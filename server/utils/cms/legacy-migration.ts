import type { CmsDocumentPayload } from '~/lib/cms/contracts'
import type { WorkspaceClient } from '~/server/utils/workspace-context'

import { z } from 'zod'

import { CMS_LIMITS, CMS_RPC, cmsDocumentPayloadSchema } from '~/lib/cms/contracts'
import { assertNoDbError, cmsError } from '~/server/utils/cms/errors'
import { siteKeyBase } from '~/server/utils/cms/sites'
import { slugify } from '~/utils/slugify'

/**
 * Legacy article tables (see `types/database.types.ts`). There is no generic
 * `categories` / `tags` table — terms live in `articles_category` and `articles_tag`,
 * joined to articles through `articles_tag_relations` and `articles.category_id`.
 */
export const LEGACY_ARTICLE_TABLES = {
  articles: 'articles',
  categories: 'articles_category',
  tags: 'articles_tag',
  tagRelations: 'articles_tag_relations',
} as const

/** Default public prefix. Mirrors `cms_publish_revision` when `settings.routes.article` is empty. */
export const LEGACY_ARTICLE_ROUTE_PREFIX = 'artigos'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const legacyArticleMigrationInputSchema = z.object({
  tenantId: z.string().uuid().nullable().optional(),
})

export interface LegacyArticleMigrationReport {
  tenants: number
  sitesCreated: number
  sitesReused: number
  taxonomiesCreated: number
  categoriesMapped: number
  categoriesSkipped: number
  tagsMapped: number
  tagsSkipped: number
  articlesMapped: number
  articlesPublished: number
  articlesDrafted: number
  articlesSkippedMapped: number
  articlesSkippedNoTenant: number
  articlesSkippedOrphan: number
  relationsLinked: number
  relationsSkipped: number
}

export type LegacyMigrationScope
  = | { ok: true, tenantId: string | null }
    | { ok: false, status: 400 | 403, message: string }

export interface LegacyArticlePayloadInput {
  id: number
  title: string | null
  slug: string
  content: string | null
  metaDescription: string | null
  termIds?: string[]
  /** Legacy `thumb_url`. Not an asset id — never copied into `cover`. */
  thumbUrl?: string | null
}

/**
 * Only the enum value `published` becomes a live CMS document.
 * `draft`, `scheduled`, `arquived` (the stored spelling) and null stay unpublished.
 */
export function isLegacyPublished(status: string | null | undefined): boolean {
  return status === 'published'
}

/** URL slug shared with the SQL helper `private.cms_legacy_slugify`. */
export function legacySlug(value: string | null | undefined, maxLength = CMS_LIMITS.maxSlugLength): string {
  return slugify(value ?? '', maxLength).replace(/-+$/, '')
}

/**
 * Default `cms_sites.site_key` for a tenant. Same rule as `siteKeyBase`:
 * tenant slug, then name, at least 3 characters, at most 48 before a collision suffix.
 */
export function legacySiteKey(slug: string | null | undefined, name: string | null | undefined): string {
  const trimmedSlug = (slug ?? '').trim()
  const trimmedName = (name ?? '').trim()
  return siteKeyBase({
    slug: trimmedSlug,
    name: trimmedName || trimmedSlug,
  })
}

function joinSiteKey(base: string, suffix: string): string {
  const room = Math.max(1, 64 - suffix.length - 1)
  const head = base.slice(0, room).replace(/-+$/, '') || 'site'
  return `${head}-${suffix}`.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}

/**
 * `site_key` is unique across every tenant. The first collision uses 8 hex
 * characters of the tenant id; a second collision uses the full id.
 */
export function disambiguateSiteKey(base: string, tenantId: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base))
    return base
  const compact = tenantId.replace(/-/g, '')
  const shortKey = joinSiteKey(base, compact.slice(0, 8) || 'site')
  if (!taken.has(shortKey))
    return shortKey
  return joinSiteKey(base, compact.slice(0, 32) || 'site')
}

export function legacyArticleSlugBase(
  slug: string | null | undefined,
  title: string | null | undefined,
  id: number,
): string {
  return legacySlug(slug) || legacySlug(title) || `artigo-${id}`
}

export function legacyTermSlugBase(
  slug: string | null | undefined,
  title: string | null | undefined,
  id: number,
  kind: 'category' | 'tag',
): string {
  return legacySlug(slug) || legacySlug(title) || `${kind === 'category' ? 'categoria' : 'tag'}-${id}`
}

export function clipLegacyText(value: string | null | undefined, maxLength: number): string {
  return (value ?? '').trim().slice(0, maxLength)
}

export function legacyArticleTitle(title: string | null | undefined, id: number): string {
  return clipLegacyText(title, CMS_LIMITS.maxTitleLength) || `Artigo ${id}`
}

/**
 * First free slug. The legacy id is the first suffix so a re-run assigns the
 * same value; later attempts append `-2`, `-3`, …
 */
