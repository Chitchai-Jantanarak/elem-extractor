// SPDX-License-Identifier: MIT
// Public entry point of the elem-extractor core library. Nothing in here
// touches chrome.* — it runs in a service worker, a web page, or Node.
export * from './types'
export { clampGrabPayload } from './clamp-payload'
export { parseSelectionResult } from './selection'
export type { RawSelectionResult, SelectionResult } from './selection'
export { markdownFormatter, jsonFormatter } from './format'
export type { GrabFormatter } from './format'
export { computeCropRect, cropScreenshot, dataUrlToBlob, bytesToBase64 } from './crop'
export type { PixelRect } from './crop'
