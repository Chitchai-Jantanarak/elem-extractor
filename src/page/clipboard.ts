// SPDX-License-Identifier: MIT
// Runs with chrome.scripting.executeScript({ func, world: 'ISOLATED' }).
// Same rule as selection.ts: fully self-contained.
//
// Why write from the page and not an offscreen document: the page is the
// focused document and was just clicked, which is what the async Clipboard
// API wants. An offscreen document is never focused, so it can only fall back
// to execCommand('copy'), which cannot put an image on the clipboard.

export type ClipboardWriteResult = { ok: boolean; image: boolean; reason?: string }

export async function writeToClipboard(
  text: string,
  pngDataUrl: string | null
): Promise<ClipboardWriteResult> {
  let lastError = 'clipboard unavailable'
  const describe = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

  if (pngDataUrl && typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
    try {
      const base64 = pngDataUrl.slice(pngDataUrl.indexOf(',') + 1)
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'image/png': new Blob([bytes], { type: 'image/png' })
        })
      ])
      return { ok: true, image: true }
    } catch (error) {
      lastError = describe(error)
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return { ok: true, image: false }
    } catch (error) {
      lastError = describe(error)
    }
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;'
    document.documentElement.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    if (copied) return { ok: true, image: false }
  } catch (error) {
    lastError = describe(error)
  }
  return { ok: false, image: false, reason: lastError }
}