export function allocateUniqueSlug(base: string, legacyId: number, taken: ReadonlySet<string>): string {
  const root = (base && SLUG_PATTERN.test(base) ? base : `artigo-${legacyId}`).slice(0, CMS_LIMITS.maxSlugLength).replace(/-+$/, '')
  if (root && !taken.has(root))
    return root

  for (let attempt = 1; attempt <= 50; attempt++) {
    const suffix = attempt === 1 ? String(legacyId) : `${legacyId}-${attempt}`
    const candidate = `${root}-${suffix}`.slice(0, CMS_LIMITS.maxSlugLength).replace(/-+$/, '')
    if (candidate && SLUG_PATTERN.test(candidate) && !taken.has(candidate))
      return candidate
  }

  const fallback = `artigo-${legacyId}-${taken.size}`.slice(0, CMS_LIMITS.maxSlugLength).replace(/-+$/, '')
  return SLUG_PATTERN.test(fallback) ? fallback : `artigo-${legacyId}`
}

/** Public path for an article. Equivalent to `cms_publish_revision` for publication_type `article`. */
export function legacyArticlePath(slug: string, prefix = LEGACY_ARTICLE_ROUTE_PREFIX): string {
  const cleaned = legacySlug(prefix, 160) || LEGACY_ARTICLE_ROUTE_PREFIX
  return `/${cleaned}/${slug}`
}

/**
 * Draft payload stored on `cms_documents.draft_payload` and, for published
 * articles, frozen into the revision snapshot.
 * HTML in `content` is copied into `body` unchanged. `blocks` stays empty.
 * `thumb_url` is not a `media_assets` id, so `cover` is null.
 */
export function buildLegacyArticlePayload(input: LegacyArticlePayloadInput): CmsDocumentPayload {
  const title = legacyArticleTitle(input.title, input.id)
  const meta = clipLegacyText(input.metaDescription, CMS_LIMITS.maxExcerptLength)
  const seoDescription = clipLegacyText(input.metaDescription, CMS_LIMITS.maxSeoDescriptionLength)
  const seoTitle = clipLegacyText(title, CMS_LIMITS.maxSeoTitleLength)
  const seo: CmsDocumentPayload['seo'] = {}
  if (seoTitle)
    seo.title = seoTitle
  if (seoDescription)
    seo.description = seoDescription

  return cmsDocumentPayloadSchema.parse({
    title,
    slug: input.slug,
    ...(meta ? { excerpt: meta } : {}),
    body: input.content ?? '',
    blocks: [],
    cover: null,
    termIds: input.termIds ?? [],
    seo,
  })
}

const REPORT_FIELDS = {
  tenants: 'tenants',
  sitesCreated: 'sites_created',
  sitesReused: 'sites_reused',
  taxonomiesCreated: 'taxonomies_created',
  categoriesMapped: 'categories_mapped',
  categoriesSkipped: 'categories_skipped',
  tagsMapped: 'tags_mapped',
  tagsSkipped: 'tags_skipped',
  articlesMapped: 'articles_mapped',
  articlesPublished: 'articles_published',
  articlesDrafted: 'articles_drafted',
  articlesSkippedMapped: 'articles_skipped_mapped',
  articlesSkippedNoTenant: 'articles_skipped_no_tenant',
  articlesSkippedOrphan: 'articles_skipped_orphan',
  relationsLinked: 'relations_linked',
  relationsSkipped: 'relations_skipped',
} as const

export function parseLegacyMigrationReport(value: unknown): LegacyArticleMigrationReport {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw cmsError(500, 'internal_error', 'Resposta inválida da migração')

  const row = value as Record<string, unknown>
  const report = {} as LegacyArticleMigrationReport
  for (const [camel, snake] of Object.entries(REPORT_FIELDS)) {
    const raw = row[snake]
    report[camel as keyof LegacyArticleMigrationReport] = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
  }
  return report
}

/**
 * Staff may import every tenant (no selected company, or an explicit null).
 * Anyone else is limited to the company already selected in the workspace,
 * and only after the handler has checked `cms.settings.manage`.
 */
export function resolveLegacyMigrationScope(input: {
  isPlatformStaff: boolean
  contextTenantId: string | null
  requestedTenantId: string | null | undefined
}): LegacyMigrationScope {
  if (!input.isPlatformStaff) {
    if (!input.contextTenantId)
      return { ok: false, status: 400, message: 'Selecione uma empresa' }
    if (input.requestedTenantId === null || (input.requestedTenantId && input.requestedTenantId !== input.contextTenantId))
      return { ok: false, status: 403, message: 'A migração só pode rodar na empresa selecionada' }
    return { ok: true, tenantId: input.contextTenantId }
  }

  if (input.requestedTenantId === undefined)
    return { ok: true, tenantId: input.contextTenantId }
  return { ok: true, tenantId: input.requestedTenantId }
}

/** Re-runs `cms_migrate_legacy_articles`. Already mapped legacy ids are skipped. */
export async function migrateLegacyArticles(
  client: WorkspaceClient,
  tenantId: string | null,
): Promise<LegacyArticleMigrationReport> {
  const { data, error } = await client.rpc(CMS_RPC.migrateLegacyArticles, {
    p_tenant_id: tenantId,
  })
  assertNoDbError(error, 'Erro ao migrar artigos legados')
  return parseLegacyMigrationReport(data)
}
