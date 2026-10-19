import type {
  CmsCreateDocumentInput,
  CmsDocument,
  CmsDocumentKind,
  CmsDocumentPayload,
  CmsDocumentSummary,
  CmsListQuery,
  CmsPage,
  CmsPublicationType,
  CmsPublishInput,
  CmsSaveDraftInput,
  CmsSite,
  CmsVersionConflictDetails,
} from '~/lib/cms/contracts'
import type { CmsContext, CmsDocumentContext } from '~/server/utils/cms/context'
import type { CmsDbError } from '~/server/utils/cms/errors'
import type {
  CmsDocumentRow,
  CmsDocumentSummaryRow,
  CmsRevisionRow,
  CmsRevisionSummary,
  CmsRevisionSummaryRow,
  CmsSiteRow,
} from '~/server/utils/cms/mappers'

import { Buffer } from 'node:buffer'

import { z } from 'zod'

import {
  CMS_LIMITS,
  CMS_RPC,
  CMS_TABLES,
  cmsDocumentPayloadSchema,
  cmsPublishablePayloadSchema,
  cmsSaveDraftInputSchema,
  cmsSlugSchema,
} from '~/lib/cms/contracts'
import { recordCmsAudit } from '~/server/utils/cms/audit'
import { assertCmsCapability, documentCapability, loadTenantDocument, loadTenantSite } from '~/server/utils/cms/context'
import {
  assertNoDbError,
  cmsDbError,
  cmsError,
  cmsNotFound,
  cmsValidationError,
  cmsVersionConflict,
} from '~/server/utils/cms/errors'
import {
  DOCUMENT_COLUMNS,
  DOCUMENT_SUMMARY_COLUMNS,
  mapDocument,
  mapDocumentSummary,
  mapRevisionSummary,
  mapSite,
  parsePayload,
  REVISION_COLUMNS,
  REVISION_SUMMARY_COLUMNS,
  SITE_COLUMNS,
} from '~/server/utils/cms/mappers'
import { cursorFilter, decodeCmsCursor, escapeLikePattern, paginate } from '~/server/utils/cms/pagination'
import { cancelOpenPublicationJobs } from '~/server/utils/cms/publication-jobs'
import { slugify } from '~/utils/slugify'

const uuidSchema = z.string().uuid()

/** Request ceiling for draft writes: the payload limit plus room for the envelope. */
export const CMS_DRAFT_BODY_BYTES = CMS_LIMITS.maxPayloadBytes + 4 * 1024

// ---- Payload limits ----

export function payloadByteLength(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload ?? {}), 'utf8')
}

/**
 * Walks `blocks` iteratively on the raw value, before Zod's recursive parser
 * runs, so a maliciously deep tree cannot exhaust the stack.
 */
export function inspectBlocks(blocks: unknown): { depth: number, count: number } {
  let depth = 0
  let count = 0
  const stack: Array<{ items: unknown, level: number }> = [{ items: blocks, level: 1 }]

  while (stack.length) {
    const { items, level } = stack.pop()!
    if (!Array.isArray(items) || !items.length)
      continue
    depth = Math.max(depth, level)
    count += items.length
    if (depth > CMS_LIMITS.maxBlockDepth || count > CMS_LIMITS.maxBlocksPerDocument)
      break
    for (const item of items) {
      if (item && typeof item === 'object' && 'children' in item)
        stack.push({ items: (item as { children?: unknown }).children, level: level + 1 })
    }
  }

  return { depth, count }
}

/** Enforces `CMS_LIMITS` server-side: 413 for size, 422 for block structure. */
export function assertPayloadLimits(payload: unknown): void {
  if (payloadByteLength(payload) > CMS_LIMITS.maxPayloadBytes)
    throw cmsError(413, 'payload_too_large', 'Conteúdo grande demais para ser salvo', { maxBytes: CMS_LIMITS.maxPayloadBytes })

  const blocks = payload && typeof payload === 'object' ? (payload as { blocks?: unknown }).blocks : undefined
  const { depth, count } = inspectBlocks(blocks)
  if (depth > CMS_LIMITS.maxBlockDepth) {
    throw cmsError(422, 'validation_failed', 'Os blocos estão aninhados em níveis demais', {
      field: 'blocks',
      reason: 'max_depth',
      maxDepth: CMS_LIMITS.maxBlockDepth,
    })
  }
  if (count > CMS_LIMITS.maxBlocksPerDocument) {
    throw cmsError(422, 'validation_failed', 'O conteúdo tem blocos demais', {
      field: 'blocks',
      reason: 'max_blocks',
      maxBlocks: CMS_LIMITS.maxBlocksPerDocument,
    })
  }
}

