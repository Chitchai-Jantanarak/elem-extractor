import { describe, expect, it } from 'vitest'
import { bytesToBase64, computeCropRect, dataUrlToBlob } from '../src/core'

describe('computeCropRect', () => {
  it('scales CSS pixels by bitmap width / viewport width', () => {
    expect(computeCropRect({ x: 10, y: 20, width: 100, height: 40 }, 2560, 1440, 1280)).toEqual({
      crop: { x: 20, y: 40, width: 200, height: 80 },
      scale: 2
    })
  })

  it('clamps to the visible bitmap', () => {
    expect(computeCropRect({ x: -50, y: 700, width: 100, height: 100 }, 1280, 720, 1280)).toEqual({
      crop: { x: 0, y: 700, width: 50, height: 20 },
      scale: 1
    })
  })

  it('returns null when nothing is visible or inputs are bad', () => {
    expect(computeCropRect({ x: 2000, y: 0, width: 10, height: 10 }, 1280, 720, 1280)).toBeNull()
    expect(computeCropRect({ x: 0, y: 0, width: 0, height: 10 }, 1280, 720, 1280)).toBeNull()
    expect(computeCropRect({ x: 0, y: 0, width: 10, height: 10 }, 1280, 720, 0)).toBeNull()
    expect(
      computeCropRect({ x: Number.NaN, y: 0, width: 10, height: 10 }, 1280, 720, 1280)
    ).toEqual({ crop: { x: 0, y: 0, width: 10, height: 10 }, scale: 1 })
  })
})

describe('data URL helpers', () => {
  it('round-trips bytes through base64 and a data URL', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255])
    const blob = dataUrlToBlob(`data:image/png;base64,${bytesToBase64(bytes)}`)
    expect(blob.type).toBe('image/png')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes)
  })

  it('rejects non data URLs', () => {
    expect(() => dataUrlToBlob('https://example.com/x.png')).toThrow()
  })
})
