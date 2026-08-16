import { randomUUID } from 'node:crypto'

import { extractStorageSignedUrl } from '~/server/utils/media-asset-preview'
import {
  compressImageForUpload,
  inferImageMimeType,
  isLikelyImageFile,
  type ImageUploadFormatHint,
} from '~/server/utils/media-upload-image'
import { BlimberMcpError } from '~/lib/blimber-mcp/errors'
import type { BlimberMcpSupabaseLike } from '~/lib/blimber-mcp/types'

export const MARKETING_ASSETS_BUCKET = 'marketing-assets'
/** Same cap as Hub library / Storage (100MB). */
export const LIBRARY_UPLOAD_MAX_BYTES = 104_857_600
/** ChatGPT JSON payloads cannot carry full 100MB; keep base64 smaller. */
export const LIBRARY_BASE64_MAX_BYTES = 8 * 1024 * 1024
export const LIBRARY_SIGNED_URL_SECONDS = 60 * 60

export const LIBRARY_CATEGORIES = [
  'logo',
  'brand_manual',
  'photo',
  'video',
  'product',
  'document',
  'reference',
] as const

export type LibraryCategory = typeof LIBRARY_CATEGORIES[number]
export type LibraryAssetPurpose = 'reference' | 'publication'

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
])

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'qt'])

export function throwLibraryUpload(
  code: string,
  message: string,
  statusCode = 400,
): never {
  throw new BlimberMcpError(code, message, statusCode)
}

export function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const last = path.split('/').filter(Boolean).pop()
    if (last)
      return decodeURIComponent(last).slice(0, 255)
  }
  catch {
    // ignore
  }
  return 'upload.bin'
}

export function decodeLibraryBase64(raw: string): { buffer: Buffer, mimeHint: string | null } {
  const trimmed = String(raw || '').trim()
  if (!trimmed)
    throwLibraryUpload('BASE64_EMPTY', 'sourceBase64 vazio.')

  const dataUrl = trimmed.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i)
  const mimeHint = dataUrl?.[1] ? dataUrl[1].trim().toLowerCase() : null
  const payload = dataUrl ? dataUrl[2]! : trimmed.replace(/\s+/g, '')

  let buffer: Buffer
  try {
    buffer = Buffer.from(payload, 'base64')
  }
  catch {
    throwLibraryUpload('BASE64_INVALID', 'sourceBase64 inválido.')
  }

  if (!buffer.length)
    throwLibraryUpload('BASE64_EMPTY', 'sourceBase64 vazio após decode.')
  if (buffer.length > LIBRARY_BASE64_MAX_BYTES) {
    throwLibraryUpload(
      'FILE_TOO_LARGE',
      `sourceBase64 excede ${LIBRARY_BASE64_MAX_BYTES} bytes (use sourceUrl HTTPS).`,
      413,
    )
  }

  return { buffer, mimeHint }
}

export function isLikelyVideoFile(type: string | undefined, filename: string | undefined): boolean {
  const mime = (type || '').trim().toLowerCase()
  if (mime.startsWith('video/'))
    return VIDEO_MIMES.has(mime) || mime === 'video/quicktime'
  const extension = filename?.includes('.') ? filename.split('.').pop()?.toLowerCase() : null
  return Boolean(extension && VIDEO_EXTENSIONS.has(extension))
}

export function assertLibraryUploadKind(
  mime: string | undefined,
  filename: string | undefined,
  _purpose: LibraryAssetPurpose,
): { kind: 'image' | 'video', mime: string } {
  if (isLikelyImageFile(mime, filename)) {
    const inferred = inferImageMimeType(mime, filename)
    return { kind: 'image', mime: inferred }
  }
  if (isLikelyVideoFile(mime, filename)) {
    const inferred = (mime || '').trim().toLowerCase() || 'video/mp4'
    return { kind: 'video', mime: VIDEO_MIMES.has(inferred) ? inferred : 'video/mp4' }
  }

  throwLibraryUpload(
    'UNSUPPORTED_TYPE',
    'A biblioteca via MCP aceita imagens (jpeg, png, webp, gif) ou vídeos (mp4, mov).',
  )
}

function extensionForUpload(kind: 'image' | 'video', format: string, filename: string): string {
  if (kind === 'video') {
    const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : null
    if (ext && VIDEO_EXTENSIONS.has(ext))
      return ext === 'qt' ? 'mov' : ext
    return 'mp4'
  }
  if (format === 'jpeg')
    return 'jpg'
  if (format === 'png')
    return 'png'
  const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : null
  return ext || 'jpg'
}

export interface PersistLibraryAssetInput {
  client: BlimberMcpSupabaseLike
  tenantId: string
  createdBy: string
  filename: string
  buffer: Buffer
  inputMime: string | undefined
  purpose: LibraryAssetPurpose
  category?: string | null
  formatHint?: ImageUploadFormatHint
  campaignId?: string | null
  metadataSource?: string
  /** Hub UI uses 4h; MCP list/upload uses 1h. */
  signedUrlSeconds?: number
}

