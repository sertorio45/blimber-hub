import type { H3Event } from 'h3'

import type {
  DeleteMediaAssetResult,
  MediaAssetDeletePreviewResult,
  MediaAssetUsages,
} from '~/server/utils/media-asset-deletion'
import type { LibraryAssetPurpose } from '~/server/utils/media-library-upload'
import type { ImageUploadFormatHint } from '~/server/utils/media-upload-image'

import type { WorkspaceClient } from '~/server/utils/workspace-context'

import { Buffer } from 'node:buffer'

import { createError } from 'h3'
import { BlimberMcpError } from '~/lib/blimber-mcp/errors'
import {
  deleteMediaAsset,
  deleteMediaAssetsBulk,
  fetchMediaAssetUsages,
  previewMediaAssetDeletion,
} from '~/server/utils/media-asset-deletion'
import { attachMediaAssetPreviews, extractStorageSignedUrl } from '~/server/utils/media-asset-preview'
import {
  CMS_ASSETS_BUCKET,
  LIBRARY_UPLOAD_MAX_BYTES,

  MARKETING_ASSETS_BUCKET,
  persistLibraryAsset,
} from '~/server/utils/media-library-upload'
import {
  ACTIVE_CONTENT_EXTENSIONS,
  fileExtension,
  sniffMediaType,
  STRICT_UPLOAD_EXTENSIONS,
} from '~/server/utils/media/file-signature'
import { recordSocialAudit } from '~/server/utils/social-audit'

/**
 * Shared media library used by Marketing and CMS. Handlers never call this
 * directly with request data: an adapter authorizes the request first and hands
 * over a `MediaAccessContext`. The tenant always comes from that context, so no
 * request field can widen the scope.
 */

export type MediaModule = 'marketing' | 'cms'
export type MediaAction = 'read' | 'upload' | 'delete'

export interface MediaAccessContext {
  /** Needed for audit metadata (request id, IP, user agent). */
  event: H3Event
  client: WorkspaceClient
  tenantId: string
  userId: string
  module: MediaModule
  can: Record<MediaAction, boolean>
}

export const MEDIA_BUCKET = MARKETING_ASSETS_BUCKET

/** Each module owns a bucket: CMS uploads never land in marketing storage. */
export function mediaBucketForModule(module: MediaModule): string {
  return module === 'cms' ? CMS_ASSETS_BUCKET : MARKETING_ASSETS_BUCKET
}

/** Existing rows know their bucket; only brand-new writes use the module default. */
function assetBucket(asset: { bucket?: string | null } | null | undefined, fallback: string): string {
  return typeof asset?.bucket === 'string' && asset.bucket ? asset.bucket : fallback
}
export const MEDIA_PREVIEW_SECONDS = 60 * 60 * 4

export const MEDIA_PURPOSES = ['reference', 'publication'] as const
export const MEDIA_LIFECYCLES = ['active', 'archived', 'discontinued'] as const
export const MEDIA_KINDS = ['image', 'video', 'document'] as const
export type MediaKind = typeof MEDIA_KINDS[number]

export interface MediaAssetRecord {
  id: string
  tenant_id: string
  name: string
  object_path: string
  mime_type: string
  created_at: string
  [key: string]: unknown
}

export type MediaAssetWithPreview = MediaAssetRecord & {
  preview_url: string | null
  previewUrl: string | null
}

const MEDIA_ACTION_LABEL: Record<MediaAction, string> = {
  read: 'visualizar',
  upload: 'enviar',
  delete: 'excluir',
}

export function assertMediaAccess(ctx: MediaAccessContext, action: MediaAction): void {
  if (!ctx.tenantId)
    throw createError({ statusCode: 400, statusMessage: 'Selecione uma empresa' })
  if (!ctx.can[action]) {
    throw createError({
      statusCode: 403,
      statusMessage: `Sem permissão para ${MEDIA_ACTION_LABEL[action]} arquivos`,
    })
  }
}

