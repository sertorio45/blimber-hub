import type {
  CmsDocumentKind,
  CmsDocumentPayload,
  CmsPage,
  CmsPublicationType,
  CmsPublicDocument,
} from '~/lib/cms/contracts'
import type { WorkspaceClient } from '~/server/utils/workspace-context'

import { z } from 'zod'

import {
  CMS_LIMITS,
  CMS_TABLES,
  cmsDocumentPayloadSchema,
  cmsPublicationTypeSchema,
  cmsSiteKeySchema,
} from '~/lib/cms/contracts'
import { assertNoDbError, cmsError, cmsNotFound } from '~/server/utils/cms/errors'
import { mapPublicDocument } from '~/server/utils/cms/mappers'
import { cursorFilter, decodeCmsCursor, paginate } from '~/server/utils/cms/pagination'

/**
 * Public delivery runs with the service role, so every query below carries
 * explicit `site_id` / `tenant_id` / `public_status` filters and selects only
 * published columns. `draft_payload` is never selected here.
 */

export const CMS_MAX_PATH_LENGTH = 1024

const PATH_PATTERN = /^\/$|^(?:\/[a-z0-9][a-z0-9._~-]*)+$/
/** Same rule as the `*_locale_format` CHECK constraints. */
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

export const PUBLIC_SITE_COLUMNS = 'id, tenant_id, site_key, default_locale, status'
export const PUBLIC_ROUTE_COLUMNS = 'path, locale, route_kind, document_id, revision_id'
export const PUBLIC_DOCUMENT_COLUMNS = 'id, kind, publication_type, locale, published_revision_id, published_at'
export const PUBLIC_REVISION_COLUMNS = 'id, document_id, snapshot'

/** Summary projection straight from the snapshot JSON: body and blocks never leave the database. */
export const PUBLIC_REVISION_SUMMARY_COLUMNS = [
  'id',
  'document_id',
  'title:snapshot->>title',
  'slug:snapshot->>slug',
  'excerpt:snapshot->>excerpt',
  'cover:snapshot->cover',
  'seo:snapshot->seo',
  'authorId:snapshot->>authorId',
  'termIds:snapshot->termIds',
  'eventDate:snapshot->>eventDate',
  'sourceName:snapshot->>sourceName',
  'sourceUrl:snapshot->>sourceUrl',
].join(', ')

interface PublicSiteRow {
  id: string
  tenant_id: string
  site_key: string
  default_locale: string
  status: string
}

interface PublicRouteRow {
  path: string
  locale: string
  route_kind: 'document' | 'reserved' | 'redirect'
  document_id: string | null
  revision_id: string | null
}

interface PublicDocumentRow {
  id: string
  kind: CmsDocumentKind
  publication_type: CmsPublicationType | null
  locale: string
  published_revision_id: string | null
  published_at: string | null
}

export interface CmsPublicRedirect {
  redirect: { to: string, status: 301 }
}

export type CmsPublicResolveResult = CmsPublicDocument | CmsPublicRedirect

const cmsPublicSummaryContentSchema = cmsDocumentPayloadSchema.omit({ body: true, blocks: true })
export type CmsPublicSummaryContent = z.infer<typeof cmsPublicSummaryContentSchema>

export type CmsPublicDocumentSummary = Omit<CmsPublicDocument, 'content'> & {
  content: Omit<CmsDocumentPayload, 'body' | 'blocks'>
}

export const cmsPublicResolveQuerySchema = z.object({
  path: z.string().max(CMS_MAX_PATH_LENGTH).default('/'),
  locale: z.string().max(16).optional(),
})

export const cmsPublicListQuerySchema = z.object({
  type: cmsPublicationTypeSchema.optional(),
  cursor: z.string().max(200).optional(),
  locale: z.string().max(16).optional(),
  limit: z.coerce.number().int().min(1).max(CMS_LIMITS.maxPageSize).default(CMS_LIMITS.defaultPageSize),
})

/** Mirrors SQL `cms_normalize_path`: leading slash, lowercase, single slashes, no trailing slash. */
export function normalizeCmsPath(path: string | null | undefined): string {
  const trimmed = (path ?? '').replace(/^ +| +$/g, '')
  const normalized = `/${trimmed.toLowerCase()}`.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  return normalized || '/'
}

