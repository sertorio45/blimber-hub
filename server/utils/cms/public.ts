import type {
  CmsDocumentKind,
  CmsDocumentPayload,
  CmsPage,
  CmsPublicationType,
  CmsPublicCollection,
  CmsPublicCollectionFeed,
  CmsPublicDocument,
  CmsPublicMenu,
  CmsPublicSiteChrome,
  CmsSeo,
  CmsSitemapEntry,
  CmsThemeTokens,
} from '~/lib/cms/contracts'
import type { WorkspaceClient } from '~/server/utils/workspace-context'

import { z } from 'zod'

import {
  CMS_LIMITS,
  CMS_TABLES,
  CMS_THEME_TOKEN_KEYS,
  cmsCollectionKeySchema,
  cmsCollectionSchemaSchema,
  cmsDocumentPayloadSchema,
  cmsPublicationTypeSchema,
  cmsPublicMenuSchema,
  cmsSeoSchema,
  cmsSiteKeySchema,
  cmsThemeTokensSchema,
} from '~/lib/cms/contracts'
import { assertNoDbError, cmsError, cmsGone, cmsNotFound } from '~/server/utils/cms/errors'
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

export const PUBLIC_SITE_COLUMNS = 'id, tenant_id, site_key, name, default_locale, status'
/** Settings are read only to project menus, theme and default SEO. The raw object is never returned. */
export const PUBLIC_SITE_DELIVERY_COLUMNS = `${PUBLIC_SITE_COLUMNS}, settings`
export const PUBLIC_ROUTE_COLUMNS = 'path, locale, route_kind, document_id, revision_id'
export const PUBLIC_DOCUMENT_COLUMNS = 'id, kind, publication_type, locale, public_status, published_revision_id, published_at'
export const PUBLIC_SITEMAP_DOCUMENT_COLUMNS = `${PUBLIC_DOCUMENT_COLUMNS}, updated_at`
export const PUBLIC_DOMAIN_COLUMNS = 'hostname, verified_at'
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
  name?: string | null
  default_locale: string
  status: string
  settings?: Record<string, unknown> | null
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
  public_status: string
  published_revision_id: string | null
  published_at: string | null
  updated_at?: string | null
}

export interface CmsPublicRedirect {
  redirect: { to: string, status: 301 }
  site: CmsPublicSiteChrome
}

/** Published document plus the site chrome the renderer needs for `<head>` and layout. */
export type CmsPublicDelivery = CmsPublicDocument & {
  seo: CmsSeo
  site: CmsPublicSiteChrome
}

export type CmsPublicResolveResult = CmsPublicDelivery | CmsPublicRedirect

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

export const cmsPublicCollectionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(CMS_LIMITS.maxPageSize).default(CMS_LIMITS.maxPageSize),
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readTheme(settings: Record<string, unknown>): CmsThemeTokens {
  const raw = asRecord(settings.theme)
  if (!raw)
    return {}
  const picked: Record<string, string> = {}
  for (const key of CMS_THEME_TOKEN_KEYS) {
    const value = raw[key]
    if (typeof value === 'string')
      picked[key] = value
  }
  const parsed = cmsThemeTokensSchema.safeParse(picked)
  return parsed.success ? parsed.data : {}
}

function readMenus(settings: Record<string, unknown>): CmsPublicMenu[] {
  const raw = settings.menus
  const candidates: unknown[] = []
  if (Array.isArray(raw)) {
    candidates.push(...raw)
  }
  else {
    const record = asRecord(raw)
    if (record) {
      for (const [key, items] of Object.entries(record))
        candidates.push({ key, items })
    }
  }

  const menus: CmsPublicMenu[] = []
  for (const candidate of candidates) {
    const parsed = cmsPublicMenuSchema.safeParse(candidate)
    if (parsed.success)
      menus.push(parsed.data)
    if (menus.length >= 8)
      break
  }
  return menus
}

function readSiteSeo(settings: Record<string, unknown>): CmsSeo {
  const parsed = cmsSeoSchema.safeParse(asRecord(settings.seo) ?? {})
  if (!parsed.success)
    return {}
  const seo = parsed.data
  if (seo.canonicalUrl && !seo.canonicalUrl.startsWith('https://'))
    delete seo.canonicalUrl
  return seo
}

/** Projects only the public slice of `settings`. Webhook URLs and other keys are dropped. */
export function readPublicSiteChrome(site: PublicSiteRow, locale: string): CmsPublicSiteChrome {
  const settings = asRecord(site.settings) ?? {}
  return {
    siteKey: site.site_key,
    name: site.name?.trim() || site.site_key,
    locale,
    defaultLocale: site.default_locale,
    menus: readMenus(settings),
    theme: readTheme(settings),
    seo: readSiteSeo(settings),
  }
}

