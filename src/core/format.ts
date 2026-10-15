// SPDX-License-Identifier: MIT
import type { GrabPayload } from './types'

/** Turns a payload into the text that gets delivered (Strategy). */
export interface GrabFormatter {
  readonly id: string
  format(payload: GrabPayload): string
}

function inlineCode(value: string): string {
  // Why: pick a backtick run longer than any inside the value so it can't
  // break out of the inline code span.
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length))
  const ticks = '`'.repeat(longest + 1)
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : ''
  return `${ticks}${pad}${value}${pad}${ticks}`
}

function quote(value: string): string {
  return `"${value.replace(/\s+/g, ' ').trim()}"`
}

function fence(value: string, lang: string): string {
  // Same idea as inlineCode: the fence must be longer than any backtick run inside.
  const longest = Math.max(2, ...(value.match(/`+/g) ?? []).map((run) => run.length))
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}${lang}\n${value}\n${ticks}`
}

const STYLE_LABELS: ReadonlyArray<[keyof GrabPayload['target']['computedStyles'], string]> = [
  ['display', 'display'],
  ['position', 'position'],
  ['width', 'width'],
  ['height', 'height'],
  ['margin', 'margin'],
  ['padding', 'padding'],
  ['color', 'color'],
  ['backgroundColor', 'background'],
  ['border', 'border'],
  ['borderRadius', 'radius'],
  ['fontFamily', 'font-family'],
  ['fontSize', 'font-size'],
  ['fontWeight', 'font-weight'],
  ['lineHeight', 'line-height'],
  ['textAlign', 'text-align'],
  ['zIndex', 'z-index']
]

/** Agent-friendly Markdown block describing the picked element. */
export const markdownFormatter: GrabFormatter = {
  id: 'markdown',
  format(payload) {
    const { page, target } = payload
    const lines: string[] = ['## Selected element']

    const pageLabel = page.sanitizedUrl || '(unknown page)'
    const title = page.title ? ` — ${quote(page.title)}` : ''
    lines.push(
      `- Page: ${pageLabel}${title} (viewport ${page.viewportWidth}x${page.viewportHeight} @ ${page.devicePixelRatio}x)`
    )

    const a11y = target.accessibility
    const elementBits = [target.tagName]
    if (a11y.role && a11y.role !== target.tagName) elementBits.push(`role=${a11y.role}`)
    if (a11y.accessibleName) elementBits.push(`name=${quote(a11y.accessibleName)}`)
    lines.push(`- Element: ${inlineCode(target.selector)} (${elementBits.join(', ')})`)

    if (target.reactComponents || target.sourceFile) {
      const react = target.reactComponents ? `React: ${target.reactComponents}` : 'React'
      const source = target.sourceFile ? `   source: ${inlineCode(target.sourceFile)}` : ''
      lines.push(`- ${react}${source}`)
    }
    if (target.elementPath) lines.push(`- Path: ${inlineCode(target.elementPath)}`)
    if (payload.ancestorPath.length > 0) {
      lines.push(`- Ancestors: ${payload.ancestorPath.slice().reverse().join(' > ')}`)
    }

    const r = target.rectViewport
    lines.push(
      `- Box: ${Math.round(r.width)}x${Math.round(r.height)} at (${Math.round(r.x)}, ${Math.round(r.y)}) in viewport${target.isFixed ? ', fixed/sticky' : ''}`
    )

    const styles = STYLE_LABELS.map(([key, label]) => [label, target.computedStyles[key]] as const)
      .filter(([, value]) => value !== '')
      .map(([label, value]) => `${label}: ${value}`)
    if (styles.length > 0) lines.push(`- Computed styles: ${styles.join('; ')}`)

    if (target.textSnippet) lines.push(`- Text: ${quote(target.textSnippet)}`)
    if (target.selectedText) lines.push(`- Selected text: ${quote(target.selectedText)}`)
    if (payload.nearbyText.length > 0) {
      lines.push(`- Nearby text: ${payload.nearbyText.map(quote).join(', ')}`)
    }
    if (target.nearbyElements && target.nearbyElements.length > 0) {
      lines.push(`- Nearby elements: ${target.nearbyElements.join(', ')}`)
    }

    lines.push('', '### HTML', fence(target.htmlSnippet, 'html'))
    if (payload.screenshot) {
      lines.push(
        '',
        `[Screenshot of the element (${payload.screenshot.width}x${payload.screenshot.height}) is on the clipboard as an image.]`
      )
    }
    return lines.join('\n') + '\n'
  }
}

/** Raw JSON, for tools that would rather parse than read. */
export const jsonFormatter: GrabFormatter = {
  id: 'json',
  format(payload) {
    const { screenshot, ...rest } = payload
    return JSON.stringify(
      { ...rest, screenshot: screenshot ? { width: screenshot.width, height: screenshot.height } : null },
      null,
      2
    )
  }
}