// ---- Listing ----

export interface ListMediaAssetsOptions {
  /** Already clamped by the caller; each surface keeps its own page size rules. */
  limit: number
  /** Enables keyset pagination (`created_at`, `id`) and `nextCursor`. */
  paginate?: boolean
  cursor?: string | null
  search?: string | null
  kind?: MediaKind | null
  mimePrefix?: string | null
  purpose?: string | null
  folderId?: string | null
  lifecycle?: string | null
  category?: string | null
  campaignId?: string | null
}

export interface ListMediaAssetsResult {
  data: MediaAssetWithPreview[]
  nextCursor: string | null
}

interface MediaCursor {
  createdAt: string
  id: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/

export function encodeMediaCursor(row: { created_at: string, id: string }): string {
  return Buffer.from(JSON.stringify({ c: row.created_at, i: row.id }), 'utf8').toString('base64url')
}

/** Cursor values end up inside a PostgREST `or` filter, so both parts are strictly validated. */
export function decodeMediaCursor(cursor: string): MediaCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { c?: unknown, i?: unknown }
    const createdAt = typeof parsed.c === 'string' ? parsed.c : ''
    const id = typeof parsed.i === 'string' ? parsed.i : ''
    if (TIMESTAMP_PATTERN.test(createdAt) && UUID_PATTERN.test(id))
      return { createdAt, id }
  }
  catch {
    // Fall through to the validation error below.
  }
  throw createError({ statusCode: 400, statusMessage: 'Cursor de paginação inválido' })
}

export async function listAssets(
  ctx: MediaAccessContext,
  options: ListMediaAssetsOptions,
): Promise<ListMediaAssetsResult> {
  assertMediaAccess(ctx, 'read')

  let request = ctx.client
    .from('media_assets')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('bucket', mediaBucketForModule(ctx.module))
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  if (options.paginate) {
    request = request
      .order('id', { ascending: false })
      .limit(options.limit + 1)
    if (options.cursor) {
      const cursor = decodeMediaCursor(options.cursor)
      request = request.or(
        `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`,
      )
    }
  }
  else {
    request = request.limit(options.limit)
  }

  if (options.mimePrefix)
    request = request.like('mime_type', `${options.mimePrefix}%`)
  if (options.kind === 'image' || options.kind === 'video')
    request = request.like('mime_type', `${options.kind}/%`)
  else if (options.kind === 'document')
    request = request.eq('mime_type', 'application/pdf')
  if (options.purpose && (MEDIA_PURPOSES as readonly string[]).includes(options.purpose))
    request = request.eq('purpose', options.purpose)
  if (typeof options.search === 'string')
    request = request.ilike('name', `%${options.search}%`)
  if (options.folderId)
    request = request.eq('folder_id', options.folderId)
  if (options.lifecycle && (MEDIA_LIFECYCLES as readonly string[]).includes(options.lifecycle))
    request = request.eq('lifecycle', options.lifecycle)
  else
    request = request.neq('lifecycle', 'discontinued')
  if (options.category)
    request = request.eq('category', options.category)
  if (options.campaignId)
    request = request.eq('campaign_id', options.campaignId)

  const { data, error } = await request
  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  let rows = (data || []) as MediaAssetRecord[]
  let nextCursor: string | null = null
  if (options.paginate && rows.length > options.limit) {
    rows = rows.slice(0, options.limit)
    const last = rows[rows.length - 1]
    if (last)
      nextCursor = encodeMediaCursor(last)
  }

  return {
    data: await attachMediaAssetPreviews(ctx.client, rows, ctx.tenantId),
    nextCursor,
  }
}

// ---- Reads ----