export function isValidCmsPath(path: string): boolean {
  return path.length <= CMS_MAX_PATH_LENGTH && PATH_PATTERN.test(path)
}

function siteNotFound(): Error {
  return cmsNotFound('Site não encontrado')
}

function pageNotFound(): Error {
  return cmsNotFound('Página não encontrada')
}

/** Only `active` sites are served; suspended, archived and unknown keys all answer 404. */
export async function loadPublicSite(client: WorkspaceClient, siteKey: string | null | undefined): Promise<PublicSiteRow> {
  const key = cmsSiteKeySchema.safeParse(siteKey ?? '')
  if (!key.success)
    throw siteNotFound()

  const { data, error } = await client
    .from(CMS_TABLES.sites)
    .select(PUBLIC_SITE_COLUMNS)
    .eq('site_key', key.data)
    .eq('status', 'active')
    .maybeSingle()
  assertNoDbError(error)
  if (!data)
    throw siteNotFound()
  return data as PublicSiteRow
}

function resolveLocale(site: PublicSiteRow, locale: string | undefined): string {
  if (!locale)
    return site.default_locale
  if (!LOCALE_PATTERN.test(locale))
    throw cmsError(400, 'validation_failed', 'Idioma inválido')
  return locale
}

async function loadPublishedDocument(
  client: WorkspaceClient,
  site: PublicSiteRow,
  documentId: string,
): Promise<PublicDocumentRow | null> {
  const { data, error } = await client
    .from(CMS_TABLES.documents)
    .select(PUBLIC_DOCUMENT_COLUMNS)
    .eq('id', documentId)
    .eq('site_id', site.id)
    .eq('tenant_id', site.tenant_id)
    .eq('public_status', 'published')
    .is('deleted_at', null)
    .maybeSingle()
  assertNoDbError(error)
  const row = data as PublicDocumentRow | null
  return row?.published_revision_id && row.published_at ? row : null
}

async function resolveRedirect(
  client: WorkspaceClient,
  site: PublicSiteRow,
  route: PublicRouteRow,
): Promise<CmsPublicRedirect> {
  if (!route.document_id || !await loadPublishedDocument(client, site, route.document_id))
    throw pageNotFound()

  const { data, error } = await client
    .from(CMS_TABLES.routes)
    .select(PUBLIC_ROUTE_COLUMNS)
    .eq('site_id', site.id)
    .eq('tenant_id', site.tenant_id)
    .eq('locale', route.locale)
    .eq('document_id', route.document_id)
    .eq('route_kind', 'document')
    .maybeSingle()
  assertNoDbError(error)
  const target = data as PublicRouteRow | null
  if (!target || target.path === route.path)
    throw pageNotFound()

  return { redirect: { to: target.path, status: 301 } }
}

/**
 * Resolves a public path of exactly one site. A path that exists on another
 * site is simply unknown here: there is no cross-site or default fallback.
 */
export async function resolvePublicPath(
  client: WorkspaceClient,
  siteKey: string | null | undefined,
  query: z.infer<typeof cmsPublicResolveQuerySchema>,
): Promise<CmsPublicResolveResult> {
  const site = await loadPublicSite(client, siteKey)
  const locale = resolveLocale(site, query.locale)
  const path = normalizeCmsPath(query.path)
  if (!isValidCmsPath(path))
    throw pageNotFound()

  const { data: routeRow, error: routeError } = await client
    .from(CMS_TABLES.routes)
    .select(PUBLIC_ROUTE_COLUMNS)
    .eq('site_id', site.id)
    .eq('tenant_id', site.tenant_id)
    .eq('locale', locale)
    .eq('path', path)
    .maybeSingle()
  assertNoDbError(routeError)

  const route = routeRow as PublicRouteRow | null
  if (!route?.document_id)
    throw pageNotFound()
  if (route.route_kind === 'redirect')
    return resolveRedirect(client, site, route)
  if (route.route_kind !== 'document')
    throw pageNotFound()

  const document = await loadPublishedDocument(client, site, route.document_id)
  if (!document)
    throw pageNotFound()

  const { data: revisionRow, error: revisionError } = await client
    .from(CMS_TABLES.revisions)
    .select(PUBLIC_REVISION_COLUMNS)
    .eq('id', document.published_revision_id)
    .eq('document_id', document.id)
    .eq('site_id', site.id)
    .eq('tenant_id', site.tenant_id)
    .maybeSingle()
  assertNoDbError(revisionError)

  const revision = revisionRow as { id: string, snapshot: unknown } | null
  if (!revision)
    throw pageNotFound()

  return mapPublicDocument({
    document,
    revisionId: revision.id,
    path: route.path,
    content: revision.snapshot,
  })
}

