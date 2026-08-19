/**
 * Resolve tenant-isolated Marketing library images (media_assets +
 * marketing-assets bucket) for Meta ad image upload. Never logs file bytes
 * or storage tokens. Video assets are rejected — use meta_upload_video.
 */

import { MetaAdsToolError } from './types'

export const MARKETING_ASSETS_BUCKET = 'marketing-assets'
/** Meta adimages typical cap (JPG/PNG/GIF). */
export const META_AD_IMAGE_MAX_BYTES = 30 * 1024 * 1024

const META_AD_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
])

export type LibraryAssetClient = {
  from: (table: string) => {
    select: (columns: string) => any
  }
  storage?: {
    from: (bucket: string) => {
      download?: (path: string) => Promise<{
        data: Blob | ArrayBuffer | Uint8Array | Buffer | null
        error: { message?: string } | null
      }>
      createSignedUrl?: (
        path: string,
        expiresIn: number,
      ) => Promise<{
        data: { signedUrl?: string | null, signedURL?: string | null } | null
        error?: { message?: string } | null
      }>
    }
  }
}

export type LibraryImageAsset = {
  id: string
  tenantId: string
  name: string
  mimeType: string
  objectPath: string
  bucket: string
  width: number | null
  height: number | null
  sizeBytes: number | null
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function toBuffer(data: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(data))
    return data
  if (data instanceof Uint8Array)
    return Buffer.from(data)
  if (data instanceof ArrayBuffer)
    return Buffer.from(data)
  if (data && typeof (data as Blob).arrayBuffer === 'function')
    return Buffer.from(await (data as Blob).arrayBuffer())
  throw new MetaAdsToolError(
    'LIBRARY_ASSET_DOWNLOAD_FAILED',
    'Arquivo da biblioteca em formato inesperado.',
    502,
  )
}

function signedUrlFromRow(row: { signedUrl?: string | null, signedURL?: string | null } | null | undefined): string | null {
  if (!row)
    return null
  const raw = row.signedUrl || row.signedURL || null
  if (!raw)
    return null
  if (/^https?:\/\//i.test(raw))
    return raw
  const origin = (
    process.env.SUPABASE_URL
    || process.env.NUXT_PUBLIC_SUPABASE_URL
    || ''
  ).replace(/\/$/, '')
  if (!origin)
    return null
  if (raw.startsWith('/object/'))
    return `${origin}/storage/v1${raw}`
  if (raw.startsWith('/storage/'))
    return `${origin}${raw}`
  return null
}

/**
 * Load media_assets by id and assert it belongs to tenantId.
 * Tenant mismatch → 403 (does not leak the other tenant's metadata).
 */
export async function loadLibraryImageAsset(
  client: LibraryAssetClient,
  tenantId: string,
  assetId: string,
): Promise<LibraryImageAsset> {
  const id = String(assetId || '').trim()
  const tenant = String(tenantId || '').trim()
  if (!id || !isUuidLike(id)) {
    throw new MetaAdsToolError(
      'ASSET_ID_INVALID',
      'assetId deve ser o UUID do arquivo na Biblioteca de mídia.',
      400,
    )
  }
  if (!tenant) {
    throw new MetaAdsToolError('TENANT_REQUIRED', 'tenantId é obrigatório', 400)
  }

  const { data, error } = await client
    .from('media_assets')
    .select('id, tenant_id, name, mime_type, object_path, bucket, width, height, size_bytes, status')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new MetaAdsToolError(
      'LIBRARY_ASSET_QUERY_FAILED',
      'Falha ao consultar a biblioteca de mídia.',
      500,
    )
  }

  if (!data) {
    throw new MetaAdsToolError(
      'ASSET_NOT_FOUND',
      'Arquivo não encontrado na biblioteca deste tenant.',
      404,
    )
  }

  if (String(data.tenant_id) !== tenant) {
    throw new MetaAdsToolError(
      'ASSET_TENANT_MISMATCH',
      'O arquivo não pertence a este tenant.',
      403,
    )
  }

  const mime = String(data.mime_type || '').trim().toLowerCase()
  if (mime.startsWith('video/')) {
    throw new MetaAdsToolError(
      'LIBRARY_ASSET_NOT_IMAGE',
      'assetId de vídeo não é suportado em meta_upload_image / createAd. Use meta_upload_video com videoUrl (HTTPS).',
      400,
      { mimeType: mime },
    )
  }
  if (!META_AD_IMAGE_MIMES.has(mime)) {
    throw new MetaAdsToolError(
      'LIBRARY_ASSET_NOT_IMAGE',
      'A biblioteca só envia JPG, PNG, WebP ou GIF para a Meta (adimages). Este arquivo não é uma imagem de anúncio.',
      400,
      { mimeType: mime || null },
    )
  }

  const status = String(data.status || '').trim().toLowerCase()
  if (status === 'archived') {
    throw new MetaAdsToolError(
      'ASSET_NOT_FOUND',
      'Arquivo não encontrado na biblioteca deste tenant.',
      404,
    )
  }

  const objectPath = String(data.object_path || '').trim()
  if (!objectPath) {
    throw new MetaAdsToolError(
      'LIBRARY_ASSET_PATH_MISSING',
      'Arquivo da biblioteca sem object_path.',
      502,
    )
  }

  const sizeBytes = typeof data.size_bytes === 'number' ? data.size_bytes : null
  if (sizeBytes != null && sizeBytes > META_AD_IMAGE_MAX_BYTES) {
    throw new MetaAdsToolError(
      'LIBRARY_ASSET_TOO_LARGE',
      'Imagem da biblioteca excede o limite da Meta para adimages (30 MB).',
      400,
    )
  }

  return {
    id: String(data.id),
    tenantId: String(data.tenant_id),
    name: String(data.name || 'upload.jpg'),
    mimeType: mime,
    objectPath,
    bucket: String(data.bucket || MARKETING_ASSETS_BUCKET),
    width: typeof data.width === 'number' ? data.width : null,
    height: typeof data.height === 'number' ? data.height : null,
    sizeBytes,
  }
}