/** Tenant-scoped row lookup; a foreign tenant's asset is indistinguishable from a missing one. */
export async function findAssetRow<T = MediaAssetRecord>(
  ctx: MediaAccessContext,
  assetId: string,
  columns = '*',
): Promise<T | null> {
  assertMediaAccess(ctx, 'read')

  const { data, error } = await ctx.client
    .from('media_assets')
    .select(columns)
    .eq('id', assetId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  return (data as T | null) ?? null
}

export async function getAsset(ctx: MediaAccessContext, assetId: string): Promise<MediaAssetWithPreview> {
  const row = await findAssetRow(ctx, assetId)
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Arquivo não encontrado' })

  const [withPreview] = await attachMediaAssetPreviews(ctx.client, [row], ctx.tenantId)
  return withPreview!
}

export async function getAssetUsages(ctx: MediaAccessContext, assetId: string): Promise<MediaAssetUsages> {
  const row = await findAssetRow<{ id: string }>(ctx, assetId, 'id')
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Arquivo não encontrado' })

  const { usages } = await fetchMediaAssetUsages(ctx.client, ctx.tenantId, assetId)
  return usages
}

export interface MediaAssetFile {
  asset: { id: string, name: string, mime_type: string | null, object_path: string, tenant_id: string, bucket?: string | null }
  buffer: Buffer
}

export async function getAssetFile(ctx: MediaAccessContext, assetId: string): Promise<MediaAssetFile> {
  const asset = await findAssetRow<MediaAssetFile['asset']>(
    ctx,
    assetId,
    'id, name, mime_type, object_path, tenant_id, bucket',
  )
  if (!asset?.object_path)
    throw createError({ statusCode: 404, statusMessage: 'Arquivo não encontrado' })

  const { data: file, error: downloadError } = await ctx.client.storage
    .from(assetBucket(asset, mediaBucketForModule(ctx.module)))
    .download(asset.object_path)

  if (downloadError || !file) {
    throw createError({
      statusCode: 404,
      statusMessage: downloadError?.message || 'Arquivo não encontrado no Storage',
    })
  }

  return { asset, buffer: Buffer.from(await file.arrayBuffer()) }
}

// ---- Writes ----

export interface RegisterUploadedAssetInput {
  name: string
  objectPath: string
  mimeType: string
  sizeBytes: number
  width?: number | null
  height?: number | null
  durationSeconds?: number | null
  checksum?: string | null
  purpose: LibraryAssetPurpose
  category?: string | null
  metadata: Record<string, unknown>
}

/**
 * Registers an object the browser already uploaded to Storage. The path must
 * live under the context tenant and must exist in the bucket.
 */
export async function registerUploadedAsset(
  ctx: MediaAccessContext,
  input: RegisterUploadedAssetInput,
): Promise<MediaAssetWithPreview> {
  assertMediaAccess(ctx, 'upload')

  if (input.purpose === 'publication' && !/^(?:image|video)\//.test(input.mimeType))
    throw createError({ statusCode: 400, statusMessage: 'Peças finais devem ser imagens ou vídeos' })

  if (!input.objectPath.startsWith(`${ctx.tenantId}/`))
    throw createError({ statusCode: 400, statusMessage: 'Caminho do arquivo inválido' })

  const bucket = mediaBucketForModule(ctx.module)
  const { data: objects } = await ctx.client.storage
    .from(bucket)
    .list(input.objectPath.slice(0, input.objectPath.lastIndexOf('/')), {
      search: input.objectPath.slice(input.objectPath.lastIndexOf('/') + 1),
      limit: 1,
    })

  if (!objects?.length)
    throw createError({ statusCode: 400, statusMessage: 'Arquivo não encontrado no Storage' })

  const { data, error } = await ctx.client
    .from('media_assets')
    .insert({
      tenant_id: ctx.tenantId,
      name: input.name,
      bucket,
      object_path: input.objectPath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      width: input.width || null,
      height: input.height || null,
      duration_seconds: input.durationSeconds || null,
      checksum: input.checksum || null,
      purpose: input.purpose,
      category: input.category ?? null,
      metadata: input.metadata,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  await recordSocialAudit(ctx.event, ctx.client, {
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    action: 'media_asset.created',
    entityType: 'media_asset',
    entityId: data.id,
    after: data,
  })

  const { data: signed, error: signError } = await ctx.client.storage
    .from(bucket)
    .createSignedUrl(data.object_path, MEDIA_PREVIEW_SECONDS)

  if (signError)
    console.warn('[media_assets] insert signed URL generation failed:', signError.message)

  const preview = extractStorageSignedUrl(signed)

  return {
    ...data,
    preview_url: preview,
    previewUrl: preview,
  }
}

export interface MediaUploadFile {
  filename: string
  data: Buffer
  /** Client-declared MIME. Advisory only for strict (CMS) uploads. */
  type?: string | null
}

export interface MediaUploadMeta {
  purpose?: LibraryAssetPurpose
  category?: string | null
  campaignId?: string | null
  formatHint?: ImageUploadFormatHint
}

export interface MediaUploadResult {
  asset: MediaAssetWithPreview
  meta: {
    originalSize: number
    compressedSize: number
    width: number | null
    height: number | null
    format: string
    compressed: boolean
    reductionPercent: number
  }
}

const UNSUPPORTED_STRICT_MESSAGE = 'Formato não suportado. Envie imagens JPG, PNG, WebP ou GIF, ou vídeos MP4 ou MOV.'
const ACTIVE_CONTENT_MESSAGE = 'Arquivos SVG, HTML ou scripts não são aceitos na mídia do site.'

/**
 * CMS media is rendered on public sites, so the bytes decide the type: active
 * content (SVG/HTML/XML/JS) is refused outright and the extension must match the
 * sniffed format.
 */
export function validateStrictUpload(file: MediaUploadFile): { mime: string, kind: 'image' | 'video' } {
  if (!file.data?.length)
    throw createError({ statusCode: 400, statusMessage: 'Arquivo vazio.' })
  if (file.data.length > LIBRARY_UPLOAD_MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `Arquivo excede ${LIBRARY_UPLOAD_MAX_BYTES} bytes (limite da biblioteca).`,
    })
  }

  const extension = fileExtension(file.filename)
  const declared = String(file.type || '').toLowerCase()
  if ((extension && ACTIVE_CONTENT_EXTENSIONS.has(extension)) || /svg|html|xml|javascript/.test(declared))
    throw createError({ statusCode: 400, statusMessage: ACTIVE_CONTENT_MESSAGE })

  const sniffed = sniffMediaType(file.data)
  if (sniffed.kind === 'markup')
    throw createError({ statusCode: 400, statusMessage: ACTIVE_CONTENT_MESSAGE })

  const allowedExtensions = sniffed.mime ? STRICT_UPLOAD_EXTENSIONS[sniffed.mime] : undefined
  if (!sniffed.mime || !allowedExtensions || (sniffed.kind !== 'image' && sniffed.kind !== 'video'))
    throw createError({ statusCode: 400, statusMessage: UNSUPPORTED_STRICT_MESSAGE })

  if (extension && !allowedExtensions.includes(extension))
    throw createError({ statusCode: 400, statusMessage: 'A extensão do arquivo não corresponde ao conteúdo.' })

  return { mime: sniffed.mime, kind: sniffed.kind }
}

/** Server-side upload: validation, compression (images), Storage, `media_assets` row and audit. */
export async function uploadAsset(
  ctx: MediaAccessContext,
  file: MediaUploadFile,
  meta: MediaUploadMeta = {},
): Promise<MediaUploadResult> {
  assertMediaAccess(ctx, 'upload')

  const strict = ctx.module === 'cms'
  const inputMime = strict ? validateStrictUpload(file).mime : (file.type || undefined)

  let persisted: Awaited<ReturnType<typeof persistLibraryAsset>>
  try {
    persisted = await persistLibraryAsset({
      client: ctx.client,
      tenantId: ctx.tenantId,
      createdBy: ctx.userId,
      filename: file.filename || 'upload.bin',
      buffer: file.data,
      bucket: mediaBucketForModule(ctx.module),
      inputMime,
      purpose: meta.purpose || 'reference',
      category: meta.category ?? null,
      campaignId: meta.campaignId ?? null,
      formatHint: meta.formatHint || 'auto',
      metadataSource: ctx.module,
      signedUrlSeconds: MEDIA_PREVIEW_SECONDS,
    })
  }
  catch (error: unknown) {
    if (error instanceof BlimberMcpError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message,
        data: { code: error.code },
      })
    }
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error && error.message ? error.message : 'Falha no upload',
    })
  }

  await recordSocialAudit(ctx.event, ctx.client, {
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    action: 'media_asset.created',
    entityType: 'media_asset',
    entityId: String(persisted.asset.id),
    after: persisted.asset,
  })

  return {
    asset: {
      ...(persisted.asset as MediaAssetRecord),
      preview_url: persisted.previewUrl,
      previewUrl: persisted.previewUrl,
    },
    meta: {
      originalSize: persisted.meta.originalSize,
      compressedSize: persisted.meta.compressedSize,
      width: persisted.meta.width,
      height: persisted.meta.height,
      format: persisted.meta.format,
      compressed: persisted.meta.compressed,
      reductionPercent: persisted.meta.reductionPercent,
    },
  }
}

