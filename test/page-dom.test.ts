// @vitest-environment jsdom
// Runs the real page script and page functions against a DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildGrabScript } from '../scripts/grab-script.mjs'
import { clampGrabPayload } from '../src/core'
import { writeToClipboard } from '../src/page/clipboard'
import { awaitSelection, setGrabOverlayVisible, teardownGrab } from '../src/page/selection'

type TestGrab = {
  host: HTMLElement
  extractPayload(el: Element): Record<string, any>
  getCurrentElement(): Element | null
  cleanup(): void
  cancelAwait?: () => void
}

const grabScript: string = buildGrabScript()
const w = window as unknown as { __elemGrab?: TestGrab }

function arm(): TestGrab {
  new Function(grabScript)()
  return w.__elemGrab!
}

/** Re-create a page function from its source text, as chrome.scripting does. */
function reviveFunction<T extends (...args: any[]) => unknown>(fn: T): T {
  return new Function(`return (${fn.toString()})`)() as T
}

let target: HTMLElement

beforeEach(() => {
  document.title = 'Fixture'
  document.body.innerHTML = `
    <main role="main">
      <h1>Account</h1>
      <button id="save" class="btn primary" aria-label="Save changes" type="submit">Save</button>
      <a id="docs" href="https://docs.test/page?ref=nav#top">Docs</a>
      <a id="leak" href="https://docs.test/cb?access_token=abc">Callback</a>
      <input id="pw" name="password_field" placeholder="secret password" />
    </main>`
  target = document.getElementById('save')!
  // jsdom has no layout, so hit-testing always returns the button.
  document.elementFromPoint = () => target
  if (!window.requestAnimationFrame) {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
  }
})

afterEach(() => {
  teardownGrab()
  vi.unstubAllGlobals()
})

describe('page/grab.js in a DOM', () => {
  it('installs the overlay behind a closed shadow root', () => {
    const grab = arm()
    expect(document.getElementById('__elem-grab-host')).toBe(grab.host)
    expect(grab.host.shadowRoot).toBeNull()
  })

  it('extracts a payload that survives clampGrabPayload', () => {
    const grab = arm()
    const payload = clampGrabPayload(grab.extractPayload(target))!
    expect(payload).not.toBeNull()
    expect(payload.page.title).toBe('Fixture')
    expect(payload.target.tagName).toBe('button')
    expect(payload.target.selector).toBe('button#save')
    expect(payload.target.textSnippet).toBe('Save')
    expect(payload.target.accessibility.accessibleName).toBe('Save changes')
    expect(payload.target.attributes).toMatchObject({ id: 'save', type: 'submit' })
    expect(payload.nearbyText).toContain('Account')
    expect(payload.ancestorPath).toEqual(['main[role=main]', 'body'])
  })

  it('sanitizes URLs and redacts secret-looking values on the page side', () => {
    const grab = arm()
    const link = grab.extractPayload(document.getElementById('docs')!)
    expect(link.target.attributes.href).toBe('https://docs.test/page')
    // A secret-looking value is redacted outright rather than just trimmed.
    const leak = grab.extractPayload(document.getElementById('leak')!)
    expect(leak.target.attributes.href).toBe('[redacted]')
    const input = grab.extractPayload(document.getElementById('pw')!)
    expect(input.target.attributes.name).toBe('[redacted]')
    expect(input.target.attributes.placeholder).toBe('[redacted]')
  })

  it('replaces a hostile pre-existing __elemGrab', () => {
    const fakeCleanup = vi.fn()
    w.__elemGrab = {
      cleanup: fakeCleanup,
      extractPayload: () => ({ page: { sanitizedUrl: 'javascript:evil()' } })
    } as unknown as TestGrab
    const grab = arm()
    expect(fakeCleanup).toHaveBeenCalled()
    expect(grab.extractPayload(target).target.selector).toBe('button#save')
  })

  it('reads React component names and the dev source location', () => {
    const fiber = {
      type: function SaveButton() {},
      _debugSource: { fileName: 'webpack:///./src/SaveButton.tsx', lineNumber: 12, columnNumber: 4 },
      return: { type: { displayName: 'AccountPage' }, return: null }
    }
    ;(target as unknown as Record<string, unknown>)['__reactFiber$test'] = fiber
    const payload = arm().extractPayload(target)
    expect(payload.target.reactComponents).toBe('<AccountPage> <SaveButton>')
    expect(payload.target.sourceFile).toBe('src/SaveButton.tsx:12:4')
  })

  it('cleanup removes the host and the global', () => {
    arm().cleanup()
    expect(document.getElementById('__elem-grab-host')).toBeNull()
    expect(w.__elemGrab).toBeUndefined()
  })
})