/** Limits are checked on the raw body first, then the contract schema runs. */
export function parseSaveDraftInput(raw: unknown): CmsSaveDraftInput {
  const payload = raw && typeof raw === 'object' ? (raw as { payload?: unknown }).payload : undefined
  assertPayloadLimits(payload)
  const parsed = cmsSaveDraftInputSchema.safeParse(raw ?? {})
  if (!parsed.success)
    throw cmsValidationError(parsed.error)
  return parsed.data
}

// ---- Helpers ----

function conflictDetails(row: Pick<CmsDocumentRow, 'edit_version' | 'updated_at' | 'updated_by'>): CmsVersionConflictDetails {
  return { currentVersion: row.edit_version, updatedAt: row.updated_at, updatedBy: row.updated_by ?? null }
}

function hasEverBeenPublished(row: Pick<CmsDocumentRow, 'published_revision_id' | 'published_at'>): boolean {
  return Boolean(row.published_revision_id || row.published_at)
}

/**
 * Published URLs never change implicitly: once a document went live, the slug
 * column keeps the live value and a new slug only takes effect on publish
 * (the RPC reads it from the draft payload and turns the old path into a redirect).
 */
export function resolveDraftSlug(
  row: Pick<CmsDocumentRow, 'slug' | 'public_status' | 'published_revision_id' | 'published_at'>,
  payload: Pick<CmsDocumentPayload, 'slug'>,
): string | null {
  // Live and previously live URLs stay put until publish rewrites the route.
  if (row.public_status === 'published' || hasEverBeenPublished(row))
    return row.slug
  const candidate = payload.slug?.trim()
  if (candidate && cmsSlugSchema.safeParse(candidate).success)
    return candidate
  return row.slug
}

function clipSlug(value: string): string {
  return value.slice(0, CMS_LIMITS.maxSlugLength).replace(/-+$/, '')
}

function fallbackSlug(kind: CmsDocumentKind, publicationType: CmsPublicationType | null | undefined): string {
  if (kind === 'page')
    return 'pagina'
  return publicationType === 'news' ? 'noticia' : 'artigo'
}

export interface CmsSlugSuggestionInput {
  siteId: string
  kind: CmsDocumentKind
  publicationType?: CmsPublicationType | null
  locale: string
  title: string
}

/**
 * Suggests a slug from the title that no live document of the same site, kind
 * and locale uses yet. It is only a hint: route uniqueness is enforced at publish.
 */
export async function suggestDocumentSlug(
  ctx: Pick<CmsContext, 'client' | 'tenantId'>,
  input: CmsSlugSuggestionInput,
): Promise<string> {
  const base = slugify(input.title, CMS_LIMITS.maxSlugLength - 6).replace(/-+$/, '')
    || fallbackSlug(input.kind, input.publicationType)

  let request = ctx.client
    .from(CMS_TABLES.documents)
    .select('id, slug')
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', input.siteId)
    .eq('kind', input.kind)
    .eq('locale', input.locale)
    .is('deleted_at', null)
    .like('slug', `${base}%`)
    .limit(500)
  if (input.kind === 'publication' && input.publicationType)
    request = request.eq('publication_type', input.publicationType)

  const { data, error } = await request
  assertNoDbError(error)

  const taken = new Set(((data ?? []) as Array<{ slug: string | null }>).map(row => row.slug))
  if (!taken.has(base))
    return base
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = clipSlug(`${base}-${suffix}`)
    if (!taken.has(candidate))
      return candidate
  }
  return clipSlug(`${base}-${Date.now().toString(36)}`) || base
}

async function reloadDocument(ctx: CmsDocumentContext): Promise<CmsDocumentRow> {
  return loadTenantDocument(ctx, ctx.document.id)
}

/**
 * Optimistic-locked draft write. The update only matches the row at
 * `expectedVersion`; zero rows means someone else saved first (409 with the
 * current version). `public_status` is part of the filter so a concurrent
 * publish cannot leave `has_unpublished_changes` stale; that case retries once.
 */
