import { describe, expect, it } from 'vitest'
import type { RawSelectionResult } from '../src/core'
import { MemorySessionStore } from '../src/extension/adapters/chrome-session-store'
import { GrabController, RESTRICTED_PAGE_MESSAGE } from '../src/extension/grab-controller'
import type { GrabSink, PageDriver, PageTarget, StatusIndicator } from '../src/extension/ports'
import { makePayload } from './fixtures'

const TAB = { tabId: 7, windowId: 1 }

async function settle(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

class FakeDriver implements PageDriver {
  readonly calls: string[] = []
  armError: Error | null = null
  awaitError: Error | null = null
  private waiters: Array<(result: RawSelectionResult) => void> = []

  readonly targets: PageTarget[] = []

  async arm(target: PageTarget): Promise<string> {
    this.calls.push('arm')
    this.targets.push(target)
    if (this.armError) throw this.armError
    return 'doc-1'
  }

  awaitSelection(target: PageTarget): Promise<RawSelectionResult> {
    this.calls.push('await')
    this.targets.push(target)
    if (this.awaitError) return Promise.reject(this.awaitError)
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  async setOverlayVisible(_target: PageTarget, visible: boolean): Promise<void> {
    this.calls.push(`overlay:${visible}`)
  }

  async teardown(): Promise<void> {
    this.calls.push('teardown')
    // Like the real page: tearing down settles a pending wait.
    this.waiters.splice(0).forEach((resolve) => resolve({ kind: 'cancelled' }))
  }

  get waiting(): number {
    return this.waiters.length
  }

  async answer(result: RawSelectionResult): Promise<void> {
    await settle()
    const resolve = this.waiters.shift()
    if (!resolve) throw new Error('no pending awaitSelection')
    resolve(result)
    await settle()
  }
}

class FakeIndicator implements StatusIndicator {
  readonly events: string[] = []
  async armed(): Promise<void> {
    this.events.push('armed')
  }
  async idle(): Promise<void> {
    this.events.push('idle')
  }
  async delivered(_tabId: number, detail: string): Promise<void> {
    this.events.push(`delivered:${detail}`)
  }
  async error(_tabId: number, message: string): Promise<void> {
    this.events.push(`error:${message}`)
  }
}

class FakeSink implements GrabSink {
  readonly id = 'fake'
  readonly delivered: Parameters<GrabSink['deliver']>[0][] = []
  fail = false
  async deliver(grab: Parameters<GrabSink['deliver']>[0]): Promise<void> {
    if (this.fail) throw new Error('sink down')
    this.delivered.push(grab)
  }
}

function setup(options: { captureFails?: boolean } = {}) {
  const driver = new FakeDriver()
  const indicator = new FakeIndicator()
  const sink = new FakeSink()
  const store = new MemorySessionStore()
  let token = 0
  const controller = new GrabController({
    driver,
    indicator,
    store,
    sinks: [sink],
    capturer: {
      async captureVisible() {
        if (options.captureFails) throw new Error('rate limited')
        return new Blob(['png'])
      }
    },
    crop: async (_blob, rect) => ({
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA',
      width: rect.width,
      height: rect.height
    }),
    newToken: () => `token-${++token}`
  })
  return { controller, driver, indicator, sink, store }
}

describe('GrabController', () => {
  it('arms the tab on toggle and waits for a pick', async () => {
    const { controller, driver, indicator, store } = setup()
    await controller.toggle(TAB)
    await settle()
    expect(driver.calls).toEqual(['arm', 'await'])
    expect(indicator.events).toEqual(['armed'])
    expect(await store.get(TAB.tabId)).toEqual({ token: 'token-1', windowId: 1 })
  })

  it('left click: clamps, screenshots without the overlay, delivers, re-arms', async () => {
    const { controller, driver, indicator, sink } = setup()
    await controller.toggle(TAB)
    const raw = makePayload()
    raw.page.sanitizedUrl = 'https://example.com/app?token=abc'
    await driver.answer({ kind: 'selected', payload: raw })

    expect(sink.delivered).toHaveLength(1)
    const { payload, tab, page } = sink.delivered[0]!
    expect(tab).toEqual(TAB)
    expect(page).toEqual({ tabId: 7, documentId: 'doc-1' })
    expect(payload.page.sanitizedUrl).toBe('https://example.com/app')
    expect(payload.screenshot).toMatchObject({ width: 100, height: 40 })
    expect(driver.calls).toEqual([
      'arm',
      'await',
      'overlay:false',
      'overlay:true',
      'arm',
      'await'
    ])
    expect(indicator.events).toEqual(['armed', 'delivered:main > button.primary'])
  })

  it('right click delivers once and turns the picker off', async () => {
    const { controller, driver, indicator, sink, store } = setup()
    await controller.toggle(TAB)
    await driver.answer({ kind: 'selected-exit', payload: makePayload() })

    expect(sink.delivered).toHaveLength(1)
    expect(driver.calls.slice(-2)).toEqual(['overlay:true', 'teardown'])
    expect(indicator.events.at(-1)).toBe('idle')
    expect(await store.get(TAB.tabId)).toBeUndefined()
  })

  it('Escape ends the session', async () => {
    const { controller, driver, indicator, store } = setup()
    await controller.toggle(TAB)
    await driver.answer({ kind: 'cancelled' })
    expect(indicator.events).toEqual(['armed', 'idle'])
    expect(await store.get(TAB.tabId)).toBeUndefined()
    expect(driver.waiting).toBe(0)
  })

  it('toggling again tears down and stops waiting', async () => {
    const { controller, driver, indicator, store } = setup()
    await controller.toggle(TAB)
    await settle()
    await controller.toggle(TAB)
    await settle()
    expect(driver.calls).toEqual(['arm', 'await', 'teardown'])
    expect(indicator.events).toEqual(['armed', 'idle'])
    expect(await store.get(TAB.tabId)).toBeUndefined()
  })

  it('waits again after a timeout', async () => {
    const { controller, driver } = setup()
    await controller.toggle(TAB)
    await driver.answer({ kind: 'timeout' })
    expect(driver.calls).toEqual(['arm', 'await', 'await'])
    expect(driver.waiting).toBe(1)
  })

  it('reports restricted pages instead of failing silently', async () => {
    const { controller, driver, indicator, store } = setup()
    driver.armError = new Error('Cannot access a chrome:// URL')
    await controller.toggle(TAB)
    expect(indicator.events).toEqual([`error:${RESTRICTED_PAGE_MESSAGE}`])
    expect(await store.get(TAB.tabId)).toBeUndefined()
  })

  it('rejects an invalid payload from the page and keeps picking', async () => {
    const { controller, driver, indicator, sink } = setup()
    await controller.toggle(TAB)
    await driver.answer({ kind: 'selected', payload: { __proto__: null, page: 'nope' } })
    expect(sink.delivered).toHaveLength(0)
    expect(indicator.events).toContain('error:The page returned an invalid selection')
    expect(driver.waiting).toBe(1)
  })

  it('still delivers the text context when the screenshot fails', async () => {
    const { controller, driver, sink } = setup({ captureFails: true })
    await controller.toggle(TAB)
    await driver.answer({ kind: 'selected', payload: makePayload() })
    expect(sink.delivered[0]!.payload.screenshot).toBeNull()
    expect(driver.calls).toContain('overlay:true')
  })

  it('surfaces a delivery failure', async () => {
    const { controller, driver, indicator, sink } = setup()
    sink.fail = true
    await controller.toggle(TAB)
    await driver.answer({ kind: 'selected', payload: makePayload() })
    expect(indicator.events).toContain('error:sink down')
  })

  it('forgets the session when the page goes away mid-wait', async () => {
    const { controller, driver, indicator, store } = setup()
    driver.awaitError = new Error('Frame with ID 0 was removed.')
    await controller.toggle(TAB)
    await settle()
    expect(await store.get(TAB.tabId)).toBeUndefined()
    expect(indicator.events).toEqual(['armed', 'idle'])
  })

  it('pins every call after the first arm to the armed document', async () => {
    const { controller, driver } = setup()
    await controller.toggle(TAB)
    await driver.answer({ kind: 'selected', payload: makePayload() })
    expect(driver.targets[0]).toEqual({ tabId: 7 })
    expect(driver.targets.slice(1)).toEqual(
      Array(driver.targets.length - 1).fill({ tabId: 7, documentId: 'doc-1' })
    )
  })

  it('ends the session when re-arming fails because the document changed', async () => {
    const { controller, driver, store } = setup()
    await controller.toggle(TAB)
    driver.armError = new Error('No document with id doc-1')
    await driver.answer({ kind: 'selected', payload: makePayload() })
    expect(await store.get(TAB.tabId)).toBeUndefined()
    expect(driver.waiting).toBe(0)
  })

  it('forget() on navigation removes any leftover overlay', async () => {
    const { controller, driver, store } = setup()
    await controller.toggle(TAB)
    await settle()
    await controller.forget(TAB.tabId)
    await settle()
    expect(driver.calls).toEqual(['arm', 'await', 'teardown'])
    expect(await store.get(TAB.tabId)).toBeUndefined()
    // forget() on an idle tab is a no-op
    await controller.forget(TAB.tabId)
    expect(driver.calls.filter((c) => c === 'teardown')).toHaveLength(1)
  })
})
