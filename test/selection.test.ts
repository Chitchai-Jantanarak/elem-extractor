import { describe, expect, it } from 'vitest'
import { parseSelectionResult } from '../src/core'

describe('parseSelectionResult', () => {
  it('passes through known kinds', () => {
    expect(parseSelectionResult({ kind: 'selected', payload: { a: 1 } })).toEqual({
      kind: 'selected',
      payload: { a: 1 }
    })
    expect(parseSelectionResult({ kind: 'selected-exit', payload: 1 })).toEqual({
      kind: 'selected-exit',
      payload: 1
    })
    expect(parseSelectionResult({ kind: 'cancelled', extra: true })).toEqual({ kind: 'cancelled' })
    expect(parseSelectionResult({ kind: 'timeout' })).toEqual({ kind: 'timeout' })
  })

  it('turns anything else into an error', () => {
    expect(parseSelectionResult(undefined).kind).toBe('error')
    expect(parseSelectionResult({ kind: 'pwned' }).kind).toBe('error')
    expect(parseSelectionResult({ kind: 'error', reason: 'x'.repeat(1000) })).toEqual({
      kind: 'error',
      reason: 'x'.repeat(200)
    })
  })
})