async function writeDraft(
  ctx: CmsDocumentContext,
  payload: CmsDocumentPayload,
  expectedVersion: number,
  extra: { publicationType?: CmsPublicationType } = {},
): Promise<CmsDocumentRow> {
  let current = ctx.document

  for (let attempt = 0; attempt < 2; attempt++) {
    if (current.edit_version !== expectedVersion)
      throw cmsVersionConflict(conflictDetails(current))

    const { data, error } = await ctx.client
      .from(CMS_TABLES.documents)
      .update({
        draft_payload: payload,
        title: payload.title,
        slug: resolveDraftSlug(current, payload),
        edit_version: expectedVersion + 1,
        has_unpublished_changes: current.public_status === 'published',
        updated_by: ctx.userId,
        ...(extra.publicationType ? { publication_type: extra.publicationType } : {}),
      })
      .eq('id', current.id)
      .eq('tenant_id', ctx.tenantId)
      .eq('edit_version', expectedVersion)
      .eq('public_status', current.public_status)
      .is('deleted_at', null)
      .select(DOCUMENT_COLUMNS)
    assertNoDbError(error)

    const updated = (data ?? []) as CmsDocumentRow[]
    if (updated[0])
      return updated[0]

    current = await reloadDocument(ctx)
  }

  throw cmsVersionConflict(conflictDetails(current))
}

// ---- Commands ----

