// SPDX-License-Identifier: MIT
// The picker's lifecycle for one tab:
//
//   idle ──toggle──▶ armed ──click──▶ capturing ──▶ deliver ──▶ armed (re-arm)
//                      │  ▲              right-click ──▶ deliver ──▶ idle
//                      │  └──timeout (wait again)
//                      └──Escape / toggle / navigation──▶ idle
//
// Inspired by Orca's useGrabMode + browser-manager-grab
// (https://github.com/stablyai/orca), reduced to what an extension needs.
import { clampGrabPayload, parseSelectionResult } from '../core'
import type {
  GrabSink,
  PageDriver,
  PageTarget,
  PickerSession,
  ScreenCapturer,
  ScreenshotCropper,
  SessionStore,
  StatusIndicator,
  TabRef
} from './ports'

export type GrabControllerDeps = {
  driver: PageDriver
  capturer: ScreenCapturer
  crop: ScreenshotCropper
  sinks: readonly GrabSink[]
  store: SessionStore
  indicator: StatusIndicator
  /** How long one awaitSelection call may wait. Keep under the MV3 idle limit (30s). */
  waitTimeoutMs?: number
  /** Token source; injectable for tests. */
  newToken?: () => string
}

export const RESTRICTED_PAGE_MESSAGE = "Can't pick elements on this page"

export class GrabController {
  private readonly deps: Required<GrabControllerDeps>

  constructor(deps: GrabControllerDeps) {
    this.deps = {
      waitTimeoutMs: 20_000,
      newToken: () => crypto.randomUUID(),
      ...deps
    }
  }

  /** Icon click / keyboard shortcut. */
  async toggle(tab: TabRef): Promise<void> {
    if (await this.deps.store.get(tab.tabId)) {
      await this.stop(tab.tabId)
    } else {
      await this.start(tab)
    }
  }

  async start(tab: TabRef): Promise<void> {
    const { store, driver, indicator } = this.deps
    const session: PickerSession = { token: this.deps.newToken(), windowId: tab.windowId }
    await store.set(tab.tabId, session)
    let page: PageTarget
    try {
      page = { tabId: tab.tabId, documentId: await driver.arm({ tabId: tab.tabId }) }
    } catch {
      await store.delete(tab.tabId)
      await indicator.error(tab.tabId, RESTRICTED_PAGE_MESSAGE)
      return
    }
    await indicator.armed(tab.tabId)
    // Runs until the session ends; errors are handled inside.
    void this.run(tab, page, session.token)
  }

  async stop(tabId: number): Promise<void> {
    // Delete first so a pending run() sees the session is over.
    await this.deps.store.delete(tabId)
    await this.deps.driver.teardown(tabId)
    await this.deps.indicator.idle(tabId)
  }

  /**
   * Navigation or tab close. Usually the page and its overlay are already
   * gone, but some same-document navigations also report `loading`, so try
   * to remove the overlay anyway (teardown never throws).
   */
  async forget(tabId: number): Promise<void> {
    if (!(await this.deps.store.get(tabId))) return
    await this.deps.store.delete(tabId)
    await this.deps.driver.teardown(tabId)
    await this.deps.indicator.idle(tabId).catch(() => {})
  }

  private async isCurrent(tabId: number, token: string): Promise<boolean> {
    return (await this.deps.store.get(tabId))?.token === token
  }

  private async run(tab: TabRef, page: PageTarget, token: string): Promise<void> {
    const { driver, indicator } = this.deps
    while (await this.isCurrent(tab.tabId, token)) {
      let raw
      try {
        raw = parseSelectionResult(await driver.awaitSelection(page, this.deps.waitTimeoutMs))
      } catch {
        // The page went away (navigation, crash, tab closed).
        if (await this.isCurrent(tab.tabId, token)) await this.forget(tab.tabId)
        return
      }
      // Toggled off or restarted while we waited: someone else owns the tab now.
      if (!(await this.isCurrent(tab.tabId, token))) return

      switch (raw.kind) {
        case 'timeout':
          continue
        case 'cancelled':
          await this.stop(tab.tabId)
          return
        case 'error':
          await indicator.error(tab.tabId, raw.reason)
          if (!(await this.rearm(page, token))) return
          continue
        case 'selected':
        case 'selected-exit': {
          await this.handlePick(tab, page, raw.payload)
          if (!(await this.isCurrent(tab.tabId, token))) return
          if (raw.kind === 'selected-exit') {
            await this.stop(tab.tabId)
            return
          }
          if (!(await this.rearm(page, token))) return
          continue
        }
      }
    }
  }

  /** Re-arms the same document; fails (and ends the session) if it navigated away. */
  private async rearm(page: PageTarget, token: string): Promise<boolean> {
    try {
      await this.deps.driver.arm(page)
      return true
    } catch {
      if (await this.isCurrent(page.tabId, token)) await this.forget(page.tabId)
      return false
    }
  }

  private async handlePick(tab: TabRef, page: PageTarget, rawPayload: unknown): Promise<void> {
    const { indicator, sinks } = this.deps
    // Never trust the page: re-validate and clamp everything it sent.
    const payload = clampGrabPayload(rawPayload)
    if (!payload) {
      await indicator.error(tab.tabId, 'The page returned an invalid selection')
      return
    }
    payload.screenshot = await this.captureElement(tab, page, payload)

    const results = await Promise.allSettled(
      sinks.map((sink) => sink.deliver({ payload, tab, page }))
    )
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (sinks.length > 0 && failed.length === sinks.length) {
      const reason = failed[0]!.reason
      await indicator.error(tab.tabId, reason instanceof Error ? reason.message : String(reason))
      return
    }
    await indicator.delivered(tab.tabId, payload.target.selector)
  }

  private async captureElement(
    tab: TabRef,
    page: PageTarget,
    payload: NonNullable<ReturnType<typeof clampGrabPayload>>
  ): Promise<typeof payload.screenshot> {
    const { driver, capturer, crop } = this.deps
    let capture: Blob
    try {
      await driver.setOverlayVisible(page, false)
      capture = await capturer.captureVisible(tab)
    } catch {
      // Rate-limited or not allowed: the text context is still worth delivering.
      return null
    } finally {
      await driver.setOverlayVisible(page, true).catch(() => {})
    }
    return crop(capture, payload.target.rectViewport, payload.page.viewportWidth)
  }
}
