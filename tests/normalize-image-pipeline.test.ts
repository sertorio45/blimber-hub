import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

import { normalizeImageForMeta, shouldNormalizeForMeta } from '~/lib/meta-ads/normalize-image'
import { MetaAdsToolError, uploadImage } from '~/lib/meta-ads'

vi.mock('~/lib/meta-ads/safe-url', () => ({
  assertSafeMediaUrl: vi.fn(async (url: string) => new URL(url)),
  assertPublicHostnameOrIp: vi.fn(),
}))

describe('normalizeImageForMeta', () => {
  it('converts PNG RGBA to JPEG (strips alpha, flattens to white)', async () => {
    const pngRgba = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
    }).png().toBuffer()

    const result = await normalizeImageForMeta(pngRgba, { originalMimeType: 'image/png' })

    expect(result.mimeType).toBe('image/jpeg')
    expect(result.convertedToJpeg).toBe(true)
    expect(result.normalized).toBe(true)
    expect(result.width).toBe(200)
    expect(result.height).toBe(200)

    const meta = await sharp(result.data).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.hasAlpha).toBeFalsy()
  })

  it('converts WebP to JPEG', async () => {
    const webp = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 128, b: 255 } },
    }).webp().toBuffer()

    const result = await normalizeImageForMeta(webp, { originalMimeType: 'image/webp' })

    expect(result.mimeType).toBe('image/jpeg')
    expect(result.convertedToJpeg).toBe(true)
    expect(result.originalMimeType).toBe('image/webp')
  })

  it('keeps JPEG as JPEG (still normalizes: rotate + strip metadata)', async () => {
    const jpeg = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 0, g: 0, b: 255 } },
    }).jpeg().toBuffer()

    const result = await normalizeImageForMeta(jpeg, { originalMimeType: 'image/jpeg' })

    expect(result.mimeType).toBe('image/jpeg')
    expect(result.normalized).toBe(true)
    expect(result.width).toBeLessThanOrEqual(300)
    expect(result.height).toBeLessThanOrEqual(200)
  })

  it('passes GIF through without processing (may be animated)', async () => {
    const gif = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
    }).gif().toBuffer()

    const result = await normalizeImageForMeta(gif, { originalMimeType: 'image/gif' })

    expect(result.mimeType).toBe('image/gif')
    expect(result.normalized).toBe(false)
    expect(result.convertedToJpeg).toBe(false)
  })

  it('GIF with forceJpeg converts to JPEG', async () => {
    const gif = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
    }).gif().toBuffer()

    const result = await normalizeImageForMeta(gif, { originalMimeType: 'image/gif', forceJpeg: true })

    expect(result.mimeType).toBe('image/jpeg')
    expect(result.convertedToJpeg).toBe(true)
  })

  it('respects maxWidth/maxHeight constraints', async () => {
    const large = await sharp({
      create: { width: 6000, height: 4000, channels: 3, background: { r: 128, g: 128, b: 128 } },
    }).jpeg().toBuffer()

    const result = await normalizeImageForMeta(large, {
      originalMimeType: 'image/jpeg',
      maxWidth: 1200,
      maxHeight: 628,
    })

    expect(result.width).toBeLessThanOrEqual(1200)
    expect(result.height).toBeLessThanOrEqual(628)
  })
})

describe('shouldNormalizeForMeta', () => {
  it('detects alpha channel as needing normalization', async () => {
    const pngRgba = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
    }).png().toBuffer()

    const probe = await shouldNormalizeForMeta(pngRgba, 'image/png')
    expect(probe.needsNormalization).toBe(true)
    expect(probe.reason).toContain('alpha_channel')
  })

  it('detects WebP as needing normalization', async () => {
    const webp = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).webp().toBuffer()

    const probe = await shouldNormalizeForMeta(webp, 'image/webp')
    expect(probe.needsNormalization).toBe(true)
    expect(probe.reason).toContain('webp_format')
  })
})

describe('uploadImage URL→bytes retry', () => {
  const META_CAPABILITY_ERROR = new MetaAdsToolError(
    'META_GRAPH_ERROR',
    '(#3) Application does not have the capability to make this API call',
    400,
    { code: 3, error_subcode: null },
  )

  const META_FORMAT_ERROR = new MetaAdsToolError(
    'META_GRAPH_ERROR',
    'Formato de imagem inválido',
    400,
    { code: 324, error_subcode: 2446496 },
  )

  it('retries URL upload as bytes when Meta returns capability error #3', async () => {
    const jpeg = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).jpeg().toBuffer()

    let callCount = 0
    const graphFetch = vi.fn(async (_url: string, init?: any) => {
      callCount++
      if (callCount === 1 && !init?.body?.bytes) {
        throw META_CAPABILITY_ERROR
      }
      return { images: { 'test.jpg': { hash: 'hash_retry_ok', width: 100, height: 100 } } }
    })

    // Mock fetch for URL download
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr === 'https://cdn.example.com/test.jpg') {
        return new Response(jpeg, { status: 200 })
      }
      return originalFetch(url, init as any)
    }) as any

    try {
      const result = await uploadImage(
        {
          apiVersion: 'v25.0',
          accessToken: 'token',
          adAccountId: '555',
          graph: graphFetch,
        },
        { imageUrl: 'https://cdn.example.com/test.jpg', name: 'test.jpg', mimeType: 'image/jpeg' },
      )

      expect(result.imageHash).toBe('hash_retry_ok')
      expect(graphFetch).toHaveBeenCalledTimes(2)
      const secondCall = graphFetch.mock.calls[1]!
      expect(secondCall[1]?.body?.bytes).toBeDefined()
      expect(secondCall[1]?.bodyEncoding).toBe('form')
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('retries format error (subcode 2446496) by downloading + normalizing to JPEG', async () => {
    const pngRgba = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
    }).png().toBuffer()

    let callCount = 0
    const graphFetch = vi.fn(async (_url: string, init?: any) => {
      callCount++
      if (callCount === 1 && !init?.body?.bytes) {
        throw META_FORMAT_ERROR
      }
      return { images: { 'test.png': { hash: 'hash_jpeg_fallback', width: 100, height: 100 } } }
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr === 'https://cdn.example.com/test.png') {
        return new Response(pngRgba, { status: 200 })
      }
      return originalFetch(url, init as any)
    }) as any

    try {
      const result = await uploadImage(
        {
          apiVersion: 'v25.0',
          accessToken: 'token',
          adAccountId: '555',
          graph: graphFetch,
        },
        { imageUrl: 'https://cdn.example.com/test.png', name: 'test.png', mimeType: 'image/png' },
      )

      expect(result.imageHash).toBe('hash_jpeg_fallback')
      expect(result.normalized).toBe(true)
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('sourceBase64 normalizes and uploads as bytes', async () => {
    const pngRgba = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
    }).png().toBuffer()

    const graphFetch = vi.fn(async () => ({
      images: { 'b64.png': { hash: 'hash_b64', width: 50, height: 50 } },
    }))

    const result = await uploadImage(
      {
        apiVersion: 'v25.0',
        accessToken: 'token',
        adAccountId: '555',
        graph: graphFetch,
      },
      { sourceBase64: pngRgba.toString('base64'), name: 'b64.png', mimeType: 'image/png' },
    )

    expect(result.imageHash).toBe('hash_b64')
    expect(result.normalized).toBe(true)
    expect(result.mimeType).toBe('image/jpeg')
    expect(graphFetch).toHaveBeenCalledOnce()
    expect(graphFetch.mock.calls[0]![1]?.bodyEncoding).toBe('form')
  })
})