export async function createDocument(ctx: CmsContext, input: CmsCreateDocumentInput): Promise<CmsDocument> {
  assertCmsCapability(ctx, documentCapability(input.kind, 'create'))

  const site = await loadTenantSite(ctx, input.siteId)
  const publicationType = input.kind === 'publication' ? input.publicationType ?? null : null
  const parentId = input.parentId ?? null

  if (parentId) {
    if (input.kind !== 'page')
      throw cmsError(422, 'validation_failed', 'Apenas páginas podem ter página pai', { field: 'parentId', reason: 'not_allowed' })
    const { data: parent, error } = await ctx.client
      .from(CMS_TABLES.documents)
      .select('id')
      .eq('id', parentId)
      .eq('tenant_id', ctx.tenantId)
      .eq('site_id', site.id)
      .eq('kind', 'page')
      .is('deleted_at', null)
      .maybeSingle()
    assertNoDbError(error)
    if (!parent)
      throw cmsError(422, 'validation_failed', 'Página pai não encontrada', { field: 'parentId', reason: 'not_found' })
  }

  const locale = input.locale ?? site.default_locale
  const slug = input.slug ?? await suggestDocumentSlug(ctx, {
    siteId: site.id,
    kind: input.kind,
    publicationType,
    locale,
    title: input.title,
  })
  const payload = cmsDocumentPayloadSchema.parse({ title: input.title, slug })

  const { data, error } = await ctx.client
    .from(CMS_TABLES.documents)
    .insert({
      tenant_id: ctx.tenantId,
      site_id: site.id,
      kind: input.kind,
      publication_type: publicationType,
      locale,
      title: input.title,
      slug,
      parent_id: parentId,
      draft_payload: payload,
      edit_version: 0,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select(DOCUMENT_COLUMNS)
    .single()
  assertNoDbError(error, 'Erro ao criar o conteúdo')

  const row = data as CmsDocumentRow
  await recordCmsAudit(ctx, {
    action: 'document.create',
    siteId: site.id,
    documentId: row.id,
    metadata: { kind: row.kind, publicationType: row.publication_type },
  })
  return mapDocument(row)
}

export async function saveDraft(ctx: CmsDocumentContext, input: CmsSaveDraftInput): Promise<CmsDocument> {
  const document = ctx.document
  assertCmsCapability(ctx, documentCapability(document.kind, 'update'))
  assertPayloadLimits(input.payload)

  let publicationType: CmsPublicationType | undefined
  if (input.publicationType && input.publicationType !== document.publication_type) {
    if (document.kind !== 'publication')
      throw cmsError(422, 'validation_failed', 'Páginas não têm tipo de publicação', { field: 'publicationType', reason: 'not_allowed' })
    if (hasEverBeenPublished(document)) {
      throw cmsError(422, 'validation_failed', 'O tipo de uma publicação já publicada não pode ser alterado', {
        field: 'publicationType',
        reason: 'published',
      })
    }
    publicationType = input.publicationType
  }

  const row = await writeDraft(ctx, input.payload, input.expectedVersion, { publicationType })
  await recordCmsAudit(ctx, {
    action: 'document.draft_save',
    siteId: row.site_id,
    documentId: row.id,
    metadata: { editVersion: row.edit_version },
  })
  return mapDocument(row)
}

async function callUnpublish(ctx: CmsContext, documentId: string): Promise<void> {
  const { error } = await ctx.client.rpc(CMS_RPC.unpublishDocument, {
    p_document_id: documentId,
    p_actor: ctx.userId,
  })
  assertNoDbError(error, 'Erro ao despublicar o conteúdo')
}

/**
 * Moves the document to the trash. Trashing does not drop public routes, so a
 * live document is unpublished first; that takes it offline, hence `cms.publish`.
 */
export async function trashDocument(ctx: CmsDocumentContext): Promise<{ id: string, deletedAt: string }> {
  const document = ctx.document
  assertCmsCapability(ctx, documentCapability(document.kind, 'delete'))

  const wasPublished = document.public_status === 'published'
  if (wasPublished)
    assertCmsCapability(ctx, 'cms.publish', 'Para excluir um conteúdo publicado é preciso permissão para publicar')
  await cancelOpenPublicationJobs(ctx, document, 'trash')
  if (wasPublished)
    await callUnpublish(ctx, document.id)

  const { data, error } = await ctx.client
    .from(CMS_TABLES.documents)
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', document.id)
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null)
    .select('id, deleted_at')
  assertNoDbError(error, 'Erro ao excluir o conteúdo')

  const trashed = ((data ?? []) as Array<{ id: string, deleted_at: string }>)[0]
  if (!trashed)
    throw cmsNotFound()

  await recordCmsAudit(ctx, {
    action: 'document.trash',
    siteId: document.site_id,
    documentId: document.id,
    metadata: { wasPublished },
  })
  return { id: trashed.id, deletedAt: trashed.deleted_at }
}

export interface CmsPublishResult {
  revisionId: string
  revisionNumber: number
  path: string
  publishedAt: string
}

const publishRpcResultSchema = z.object({
  revision_id: uuidSchema,
  revision_number: z.number().int().positive(),
  path: z.string(),
  published_at: z.string(),
})

/** The home page lives at `/`, so it is the only document allowed without a slug. */
const homePublishablePayloadSchema = cmsPublishablePayloadSchema.extend({ slug: cmsSlugSchema.optional() })

export async function publishDocument(ctx: CmsDocumentContext, input: CmsPublishInput): Promise<CmsPublishResult> {
  const document = ctx.document
  assertCmsCapability(ctx, 'cms.publish', 'Sem permissão para publicar')

  if (document.edit_version !== input.expectedVersion)
    throw cmsVersionConflict(conflictDetails(document))

  assertPayloadLimits(document.draft_payload)
  const schema = document.is_home ? homePublishablePayloadSchema : cmsPublishablePayloadSchema
  const publishable = schema.safeParse(document.draft_payload ?? {})
  if (!publishable.success)
    throw cmsValidationError(publishable.error, 'Revise os campos obrigatórios antes de publicar')

  const { data, error } = await ctx.client.rpc(CMS_RPC.publishRevision, {
    p_document_id: document.id,
    p_expected_version: input.expectedVersion,
    p_actor: ctx.userId,
  })
  assertNoDbError(error, 'Erro ao publicar o conteúdo')

  const result = publishRpcResultSchema.safeParse(data)
  if (!result.success) {
    console.error('[cms] unexpected publish result', result.error)
    throw cmsError(500, 'internal_error', 'Erro ao publicar o conteúdo')
  }

  return {
    revisionId: result.data.revision_id,
    revisionNumber: result.data.revision_number,
    path: result.data.path,
    publishedAt: result.data.published_at,
  }
}

export async function unpublishDocument(ctx: CmsDocumentContext): Promise<CmsDocument> {
  assertCmsCapability(ctx, 'cms.publish', 'Sem permissão para despublicar')
  await cancelOpenPublicationJobs(ctx, ctx.document, 'unpublish')
  await callUnpublish(ctx, ctx.document.id)
  return mapDocument(await reloadDocument(ctx))
}

// ---- Revisions ----

export interface CmsRevisionListOptions {
  cursor?: string | null
  limit: number
}

function encodeRevisionCursor(revisionNumber: number): string {
  return Buffer.from(JSON.stringify({ n: revisionNumber }), 'utf8').toString('base64url')
}

function decodeRevisionCursor(value: string): number {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { n?: unknown }
    if (typeof parsed.n === 'number' && Number.isInteger(parsed.n) && parsed.n > 0)
      return parsed.n
  }
  catch {
    // Fall through to the validation error below.
  }
  throw cmsError(400, 'validation_failed', 'Cursor de paginação inválido')
}

