/**
 * Canonical MediaService for Meta Marketing API ad images / advideos.
 * Upload by HTTPS URL (Graph pulls), raw bytes (library download), or reuse hash/video_id.
 * dryRun callers must skip execute — this module never invents URLs.
 * Never logs file bytes or access tokens.
 */

import type { MetaGraphFetch } from './types'
import { actPath, enrichMetaGraphWriteError, metaGraphUrl } from './graph'
import { normalizeImageForMeta } from './normalize-image'
import { assertSafeMediaUrl } from './safe-url'
import { MetaAdsToolError } from './types'

export type MediaServiceContext = {
  apiVersion: string
  accessToken: string
  adAccountId: string
  graph: MetaGraphFetch
}

export type UploadImageInput = {
  /** Existing image_hash — reuse without Graph upload. */
  imageHash?: string
  /** HTTPS URL for Meta to fetch (SSRF-checked). XOR with imageHash / bytes / sourceBase64. */
  imageUrl?: string
  /** Raw image bytes (library download or decoded base64). XOR with imageHash / imageUrl. */
  bytes?: Buffer | Uint8Array
  /** Base64-encoded image data. Decoded to bytes internally. XOR with imageHash / imageUrl / bytes. */
  sourceBase64?: string
  /** Original MIME type — used to decide normalization strategy. */
  mimeType?: string
  name?: string
}

export type UploadVideoInput = {
  /** Existing video_id — reuse without Graph upload. */
  videoId?: string
  /** HTTPS URL for Meta Advideos (SSRF-checked). XOR with videoId. */
  videoUrl?: string
  title?: string
  description?: string
}

export type UploadImageResult = {
  imageHash: string
  reused: boolean
  dryRun?: boolean
  width?: number | null
  height?: number | null
  mimeType?: string | null
  normalized?: boolean
  convertedToJpeg?: boolean
}

export type UploadVideoResult = {
  videoId: string
  reused: boolean
  dryRun?: boolean
}

export type VideoStatusResult = {
  videoId: string
  status: string | null
  title: string | null
  length: number | null
  rawStatus: unknown
}

function isPresentString(value?: string): boolean {
  return Boolean(value && String(value).trim())
}

function isPresentBytes(value?: Buffer | Uint8Array): boolean {
  return Boolean(value && value.byteLength > 0)
}

function xorMedia(params: { a?: string, b?: string, code: string, message: string }) {
  const hasA = Boolean(params.a)
  const hasB = Boolean(params.b)
  if (hasA === hasB) {
    throw new MetaAdsToolError(params.code, params.message, 400)
  }
}

function parseAdImageGraphResult(res: any): UploadImageResult {
  const images = res?.images && typeof res.images === 'object' ? res.images as Record<string, any> : null
  const first = images ? Object.values(images)[0] : null
  const hash = first?.hash
    ? String(first.hash)
    : (res?.hash ? String(res.hash) : null)
  if (!hash) {
    throw new MetaAdsToolError(
      'META_UPLOAD_IMAGE_FAILED',
      'Meta não retornou image_hash no upload.',
      502,
      { responseKeys: res && typeof res === 'object' ? Object.keys(res) : [] },
    )
  }
  const width = typeof first?.width === 'number'
    ? first.width
    : (typeof res?.width === 'number' ? res.width : null)
  const height = typeof first?.height === 'number'
    ? first.height
    : (typeof res?.height === 'number' ? res.height : null)
  return { imageHash: hash, reused: false, width, height }
}

function redactUploadBody(body: Record<string, unknown>): Record<string, unknown> {
  if (!('bytes' in body))
    return body
  return { ...body, bytes: '[omitted]' }
}

/** Meta error code #3 = app lacks capability for URL-based upload. */
function isCapabilityError(err: unknown): boolean {
  if (!(err instanceof MetaAdsToolError) || err.code !== 'META_GRAPH_ERROR') return false
  const details = err.details as Record<string, unknown> | undefined
  return details?.code === 3 || details?.code === '3'
}