/**
 * Download library file via service-role storage.download, falling back to a
 * short-lived signed URL fetched by this server (never sent to Meta, never logged).
 */
export async function downloadLibraryImageBytes(
  client: LibraryAssetClient,
  asset: LibraryImageAsset,
): Promise<Buffer> {
  const storage = client.storage?.from(asset.bucket || MARKETING_ASSETS_BUCKET)
  if (!storage) {
    throw new MetaAdsToolError(
      'LIBRARY_STORAGE_UNAVAILABLE',
      'Storage da biblioteca indisponível neste cliente.',
      500,
    )
  }

  if (typeof storage.download === 'function') {
    const { data, error } = await storage.download(asset.objectPath)
    if (!error && data) {
      const buffer = await toBuffer(data)
      if (buffer.length > META_AD_IMAGE_MAX_BYTES) {
        throw new MetaAdsToolError(
          'LIBRARY_ASSET_TOO_LARGE',
          'Imagem da biblioteca excede o limite da Meta para adimages (30 MB).',
          400,
        )
      }
      if (!buffer.length) {
        throw new MetaAdsToolError(
          'LIBRARY_ASSET_DOWNLOAD_FAILED',
          'Arquivo da biblioteca vazio.',
          502,
        )
      }
      return buffer
    }
  }

  if (typeof storage.createSignedUrl === 'function') {
    const { data, error } = await storage.createSignedUrl(asset.objectPath, 120)
    if (error || !data) {
      throw new MetaAdsToolError(
        'LIBRARY_ASSET_DOWNLOAD_FAILED',
        'Falha ao obter o arquivo da biblioteca.',
        502,
      )
    }
    const url = signedUrlFromRow(data)
    if (!url) {
      throw new MetaAdsToolError(
        'LIBRARY_ASSET_DOWNLOAD_FAILED',
        'Falha ao obter o arquivo da biblioteca.',
        502,
      )
    }
    const response = await fetch(url)
    if (!response.ok) {
      throw new MetaAdsToolError(
        'LIBRARY_ASSET_DOWNLOAD_FAILED',
        'Falha ao baixar o arquivo da biblioteca.',
        502,
      )
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > META_AD_IMAGE_MAX_BYTES) {
      throw new MetaAdsToolError(
        'LIBRARY_ASSET_TOO_LARGE',
        'Imagem da biblioteca excede o limite da Meta para adimages (30 MB).',
        400,
      )
    }
    if (!buffer.length) {
      throw new MetaAdsToolError(
        'LIBRARY_ASSET_DOWNLOAD_FAILED',
        'Arquivo da biblioteca vazio.',
        502,
      )
    }
    return buffer
  }

  throw new MetaAdsToolError(
    'LIBRARY_ASSET_DOWNLOAD_FAILED',
    'Falha ao obter o arquivo da biblioteca.',
    502,
  )
}
