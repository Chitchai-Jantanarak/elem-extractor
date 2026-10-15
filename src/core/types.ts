// SPDX-License-Identifier: MIT
// Payload types and budgets. Adapted from Orca's src/shared/browser-grab-types.ts
// (https://github.com/stablyai/orca, Copyright (c) 2026 Lovecast Inc., MIT).
// The page-side copies of these constants live in src/page/grab/01-foundation.js
// and must be kept in sync; test/grab-script.test.ts checks that they match.

/** Page-level metadata captured at selection time. */
export type GrabPageContext = {
  sanitizedUrl: string
  title: string
  viewportWidth: number
  viewportHeight: number
  scrollX: number
  scrollY: number
  devicePixelRatio: number
  capturedAt: string
}

/** Accessibility metadata for the selected element. */
export type GrabAccessibility = {
  role: string | null
  accessibleName: string | null
  ariaLabel: string | null
  ariaLabelledBy: string | null
}

/** Curated subset of computed styles. */
export type GrabComputedStyles = {
  display: string
  position: string
  width: string
  height: string
  margin: string
  padding: string
  color: string
  backgroundColor: string
  border: string
  borderRadius: string
  fontFamily: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  textAlign: string
  zIndex: string
}

/** Viewport-relative or page-relative rectangle in CSS pixels. */
export type GrabRect = {
  x: number
  y: number
  width: number
  height: number
}

/** The selected element's extracted data. */
export type GrabTarget = {
  tagName: string
  selector: string
  elementPath?: string
  fullPath?: string
  cssClasses?: string
  nearbyElements?: string[]
  selectedText?: string | null
  isFixed?: boolean
  reactComponents?: string | null
  sourceFile?: string | null
  textSnippet: string
  htmlSnippet: string
  attributes: Record<string, string>
  accessibility: GrabAccessibility
  rectViewport: GrabRect
  rectPage: GrabRect
  computedStyles: GrabComputedStyles
}

/** Cropped screenshot of the element. Width/height are CSS pixels. */
export type GrabScreenshot = {
  mimeType: 'image/png'
  dataUrl: string
  width: number
  height: number
}

/** Everything extracted for one picked element. */
export type GrabPayload = {
  page: GrabPageContext
  target: GrabTarget
  nearbyText: string[]
  ancestorPath: string[]
  screenshot: GrabScreenshot | null
}

/** Size limits enforced on the page and again by clampGrabPayload. */
export const GRAB_BUDGET = {
  textSnippetMaxLength: 200,
  nearbyTextEntryMaxLength: 200,
  nearbyTextMaxEntries: 10,
  htmlSnippetMaxLength: 4096,
  ancestorPathMaxEntries: 10,
  nearbyElementsMaxEntries: 6,
  nearbyElementMaxLength: 160,
  selectorMaxLength: 700,
  pathMaxLength: 900,
  cssClassesMaxLength: 500,
  selectedTextMaxLength: 500,
  sourceFileMaxLength: 500,
  reactComponentsMaxLength: 500,
  /** Screenshots whose PNG is larger than this are dropped. */
  screenshotMaxBytes: 2 * 1024 * 1024
} as const

/** Only these attribute names (plus aria-*) are kept. */
export const GRAB_SAFE_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
  'id',
  'class',
  'name',
  'type',
  'role',
  'href',
  'src',
  'alt',
  'title',
  'placeholder',
  'for',
  'action',
  'method'
])

/**
 * Substrings that mark a value as secret-looking; such values are redacted.
 * Deliberately narrow so ordinary class names ("source-code", "stateful")
 * are not caught.
 */
export const GRAB_SECRET_PATTERNS: readonly string[] = [
  'access_token',
  'auth_token',
  'api_key',
  'apikey',
  'client_secret',
  'oauth_state',
  'x-amz-',
  'session_id',
  'sessionid',
  'csrf',
  'secret',
  'password',
  'passwd'
]

/** Name of the global the page script installs. */
export const GRAB_GLOBAL = '__elemGrab'
