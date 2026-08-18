/**
 * Canonical MediaService for Meta Marketing API ad images / advideos.
 * Upload by HTTPS URL (Graph pulls), raw bytes (library download), or reuse hash/video_id.
 * dryRun callers must skip execute — this module never invents URLs.
 * Never logs file bytes or access tokens.
 */

import type { MetaGraphFetch } from './types'
import { actPath, enrichMetaGraphWriteError, metaGraphUrl } from './graph'
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
  /** HTTPS URL for Meta to fetch (SSRF-checked). XOR with imageHash / bytes. */
  imageUrl?: string
  /** Raw image bytes (library download). XOR with imageHash / imageUrl. Posted as Graph `bytes`. */
  bytes?: Buffer | Uint8Array
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

/**
 * Resolve image_hash: reuse hash, POST act_{id}/adimages with url, or POST bytes (form).
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
  const sourceCount = [hasHash, hasUrl, hasBytes].filter(Boolean).length
  if (sourceCount !== 1) {
    throw new MetaAdsToolError(
      'IMAGE_MEDIA_XOR',
      'Informe imageHash OU imageUrl OU bytes (biblioteca), não combine nem omita.',
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

  const path = `/${actPath(ctx.adAccountId)}/adimages`
  const body: Record<string, unknown> = {}
  if (input.name)
    body.name = input.name

  if (hasBytes)
    body.bytes = Buffer.from(input.bytes!).toString('base64')
  else
    body.url = safeUrl

  try {
    const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, path), {
      method: 'POST',
      query: { access_token: ctx.accessToken },
      body,
      ...(hasBytes ? { bodyEncoding: 'form' as const } : {}),
    })
    return parseAdImageGraphResult(res)
  }
  catch (err) {
    enrichMetaGraphWriteError(err, redactUploadBody(body))
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
