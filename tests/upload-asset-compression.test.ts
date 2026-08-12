import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import {
  compressImageForUpload,
  detectBestPreset,
  IMAGE_UPLOAD_PRESETS,
  inferImageMimeType,
  isLikelyImageFile,
} from '~/server/utils/media-upload-image'

const PRESETS = IMAGE_UPLOAD_PRESETS

async function compressImage(
  buffer: Buffer,
  preset: { width: number, height: number },
  format: 'jpeg' | 'png' = 'jpeg',
) {
  let pipeline = sharp(buffer)
    .rotate()
    .resize({
      width: preset.width,
      height: preset.height,
      fit: 'inside',
      withoutEnlargement: true,
    })

  if (format === 'jpeg')
    pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true })
  else
    pipeline = pipeline.png({ compressionLevel: 9 })

  return pipeline.toBuffer({ resolveWithObject: true })
}

function createTestImage(width: number, height: number, channels: 3 | 4 = 3) {
  return sharp({
    create: {
      width,
      height,
      channels,
      background: channels === 4
        ? { r: 255, g: 0, b: 0, alpha: 0.5 }
        : { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer()
}

function createPngWithAlpha(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer()
}

describe('upload asset compression', () => {
  describe('mime detection', () => {
    it('infers jpeg from filename when multipart type is generic', () => {
      expect(inferImageMimeType('application/octet-stream', 'photo.jpg')).toBe('image/jpeg')
      expect(isLikelyImageFile('application/octet-stream', 'photo.jpg')).toBe(true)
    })
  })

  describe('aspect ratio detection', () => {
    it('detects square images (1:1)', () => {
      expect(detectBestPreset(1080, 1080)).toBe('square')
      expect(detectBestPreset(2000, 2000)).toBe('square')
    })

    it('detects portrait images (4:5)', () => {
      expect(detectBestPreset(1080, 1350)).toBe('portrait')
      expect(detectBestPreset(800, 1000)).toBe('portrait')
    })

    it('detects landscape images', () => {
      expect(detectBestPreset(1200, 630)).toBe('landscape')
      expect(detectBestPreset(1920, 1080)).toBe('landscape')
    })

    it('detects story/vertical images (9:16)', () => {
      expect(detectBestPreset(1080, 1920)).toBe('story')
      expect(detectBestPreset(750, 1334)).toBe('story')
    })
  })

  describe('image resizing', () => {
    it('resizes square image to 1080x1080 max', async () => {
      const input = await createTestImage(3000, 3000)
      const { info } = await compressImage(input, PRESETS.square)
      expect(info.width).toBe(1080)
      expect(info.height).toBe(1080)
    })

    it('resizes portrait image preserving 4:5 ratio', async () => {
      const input = await createTestImage(2160, 2700)
      const { info } = await compressImage(input, PRESETS.portrait)
      expect(info.width).toBe(1080)
      expect(info.height).toBe(1350)
    })

    it('resizes landscape image preserving ratio', async () => {
      const input = await createTestImage(2400, 1260)
      const { info } = await compressImage(input, PRESETS.landscape)
      expect(info.width).toBe(1200)
      expect(info.height).toBe(630)
    })

    it('resizes story image preserving 9:16 ratio', async () => {
      const input = await createTestImage(2160, 3840)
      const { info } = await compressImage(input, PRESETS.story)
      expect(info.width).toBe(1080)
      expect(info.height).toBe(1920)
    })

    it('does NOT upscale small images (withoutEnlargement)', async () => {
      const input = await createTestImage(500, 500)
      const { info } = await compressImage(input, PRESETS.square)
      expect(info.width).toBe(500)
      expect(info.height).toBe(500)
    })

    it('fits non-matching aspect ratio inside preset bounds', async () => {
      const input = await createTestImage(3000, 2000)
      const { info } = await compressImage(input, PRESETS.square)
      expect(info.width).toBeLessThanOrEqual(1080)
      expect(info.height).toBeLessThanOrEqual(1080)
      const ratio = info.width / info.height
      expect(ratio).toBeCloseTo(3000 / 2000, 1)
    })
  })

  describe('compression quality', () => {
    it('JPEG output is significantly smaller than input', async () => {
      const input = await createTestImage(3000, 3000)
      const { data } = await compressImage(input, PRESETS.square, 'jpeg')
      expect(data.length).toBeLessThan(input.length)
    })

    it('preserves PNG format for images with alpha channel', async () => {
      const input = await createPngWithAlpha(2000, 2000)
      const { data } = await compressImage(input, PRESETS.square, 'png')
      const meta = await sharp(data).metadata()
      expect(meta.format).toBe('png')
      expect(meta.channels).toBe(4)
    })

    it('falls back to original bytes when compression fails', async () => {
      const input = Buffer.from('not-an-image')
      const result = await compressImageForUpload(input, {
        inputMime: 'image/jpeg',
      })

      expect(result.compressed).toBe(false)
      expect(result.format).toBe('original')
      expect(result.data.equals(input)).toBe(true)
    })

    it('falls back to original bytes when sharp module fails to load', async () => {
      const input = await createTestImage(400, 400)
      vi.resetModules()
      vi.doMock('sharp', () => {
        throw new Error('Could not load the "sharp" module using the linux-x64 runtime')
      })

      const { compressImageForUpload: compressWithBrokenSharp } = await import('~/server/utils/media-upload-image')
      const result = await compressWithBrokenSharp(input, {
        inputMime: 'image/jpeg',
      })

      expect(result.compressed).toBe(false)
      expect(result.format).toBe('original')
      expect(result.data.equals(input)).toBe(true)
      expect(result.mimeType).toBe('image/jpeg')

      vi.doUnmock('sharp')
      vi.resetModules()
    })
  })
})
