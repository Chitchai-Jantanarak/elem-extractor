// SPDX-License-Identifier: MIT
import type { RawSelectionResult } from '../../core'
import { awaitSelection, setGrabOverlayVisible, teardownGrab } from '../../page/selection'
import type { PageDriver, PageTarget } from '../ports'

/** Path of the built page script inside the extension package. */
export const GRAB_SCRIPT_FILE = 'page/grab.js'

export function toInjectionTarget(target: PageTarget): chrome.scripting.InjectionTarget {
  return target.documentId
    ? { tabId: target.tabId, documentIds: [target.documentId] }
    : { tabId: target.tabId }
}

/** Unwraps a single-frame executeScript result; a missing one means the page went away. */
function single<T>(results: chrome.scripting.InjectionResult<T>[]): chrome.scripting.InjectionResult<T> {
  const [result] = results
  if (!result) throw new Error('page is gone')
  return result
}

/**
 * PageDriver on top of chrome.scripting. Everything runs in the page's MAIN
 * world because React's __reactFiber$ expandos are only visible there; the
 * results are treated as untrusted by the controller.
 */
export class ChromePageDriver implements PageDriver {
  async arm(target: PageTarget): Promise<string | undefined> {
    const result = single(
      await chrome.scripting.executeScript({
        target: toInjectionTarget(target),
        files: [GRAB_SCRIPT_FILE],
        world: 'MAIN'
      })
    )
    if (result.result !== true) throw new Error('picker failed to start')
    return result.documentId
  }

  async awaitSelection(target: PageTarget, timeoutMs: number): Promise<RawSelectionResult> {
    const result = single(
      await chrome.scripting.executeScript({
        target: toInjectionTarget(target),
        func: awaitSelection,
        args: [timeoutMs],
        world: 'MAIN'
      })
    )
    // Why: Chrome reports `null` when the document unloaded before the
    // promise settled. Treat it like any other "page is gone" failure.
    if (result.result == null) throw new Error('page is gone')
    return result.result
  }

  async setOverlayVisible(target: PageTarget, visible: boolean): Promise<void> {
    await chrome.scripting.executeScript({
      target: toInjectionTarget(target),
      func: setGrabOverlayVisible,
      args: [visible],
      world: 'MAIN'
    })
  }

  async teardown(tabId: number): Promise<void> {
    await chrome.scripting
      .executeScript({ target: { tabId }, func: teardownGrab, world: 'MAIN' })
      .catch(() => {})
  }
}
