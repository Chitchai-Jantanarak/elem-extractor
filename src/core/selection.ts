// SPDX-License-Identifier: MIT
import type { GrabPayload } from './types'

/**
 * What the page reports back for one wait on the picker:
 *
 * - `selected`      left click: copy, keep the picker running
 * - `selected-exit` right click: copy, then turn the picker off
 * - `cancelled`     Escape, or the picker was torn down
 * - `timeout`       nothing happened within the wait window; wait again
 * - `error`         the page could not produce a payload
 *
 * `payload` is untrusted page data: run it through clampGrabPayload.
 */
export type RawSelectionResult =
  | { kind: 'selected' | 'selected-exit'; payload: unknown }
  | { kind: 'cancelled' }
  | { kind: 'timeout' }
  | { kind: 'error'; reason: string }

export type SelectionResult =
  | { kind: 'selected' | 'selected-exit'; payload: GrabPayload }
  | { kind: 'cancelled' }
  | { kind: 'timeout' }
  | { kind: 'error'; reason: string }

/** Validates the page's answer. Anything unexpected becomes an error result. */
export function parseSelectionResult(raw: unknown): RawSelectionResult {
  if (!raw || typeof raw !== 'object') {
    return { kind: 'error', reason: 'empty result from page' }
  }
  const obj = raw as Record<string, unknown>
  switch (obj.kind) {
    case 'selected':
    case 'selected-exit':
      return { kind: obj.kind, payload: obj.payload }
    case 'cancelled':
    case 'timeout':
      return { kind: obj.kind }
    case 'error':
      return {
        kind: 'error',
        reason: typeof obj.reason === 'string' ? obj.reason.slice(0, 200) : 'unknown error'
      }
    default:
      return { kind: 'error', reason: 'unexpected result from page' }
  }
}
