import { z } from 'zod'

/**
 * Shared CMS contracts. Server handlers, panel composables and the public
 * renderer all validate against these schemas, so a field renamed here breaks
 * every consumer at type-check time instead of silently at runtime.
 */

export const CMS_TABLES = {
  sites: 'cms_sites',
  siteDomains: 'cms_site_domains',
  documents: 'cms_documents',
  revisions: 'cms_revisions',
  routes: 'cms_routes',
  authors: 'cms_authors',
  taxonomies: 'cms_taxonomies',
  terms: 'cms_terms',
  revisionTerms: 'cms_revision_terms',
  assetUsages: 'cms_asset_usages',
  auditEvents: 'cms_audit_events',
  legacyMap: 'cms_legacy_map',
  collectionDefinitions: 'cms_collection_definitions',
  entries: 'cms_entries',
} as const

export const CMS_RPC = {
  publishRevision: 'cms_publish_revision',
  unpublishDocument: 'cms_unpublish_document',
} as const

export const CMS_LIMITS = {
  maxPayloadBytes: 512 * 1024,
  maxBlocksPerDocument: 200,
  maxBlockDepth: 4,
  maxPageSize: 100,
  defaultPageSize: 25,
  maxTitleLength: 200,
  maxSlugLength: 160,
  maxExcerptLength: 600,
  maxSeoTitleLength: 120,
  maxSeoDescriptionLength: 320,
} as const

export const CMS_DEFAULT_LOCALE = 'pt-BR'
export const CMS_DEFAULT_TIMEZONE = 'America/Sao_Paulo'

export const cmsDocumentKindSchema = z.enum(['page', 'publication'])
export const cmsPublicationTypeSchema = z.enum(['article', 'news'])
export const cmsWorkflowStatusSchema = z.enum(['draft', 'in_review', 'changes_requested', 'approved'])
export const cmsPublicStatusSchema = z.enum(['unpublished', 'published', 'withdrawn'])
export const cmsSiteStatusSchema = z.enum(['active', 'suspended', 'archived'])

export type CmsDocumentKind = z.infer<typeof cmsDocumentKindSchema>
export type CmsPublicationType = z.infer<typeof cmsPublicationTypeSchema>
export type CmsWorkflowStatus = z.infer<typeof cmsWorkflowStatusSchema>
export type CmsPublicStatus = z.infer<typeof cmsPublicStatusSchema>
export type CmsSiteStatus = z.infer<typeof cmsSiteStatusSchema>

const uuid = z.string().uuid()
const isoDate = z.string()

export const cmsSlugSchema = z.string()
  .trim()
  .min(1)
  .max(CMS_LIMITS.maxSlugLength)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens')

export const cmsSiteKeySchema = z.string().trim().min(3).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

/** Media is always referenced by asset id / object path, never by a signed URL. */
export const cmsMediaRefSchema = z.object({
  assetId: uuid,
  objectPath: z.string().min(1).max(1024).optional(),
  alt: z.string().max(300).optional(),
  credit: z.string().max(200).optional(),
})
export type CmsMediaRef = z.infer<typeof cmsMediaRefSchema>

export interface CmsBlock {
  id: string
  type: string
  version: number
  props: Record<string, unknown>
  children?: CmsBlock[]
}

export const cmsBlockSchema: z.ZodType<CmsBlock> = z.lazy(() => z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(80).regex(/^[a-z][a-z0-9_.-]*$/),
  version: z.number().int().positive(),
  props: z.record(z.unknown()),
  children: z.array(cmsBlockSchema).max(CMS_LIMITS.maxBlocksPerDocument).optional(),
}))

export const cmsSeoSchema = z.object({
  title: z.string().max(CMS_LIMITS.maxSeoTitleLength).optional(),
  description: z.string().max(CMS_LIMITS.maxSeoDescriptionLength).optional(),
  canonicalUrl: z.string().url().optional(),
  noindex: z.boolean().optional(),
  socialImage: cmsMediaRefSchema.optional(),
})
export type CmsSeo = z.infer<typeof cmsSeoSchema>

/**
 * Working copy stored in `cms_documents.draft_payload` and frozen into
 * `cms_revisions.snapshot`. Drafts may be incomplete; publish validation is
 * stricter (see `cmsPublishablePayloadSchema`).
 */
export const cmsDocumentPayloadSchema = z.object({
  title: z.string().max(CMS_LIMITS.maxTitleLength).default(''),
  slug: z.string().max(CMS_LIMITS.maxSlugLength).optional(),
  excerpt: z.string().max(CMS_LIMITS.maxExcerptLength).optional(),
  body: z.string().optional(),
  blocks: z.array(cmsBlockSchema).max(CMS_LIMITS.maxBlocksPerDocument).default([]),
  cover: cmsMediaRefSchema.nullable().optional(),
  authorId: uuid.nullable().optional(),
  termIds: z.array(uuid).max(100).default([]),
  seo: cmsSeoSchema.default({}),
  sourceName: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  eventDate: isoDate.optional(),
})
export type CmsDocumentPayload = z.infer<typeof cmsDocumentPayloadSchema>

