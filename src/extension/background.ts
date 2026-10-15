// SPDX-License-Identifier: MIT
// Service worker and composition root: the only place that picks concrete
// adapters. Forks change behaviour here (e.g. add a sink) rather than in the
// controller.
import { cropScreenshot } from '../core'
import { BadgeIndicator } from './adapters/badge-indicator'
import { ChromeCapturer } from './adapters/chrome-capturer'
import { ChromePageDriver } from './adapters/chrome-page-driver'
import { ChromeSessionStore } from './adapters/chrome-session-store'
import { GrabController } from './grab-controller'
import { ClipboardSink } from './sinks/clipboard-sink'

export const TOGGLE_COMMAND = 'toggle-picker'

const controller = new GrabController({
  driver: new ChromePageDriver(),
  capturer: new ChromeCapturer(),
  crop: cropScreenshot,
  sinks: [new ClipboardSink()],
  store: new ChromeSessionStore(),
  indicator: new BadgeIndicator()
})

function toTabRef(tab: chrome.tabs.Tab | undefined): { tabId: number; windowId: number } | null {
  if (!tab || tab.id === undefined || tab.id < 0) return null
  return { tabId: tab.id, windowId: tab.windowId }
}

chrome.action.onClicked.addListener((tab) => {
  const ref = toTabRef(tab)
  if (ref) void controller.toggle(ref)
})

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== TOGGLE_COMMAND) return
  const ref = toTabRef(tab)
  if (ref) void controller.toggle(ref)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // A navigation wipes the overlay; drop our state with it.
  if (changeInfo.status === 'loading') void controller.forget(tabId)
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void controller.forget(tabId)
})

// Handle for the service worker's DevTools console and for end-to-end tests
// (pages cannot reach the worker's global scope).
;(globalThis as unknown as { elemExtractor: unknown }).elemExtractor = { controller }
