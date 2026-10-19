import type {
  CmsAuthor,
  CmsDocument,
  CmsDocumentKind,
  CmsDocumentPayload,
  CmsDocumentSummary,
  CmsPublicationType,
  CmsPublicDocument,
  CmsPublicStatus,
  CmsRevision,
  CmsSite,
  CmsSiteStatus,
  CmsTaxonomy,
  CmsTaxonomyKind,
  CmsTerm,
  CmsWorkflowStatus,
} from '~/lib/cms/contracts'

import {
  cmsAuthorSchema,
  cmsDocumentPayloadSchema,
  cmsDocumentSchema,
  cmsDocumentSummarySchema,
  cmsPublicDocumentSchema,
  cmsRevisionSchema,
  cmsSiteSchema,
  cmsTaxonomySchema,
  cmsTermSchema,
} from '~/lib/cms/contracts'
import { cmsError } from '~/server/utils/cms/errors'

// ---- Database rows (snake_case of the contract fields) ----

export interface CmsSiteRow {
  id: string
  tenant_id: string
  site_key: string
  name: string
  default_locale: string
  timezone: string
  status: CmsSiteStatus
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface CmsDocumentSummaryRow {
  id: string
  tenant_id: string
  site_id: string
  kind: CmsDocumentKind
  publication_type: CmsPublicationType | null
  locale: string
  title: string
  slug: string | null
  parent_id: string | null
  is_home: boolean
  workflow_status: CmsWorkflowStatus
  public_status: CmsPublicStatus
  edit_version: number
  published_revision_id: string | null
  published_at: string | null
  has_unpublished_changes: boolean
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface CmsDocumentRow extends CmsDocumentSummaryRow {
  draft_payload: unknown
}

export interface CmsRevisionSummaryRow {
  id: string
  tenant_id: string
  site_id: string
  document_id: string
  revision_number: number
  reason: CmsRevision['reason']
  created_by: string | null
  created_at: string
}

export interface CmsRevisionRow extends CmsRevisionSummaryRow {
  snapshot: unknown
}

export interface CmsAuthorRow {
  id: string
  tenant_id: string
  site_id: string
  name: string
  slug: string
  bio: string | null
  avatar_asset_id: string | null
  user_id: string | null
  created_at: string
  updated_at: string
}

export interface CmsTaxonomyRow {
  id: string
  tenant_id: string
  site_id: string
  kind: CmsTaxonomyKind
  name: string
  slug: string
  created_at: string
  updated_at: string
}

export interface CmsTermRow {
  id: string
  tenant_id: string
  site_id: string
  taxonomy_id: string
  name: string
  slug: string
  parent_id: string | null
  created_at: string
  updated_at: string
}

export const SITE_COLUMNS
  = 'id, tenant_id, site_key, name, default_locale, timezone, status, settings, created_at, updated_at'

/** List projection: the draft payload is never shipped in listings. */
export const DOCUMENT_SUMMARY_COLUMNS = [
  'id',
  'tenant_id',
  'site_id',
  'kind',
  'publication_type',
  'locale',
  'title',
  'slug',
  'parent_id',
  'is_home',
  'workflow_status',
  'public_status',
  'edit_version',
  'published_revision_id',
  'published_at',
  'has_unpublished_changes',
  'created_by',
  'updated_by',
  'deleted_at',
  'created_at',
  'updated_at',
].join(', ')

export const DOCUMENT_COLUMNS = `${DOCUMENT_SUMMARY_COLUMNS}, draft_payload`

export const REVISION_SUMMARY_COLUMNS
  = 'id, tenant_id, site_id, document_id, revision_number, reason, created_by, created_at'

export const REVISION_COLUMNS = `${REVISION_SUMMARY_COLUMNS}, snapshot`

export const AUTHOR_COLUMNS
  = 'id, tenant_id, site_id, name, slug, bio, avatar_asset_id, user_id, created_at, updated_at'

export const TAXONOMY_COLUMNS
  = 'id, tenant_id, site_id, kind, name, slug, created_at, updated_at'

export const TERM_COLUMNS
  = 'id, tenant_id, site_id, taxonomy_id, name, slug, parent_id, created_at, updated_at'

export type CmsRevisionSummary = Omit<CmsRevision, 'snapshot'>

const cmsRevisionSummarySchema = cmsRevisionSchema.omit({ snapshot: true })

/**
 * Rows that fail contract validation are data corruption, not client errors:
 * they are logged with the row id and surface as a generic 500.
 */
function parseOrFail<T>(
  result: { success: true, data: T } | { success: false, error: unknown },
  entity: string,
  id: string,
): T {
  if (result.success)
    return result.data
  console.error(`[cms] invalid ${entity} row`, id, result.error)
  throw cmsError(500, 'internal_error', 'Conteúdo armazenado em formato inválido')
}

export function parsePayload(value: unknown, id = 'unknown'): CmsDocumentPayload {
  const source = value && typeof value === 'object' ? value : {}
  return parseOrFail(cmsDocumentPayloadSchema.safeParse(source), 'payload', id)
}

export function mapSite(row: CmsSiteRow): CmsSite {
  return parseOrFail(cmsSiteSchema.safeParse({
    id: row.id,
    tenantId: row.tenant_id,
    siteKey: row.site_key,
    name: row.name,
    defaultLocale: row.default_locale,
    timezone: row.timezone,
    status: row.status,
    settings: row.settings ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }), 'site', row.id)
}

function summaryFields(row: CmsDocumentSummaryRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    kind: row.kind,
    publicationType: row.publication_type ?? null,
    locale: row.locale,
    title: row.title ?? '',
    slug: row.slug ?? null,
    parentId: row.parent_id ?? null,
    isHome: Boolean(row.is_home),
    workflowStatus: row.workflow_status,
    publicStatus: row.public_status,
    editVersion: row.edit_version,
    publishedRevisionId: row.published_revision_id ?? null,
    publishedAt: row.published_at ?? null,
    hasUnpublishedChanges: Boolean(row.has_unpublished_changes),
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapDocumentSummary(row: CmsDocumentSummaryRow): CmsDocumentSummary {
  return parseOrFail(cmsDocumentSummarySchema.safeParse(summaryFields(row)), 'document', row.id)
}

export function mapDocument(row: CmsDocumentRow): CmsDocument {
  return parseOrFail(cmsDocumentSchema.safeParse({
    ...summaryFields(row),
    draftPayload: row.draft_payload && typeof row.draft_payload === 'object' ? row.draft_payload : {},
  }), 'document', row.id)
}

export function mapRevisionSummary(row: CmsRevisionSummaryRow): CmsRevisionSummary {
  return parseOrFail(cmsRevisionSummarySchema.safeParse({
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    documentId: row.document_id,
    revisionNumber: row.revision_number,
    reason: row.reason,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  }), 'revision', row.id)
}

export function mapRevision(row: CmsRevisionRow): CmsRevision {
  return parseOrFail(cmsRevisionSchema.safeParse({
    ...mapRevisionSummary(row),
    snapshot: row.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {},
  }), 'revision', row.id)
}

export interface CmsPublicSource {
  document: {
    id: string
    kind: CmsDocumentKind
    publication_type: CmsPublicationType | null
    locale: string
    published_at: string | null
  }
  revisionId: string
  path: string
  content: unknown
}

export function mapAuthor(row: CmsAuthorRow): CmsAuthor {
  return parseOrFail(cmsAuthorSchema.safeParse({
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    name: row.name,
    slug: row.slug,
    bio: row.bio ?? null,
    avatarAssetId: row.avatar_asset_id ?? null,
    userId: row.user_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }), 'author', row.id)
}

export function mapTaxonomy(row: CmsTaxonomyRow): CmsTaxonomy {
  return parseOrFail(cmsTaxonomySchema.safeParse({
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    kind: row.kind,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }), 'taxonomy', row.id)
}

export function mapTerm(row: CmsTermRow, kind: CmsTaxonomyKind): CmsTerm {
  return parseOrFail(cmsTermSchema.safeParse({
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    taxonomyId: row.taxonomy_id,
    kind,
    name: row.name,
    slug: row.slug,
    parentId: row.parent_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }), 'term', row.id)
}

export function mapPublicDocument(source: CmsPublicSource): CmsPublicDocument {
  return parseOrFail(cmsPublicDocumentSchema.safeParse({
    id: source.document.id,
    kind: source.document.kind,
    publicationType: source.document.publication_type ?? null,
    locale: source.document.locale,
    path: source.path,
    revisionId: source.revisionId,
    publishedAt: source.document.published_at,
    content: source.content && typeof source.content === 'object' ? source.content : {},
  }), 'public document', source.document.id)
}
