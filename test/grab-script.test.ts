// Static checks on the built page script. Partly ported from Orca's
// src/main/browser/grab-guest-script.test.ts
// (https://github.com/stablyai/orca, Copyright (c) 2026 Lovecast Inc., MIT).
import { describe, expect, it } from 'vitest'
import { buildGrabScript } from '../scripts/grab-script.mjs'
import { GRAB_BUDGET, GRAB_SAFE_ATTRIBUTE_NAMES, GRAB_SECRET_PATTERNS } from '../src/core'

const script: string = buildGrabScript()

function extractLiteral(name: string, open: string, close: string): string {
  const start = script.indexOf(`var ${name} = ${open}`)
  expect(start, `${name} not found in page script`).toBeGreaterThan(-1)
  const end = script.indexOf(close, start)
  return script.slice(start, end + close.length)
}

function stringsIn(source: string): string[] {
  return [...source.matchAll(/'([^']*)'/g)].map((m) => m[1]!)
}

describe('page/grab.js', () => {
  it('is one strict IIFE that parses', () => {
    expect(script.startsWith("(function() {\n'use strict';")).toBe(true)
    expect(script.trimEnd().endsWith('})();')).toBe(true)
    expect(() => new Function(script)).not.toThrow()
  })

  it('uses the renamed identifiers only', () => {
    expect(script).toContain('window.__elemGrab = {')
    expect(script).toContain("host.id = '__elem-grab-host'")
    expect(script).toContain('"data-elem-grab-selected"')
    expect(script).not.toMatch(/__orcaGrab|__orca-grab-host|data-orca-grab-selected/)
  })

  it('keeps the page budgets in sync with core/types.ts', () => {
    const literal = extractLiteral('BUDGET', '{', '};')
    const pageBudget = Object.fromEntries(
      [...literal.matchAll(/(\w+): (\d+)/g)].map((m) => [m[1], Number(m[2])])
    )
    const { screenshotMaxBytes: _ignored, ...coreBudget } = GRAB_BUDGET
    expect(pageBudget).toEqual(coreBudget)
  })

  it('keeps the safe attribute list and secret patterns in sync', () => {
    expect(new Set(stringsIn(extractLiteral('SAFE_ATTRS', 'new Set([', ']);')))).toEqual(
      new Set(GRAB_SAFE_ATTRIBUTE_NAMES)
    )
    expect(stringsIn(extractLiteral('SECRET_PATTERNS', '[', '];'))).toEqual([...GRAB_SECRET_PATTERNS])
  })

  it('tears down any pre-existing global before arming', () => {
    expect(script.indexOf('if (window.__elemGrab)')).toBeLessThan(script.indexOf('function clampStr'))
  })

  it('uses a closed shadow root and a full-viewport click catcher', () => {
    expect(script).toContain("attachShadow({ mode: 'closed' })")
    expect(script).toContain('pointer-events:all')
    expect(script).toContain('cursor:crosshair')
  })

  it('redacts secrets, strips scripts and sanitizes URLs', () => {
    expect(script).toContain('[redacted]')
    expect(script).toContain("querySelectorAll('script')")
    expect(script).toContain("u.search = ''")
    expect(script).toContain('!SAFE_URL_PROTOCOLS.has(u.protocol)')
  })
})