describe('awaitSelection', () => {
  it('reports an error when the picker is not armed', async () => {
    await expect(awaitSelection(1000)).resolves.toEqual({ kind: 'error', reason: 'picker is not armed' })
  })

  it('left click resolves the payload and freezes the highlight', async () => {
    const grab = arm()
    const pending = awaitSelection(5000)
    grab.host.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const result = (await pending) as { kind: string; payload: Record<string, any> }
    expect(result.kind).toBe('selected')
    expect(result.payload.target.selector).toBe('button#save')
    expect(target.hasAttribute('data-elem-grab-selected')).toBe(false) // nothing was hovered yet
    expect(grab.host.style.pointerEvents).toBe('none')
  })

  it('uses the hovered element and marks it as selected', async () => {
    const grab = arm()
    grab.host.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }))
    await vi.waitFor(() => expect(grab.getCurrentElement()).toBe(target))
    const pending = awaitSelection(5000)
    grab.host.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    const result = await pending
    expect(result.kind).toBe('selected-exit')
    expect(target.getAttribute('data-elem-grab-selected')).toBeTruthy()
  })

  it('Escape cancels and removes the overlay', async () => {
    arm()
    const pending = awaitSelection(5000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await expect(pending).resolves.toEqual({ kind: 'cancelled' })
    expect(document.getElementById('__elem-grab-host')).toBeNull()
  })

  it('times out so the caller can wait again', async () => {
    arm()
    await expect(awaitSelection(10)).resolves.toEqual({ kind: 'timeout' })
  })

  it('a newer wait supersedes an older one', async () => {
    const grab = arm()
    const first = awaitSelection(5000)
    const second = awaitSelection(5000)
    await expect(first).resolves.toEqual({ kind: 'timeout' })
    grab.host.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await expect(second).resolves.toMatchObject({ kind: 'selected' })
  })

  it('teardownGrab settles a pending wait and removes the overlay', async () => {
    arm()
    const pending = awaitSelection(5000)
    expect(teardownGrab()).toBe(true)
    await expect(pending).resolves.toEqual({ kind: 'timeout' })
    expect(document.getElementById('__elem-grab-host')).toBeNull()
    expect(teardownGrab()).toBe(true)
  })

  it('still works after being serialized like chrome.scripting does', async () => {
    const revivedAwait = reviveFunction(awaitSelection)
    const revivedVisible = reviveFunction(setGrabOverlayVisible)
    const revivedTeardown = reviveFunction(teardownGrab)
    const grab = arm()
    await expect(revivedVisible(false)).resolves.toBe(true)
    expect(grab.host.style.display).toBe('none')
    await revivedVisible(true)
    const pending = revivedAwait(5000)
    grab.host.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await expect(pending).resolves.toMatchObject({ kind: 'selected' })
    expect(revivedTeardown()).toBe(true)
    expect(reviveFunction(writeToClipboard)).toBeTypeOf('function')
  })
})

describe('writeToClipboard', () => {
  function stubClipboard(clipboard: Partial<Clipboard>): void {
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
  }

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  })

  it('writes text and image together when it can', async () => {
    const write = vi.fn(async () => {})
    stubClipboard({ write })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(readonly items: Record<string, Blob>) {}
      }
    )
    const result = await writeToClipboard('hello', 'data:image/png;base64,AAEC')
    expect(result).toEqual({ ok: true, image: true })
    const item = (write.mock.calls[0] as unknown as [[{ items: Record<string, Blob> }]])[0][0]
    expect(Object.keys(item.items)).toEqual(['text/plain', 'image/png'])
    expect(item.items['text/plain']!.size).toBe(5)
    expect(item.items['image/png']!.size).toBe(3)
  })

  it('falls back to text when the image write is refused', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard({
      write: async () => {
        throw new Error('NotAllowedError')
      },
      writeText
    })
    vi.stubGlobal('ClipboardItem', class {})
    await expect(writeToClipboard('hello', 'data:image/png;base64,AA')).resolves.toEqual({
      ok: true,
      image: false
    })
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('reports failure when nothing works', async () => {
    stubClipboard({})
    document.execCommand = () => false
    const result = await writeToClipboard('hello', null)
    expect(result.ok).toBe(false)
  })
})
