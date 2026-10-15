// SPDX-License-Identifier: MIT
// Ports (interfaces) the GrabController depends on. The Chrome implementations
// live in ./adapters and ./sinks; tests use in-memory fakes. To retarget the
// extension (Firefox, a side panel, a local agent bridge…) implement the port
// you need and wire it up in background.ts — the controller stays unchanged.
import type { GrabPayload, RawSelectionResult } from '../core'

export type TabRef = { tabId: number; windowId: number }

/**
 * One document inside a tab. Chrome gives every page load its own documentId,
 * so pinning calls to it guarantees a navigation can never leak the picker
 * into the next page: calls for a gone document simply fail.
 */
export type PageTarget = { tabId: number; documentId?: string }

/** Runs the picker inside a tab. */
export interface PageDriver {
  /**
   * Injects page/grab.js (tearing down any previous overlay first) and
   * returns the documentId it landed in. Throws on restricted pages or when
   * `target.documentId` is no longer the tab's document.
   */
  arm(target: PageTarget): Promise<string | undefined>
  /** Waits for one pick; settles with `timeout` after `timeoutMs`. Throws if the page is gone. */
  awaitSelection(target: PageTarget, timeoutMs: number): Promise<RawSelectionResult>
  /** Hides/shows the overlay so it stays out of screenshots. */
  setOverlayVisible(target: PageTarget, visible: boolean): Promise<void>
  /** Removes the overlay and listeners from whatever the tab shows now. Never throws. */
  teardown(tabId: number): Promise<void>
}

/** Takes a screenshot of the visible part of the tab. */
export interface ScreenCapturer {
  captureVisible(tab: TabRef): Promise<Blob>
}

/** Crops a viewport capture to the element (see core/crop.ts). */
export type ScreenshotCropper = (
  capture: Blob,
  rect: GrabPayload['target']['rectViewport'],
  viewportCssWidth: number
) => Promise<GrabPayload['screenshot']>

/** Where a finished pick goes (Strategy). Add more sinks to fan out. */
export interface GrabSink {
  readonly id: string
  deliver(grab: { payload: GrabPayload; tab: TabRef; page: PageTarget }): Promise<void>
}

/** Per-tab picker state. Must survive service-worker restarts. */
export type PickerSession = { token: string; windowId: number }

export interface SessionStore {
  get(tabId: number): Promise<PickerSession | undefined>
  set(tabId: number, session: PickerSession): Promise<void>
  delete(tabId: number): Promise<void>
}

/** User-visible status (toolbar badge in Chrome). */
export interface StatusIndicator {
  armed(tabId: number): Promise<void>
  idle(tabId: number): Promise<void>
  delivered(tabId: number, detail: string): Promise<void>
  error(tabId: number, message: string): Promise<void>
}
