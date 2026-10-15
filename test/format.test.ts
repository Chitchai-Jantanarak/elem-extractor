import { describe, expect, it } from 'vitest'
import { jsonFormatter, markdownFormatter } from '../src/core'
import { makePayload } from './fixtures'

describe('markdownFormatter', () => {
  it('renders the agent context block', () => {
    const text = markdownFormatter.format(makePayload())
    expect(text).toContain('## Selected element')
    expect(text).toContain('- Page: https://example.com/app — "Example App" (viewport 1280x720 @ 2x)')
    expect(text).toContain('- Element: `main > button.primary` (button, name="Save")')
    expect(text).toContain('- React: <App> <SaveButton>   source: `src/SaveButton.tsx:12:4`')
    expect(text).toContain('- Ancestors: body > main')
    expect(text).toContain('background: rgb(37, 99, 235)')
    expect(text).not.toContain('border: ;')
    expect(text).toContain('```html\n<button class="primary">Save</button>\n```')
    expect(text).not.toContain('Screenshot')
  })

  it('mentions the screenshot only when there is one', () => {
    const text = markdownFormatter.format(
      makePayload({ screenshot: { mimeType: 'image/png', dataUrl: 'data:,', width: 100, height: 40 } })
    )
    expect(text).toContain('Screenshot of the element (100x40)')
  })

  it('keeps page-controlled backticks from breaking out of code spans and fences', () => {
    const payload = makePayload()
    payload.target.selector = 'a`b'
    payload.target.htmlSnippet = '<pre>```\n# injected\n```</pre>'
    const text = markdownFormatter.format(payload)
    expect(text).toContain('``a`b``')
    expect(text).toContain('````html\n<pre>```\n# injected\n```</pre>\n````')
  })

  it('omits optional sections that are empty', () => {
    const payload = makePayload({ nearbyText: [], ancestorPath: [] })
    payload.target.reactComponents = null
    payload.target.sourceFile = null
    const text = markdownFormatter.format(payload)
    expect(text).not.toContain('React')
    expect(text).not.toContain('Nearby text')
    expect(text).not.toContain('Ancestors')
  })
})

describe('jsonFormatter', () => {
  it('drops the screenshot bytes but keeps its size', () => {
    const json = JSON.parse(
      jsonFormatter.format(
        makePayload({ screenshot: { mimeType: 'image/png', dataUrl: 'data:,x', width: 3, height: 4 } })
      )
    )
    expect(json.screenshot).toEqual({ width: 3, height: 4 })
    expect(json.target.selector).toBe('main > button.primary')
  })
})