export const cmsPublishablePayloadSchema = cmsDocumentPayloadSchema.extend({
  title: z.string().trim().min(1).max(CMS_LIMITS.maxTitleLength),
  slug: cmsSlugSchema,
})

export const cmsSiteSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteKey: cmsSiteKeySchema,
  name: z.string().min(1).max(160),
  defaultLocale: z.string().default(CMS_DEFAULT_LOCALE),
  timezone: z.string().default(CMS_DEFAULT_TIMEZONE),
  status: cmsSiteStatusSchema,
  settings: z.record(z.unknown()).default({}),
  createdAt: isoDate,
  updatedAt: isoDate,
})
export type CmsSite = z.infer<typeof cmsSiteSchema>

export const cmsDocumentSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  kind: cmsDocumentKindSchema,
  publicationType: cmsPublicationTypeSchema.nullable(),
  locale: z.string(),
  title: z.string(),
  slug: z.string().nullable(),
  parentId: uuid.nullable(),
  isHome: z.boolean(),
  workflowStatus: cmsWorkflowStatusSchema,
  publicStatus: cmsPublicStatusSchema,
  draftPayload: cmsDocumentPayloadSchema,
  editVersion: z.number().int().nonnegative(),
  publishedRevisionId: uuid.nullable(),
  publishedAt: isoDate.nullable(),
  hasUnpublishedChanges: z.boolean(),
  createdBy: uuid.nullable(),
  updatedBy: uuid.nullable(),
  deletedAt: isoDate.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
})
export type CmsDocument = z.infer<typeof cmsDocumentSchema>

/** List projection: never ships the full draft payload. */
export const cmsDocumentSummarySchema = cmsDocumentSchema.omit({ draftPayload: true })
export type CmsDocumentSummary = z.infer<typeof cmsDocumentSummarySchema>

export const cmsRevisionSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  documentId: uuid,
  revisionNumber: z.number().int().positive(),
  snapshot: cmsDocumentPayloadSchema,
  reason: z.enum(['checkpoint', 'review', 'publish', 'restore']),
  createdBy: uuid.nullable(),
  createdAt: isoDate,
})
export type CmsRevision = z.infer<typeof cmsRevisionSchema>

/** Public delivery shape: published revision only, no draft or audit data. */
export const cmsPublicDocumentSchema = z.object({
  id: uuid,
  kind: cmsDocumentKindSchema,
  publicationType: cmsPublicationTypeSchema.nullable(),
  locale: z.string(),
  path: z.string(),
  revisionId: uuid,
  publishedAt: isoDate,
  content: cmsDocumentPayloadSchema,
})
export type CmsPublicDocument = z.infer<typeof cmsPublicDocumentSchema>

// ---- Admin API inputs ----

export const cmsCreateSiteInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  siteKey: cmsSiteKeySchema.optional(),
  defaultLocale: z.string().max(16).optional(),
  timezone: z.string().max(80).optional(),
})
export type CmsCreateSiteInput = z.infer<typeof cmsCreateSiteInputSchema>

export const cmsUpdateSiteInputSchema = cmsCreateSiteInputSchema.partial().extend({
  settings: z.record(z.unknown()).optional(),
})
export type CmsUpdateSiteInput = z.infer<typeof cmsUpdateSiteInputSchema>

export const cmsCreateDocumentInputSchema = z.object({
  siteId: uuid,
  kind: cmsDocumentKindSchema,
  publicationType: cmsPublicationTypeSchema.optional(),
  title: z.string().trim().min(1).max(CMS_LIMITS.maxTitleLength),
  slug: cmsSlugSchema.optional(),
  parentId: uuid.nullable().optional(),
  locale: z.string().max(16).optional(),
}).superRefine((value, ctx) => {
  if (value.kind === 'publication' && !value.publicationType)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['publicationType'], message: 'Escolha Artigo ou Notícia' })
  if (value.kind === 'page' && value.publicationType)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['publicationType'], message: 'Páginas não têm tipo de publicação' })
})
export type CmsCreateDocumentInput = z.infer<typeof cmsCreateDocumentInputSchema>

/** Autosave: `expectedVersion` enables optimistic locking (409 on mismatch). */
export const cmsSaveDraftInputSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  payload: cmsDocumentPayloadSchema,
  publicationType: cmsPublicationTypeSchema.optional(),
})
export type CmsSaveDraftInput = z.infer<typeof cmsSaveDraftInputSchema>