export interface PersistLibraryAssetResult {
  asset: Record<string, unknown>
  objectPath: string
  previewUrl: string | null
  meta: {
    originalSize: number
    compressedSize: number
    width: number | null
    height: number | null
    format: string
    compressed: boolean
    reductionPercent: number
    mimeType: string
    kind: 'image' | 'video'
  }
}

/**
 * Same storage + compression path as Hub UI (`/api/marketing/social/upload-asset`
 * for images; direct Storage upload for video).
 */
export async function persistLibraryAsset(
  input: PersistLibraryAssetInput,
): Promise<PersistLibraryAssetResult> {
  const originalSize = input.buffer.length
  if (!originalSize)
    throwLibraryUpload('FILE_EMPTY', 'Arquivo vazio.')
  if (originalSize > LIBRARY_UPLOAD_MAX_BYTES) {
    throwLibraryUpload(
      'FILE_TOO_LARGE',
      `Arquivo excede ${LIBRARY_UPLOAD_MAX_BYTES} bytes (limite da biblioteca).`,
      413,
    )
  }

  const kindInfo = assertLibraryUploadKind(input.inputMime, input.filename, input.purpose)
  if (input.purpose === 'publication' && kindInfo.kind !== 'image' && kindInfo.kind !== 'video') {
    throwLibraryUpload('UNSUPPORTED_TYPE', 'Peças finais devem ser imagens ou vídeos.')
  }

  const storage = input.client.storage
  if (!storage?.from)
    throwLibraryUpload('STORAGE_UNAVAILABLE', 'Storage não disponível.', 503)

  let processedMime = kindInfo.mime
  let processedBuffer = input.buffer
  let width: number | null = null
  let height: number | null = null
  let format = 'original'
  let compressed = false

  if (kindInfo.kind === 'image') {
    try {
      const processed = await compressImageForUpload(input.buffer, {
        inputMime: kindInfo.mime,
        formatHint: input.formatHint || 'auto',
      })
      processedBuffer = processed.data
      processedMime = processed.mimeType
      width = processed.width
      height = processed.height
      format = processed.format
      compressed = processed.compressed
    }
    catch (error: any) {
      throwLibraryUpload(
        'UNSUPPORTED_IMAGE',
        error?.message || 'Formato de imagem não suportado',
      )
    }
  }

  const compressedSize = processedBuffer.length
  const ext = extensionForUpload(kindInfo.kind, format, input.filename)
  const objectPath = `${input.tenantId}/${randomUUID()}/${compressed ? 'optimized' : 'original'}.${ext}`

  const bucket = storage.from(MARKETING_ASSETS_BUCKET)
  if (typeof bucket.upload !== 'function')
    throwLibraryUpload('STORAGE_UNAVAILABLE', 'Storage upload não disponível.', 503)

  const { error: uploadError } = await bucket.upload(objectPath, processedBuffer, {
    cacheControl: '3600',
    contentType: processedMime,
    upsert: false,
  })
  if (uploadError)
    throwLibraryUpload('STORAGE_ERROR', uploadError.message, 500)

  const insertPayload: Record<string, unknown> = {
    tenant_id: input.tenantId,
    name: input.filename.slice(0, 255) || 'upload.bin',
    object_path: objectPath,
    mime_type: processedMime,
    size_bytes: compressedSize,
    width,
    height,
    purpose: input.purpose,
    category: input.category ?? null,
    campaign_id: input.campaignId || null,
    metadata: {
      originalSize,
      originalMime: kindInfo.mime,
      compressionRatio: compressed
        ? Math.round((1 - compressedSize / originalSize) * 100)
        : 0,
      compressed,
      ...(input.metadataSource ? { source: input.metadataSource } : {}),
    },
    created_by: input.createdBy,
  }

  const { data: asset, error: insertError } = await input.client
    .from('media_assets')
    .insert(insertPayload)
    .select('*')
    .single()

  if (insertError || !asset) {
    if (typeof bucket.remove === 'function')
      await bucket.remove([objectPath])
    throwLibraryUpload('DB_ERROR', insertError?.message || 'Falha ao gravar media_assets.', 400)
  }

  let previewUrl: string | null = null
  if (typeof bucket.createSignedUrl === 'function') {
    const { data: signed, error: signError } = await bucket.createSignedUrl(
      objectPath,
      input.signedUrlSeconds ?? LIBRARY_SIGNED_URL_SECONDS,
    )
    if (signError)
      console.warn('[media_assets] MCP signed URL generation failed:', signError.message)
    previewUrl = extractStorageSignedUrl(signed)
  }

  return {
    asset,
    objectPath,
    previewUrl,
    meta: {
      originalSize,
      compressedSize,
      width,
      height,
      format,
      compressed,
      reductionPercent: compressed
        ? Math.round((1 - compressedSize / originalSize) * 100)
        : 0,
      mimeType: processedMime,
      kind: kindInfo.kind,
    },
  }
}
