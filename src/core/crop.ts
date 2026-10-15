// SPDX-License-Identifier: MIT
// Crop logic adapted from Orca's src/main/browser/browser-grab-screenshot.ts
// (https://github.com/stablyai/orca, Copyright (c) 2026 Lovecast Inc., MIT).
import { GRAB_BUDGET, type GrabRect, type GrabScreenshot } from './types'

export type PixelRect = { x: number; y: number; width: number; height: number }

const finite = (n: unknown, fallback = 0): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : fallback

/**
 * Maps a CSS-pixel rect onto a viewport bitmap, clamped to the bitmap.
 *
 * Why derive the scale from bitmap width / CSS viewport width rather than
 * devicePixelRatio: the ratio also folds in browser zoom, and it's what the
 * capture actually produced. Returns null when nothing visible is left.
 */
export function computeCropRect(
  rect: GrabRect,
  bitmapWidth: number,
  bitmapHeight: number,
  viewportCssWidth: number
): { crop: PixelRect; scale: number } | null {
  if (!(viewportCssWidth > 0) || !(bitmapWidth > 0) || !(bitmapHeight > 0)) return null
  const scale = bitmapWidth / viewportCssWidth
  const left = finite(rect.x) * scale
  const top = finite(rect.y) * scale
  const x = Math.max(0, Math.round(left))
  const y = Math.max(0, Math.round(top))
  const right = Math.min(bitmapWidth, Math.round(left + finite(rect.width) * scale))
  const bottom = Math.min(bitmapHeight, Math.round(top + finite(rect.height) * scale))
  const width = right - x
  const height = bottom - y
  if (width <= 0 || height <= 0) return null
  return { crop: { x, y, width, height }, scale }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Crops a full-viewport capture (e.g. from chrome.tabs.captureVisibleTab) to
 * the element rect. Works in a service worker: it only needs
 * createImageBitmap and OffscreenCanvas. Fails closed (null) on any problem
 * or when the PNG exceeds the screenshot budget.
 */
export async function cropScreenshot(
  capture: Blob,
  rect: GrabRect,
  viewportCssWidth: number,
  maxBytes: number = GRAB_BUDGET.screenshotMaxBytes
): Promise<GrabScreenshot | null> {
  try {
    const bitmap = await createImageBitmap(capture)
    const mapped = computeCropRect(rect, bitmap.width, bitmap.height, viewportCssWidth)
    if (!mapped) {
      bitmap.close()
      return null
    }
    const { crop, scale } = mapped
    const canvas = new OffscreenCanvas(crop.width, crop.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return null
    }
    ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
    bitmap.close()
    const png = await canvas.convertToBlob({ type: 'image/png' })
    if (png.size > maxBytes) return null
    const base64 = bytesToBase64(new Uint8Array(await png.arrayBuffer()))
    return {
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${base64}`,
      // Report CSS pixels, like the rest of the payload.
      width: Math.round(crop.width / scale),
      height: Math.round(crop.height / scale)
    }
  } catch {
    return null
  }
}

/** Decodes a data: URL (as returned by captureVisibleTab) into a Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) throw new Error('not a data URL')
  const mime = match[1] || 'application/octet-stream'
  const data = match[3] ?? ''
  if (!match[2]) return new Blob([decodeURIComponent(data)], { type: mime })
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
