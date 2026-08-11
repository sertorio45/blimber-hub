import { describe, expect, it } from 'vitest'
import {
  mediaAssetMimeType,
  mediaAssetObjectPath,
  mediaAssetPreviewUrl,
  toBrandGuideLogoAsset,
} from '~/utils/media-asset'

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