/** Revisions are append-only and numbered per document, so the number is the cursor. */
export async function listRevisions(
  ctx: CmsDocumentContext,
  options: CmsRevisionListOptions,
): Promise<CmsPage<CmsRevisionSummary>> {
  let request = ctx.client
    .from(CMS_TABLES.revisions)
    .select(REVISION_SUMMARY_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', ctx.document.site_id)
    .eq('document_id', ctx.document.id)
  if (options.cursor)
    request = request.lt('revision_number', decodeRevisionCursor(options.cursor))

  const { data, error } = await request
    .order('revision_number', { ascending: false })
    .limit(options.limit + 1)
  assertNoDbError(error)

  const rows = (data ?? []) as CmsRevisionSummaryRow[]
  const hasMore = rows.length > options.limit
  const kept = hasMore ? rows.slice(0, options.limit) : rows
  const last = kept[kept.length - 1]
  return {
    data: kept.map(mapRevisionSummary),
    nextCursor: hasMore && last ? encodeRevisionCursor(last.revision_number) : null,
  }
}

async function insertRestoreRevision(
  ctx: CmsDocumentContext,
  snapshot: CmsDocumentPayload,
): Promise<{ id: string, revision_number: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: latest, error: latestError } = await ctx.client
      .from(CMS_TABLES.revisions)
      .select('revision_number')
      .eq('tenant_id', ctx.tenantId)
      .eq('document_id', ctx.document.id)
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    assertNoDbError(latestError)

    const { data, error } = await ctx.client
      .from(CMS_TABLES.revisions)
      .insert({
        tenant_id: ctx.tenantId,
        site_id: ctx.document.site_id,
        document_id: ctx.document.id,
        revision_number: ((latest as { revision_number?: number } | null)?.revision_number ?? 0) + 1,
        snapshot,
        reason: 'restore',
        created_by: ctx.userId,
      })
      .select('id, revision_number')
      .single()

    if (!error)
      return data as { id: string, revision_number: number }
    if ((error as CmsDbError).code !== '23505')
      throw cmsDbError(error as CmsDbError, 'Erro ao registrar a restauração')
  }
  throw cmsError(409, 'version_conflict', 'Outra versão foi registrada ao mesmo tempo. Tente novamente.')
}

/**
 * Restoring copies a revision snapshot into the draft (optimistic lock) and
 * records a `restore` revision. It never publishes: going live stays explicit.
 */
export async function restoreRevision(
  ctx: CmsDocumentContext,
  revisionId: string | null | undefined,
  expectedVersion: number,
): Promise<CmsDocument> {
  const document = ctx.document
  assertCmsCapability(ctx, documentCapability(document.kind, 'update'))

  if (!revisionId || !uuidSchema.safeParse(revisionId).success)
    throw cmsNotFound('Versão não encontrada')

  const { data: source, error } = await ctx.client
    .from(CMS_TABLES.revisions)
    .select(REVISION_COLUMNS)
    .eq('id', revisionId)
    .eq('tenant_id', ctx.tenantId)
    .eq('document_id', document.id)
    .maybeSingle()
  assertNoDbError(error)
  if (!source)
    throw cmsNotFound('Versão não encontrada')

  const revision = source as CmsRevisionRow
  const payload = parsePayload(revision.snapshot, revision.id)
  assertPayloadLimits(payload)

  const row = await writeDraft(ctx, payload, expectedVersion)
  const restored = await insertRestoreRevision({ ...ctx, document: row }, payload)

  await recordCmsAudit(ctx, {
    action: 'revision.restore',
    siteId: row.site_id,
    documentId: row.id,
    revisionId: restored.id,
    metadata: {
      sourceRevisionId: revision.id,
      sourceRevisionNumber: revision.revision_number,
      revisionNumber: restored.revision_number,
    },
  })
  return mapDocument(row)
}