/** Meta error_subcode 2446496 = invalid image format (e.g. PNG RGBA). */
function isInvalidFormatError(err: unknown): boolean {
  if (!(err instanceof MetaAdsToolError) || err.code !== 'META_GRAPH_ERROR') return false
  const details = err.details as Record<string, unknown> | undefined
  const subcode = details?.error_subcode
  return subcode === 2446496 || subcode === '2446496'
}

async function fetchUrlToBytes(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok)
    throw new MetaAdsToolError('IMAGE_URL_FETCH_FAILED', `Falha ao baixar imagem: HTTP ${response.status}`, 502)
  return Buffer.from(await response.arrayBuffer())
}

async function postAdImageBytes(
  ctx: MediaServiceContext,
  rawBytes: Buffer,
  name?: string,
  mimeType?: string,
): Promise<UploadImageResult> {
  const normalized = await normalizeImageForMeta(rawBytes, {
    originalMimeType: mimeType || 'image/jpeg',
  })
  const path = `/${actPath(ctx.adAccountId)}/adimages`
  const body: Record<string, unknown> = {
    bytes: normalized.data.toString('base64'),
  }
  if (name) body.name = name

  try {
    const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, path), {
      method: 'POST',
      query: { access_token: ctx.accessToken },
      body,
      bodyEncoding: 'form' as const,
    })
    const result = parseAdImageGraphResult(res)
    return {
      ...result,
      width: result.width ?? normalized.width,
      height: result.height ?? normalized.height,
      mimeType: normalized.mimeType,
      normalized: normalized.normalized,
      convertedToJpeg: normalized.convertedToJpeg,
    }
  }
  catch (err) {
    // Format rejected even after normalization → force JPEG and retry once
    if (isInvalidFormatError(err) && !normalized.convertedToJpeg) {
      const jpegNormalized = await normalizeImageForMeta(rawBytes, {
        originalMimeType: mimeType || 'image/jpeg',
        forceJpeg: true,
      })
      body.bytes = jpegNormalized.data.toString('base64')
      const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, path), {
        method: 'POST',
        query: { access_token: ctx.accessToken },
        body,
        bodyEncoding: 'form' as const,
      })
      const result = parseAdImageGraphResult(res)
      return {
        ...result,
        width: result.width ?? jpegNormalized.width,
        height: result.height ?? jpegNormalized.height,
        mimeType: jpegNormalized.mimeType,
        normalized: true,
        convertedToJpeg: true,
      }
    }
    throw err
  }
}

/**
 * Resolve image_hash: reuse hash, POST act_{id}/adimages with url (fallback bytes), or POST bytes (form).
 * Normalizes images (EXIF, alpha, color space, format) via Sharp before sending to Meta.
 * Auto-retries: URL upload fails with capability error #3 → download + multipart bytes.
 * Auto-retries: invalid format (subcode 2446496) → convert to JPEG and retry.
 * Ads Management user token only — callers must not pass a page token.
 */