/** Only `active` sites are served; suspended, archived and unknown keys all answer 404. */
export async function loadPublicSite(
  client: WorkspaceClient,
  siteKey: string | null | undefined,
  options: { includeSettings?: boolean } = {},
): Promise<PublicSiteRow> {
  const key = cmsSiteKeySchema.safeParse(siteKey ?? '')
  if (!key.success)
    throw siteNotFound()

  const { data, error } = await client
    .from(CMS_TABLES.sites)
    .select(options.includeSettings ? PUBLIC_SITE_DELIVERY_COLUMNS : PUBLIC_SITE_COLUMNS)
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

async function loadRouteDocument(
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
    .is('deleted_at', null)
    .maybeSingle()
  assertNoDbError(error)
  return data as PublicDocumentRow | null
}

/**
 * Missing and unpublished paths stay 404. A document that was live and then
 * withdrawn is 410 so crawlers drop the URL. `draft_payload` is never selected.
 */
function assertDeliverable(row: PublicDocumentRow | null): PublicDocumentRow {
  if (!row)
    throw pageNotFound()
  if (row.public_status === 'withdrawn')
    throw cmsGone()
  if (row.public_status !== 'published' || !row.published_revision_id || !row.published_at)
    throw pageNotFound()
  return row
}

async function resolveRedirect(
  client: WorkspaceClient,
  site: PublicSiteRow,
  route: PublicRouteRow,
): Promise<CmsPublicRedirect> {
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

  return { redirect: { to: target.path, status: 301 }, site: readPublicSiteChrome(site, route.locale) }
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
  const site = await loadPublicSite(client, siteKey, { includeSettings: true })
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

  const document = assertDeliverable(await loadRouteDocument(client, site, route.document_id))
  if (route.route_kind === 'redirect')
    return resolveRedirect(client, site, route)
  if (route.route_kind !== 'document')
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

  const published = mapPublicDocument({
    document,
    revisionId: revision.id,
    path: route.path,
    content: revision.snapshot,
  })
  const content = await expandCollectionBlocks(client, site, published.content)
  return {
    ...published,
    content,
    seo: content.seo,
    site: readPublicSiteChrome(site, locale),
  }
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

interface SitemapDocumentRow extends PublicDocumentRow {
  updated_at: string | null
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function loadPrimaryHostname(client: WorkspaceClient, site: PublicSiteRow): Promise<string | null> {
  const { data, error } = await client
    .from(CMS_TABLES.siteDomains)
    .select(PUBLIC_DOMAIN_COLUMNS)
    .eq('site_id', site.id)
    .eq('tenant_id', site.tenant_id)
    .eq('environment', 'production')
    .eq('is_primary', true)
    .not('verified_at', 'is', null)
    .maybeSingle()
  assertNoDbError(error)
  const hostname = (data as { hostname?: string } | null)?.hostname
  return hostname || null
}

/**
 * Canonical published paths of one site. Redirects, drafts and withdrawn
 * documents are omitted. `loc` is absolute only when a verified primary
 * hostname exists; otherwise it repeats the site-relative `path`.
 */
export async function listPublicSitemap(
  client: WorkspaceClient,
  siteKey: string | null | undefined,
  locale?: string,
): Promise<CmsSitemapEntry[]> {
  const site = await loadPublicSite(client, siteKey)
  const resolvedLocale = locale ? resolveLocale(site, locale) : null

  let request = client
    .from(CMS_TABLES.documents)
    .select(PUBLIC_SITEMAP_DOCUMENT_COLUMNS)
    .eq('site_id', site.id)
    .eq('tenant_id', site.tenant_id)
    .eq('public_status', 'published')
    .is('deleted_at', null)
    .not('published_revision_id', 'is', null)
  if (resolvedLocale)
    request = request.eq('locale', resolvedLocale)

  const { data, error } = await request
    .order('published_at', { ascending: false })
    .limit(CMS_LIMITS.maxSitemapEntries)
  assertNoDbError(error)

  const documents = (data ?? []) as SitemapDocumentRow[]
  if (!documents.length)
    return []

  const { data: routeRows, error: routeError } = await client
    .from(CMS_TABLES.routes)
    .select(PUBLIC_ROUTE_COLUMNS)
    .eq('site_id', site.id)
    .eq('tenant_id', site.tenant_id)
    .eq('route_kind', 'document')
    .in('document_id', documents.map(row => row.id))
  assertNoDbError(routeError)

  const paths = new Map<string, string>()
  for (const route of (routeRows ?? []) as PublicRouteRow[]) {
    if (route.document_id)
      paths.set(`${route.document_id}:${route.locale}`, route.path)
  }

  const hostname = await loadPrimaryHostname(client, site)
  const entries: CmsSitemapEntry[] = []
  for (const document of documents) {
    if (!document.published_at)
      continue
    const path = paths.get(`${document.id}:${document.locale}`)
    if (!path)
      continue
    entries.push({
      path,
      loc: hostname ? `https://${hostname}${path}` : path,
      lastmod: document.updated_at || document.published_at,
      locale: document.locale,
      kind: document.kind,
      publicationType: document.publication_type ?? null,
    })
  }

  entries.sort((left, right) => left.path.localeCompare(right.path) || left.locale.localeCompare(right.locale))
  return entries
}

export const PUBLIC_COLLECTION_COLUMNS = 'id, key, name, schema'
export const PUBLIC_ENTRY_COLUMNS = 'id, payload, updated_at'

interface PublicCollectionRow {
  id: string
  key: string
  name: string
  schema: unknown
}

interface PublicEntryRow {
  id: string
  payload: Record<string, unknown> | null
  updated_at: string
}

function mapPublicCollection(row: PublicCollectionRow): CmsPublicCollection | null {
  const schema = cmsCollectionSchemaSchema.safeParse(row.schema)
  if (!schema.success) {
    console.error('[cms] invalid collection schema', row.id)
    return null
  }
  return { key: row.key, name: row.name, schema: schema.data }
}

async function loadSiteCollections(
  client: WorkspaceClient,
  site: PublicSiteRow,
): Promise<PublicCollectionRow[]> {
  const { data, error } = await client
    .from(CMS_TABLES.collectionDefinitions)
    .select(PUBLIC_COLLECTION_COLUMNS)
    .eq('site_id', site.id)
    .eq('tenant_id', site.tenant_id)
    .order('key', { ascending: true })
  assertNoDbError(error)
  return (data ?? []) as PublicCollectionRow[]
}

/** Collection definitions of an active site (key, name and field schema only). */
export async function listPublicCollections(
  client: WorkspaceClient,
  siteKey: string | null | undefined,
): Promise<CmsPublicCollection[]> {
  const site = await loadPublicSite(client, siteKey)
  const rows = await loadSiteCollections(client, site)
  return rows
    .map(mapPublicCollection)
    .filter((item): item is CmsPublicCollection => item !== null)
}

/**
 * Published entries of one collection, most recently updated first. Draft
 * entries never leave the Hub, mirroring how documents only serve published
 * revisions. Unknown sites and collection keys both answer 404.
 */
export async function listPublicCollectionEntries(
  client: WorkspaceClient,
  siteKey: string | null | undefined,
  collectionKey: string | null | undefined,
  query: z.infer<typeof cmsPublicCollectionQuerySchema>,
): Promise<CmsPublicCollectionFeed> {
  const key = cmsCollectionKeySchema.safeParse(collectionKey ?? '')
  if (!key.success)
    throw cmsNotFound('Coleção não encontrada')

  const site = await loadPublicSite(client, siteKey)
  const rows = await loadSiteCollections(client, site)
  const definition = rows.find(row => row.key === key.data)
  const collection = definition ? mapPublicCollection(definition) : null
  if (!definition || !collection)
    throw cmsNotFound('Coleção não encontrada')

  return {
    collection,
    entries: await loadPublishedCollectionEntries(client, site, definition.id, query.limit),
  }
}

async function loadPublishedCollectionEntries(
  client: WorkspaceClient,
  site: PublicSiteRow,
  definitionId: string,
  limit: number,
): Promise<CmsPublicCollectionFeed['entries']> {
  const { data, error } = await client
    .from(CMS_TABLES.entries)
    .select(PUBLIC_ENTRY_COLUMNS)
    .eq('definition_id', definitionId)
    .eq('site_id', site.id)
    .eq('tenant_id', site.tenant_id)
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  assertNoDbError(error)

  return ((data ?? []) as PublicEntryRow[]).map(row => ({
    id: row.id,
    payload: row.payload ?? {},
    updatedAt: row.updated_at,
  }))
}

const COLLECTION_BLOCK_TYPES = new Set(['testimonials', 'cards', 'faq'])

function payloadText(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim())
      return value
    if (typeof value === 'number')
      return String(value)
  }
  return ''
}

/** Maps one collection entry to the item shape each linked block renders. */
function collectionBlockItem(type: string, payload: Record<string, unknown>): Record<string, string> | null {
  if (type === 'testimonials') {
    const item = {
      quote: payloadText(payload, 'depoimento', 'quote', 'texto', 'descricao'),
      author: payloadText(payload, 'nome', 'author', 'autor'),
      role: payloadText(payload, 'papel', 'role', 'cargo'),
    }
    return item.quote || item.author ? item : null
  }
  if (type === 'faq') {
    const item = {
      question: payloadText(payload, 'pergunta', 'question', 'titulo'),
      answer: payloadText(payload, 'resposta', 'answer', 'descricao'),
    }
    return item.question || item.answer ? item : null
  }
  const item = {
    title: payloadText(payload, 'titulo', 'nome', 'title'),
    description: payloadText(payload, 'descricao', 'resumo', 'bio', 'depoimento', 'texto'),
    href: payloadText(payload, 'href', 'link', 'url', 'site-url'),
  }
  return item.title || item.description ? item : null
}

/** Entries with a numeric `ordem` field are presented in that order; others keep newest-first. */
function orderCollectionEntries(entries: CmsPublicCollectionFeed['entries']): CmsPublicCollectionFeed['entries'] {
  const hasOrder = entries.some(entry => typeof entry.payload.ordem === 'number')
  if (!hasOrder)
    return entries
  const rank = (entry: CmsPublicCollectionFeed['entries'][number]) =>
    typeof entry.payload.ordem === 'number' ? entry.payload.ordem : Number.POSITIVE_INFINITY
  return [...entries].sort((a, b) => rank(a) - rank(b))
}

interface PublicBlock {
  type?: unknown
  props?: Record<string, unknown>
  children?: PublicBlock[]
  [key: string]: unknown
}

/**
 * Collection-linked blocks (`testimonials`, `cards`, `faq` with
 * `props.collectionKey`) never carry a copy of the data: at read time their
 * `items` are replaced with the collection's published entries. A missing
 * collection keeps the stored fallback items, so a page never breaks.
 */
export async function expandCollectionBlocks(
  client: WorkspaceClient,
  site: PublicSiteRow,
  content: CmsDocumentPayload,
): Promise<CmsDocumentPayload> {
  if (!content.blocks?.length)
    return content

  const keys = new Set<string>()
  const collect = (blocks: PublicBlock[]) => {
    for (const block of blocks) {
      if (COLLECTION_BLOCK_TYPES.has(String(block.type)) && typeof block.props?.collectionKey === 'string' && block.props.collectionKey.trim())
        keys.add(block.props.collectionKey.trim())
      if (Array.isArray(block.children))
        collect(block.children)
    }
  }
  collect(content.blocks as PublicBlock[])
  if (!keys.size)
    return content

  const definitions = await loadSiteCollections(client, site)
  const itemsByKey = new Map<string, Array<Record<string, string>>>()

  const expand = async (blocks: PublicBlock[]): Promise<PublicBlock[]> => {
    const out: PublicBlock[] = []
    for (const block of blocks) {
      const next: PublicBlock = { ...block }
      if (Array.isArray(block.children))
        next.children = await expand(block.children)
      const type = String(block.type)
      const key = typeof block.props?.collectionKey === 'string' ? block.props.collectionKey.trim() : ''
      if (key && COLLECTION_BLOCK_TYPES.has(type)) {
        const cacheKey = `${type}:${key}`
        if (!itemsByKey.has(cacheKey)) {
          const definition = definitions.find(row => row.key === key)
          if (definition) {
            const limitRaw = block.props?.collectionLimit
            const limit = typeof limitRaw === 'number' && Number.isInteger(limitRaw) && limitRaw > 0
              ? Math.min(limitRaw, 20)
              : 6
            const entries = orderCollectionEntries(
              await loadPublishedCollectionEntries(client, site, definition.id, CMS_LIMITS.maxPageSize),
            )
            itemsByKey.set(cacheKey, entries
              .map(entry => collectionBlockItem(type, entry.payload))
              .filter((item): item is Record<string, string> => item !== null)
              .slice(0, limit))
          }
        }
        const items = itemsByKey.get(cacheKey)
        if (items)
          next.props = { ...(block.props ?? {}), items }
      }
      out.push(next)
    }
    return out
  }

  return { ...content, blocks: await expand(content.blocks as PublicBlock[]) as CmsDocumentPayload['blocks'] }
}

export function renderSitemapXml(entries: CmsSitemapEntry[]): string {
  const urls = entries.map(entry => [
    '  <url>',
    `    <loc>${xmlEscape(entry.loc)}</loc>`,
    `    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`,
    '  </url>',
  ].join('\n')).join('\n')
  const body = urls ? `\n${urls}\n` : '\n'
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>\n`
}
