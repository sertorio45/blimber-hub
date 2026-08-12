import type { MediaAssetDeletePreviewResult } from '~/server/utils/media-asset-deletion'
import type { MediaAssetLike } from '~/utils/media-asset'
import { isDisplayablePreviewUrl, mediaAssetMimeType, mediaAssetPreviewUrl } from '~/utils/media-asset'

export type LibraryAssetRow = MediaAssetLike & {
  id: string
  name: string
  size_bytes?: number
  sizeBytes?: number
  created_at?: string
  createdAt?: string
  purpose?: string
  lifecycle?: string
}

export interface MediaLibraryUploadItem {
  id: string
  name: string
  previewUrl?: string | null
}

const IMAGE_NAME_RE = /\.(?:jpe?g|png|gif|webp|svg|heic|heif|avif|bmp)$/i

export function formatMediaAssetSize(bytes?: number | null): string {
  const value = Number(bytes || 0)
  if (value < 1024)
    return `${Math.max(1, value)} B`
  if (value < 1024 * 1024)
    return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function formatMediaAssetDate(value?: string | null): string {
  if (!value)
    return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function libraryAssetSize(asset: LibraryAssetRow): number {
  return Number(asset.sizeBytes ?? asset.size_bytes ?? 0)
}

export function libraryAssetCreatedAt(asset: LibraryAssetRow): string | null {
  return asset.createdAt || asset.created_at || null
}

export function libraryAssetFileUrl(assetId: string, tenantId?: string | null): string {
  const query = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ''
  return `/api/marketing/social/assets/${assetId}/file${query}`
}

export function libraryAssetPreview(asset: LibraryAssetRow): string | null {
  return mediaAssetPreviewUrl(asset)
}

/** Signed or blob URL only — never an authenticated API route. */
export function libraryAssetDisplayUrl(asset: LibraryAssetRow, _tenantId?: string | null): string | null {
  return libraryAssetPreview(asset)
}

export function normalizeLibraryAsset(
  asset: MediaAssetLike,
  localFile?: File,
): LibraryAssetRow {
  const preview = mediaAssetPreviewUrl(asset)
    || (localFile ? URL.createObjectURL(localFile) : null)
  const mimeType = mediaAssetMimeType(asset) || localFile?.type || ''

  return {
    ...asset,
    id: asset.id || '',
    name: asset.name || localFile?.name || 'Arquivo',
    mime_type: asset.mime_type || mimeType,
    mimeType: asset.mimeType || mimeType,
    preview_url: preview,
    previewUrl: preview,
    size_bytes: asset.size_bytes ?? asset.sizeBytes,
    sizeBytes: asset.sizeBytes ?? asset.size_bytes,
    created_at: asset.created_at ?? asset.createdAt,
    createdAt: asset.createdAt ?? asset.created_at,
  }
}

export function mergeLibraryAssetPreviews(
  assets: LibraryAssetRow[],
  localPreviews: LibraryAssetRow[],
): LibraryAssetRow[] {
  if (!localPreviews.length)
    return assets

  const previewsById = new Map(
    localPreviews
      .map(asset => [asset.id, libraryAssetPreview(asset)] as const)
      .filter(([id, preview]) => Boolean(id && preview)),
  )

  return assets.map((asset) => {
    if (libraryAssetPreview(asset))
      return asset

    const fallbackPreview = previewsById.get(asset.id)
    if (!isDisplayablePreviewUrl(fallbackPreview))
      return asset

    return {
      ...asset,
      preview_url: fallbackPreview,
      previewUrl: fallbackPreview,
    }
  })
}

export function libraryAssetIsImage(asset: LibraryAssetRow): boolean {
  const mime = mediaAssetMimeType(asset)
  if (mime.startsWith('image/'))
    return true
  return IMAGE_NAME_RE.test(asset.name || '')
}

export function libraryAssetIsVideo(asset: LibraryAssetRow): boolean {
  return mediaAssetMimeType(asset).startsWith('video/')
}

export function libraryAssetPurposeLabel(purpose?: string | null): string {
  return purpose === 'reference' ? 'Referência' : 'Peça final'
}

export function useMediaLibrary() {
  const social = useMarketingSocial()

  function tenantBody(extra: Record<string, unknown> = {}) {
    return {
      tenant_id: social.tenantId.value || undefined,
      ...extra,
    }
  }

  async function previewDelete(assetIds: string[]) {
    const response = await $fetch<{ data: MediaAssetDeletePreviewResult }>(
      '/api/marketing/social/assets/delete-preview',
      {
        method: 'POST',
        body: tenantBody({ assetIds }),
      },
    )
    return response.data
  }

  async function deleteAssets(assetIds: string[]) {
    if (assetIds.length === 1) {
      await social.deleteAsset(assetIds[0]!)
      return { count: 1, deleted: [{ assetId: assetIds[0]!, name: '' }] }
    }

    const response = await $fetch<{
      success: boolean
      data: { count: number, deleted: Array<{ assetId: string, name: string }> }
    }>('/api/marketing/social/assets/bulk-delete', {
      method: 'POST',
      body: tenantBody({ assetIds }),
    })
    return response.data
  }

  return {
    previewDelete,
    deleteAssets,
    formatMediaAssetSize,
    formatMediaAssetDate,
    libraryAssetSize,
    libraryAssetCreatedAt,
    libraryAssetPreview,
    libraryAssetDisplayUrl,
    libraryAssetFileUrl,
    libraryAssetIsImage,
    libraryAssetIsVideo,
    libraryAssetPurposeLabel,
  }
}