export async function uploadImage(
  ctx: MediaServiceContext,
  input: UploadImageInput,
  options?: { dryRun?: boolean },
): Promise<UploadImageResult> {
  const hasHash = isPresentString(input.imageHash)
  const hasUrl = isPresentString(input.imageUrl)
  const hasBytes = isPresentBytes(input.bytes)
  const hasBase64 = isPresentString(input.sourceBase64)
  const sourceCount = [hasHash, hasUrl, hasBytes, hasBase64].filter(Boolean).length
  if (sourceCount !== 1) {
    throw new MetaAdsToolError(
      'IMAGE_MEDIA_XOR',
      'Informe imageHash OU imageUrl OU bytes OU sourceBase64, não combine nem omita.',
      400,
    )
  }

  if (hasHash) {
    return { imageHash: String(input.imageHash).trim(), reused: true, dryRun: options?.dryRun }
  }

  let safeUrl: string | undefined
  if (hasUrl)
    safeUrl = (await assertSafeMediaUrl(input.imageUrl!, { resolveDns: true })).toString()

  if (options?.dryRun) {
    return { imageHash: '(dryRun — hash após upload)', reused: false, dryRun: true }
  }

  // sourceBase64 → decode to bytes path
  if (hasBase64) {
    const rawBytes = Buffer.from(input.sourceBase64!, 'base64')
    return postAdImageBytes(ctx, rawBytes, input.name, input.mimeType)
  }

  // bytes path (library asset download)
  if (hasBytes) {
    return postAdImageBytes(ctx, Buffer.from(input.bytes!), input.name, input.mimeType)
  }

  // URL path: try URL upload first, fallback to bytes on capability error or format error
  const path = `/${actPath(ctx.adAccountId)}/adimages`
  const body: Record<string, unknown> = { url: safeUrl }
  if (input.name) body.name = input.name

  try {
    const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, path), {
      method: 'POST',
      query: { access_token: ctx.accessToken },
      body,
    })
    return parseAdImageGraphResult(res)
  }
  catch (err) {
    // Capability error #3 or invalid format → download image and retry as bytes
    if (isCapabilityError(err) || isInvalidFormatError(err)) {
      const rawBytes = await fetchUrlToBytes(safeUrl!)
      return postAdImageBytes(ctx, rawBytes, input.name, input.mimeType)
    }
    if (err instanceof MetaAdsToolError && err.code === 'META_GRAPH_ERROR') {
      const details = (err.details && typeof err.details === 'object') ? err.details as Record<string, unknown> : {}
      throw new MetaAdsToolError(err.code, err.message, err.statusCode, {
        ...details,
        request_payload: { url: safeUrl, name: input.name },
      })
    }
    throw err
  }
}

/**
 * Resolve video_id: reuse id or POST act_{id}/advideos with file_url.
 */
export async function uploadVideo(
  ctx: MediaServiceContext,
  input: UploadVideoInput,
  options?: { dryRun?: boolean },
): Promise<UploadVideoResult> {
  xorMedia({
    a: input.videoId,
    b: input.videoUrl,
    code: 'VIDEO_MEDIA_XOR',
    message: 'Informe videoId OU videoUrl, não ambos nem nenhum.',
  })

  if (input.videoId) {
    return { videoId: String(input.videoId).trim(), reused: true, dryRun: options?.dryRun }
  }

  const safe = await assertSafeMediaUrl(input.videoUrl!, { resolveDns: true })
  if (options?.dryRun) {
    return { videoId: '(dryRun — video_id após upload)', reused: false, dryRun: true }
  }

  const path = `/${actPath(ctx.adAccountId)}/advideos`
  const body: Record<string, unknown> = {
    file_url: safe.toString(),
  }
  if (input.title)
    body.title = input.title
  if (input.description)
    body.description = input.description

  try {
    const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, path), {
      method: 'POST',
      query: { access_token: ctx.accessToken },
      body,
    })
    const videoId = res?.id ? String(res.id) : null
    if (!videoId) {
      throw new MetaAdsToolError(
        'META_UPLOAD_VIDEO_FAILED',
        'Meta não retornou video_id no upload.',
        502,
        { responseKeys: res && typeof res === 'object' ? Object.keys(res) : [] },
      )
    }
    return { videoId, reused: false }
  }
  catch (err) {
    enrichMetaGraphWriteError(err, body)
  }
}

/**
 * Poll Advideo processing status (fields status, title, length).
 */
export async function getVideoStatus(
  ctx: MediaServiceContext,
  videoId: string,
): Promise<VideoStatusResult> {
  const id = String(videoId || '').trim()
  if (!id) {
    throw new MetaAdsToolError('VIDEO_ID_REQUIRED', 'videoId é obrigatório.', 400)
  }

  const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, `/${id}`), {
    query: {
      fields: 'id,title,length,status',
      access_token: ctx.accessToken,
    },
  })

  const statusObj = res?.status
  const status
    = typeof statusObj === 'string'
      ? statusObj
      : (statusObj?.video_status != null ? String(statusObj.video_status) : null)

  return {
    videoId: res?.id ? String(res.id) : id,
    status,
    title: res?.title != null ? String(res.title) : null,
    length: typeof res?.length === 'number' ? res.length : null,
    rawStatus: statusObj ?? null,
  }
}
