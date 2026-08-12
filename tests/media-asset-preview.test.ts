import { describe, expect, it, vi } from 'vitest'

import {
  attachMediaAssetPreviews,
  extractStorageSignedUrl,
  mediaAssetFileUrl,
} from '~/server/utils/media-asset-preview'

const TENANT = '2fa71211-7919-4488-86af-3f3fb56427ea'
const ASSET_ID = 'a46288de-fd7b-4140-8d23-4d479bf7457b'
const OBJECT_PATH = `${TENANT}/9bb483ee-7875-4ffe-8e1d-b8079008a8bd/optimized.jpg`

describe('extractStorageSignedUrl', () => {
  it('prefers the absolute signedUrl field', () => {
    expect(extractStorageSignedUrl({
      path: OBJECT_PATH,
      signedUrl: 'https://example.supabase.co/storage/v1/object/sign/marketing-assets/x.jpg?token=abc',
      signedURL: '/object/sign/marketing-assets/x.jpg?token=abc',
    })).toBe('https://example.supabase.co/storage/v1/object/sign/marketing-assets/x.jpg?token=abc')
  })

  it('absolutizes a relative signedURL using SUPABASE_URL', () => {
    const previous = process.env.SUPABASE_URL
    process.env.SUPABASE_URL = 'https://srzohnuulwgonduoudfp.supabase.co'
    try {
      expect(extractStorageSignedUrl({
        path: OBJECT_PATH,
        signedURL: '/object/sign/marketing-assets/x.jpg?token=abc',
      })).toBe('https://srzohnuulwgonduoudfp.supabase.co/storage/v1/object/sign/marketing-assets/x.jpg?token=abc')
    }
    finally {
      process.env.SUPABASE_URL = previous
    }
  })

  it('returns null when the row has an error', () => {
    expect(extractStorageSignedUrl({
      path: OBJECT_PATH,
      signedUrl: 'https://example.com/x.jpg',
      error: 'not found',
    })).toBeNull()
  })
})

describe('attachMediaAssetPreviews', () => {
  it('maps signed URLs by object path', async () => {
    const createSignedUrls = vi.fn(async () => ({
      data: [{
        error: null,
        path: OBJECT_PATH,
        signedUrl: 'https://cdn.example/signed.jpg',
        signedURL: '/object/sign/marketing-assets/x.jpg',
      }],
      error: null,
    }))

    const rows = await attachMediaAssetPreviews(
      { storage: { from: () => ({ createSignedUrls }) } },
      [{ id: ASSET_ID, name: 'foto.jpg', object_path: OBJECT_PATH }],
      TENANT,
    )

    expect(rows[0]?.preview_url).toBe('https://cdn.example/signed.jpg')
    expect(rows[0]?.previewUrl).toBe('https://cdn.example/signed.jpg')
  })

  it('leaves preview empty when signing fails instead of an authenticated file route', async () => {
    const createSignedUrls = vi.fn(async () => ({
      data: [{ error: 'missing', path: OBJECT_PATH, signedUrl: null }],
      error: null,
    }))

    const rows = await attachMediaAssetPreviews(
      { storage: { from: () => ({ createSignedUrls }) } },
      [{ id: ASSET_ID, name: 'foto.jpg', object_path: OBJECT_PATH }],
      TENANT,
    )

    expect(rows[0]?.preview_url).toBeNull()
    expect(rows[0]?.previewUrl).toBeNull()
    expect(mediaAssetFileUrl(ASSET_ID, TENANT)).toContain('/api/')
  })

  it('retries createSignedUrl when the batch row is not an absolute URL', async () => {
    const createSignedUrls = vi.fn(async () => ({
      data: [{ error: null, path: OBJECT_PATH, signedUrl: null }],
      error: null,
    }))
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://cdn.example/retry.jpg' },
      error: null,
    }))

    const rows = await attachMediaAssetPreviews(
      { storage: { from: () => ({ createSignedUrls, createSignedUrl }) } },
      [{ id: ASSET_ID, name: 'foto.jpg', object_path: OBJECT_PATH }],
      TENANT,
    )

    expect(createSignedUrl).toHaveBeenCalledWith(OBJECT_PATH, 60 * 60 * 4)
    expect(rows[0]?.preview_url).toBe('https://cdn.example/retry.jpg')
  })
})