export const cmsPublishInputSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
})
export type CmsPublishInput = z.infer<typeof cmsPublishInputSchema>

export const cmsListQuerySchema = z.object({
  siteId: uuid.optional(),
  type: cmsPublicationTypeSchema.optional(),
  status: cmsPublicStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(CMS_LIMITS.maxPageSize).default(CMS_LIMITS.defaultPageSize),
})
export type CmsListQuery = z.infer<typeof cmsListQuerySchema>

// ---- Collections (versioned schema + entries) ----

/** Stable key for a collection or one of its fields. */
export const cmsCollectionKeySchema = z.string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens')

export const cmsCollectionFieldTypeSchema = z.enum(['text', 'number', 'boolean', 'media'])
export type CmsCollectionFieldType = z.infer<typeof cmsCollectionFieldTypeSchema>

export const CMS_COLLECTION_SCHEMA_VERSION = 1 as const
export const CMS_COLLECTION_FIELD_LIMIT = 40

export const cmsCollectionFieldSchema = z.object({
  key: cmsCollectionKeySchema,
  label: z.string().trim().min(1).max(80),
  type: cmsCollectionFieldTypeSchema,
  required: z.boolean().default(false),
})
export type CmsCollectionField = z.infer<typeof cmsCollectionFieldSchema>

/**
 * Versioned collection schema. MVP accepts only version 1, with text, number,
 * boolean and media-ref fields. Unknown versions fail validation on purpose.
 */
export const cmsCollectionSchemaSchema = z.object({
  version: z.literal(CMS_COLLECTION_SCHEMA_VERSION),
  fields: z.array(cmsCollectionFieldSchema).min(1).max(CMS_COLLECTION_FIELD_LIMIT),
}).superRefine((schema, ctx) => {
  const seen = new Set<string>()
  for (const [index, field] of schema.fields.entries()) {
    if (seen.has(field.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fields', index, 'key'],
        message: 'Esta chave já está em uso',
      })
    }
    seen.add(field.key)
  }
})
export type CmsCollectionSchema = z.infer<typeof cmsCollectionSchemaSchema>

export const cmsCollectionDefinitionSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  key: cmsCollectionKeySchema,
  name: z.string().min(1).max(80),
  schema: cmsCollectionSchemaSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
})
export type CmsCollectionDefinition = z.infer<typeof cmsCollectionDefinitionSchema>

export const cmsEntryStatusSchema = z.enum(['draft', 'published'])
export type CmsEntryStatus = z.infer<typeof cmsEntryStatusSchema>

export const cmsEntrySchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  definitionId: uuid,
  payload: z.record(z.unknown()),
  status: cmsEntryStatusSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
})
export type CmsEntry = z.infer<typeof cmsEntrySchema>

export const cmsCreateCollectionInputSchema = z.object({
  siteId: uuid,
  key: cmsCollectionKeySchema,
  name: z.string().trim().min(1).max(80),
  schema: cmsCollectionSchemaSchema,
})
export type CmsCreateCollectionInput = z.infer<typeof cmsCreateCollectionInputSchema>

export const cmsUpdateCollectionInputSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  schema: cmsCollectionSchemaSchema.optional(),
}).refine(value => value.name !== undefined || value.schema !== undefined, {
  message: 'Nada para salvar',
})
export type CmsUpdateCollectionInput = z.infer<typeof cmsUpdateCollectionInputSchema>

export const cmsCollectionListQuerySchema = z.object({
  siteId: uuid.optional(),
})
export type CmsCollectionListQuery = z.infer<typeof cmsCollectionListQuerySchema>

export const cmsSaveEntryInputSchema = z.object({
  payload: z.record(z.unknown()),
  status: cmsEntryStatusSchema.optional(),
})
export type CmsSaveEntryInput = z.infer<typeof cmsSaveEntryInputSchema>

export const cmsEntryListQuerySchema = z.object({
  status: cmsEntryStatusSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(CMS_LIMITS.maxPageSize).default(CMS_LIMITS.defaultPageSize),
})
export type CmsEntryListQuery = z.infer<typeof cmsEntryListQuerySchema>

// ---- Response envelopes ----

export interface CmsPage<T> {
  data: T[]
  nextCursor: string | null
}

export interface CmsItem<T> {
  data: T
}

export type CmsErrorCode
  = | 'unauthenticated'
    | 'forbidden'
    | 'not_found'
    | 'validation_failed'
    | 'version_conflict'
    | 'route_conflict'
    | 'asset_in_use'
    | 'module_disabled'
    | 'payload_too_large'
    | 'internal_error'

export interface CmsErrorBody {
  error: {
    code: CmsErrorCode
    message: string
    details?: unknown
  }
}

export interface CmsVersionConflictDetails {
  currentVersion: number
  updatedAt: string
  updatedBy: string | null
}