// ---- Deletion ----

export async function previewAssetDeletion(
  ctx: MediaAccessContext,
  assetIds: string[],
): Promise<MediaAssetDeletePreviewResult> {
  assertMediaAccess(ctx, 'read')

  const { data: assets } = await ctx.client
    .from('media_assets')
    .select('object_path, bucket')
    .eq('tenant_id', ctx.tenantId)
    .in('id', assetIds)

  const rows = (assets || []) as Array<{ object_path: string, bucket?: string | null }>
  const signedByBucketPath = new Map<string, string | null>()
  for (const bucketName of [...new Set(rows.map(row => assetBucket(row, mediaBucketForModule(ctx.module))))]) {
    const paths = rows
      .filter(row => assetBucket(row, mediaBucketForModule(ctx.module)) === bucketName)
      .map(row => row.object_path)
      .filter(Boolean)
    if (!paths.length)
      continue
    const { data: signedRows } = await ctx.client.storage.from(bucketName).createSignedUrls(paths, 60 * 10)
    for (const item of (signedRows || []) as Array<{ path?: string | null, signedUrl?: string | null }>) {
      if (item.path)
        signedByBucketPath.set(`${bucketName}:${item.path}`, item.signedUrl || null)
    }
  }

  const previewUrls = new Map<string, string | null>()
  for (const row of rows)
    previewUrls.set(row.object_path, signedByBucketPath.get(`${assetBucket(row, mediaBucketForModule(ctx.module))}:${row.object_path}`) ?? null)

  return previewMediaAssetDeletion(ctx.client, ctx.tenantId, assetIds, previewUrls)
}

/**
 * Deletes an unused asset (row, derivatives and Storage objects). Any social
 * post link or `cms_asset_usages` row blocks it with 409 and the usages in
 * `data.blocked`; there is no force override.
 */
export async function deleteAsset(ctx: MediaAccessContext, assetId: string): Promise<DeleteMediaAssetResult> {
  assertMediaAccess(ctx, 'delete')
  return deleteMediaAsset(ctx.event, ctx.client, ctx.tenantId, ctx.userId, assetId)
}

export async function deleteAssets(
  ctx: MediaAccessContext,
  assetIds: string[],
): Promise<{ deleted: DeleteMediaAssetResult[], count: number }> {
  assertMediaAccess(ctx, 'delete')
  return deleteMediaAssetsBulk(ctx.event, ctx.client, ctx.tenantId, ctx.userId, assetIds)
}
