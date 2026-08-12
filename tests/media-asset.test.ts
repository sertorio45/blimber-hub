import { describe, expect, it } from 'vitest'
import {
  isDisplayablePreviewUrl,
  mediaAssetMimeType,
  mediaAssetObjectPath,
  mediaAssetPreviewUrl,
  toBrandGuideLogoAsset,
} from '~/utils/media-asset'
import {
  libraryAssetDisplayUrl,
  libraryAssetFileUrl,
  libraryAssetIsImage,
  mergeLibraryAssetPreviews,
  normalizeLibraryAsset,
} from '~/composables/marketing/useMediaLibrary'

describe('media-asset utils', () => {
  it('reads snake_case and camelCase asset fields', () => {
    const snake = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'logo.svg',
      mime_type: 'image/svg+xml',
      object_path: 'tenant/logo/original.svg',
      preview_url: 'https://cdn.example/preview.svg',
    }

    expect(mediaAssetMimeType(snake)).toBe('image/svg+xml')
    expect(mediaAssetObjectPath(snake)).toBe('tenant/logo/original.svg')
    expect(mediaAssetPreviewUrl(snake)).toBe('https://cdn.example/preview.svg')
    expect(toBrandGuideLogoAsset(snake)).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      previewUrl: 'https://cdn.example/preview.svg',
      objectPath: 'tenant/logo/original.svg',
    })
  })

  it('prefers camelCase when both shapes exist', () => {
    const mixed = {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'marca.png',
      mimeType: 'image/png',
      mime_type: 'image/jpeg',
      objectPath: 'a/b.png',
      object_path: 'x/y.jpg',
      previewUrl: 'https://cdn.example/a.png',
      preview_url: 'https://cdn.example/b.jpg',
    }

    expect(toBrandGuideLogoAsset(mixed)).toEqual({
      id: '22222222-2222-2222-2222-222222222222',
      name: 'marca.png',
      mimeType: 'image/png',
      previewUrl: 'https://cdn.example/a.png',
      objectPath: 'a/b.png',
    })
  })

  it('returns null without id', () => {
    expect(toBrandGuideLogoAsset({ name: 'x' })).toBeNull()
  })
})

describe('media library asset helpers', () => {
  it('normalizes API rows and keeps preview_url when present', () => {
    const row = normalizeLibraryAsset({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'banner.jpg',
      mime_type: 'image/jpeg',
      preview_url: 'https://cdn.example/banner.jpg',
    })

    expect(row.preview_url).toBe('https://cdn.example/banner.jpg')
    expect(row.previewUrl).toBe('https://cdn.example/banner.jpg')
    expect(row.mimeType).toBe('image/jpeg')
  })

  it('creates a blob preview when signed URL is missing', () => {
    const file = new File(['hello'], 'photo.png', { type: 'image/png' })
    const row = normalizeLibraryAsset({
      id: '22222222-2222-2222-2222-222222222222',
      name: 'photo.png',
      mime_type: 'image/png',
    }, file)

    expect(row.preview_url).toMatch(/^blob:/)
    expect(row.previewUrl).toMatch(/^blob:/)
  })

  it('re-applies local previews after refresh when server preview is still missing', () => {
    const local = normalizeLibraryAsset({
      id: '33333333-3333-3333-3333-333333333333',
      name: 'local.jpg',
      mime_type: 'image/jpeg',
    }, new File(['x'], 'local.jpg', { type: 'image/jpeg' }))

    const merged = mergeLibraryAssetPreviews([
      {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'local.jpg',
        mime_type: 'image/jpeg',
        preview_url: null,
      },
    ], [local])

    expect(merged[0]?.preview_url).toMatch(/^blob:/)
  })

  it('does not use the authenticated file route as img src', () => {
    const tenantId = '2fa71211-7919-4488-86af-3f3fb56427ea'
    const fileRoute = `/api/marketing/social/assets/4b293323-1f90-43ef-8893-7acd06c1f1ac/file?tenant_id=${tenantId}`
    const payload = {
      id: '4b293323-1f90-43ef-8893-7acd06c1f1ac',
      tenant_id: tenantId,
      name: 'Posts-AgostoPost-04---4.png',
      mime_type: 'image/jpeg',
      object_path: `${tenantId}/5706455e-5426-4a0d-8cae-7711204edf6a/optimized.jpg`,
      status: 'ready',
      purpose: 'publication',
      lifecycle: 'active',
      category: null,
      created_at: '2026-08-12T11:14:20.34016+00',
      size_bytes: 100259,
      preview_url: fileRoute,
      previewUrl: fileRoute,
    }

    const row = normalizeLibraryAsset(payload)
    expect(isDisplayablePreviewUrl(fileRoute)).toBe(false)
    expect(libraryAssetIsImage(row)).toBe(true)
    expect(libraryAssetDisplayUrl(row, tenantId)).toBeNull()
    expect(libraryAssetFileUrl(row.id, tenantId)).toContain('/api/')
  })

  it('maps a real list payload signed URL to the grid src', () => {
    const tenantId = '2fa71211-7919-4488-86af-3f3fb56427ea'
    const signed = 'https://srzohnuulwgonduoudfp.supabase.co/storage/v1/object/sign/marketing-assets/x.jpg?token=abc'
    const payload = {
      id: '4b293323-1f90-43ef-8893-7acd06c1f1ac',
      tenant_id: tenantId,
      name: 'Posts-AgostoPost-04---4.png',
      mime_type: 'image/jpeg',
      object_path: `${tenantId}/5706455e-5426-4a0d-8cae-7711204edf6a/optimized.jpg`,
      preview_url: signed,
      previewUrl: signed,
    }

    const row = normalizeLibraryAsset(payload)
    expect(libraryAssetIsImage(row)).toBe(true)
    expect(libraryAssetDisplayUrl(row, tenantId)).toBe(signed)
  })

  it('uses a blob thumbnail when the API only returned an authenticated file route', () => {
    const file = new File(['hello'], 'photo.png', { type: 'image/png' })
    const row = normalizeLibraryAsset({
      id: '4b293323-1f90-43ef-8893-7acd06c1f1ac',
      name: 'photo.png',
      mime_type: 'image/jpeg',
      preview_url: '/api/marketing/social/assets/4b293323-1f90-43ef-8893-7acd06c1f1ac/file',
    }, file)

    expect(row.preview_url).toMatch(/^blob:/)
    expect(libraryAssetDisplayUrl(row)).toMatch(/^blob:/)
  })
})
