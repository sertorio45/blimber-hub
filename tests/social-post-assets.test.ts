import { beforeEach, describe, expect, it, vi } from 'vitest'

import { maxCarouselAssets, validateSocialPostAssets } from '~/server/utils/social-post-assets'

function createClient(assets: Array<{ id: string, purpose: string, mime_type: string, size_bytes?: number }>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: assets, error: null }),
    })),
  }
}

describe('maxCarouselAssets', () => {
  it('allows 20 items on Instagram and 10 elsewhere', () => {
    expect(maxCarouselAssets('instagram')).toBe(20)
    expect(maxCarouselAssets('facebook')).toBe(10)
    expect(maxCarouselAssets('linkedin')).toBe(10)
    expect(maxCarouselAssets(null)).toBe(10)
  })
})

describe('validateSocialPostAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts story with a single image', async () => {
    const client = createClient([
      { id: 'a1', purpose: 'publication', mime_type: 'image/jpeg' },
    ])
    await expect(validateSocialPostAssets(
      client,
      't1',
      [{ platform: 'instagram', format: 'story', assetIds: ['a1'] }],
      [],
    )).resolves.toBeUndefined()
  })

  it('accepts story with a single video', async () => {
    const client = createClient([
      { id: 'v1', purpose: 'publication', mime_type: 'video/mp4' },
    ])
    await expect(validateSocialPostAssets(
      client,
      't1',
      [{ platform: 'facebook', format: 'story', assetIds: ['v1'] }],
      [],
    )).resolves.toBeUndefined()
  })

  it('rejects story with two assets', async () => {
    const client = createClient([
      { id: 'a1', purpose: 'publication', mime_type: 'image/jpeg' },
      { id: 'a2', purpose: 'publication', mime_type: 'image/png' },
    ])
    await expect(validateSocialPostAssets(
      client,
      't1',
      [{ platform: 'instagram', format: 'story', assetIds: ['a1', 'a2'] }],
      [],
    )).rejects.toMatchObject({
      statusMessage: 'Post estático, Stories ou vídeo aceita somente um arquivo',
    })
  })

  it('rejects static format with video', async () => {
    const client = createClient([
      { id: 'v1', purpose: 'publication', mime_type: 'video/mp4' },
    ])
    await expect(validateSocialPostAssets(
      client,
      't1',
      [{ platform: 'instagram', format: 'static', assetIds: ['v1'] }],
      [],
    )).rejects.toMatchObject({
      statusMessage: 'Use o formato vídeo ou Stories para publicar este arquivo',
    })
  })

  it('allows Instagram carousel up to 20 items', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `ig-${i}`)
    const client = createClient(ids.map(id => ({
      id,
      purpose: 'publication',
      mime_type: 'image/jpeg',
    })))
    await expect(validateSocialPostAssets(
      client,
      't1',
      [{ platform: 'instagram', format: 'carousel', assetIds: ids }],
      [],
    )).resolves.toBeUndefined()
  })

  it('rejects Facebook carousel over 10 items', async () => {
    const ids = Array.from({ length: 11 }, (_, i) => `fb-${i}`)
    const client = createClient(ids.map(id => ({
      id,
      purpose: 'publication',
      mime_type: 'image/jpeg',
    })))
    await expect(validateSocialPostAssets(
      client,
      't1',
      [{ platform: 'facebook', format: 'carousel', assetIds: ids }],
      [],
    )).rejects.toMatchObject({
      statusMessage: 'Carrosséis aceitam no máximo 10 peças',
    })
  })
})
