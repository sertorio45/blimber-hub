export interface SocialPreviewAsset {
  id: string
  name?: string
  mime_type?: string
  mimeType?: string
  preview_url?: string | null
  previewUrl?: string | null
  purpose?: string
}

export interface SocialContentBoardItem {
  id: string
  title: string
  caption?: string | null
  status: string
  statusLabel: string
  /** MVP simplified status when resolved by the caller. */
  mvpStatus?: string | null
  platforms: string[]
  previewAssets: SocialPreviewAsset[]
  meta?: string | null
  campaignLabel?: string | null
  assigneeLabel?: string | null
  href?: string
  raw?: unknown
}

function assetMime(asset: SocialPreviewAsset) {
  return asset.mime_type || asset.mimeType || ''
}

function assetPreview(asset: SocialPreviewAsset) {
  return asset.preview_url || asset.previewUrl || null
}

function uniqueById(assets: SocialPreviewAsset[]) {
  const seen = new Set<string>()
  return assets.filter((asset) => {
    if (!asset?.id || seen.has(asset.id))
      return false
    seen.add(asset.id)
    return true
  })
}

/** Unique publication assets from a post (same piece across networks appears once). */
export function uniquePostPreviewAssets(post: any): SocialPreviewAsset[] {
  const relations = (post?.social_post_variants || [])
    .flatMap((variant: any) => variant.social_post_assets || [])
    .sort((left: any, right: any) => Number(left.position || 0) - Number(right.position || 0))

  return uniqueById(
    relations
      .map((relation: any) => relation.media_assets)
      .filter(Boolean),
  )
}

/** Unique publication assets from an approval request snapshot. */
export function uniqueApprovalPreviewAssets(
  request: any,
  purpose: 'publication' | 'reference' = 'publication',
): SocialPreviewAsset[] {
  const version = Array.isArray(request?.content_versions)
    ? request.content_versions[0]
    : request?.content_versions
  const relations = (version?.snapshot?.assets || [])
    .filter((relation: any) => {
      const assetPurpose = relation.media_assets?.purpose
      return purpose === 'publication'
        ? assetPurpose === 'publication' || (!assetPurpose && relation.variant_id)
        : assetPurpose === 'reference' || (!assetPurpose && !relation.variant_id)
    })
    .sort((left: any, right: any) => Number(left.position || 0) - Number(right.position || 0))

  return uniqueById(
    relations
      .map((relation: any) => relation.media_assets)
      .filter(Boolean),
  )
}

export function primaryPreviewAsset(assets: SocialPreviewAsset[]) {
  return assets[0] || null
}

export function isImageAsset(asset?: SocialPreviewAsset | null) {
  return Boolean(asset && assetMime(asset).startsWith('image/'))
}

export function isVideoAsset(asset?: SocialPreviewAsset | null) {
  return Boolean(asset && assetMime(asset).startsWith('video/'))
}

export function previewUrl(asset?: SocialPreviewAsset | null) {
  return asset ? assetPreview(asset) : null
}

export function platformIcon(platform: string) {
  if (platform === 'linkedin')
    return 'lucide:linkedin'
  if (platform === 'instagram')
    return 'lucide:instagram'
  return 'lucide:facebook'
}

export interface PreviewMediaItem {
  url: string
  type: 'image' | 'video'
  width?: number | null
  height?: number | null
}

/** Common social ratios used for preview chrome and labels. */
const COMMON_RATIOS: Array<{ label: string, value: number }> = [
  { label: '9:16', value: 9 / 16 },
  { label: '4:5', value: 4 / 5 },
  { label: '1:1', value: 1 },
  { label: '1.91:1', value: 1.91 },
  { label: '16:9', value: 16 / 9 },
]

export function aspectRatioLabel(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0)
    return '—'
  let best = COMMON_RATIOS[0]!
  let bestDelta = Math.abs(ratio - best.value)
  for (const candidate of COMMON_RATIOS) {
    const delta = Math.abs(ratio - candidate.value)
    if (delta < bestDelta) {
      best = candidate
      bestDelta = delta
    }
  }
  if (bestDelta <= 0.08)
    return best.label
  return `${ratio.toFixed(2).replace(/\.?0+$/, '')}:1`
}

/**
 * Frame aspect for the live post preview.
 * Prefer intrinsic media size when known. Stories / IG Reels keep a 9:16 phone chrome
 * only as fallback when dimensions were not probed yet.
 */
export function resolveDisplayAspectRatio(input: {
  format?: string | null
  platform?: string | null
  width?: number | null
  height?: number | null
}): number {
  const format = String(input.format || '')
  const platform = String(input.platform || '')
  const width = Number(input.width)
  const height = Number(input.height)

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    const ratio = width / height
    // Clamp extreme ratios so the mockup stays readable in the sidebar.
    return Math.min(2.4, Math.max(0.4, ratio))
  }

  if (format === 'story' || (format === 'video' && platform === 'instagram'))
    return 9 / 16
  if (platform === 'instagram')
    return 1
  return 1.91
}

export function previewFormatBadge(input: {
  format?: string | null
  platform?: string | null
  mediaCount?: number
  aspectLabel?: string
}): string {
  const format = String(input.format || 'static')
  if (format === 'story')
    return `Stories · ${input.aspectLabel || '9:16'}`
  if (format === 'video' && input.platform === 'instagram')
    return `Reels · ${input.aspectLabel || '9:16'}`
  if (format === 'video')
    return `Vídeo · ${input.aspectLabel || '16:9'}`
  if (format === 'carousel' || (input.mediaCount || 0) > 1)
    return `Carrossel · ${input.aspectLabel || '1:1'}`
  return input.aspectLabel || '1:1'
}

export type ProbedMediaSize = {
  width: number
  height: number
}

const mediaSizeCache = new Map<string, ProbedMediaSize>()
const mediaSizeInflight = new Map<string, Promise<ProbedMediaSize | null>>()

function probeImageSize(url: string): Promise<ProbedMediaSize | null> {
  if (typeof Image === 'undefined')
    return Promise.resolve(null)

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (width > 0 && height > 0)
        resolve({ width, height })
      else
        resolve(null)
    }
    image.onerror = () => resolve(null)
    image.src = url
  })
}

function probeVideoSize(url: string): Promise<ProbedMediaSize | null> {
  if (typeof document === 'undefined')
    return Promise.resolve(null)

  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
    }

    video.onloadedmetadata = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      cleanup()
      if (width > 0 && height > 0)
        resolve({ width, height })
      else
        resolve(null)
    }
    video.onerror = () => {
      cleanup()
      resolve(null)
    }
    video.src = url
  })
}

/** Read intrinsic width/height from a public media URL (cached). */
export async function probeMediaSize(
  url: string,
  type: 'image' | 'video' = 'image',
): Promise<ProbedMediaSize | null> {
  const key = `${type}:${url}`
  const cached = mediaSizeCache.get(key)
  if (cached)
    return cached

  const inflight = mediaSizeInflight.get(key)
  if (inflight)
    return inflight

  const task = (type === 'video' ? probeVideoSize(url) : probeImageSize(url))
    .then((size) => {
      if (size)
        mediaSizeCache.set(key, size)
      mediaSizeInflight.delete(key)
      return size
    })
    .catch(() => {
      mediaSizeInflight.delete(key)
      return null
    })

  mediaSizeInflight.set(key, task)
  return task
}

/** Test helper — clears probe cache between cases. */
export function clearMediaSizeProbeCache() {
  mediaSizeCache.clear()
  mediaSizeInflight.clear()
}
