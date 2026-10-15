// SPDX-License-Identifier: MIT
// Page-side functions run with chrome.scripting.executeScript({ func, world: 'MAIN' }).
//
// RULE: each exported function is serialized with Function.prototype.toString
// and re-evaluated in the page, so it must be fully self-contained — no
// imports, no references to anything outside its own body (type-only imports
// are fine; they vanish at compile time). test/page-functions.test.ts checks this.
//
// awaitSelection is adapted from Orca's AWAIT_CLICK_SCRIPT
// (src/main/browser/grab-guest-selection-scripts.ts in
// https://github.com/stablyai/orca, Copyright (c) 2026 Lovecast Inc., MIT).
import type { RawSelectionResult } from '../core/selection'

/**
 * Waits for one pick on an armed page (page/grab.js must already be injected).
 * Settles after `timeoutMs` with { kind: 'timeout' } so the background can
 * wait again: each new executeScript call keeps the MV3 service worker alive.
 */
export async function awaitSelection(timeoutMs: number): Promise<RawSelectionResult> {
  type Grab = {
    host: HTMLElement
    extractPayload(el: Element): { page: { capturedAt: string } }
    getCurrentElement(): Element | null
    freezeHighlight(selectionId: string): void
    cleanup(): void
    cancelAwait?: () => void
  }
  const grab = (window as unknown as { __elemGrab?: Grab }).__elemGrab
  if (!grab || !grab.host) return { kind: 'error', reason: 'picker is not armed' }

  // Why: a previous wait can still be pending if the service worker restarted
  // and lost track of it. Settle it quietly so only one set of listeners exists.
  if (typeof grab.cancelAwait === 'function') {
    try {
      grab.cancelAwait()
    } catch {
      // ignore
    }
  }

  // Why `return await` inside an async function: the result handed to
  // executeScript is then the engine's own promise, even on pages (Angular
  // Zone.js) that replace window.Promise with a look-alike.
  return await new Promise<RawSelectionResult>((resolve) => {
    const host = grab.host
    let settled = false

    function finish(result: RawSelectionResult): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      host.removeEventListener('click', onClick, true)
      host.removeEventListener('contextmenu', onContextMenu, true)
      window.removeEventListener('keydown', onKeyDown, true)
      if (grab!.cancelAwait === supersede) delete grab!.cancelAwait
      resolve(result)
    }

    function elementAt(e: MouseEvent): Element | null {
      const current = grab!.getCurrentElement()
      if (current) return current
      // No hover yet (e.g. clicked right after re-arming without moving the
      // mouse): hit-test under the pointer the same way the overlay does.
      host.style.pointerEvents = 'none'
      const el = document.elementFromPoint(e.clientX, e.clientY)
      host.style.pointerEvents = 'all'
      if (!el || el === document.documentElement || el === document.body) return null
      return el
    }

    function select(e: MouseEvent, kind: 'selected' | 'selected-exit'): void {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      const el = elementAt(e)
      if (!el) return // nothing under the pointer; keep waiting
      let payload: { page: { capturedAt: string } }
      try {
        payload = grab!.extractPayload(el)
      } catch (error) {
        finish({
          kind: 'error',
          reason: error instanceof Error ? error.message : 'failed to extract element context'
        })
        return
      }
      // Keep the picked element outlined until the background re-arms or tears down.
      grab!.freezeHighlight(payload.page.capturedAt)
      finish({ kind, payload })
    }

    function onClick(e: MouseEvent): void {
      select(e, 'selected')
    }

    function onContextMenu(e: MouseEvent): void {
      select(e, 'selected-exit')
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      grab!.cleanup()
      finish({ kind: 'cancelled' })
    }

    // Called by a newer awaitSelection: end this wait without touching the overlay.
    function supersede(): void {
      finish({ kind: 'timeout' })
    }

    const timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs)
    host.addEventListener('click', onClick, true)
    host.addEventListener('contextmenu', onContextMenu, true)
    window.addEventListener('keydown', onKeyDown, true)
    grab.cancelAwait = supersede
  })
}

/** Removes the overlay and every listener. Safe to call when not armed. */
export function teardownGrab(): boolean {
  const w = window as unknown as {
    __elemGrab?: { cleanup?: () => void; cancelAwait?: () => void }
  }
  const grab = w.__elemGrab
  if (!grab) return true
  try {
    if (typeof grab.cancelAwait === 'function') grab.cancelAwait()
  } catch {
    // ignore
  }
  try {
    if (typeof grab.cleanup === 'function') grab.cleanup()
  } catch {
    // ignore
  }
  delete w.__elemGrab
  return true
}

/**
 * Hides or shows the picker overlay, then waits for the next paint so a
 * screenshot taken right after doesn't include the highlight box.
 */
export async function setGrabOverlayVisible(visible: boolean): Promise<boolean> {
  const grab = (window as unknown as { __elemGrab?: { host?: HTMLElement } }).__elemGrab
  if (!grab || !grab.host) return false
  grab.host.style.display = visible ? '' : 'none'
  if (!visible) {
    await new Promise<void>((resolve) => {
      // Two frames: one to apply the style, one to paint it. The timeout
      // covers tabs where requestAnimationFrame is throttled.
      const done = setTimeout(resolve, 150)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          clearTimeout(done)
          resolve()
        })
      )
    })
  }
  return true
}