type SummaryRevisionRow = { id: string, document_id: string } & Record<string, unknown>

function summaryContent(row: SummaryRevisionRow): CmsPublicSummaryContent | null {
  const content: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || key === 'document_id')
      continue
    if (value !== null && value !== undefined)
      content[key] = value
    else if (key === 'cover')
      content[key] = null
  }
  const parsed = cmsPublicSummaryContentSchema.safeParse(content)
  if (!parsed.success) {
    console.error('[cms] invalid published snapshot', row.id, parsed.error)
    return null
  }
  return parsed.data
}

/** Published publications of one site, newest first, without body or blocks. */
export async function listPublicPublications(
  client: WorkspaceClient,
  siteKey: string | null | undefined,
  query: z.infer<typeof cmsPublicListQuerySchema>,
): Promise<CmsPage<CmsPublicDocumentSummary>> {
  const site = await loadPublicSite(client, siteKey)
  const locale = resolveLocale(site, query.locale)

  let request = client
    .from(CMS_TABLES.documents)
    .select(PUBLIC_DOCUMENT_COLUMNS)
    .eq('site_id', site.id)
    .eq('tenant_id', site.tenant_id)
    .eq('kind', 'publication')
    .eq('locale', locale)
    .eq('public_status', 'published')
    .is('deleted_at', null)
    .not('published_revision_id', 'is', null)
  if (query.type)
    request = request.eq('publication_type', query.type)
  if (query.cursor)
    request = request.or(cursorFilter('published_at', decodeCmsCursor(query.cursor)))

  const { data, error } = await request
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(query.limit + 1)
  assertNoDbError(error)

  const page = paginate((data ?? []) as PublicDocumentRow[], query.limit, row => ({
    key: row.published_at ?? '',
    id: row.id,
  }))
  if (!page.rows.length)
    return { data: [], nextCursor: page.nextCursor }

  const documentIds = page.rows.map(row => row.id)
  const revisionIds = page.rows.map(row => row.published_revision_id).filter((id): id is string => Boolean(id))

  const [revisionsResult, routesResult] = await Promise.all([
    client
      .from(CMS_TABLES.revisions)
      .select(PUBLIC_REVISION_SUMMARY_COLUMNS)
      .eq('site_id', site.id)
      .eq('tenant_id', site.tenant_id)
      .in('id', revisionIds),
    client
      .from(CMS_TABLES.routes)
      .select(PUBLIC_ROUTE_COLUMNS)
      .eq('site_id', site.id)
      .eq('tenant_id', site.tenant_id)
      .eq('locale', locale)
      .eq('route_kind', 'document')
      .in('document_id', documentIds),
  ])
  assertNoDbError(revisionsResult.error)
  assertNoDbError(routesResult.error)

  const revisions = new Map(((revisionsResult.data ?? []) as SummaryRevisionRow[]).map(row => [row.id, row]))
  const paths = new Map(((routesResult.data ?? []) as PublicRouteRow[]).map(row => [row.document_id, row.path]))

  const items: CmsPublicDocumentSummary[] = []
  for (const document of page.rows) {
    const revision = document.published_revision_id ? revisions.get(document.published_revision_id) : undefined
    const path = paths.get(document.id)
    const content = revision && revision.document_id === document.id ? summaryContent(revision) : null
    if (!revision || !path || !content || !document.published_at)
      continue
    items.push({
      id: document.id,
      kind: document.kind,
      publicationType: document.publication_type ?? null,
      locale: document.locale,
      path,
      revisionId: revision.id,
      publishedAt: document.published_at,
      content,
    })
  }

  return { data: items, nextCursor: page.nextCursor }
}