// ---- Queries ----

export interface CmsDocumentListOptions extends CmsListQuery {
  kind: CmsDocumentKind
}

export async function listDocuments(
  ctx: CmsContext,
  options: CmsDocumentListOptions,
): Promise<CmsPage<CmsDocumentSummary>> {
  let request = ctx.client
    .from(CMS_TABLES.documents)
    .select(DOCUMENT_SUMMARY_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('kind', options.kind)
    .is('deleted_at', null)

  if (options.siteId)
    request = request.eq('site_id', options.siteId)
  if (options.kind === 'publication' && options.type)
    request = request.eq('publication_type', options.type)
  if (options.status)
    request = request.eq('public_status', options.status)
  if (options.search) {
    const pattern = escapeLikePattern(options.search)
    if (pattern)
      request = request.ilike('title', `%${pattern}%`)
  }
  if (options.cursor)
    request = request.or(cursorFilter('updated_at', decodeCmsCursor(options.cursor)))

  const { data, error } = await request
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(options.limit + 1)
  assertNoDbError(error)

  const page = paginate((data ?? []) as CmsDocumentSummaryRow[], options.limit, row => ({
    key: row.updated_at,
    id: row.id,
  }))
  return { data: page.rows.map(mapDocumentSummary), nextCursor: page.nextCursor }
}

export interface CmsOverviewCounts {
  pages: number
  publications: number
  articles: number
  news: number
  published: number
  drafts: number
}

export interface CmsOverview {
  site: CmsSite | null
  counts: CmsOverviewCounts
  recent: CmsDocumentSummary[]
}

interface CountFilter {
  kind?: CmsDocumentKind
  publicationType?: CmsPublicationType
  published?: boolean
}

async function countDocuments(ctx: CmsContext, siteId: string, filter: CountFilter): Promise<number> {
  let request = ctx.client
    .from(CMS_TABLES.documents)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', siteId)
    .is('deleted_at', null)
  if (filter.kind)
    request = request.eq('kind', filter.kind)
  if (filter.publicationType)
    request = request.eq('publication_type', filter.publicationType)
  if (filter.published === true)
    request = request.eq('public_status', 'published')
  else if (filter.published === false)
    request = request.neq('public_status', 'published')

  const { count, error } = await request
  assertNoDbError(error)
  return typeof count === 'number' ? count : 0
}

const RECENT_LIMIT = 8

/** Dashboard of the tenant's primary (oldest) site. `drafts` counts documents not live. */
export async function getOverview(ctx: CmsContext): Promise<CmsOverview> {
  const { data: siteRow, error } = await ctx.client
    .from(CMS_TABLES.sites)
    .select(SITE_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  assertNoDbError(error)

  const empty: CmsOverviewCounts = { pages: 0, publications: 0, articles: 0, news: 0, published: 0, drafts: 0 }
  if (!siteRow)
    return { site: null, counts: empty, recent: [] }

  const site = siteRow as CmsSiteRow
  const [pages, publications, articles, news, published, drafts, recentResult] = await Promise.all([
    countDocuments(ctx, site.id, { kind: 'page' }),
    countDocuments(ctx, site.id, { kind: 'publication' }),
    countDocuments(ctx, site.id, { kind: 'publication', publicationType: 'article' }),
    countDocuments(ctx, site.id, { kind: 'publication', publicationType: 'news' }),
    countDocuments(ctx, site.id, { published: true }),
    countDocuments(ctx, site.id, { published: false }),
    ctx.client
      .from(CMS_TABLES.documents)
      .select(DOCUMENT_SUMMARY_COLUMNS)
      .eq('tenant_id', ctx.tenantId)
      .eq('site_id', site.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(RECENT_LIMIT),
  ])
  assertNoDbError(recentResult.error)

  return {
    site: mapSite(site),
    counts: { pages, publications, articles, news, published, drafts },
    recent: ((recentResult.data ?? []) as CmsDocumentSummaryRow[]).map(mapDocumentSummary),
  }
}
