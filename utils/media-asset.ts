import type { BrandGuideLogoAsset } from '~/types/brand-guide'
import type { MediaAsset } from '~/types/marketing-social'

/** Raw library/API asset row (snake_case, camelCase, or mix). */
export type MediaAssetLike = Partial<MediaAsset> & {
  id?: string
  name?: string
  mime_type?: string
  mimeType?: string
  object_path?: string
  objectPath?: string
  preview_url?: string | null
  previewUrl?: string | null
  purpose?: string
  category?: string | null
}

export function mediaAssetMimeType(asset: MediaAssetLike): string {
  return asset.mimeType || asset.mime_type || ''
}

export function mediaAssetObjectPath(asset: MediaAssetLike): string {
  return asset.objectPath || asset.object_path || ''
}

export function mediaAssetPreviewUrl(asset: MediaAssetLike): string | null {
  return asset.previewUrl || asset.preview_url || null
}

/** Map library asset into Brand Center logo/reference preview shape. */
export function toBrandGuideLogoAsset(asset: MediaAssetLike): BrandGuideLogoAsset | null {
  if (!asset?.id)
    return null
  return {
    id: asset.id,
    name: asset.name || 'Arquivo',
    mimeType: mediaAssetMimeType(asset),
    previewUrl: mediaAssetPreviewUrl(asset),
    objectPath: mediaAssetObjectPath(asset),
  }
}
