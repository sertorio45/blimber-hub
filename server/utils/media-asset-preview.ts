export interface StorageSignedUrlRow {
  path?: string | null
  signedUrl?: string | null
  signedURL?: string | null
  error?: unknown
}

export interface MediaAssetPreviewRow {
  id?: string
  object_path?: string | null
  objectPath?: string | null
  [key: string]: unknown
}

function supabaseOrigin(): string {
  return (
    process.env.SUPABASE_URL
    || process.env.NUXT_PUBLIC_SUPABASE_URL
    || ''
  ).replace(/\/$/, '')
}

/** Absolute signed URL from storage-js (`signedUrl`) or legacy relative `signedURL`. */
export function extractStorageSignedUrl(row: StorageSignedUrlRow | null | undefined): string | null {
  if (!row || row.error)
    return null

  const raw = row.signedUrl || row.signedURL || null
  if (!raw)
    return null
  if (/^https?:\/\//i.test(raw))
    return raw

  const origin = supabaseOrigin()
  if (!origin)
    return null
  if (raw.startsWith('/object/'))
    return `${origin}/storage/v1${raw}`
  if (raw.startsWith('/storage/'))
    return `${origin}${raw}`
  return null
}

export function mediaAssetFileUrl(assetId: string, tenantId: string): string {
  return `/api/marketing/social/assets/${assetId}/file?tenant_id=${encodeURIComponent(tenantId)}`
}

export function mediaAssetObjectPath(asset: MediaAssetPreviewRow): string {
  return String(asset.objectPath || asset.object_path || '')
}

function isAbsoluteHttpUrl(url: string | null): url is string {
  return Boolean(url && /^https?:\/\//i.test(url))
}

/**
 * Attach a public signed URL to each library row. Never fall back to an
 * authenticated `/api/.../file` route — `<img>` cannot send Bearer tokens.
 */
export async function attachMediaAssetPreviews<T extends MediaAssetPreviewRow>(
  client: {
    storage: {
      from: (bucket: string) => {
        createSignedUrls: (
          paths: string[],
          expiresIn: number,
        ) => Promise<{ data: StorageSignedUrlRow[] | null, error: { message?: string } | null }>
        createSignedUrl?: (
          path: string,
          expiresIn: number,
        ) => Promise<{ data: StorageSignedUrlRow | null, error: { message?: string } | null }>
      }
    }
  },
  assets: T[],
  _tenantId: string,
  expiresIn = 60 * 60 * 4,
): Promise<Array<T & { preview_url: string | null, previewUrl: string | null }>> {
  const paths = assets.map(asset => mediaAssetObjectPath(asset)).filter(Boolean)
  const bucket = client.storage.from('marketing-assets')
  const { data: signedRows, error: signError } = paths.length
    ? await bucket.createSignedUrls(paths, expiresIn)
    : { data: [], error: null }

  if (signError)
    console.warn('[media_assets] batch signed URL generation failed:', signError.message)

  const signedByPath = new Map<string, string>()
  for (const row of signedRows || []) {
    const url = extractStorageSignedUrl(row)
    if (row?.path && isAbsoluteHttpUrl(url))
      signedByPath.set(row.path, url)
  }

  const rows: Array<T & { preview_url: string | null, previewUrl: string | null }> = []

  for (const [index, asset] of assets.entries()) {
    const objectPath = mediaAssetObjectPath(asset)
    let preview = (objectPath ? signedByPath.get(objectPath) : null)
      || extractStorageSignedUrl(signedRows?.[index])
      || null

    if (!isAbsoluteHttpUrl(preview) && objectPath && bucket.createSignedUrl) {
      const { data: signed, error } = await bucket.createSignedUrl(objectPath, expiresIn)
      if (error)
        console.warn('[media_assets] signed URL generation failed:', objectPath, error.message)
      preview = extractStorageSignedUrl(signed)
    }

    const display = isAbsoluteHttpUrl(preview) ? preview : null
    rows.push({
      ...asset,
      preview_url: display,
      previewUrl: display,
    })
  }

  return rows
}
