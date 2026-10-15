// SPDX-License-Identifier: MIT
import { markdownFormatter, type GrabFormatter } from '../../core'
import { writeToClipboard, type ClipboardWriteResult } from '../../page/clipboard'
import { toInjectionTarget } from '../adapters/chrome-page-driver'
import type { GrabSink, PageTarget } from '../ports'

export type ClipboardWriter = (
  page: PageTarget,
  text: string,
  pngDataUrl: string | null
) => Promise<ClipboardWriteResult>

/** Writes from the picked tab itself (ISOLATED world); see page/clipboard.ts for why. */
export const chromeClipboardWriter: ClipboardWriter = async (page, text, pngDataUrl) => {
  const [result] = await chrome.scripting.executeScript({
    target: toInjectionTarget(page),
    func: writeToClipboard,
    args: [text, pngDataUrl],
    world: 'ISOLATED'
  })
  return (result?.result as ClipboardWriteResult | undefined) ?? { ok: false, image: false }
}

export type ClipboardSinkOptions = {
  formatter?: GrabFormatter
  includeScreenshot?: boolean
  writer?: ClipboardWriter
}

/** Puts the formatted text (and the PNG, when available) on the clipboard. */
export class ClipboardSink implements GrabSink {
  readonly id = 'clipboard'
  private readonly formatter: GrabFormatter
  private readonly includeScreenshot: boolean
  private readonly writer: ClipboardWriter

  constructor(options: ClipboardSinkOptions = {}) {
    this.formatter = options.formatter ?? markdownFormatter
    this.includeScreenshot = options.includeScreenshot ?? true
    this.writer = options.writer ?? chromeClipboardWriter
  }

  async deliver({ payload, page }: Parameters<GrabSink['deliver']>[0]): Promise<void> {
    const png = this.includeScreenshot ? (payload.screenshot?.dataUrl ?? null) : null
    const text = this.formatter.format(png ? payload : { ...payload, screenshot: null })
    const result = await this.writer(page, text, png)
    if (!result.ok) throw new Error(`Clipboard write failed: ${result.reason ?? 'unknown'}`)
  }
}
