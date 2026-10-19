import type { CmsPreviewToken, CmsSeo } from '~/lib/cms/contracts'
import type { CmsDocumentContext } from '~/server/utils/cms/context'
import type { CmsPublicDelivery } from '~/server/utils/cms/public'
import type { WorkspaceClient } from '~/server/utils/workspace-context'

import process from 'node:process'

import { CMS_TABLES } from '~/lib/cms/contracts'
import { recordCmsAudit } from '~/server/utils/cms/audit'
import { assertCmsCapability } from '~/server/utils/cms/context'
import { assertNoDbError, cmsError, cmsNotFound } from '~/server/utils/cms/errors'
import { mapPublicDocument } from '~/server/utils/cms/mappers'
import { signCmsPreviewToken, verifyCmsPreviewToken } from '~/server/utils/cms/preview-token'
import {
  PUBLIC_DOCUMENT_COLUMNS,
  PUBLIC_REVISION_COLUMNS,
  PUBLIC_ROUTE_COLUMNS,
  PUBLIC_SITE_DELIVERY_COLUMNS,
  readPublicSiteChrome,
} from '~/server/utils/cms/public'

export const CMS_PREVIEW_PATH = '/api/public/cms/v1/preview'

const PREVIEW_REVISION_COLUMNS = 'id, document_id, revision_number'
const PREVIEW_SNAPSHOT_COLUMNS = `${PUBLIC_REVISION_COLUMNS}, created_at`

export type CmsPublicPreview = CmsPublicDelivery & { preview: true }

interface PreviewRevisionRow {
  id: string
  document_id: string
  snapshot: unknown
  created_at: string
}

interface PreviewDocumentRow {
  id: string
  kind: CmsPublicDelivery['kind']
  publication_type: CmsPublicDelivery['publicationType']
  locale: string
  published_at: string | null
}

interface PreviewSiteRow {
  id: string
  tenant_id: string
  site_key: string
  name?: string | null
  default_locale: string
  status: string
  settings?: Record<string, unknown> | null
}

interface PreviewRouteRow {
  path: string
  locale: string
  document_id: string | null
}

/**
 * Runtime secret for preview HMAC. Dedicated env wins; `API_SECRET` is only
 * a local fallback so a missing preview key does not silently sign with "".
 */
export function resolveCmsPreviewSecret(): string {
  const fromEnv = process.env.CMS_PREVIEW_SECRET || process.env.NUXT_CMS_PREVIEW_SECRET
  if (fromEnv)
    return fromEnv

  try {
    const config = useRuntimeConfig() as { cmsPreviewSecret?: unknown }
    if (typeof config.cmsPreviewSecret === 'string' && config.cmsPreviewSecret)
      return config.cmsPreviewSecret
  }
  catch {
    // Vitest imports this module outside Nitro.
  }

  if (process.env.API_SECRET)
    return process.env.API_SECRET

  throw cmsError(500, 'internal_error', 'Pré-visualização indisponível')
}

function snapshotSlug(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object' || !('slug' in snapshot))
    return null
  const slug = (snapshot as { slug?: unknown }).slug
  return typeof slug === 'string' && slug ? slug : null
}

/**
 * Mints a short-lived token for one existing revision. The public API later
 * reads that revision's snapshot and never `draft_payload`.
 */
export async function issueCmsPreviewToken(
  ctx: CmsDocumentContext,
  revisionId: string | undefined,
  nowMs = Date.now(),
): Promise<CmsPreviewToken> {
  assertCmsCapability(ctx, 'cms.read', 'Sem permissão para pré-visualizar')

  let request = ctx.client
    .from(CMS_TABLES.revisions)
    .select(PREVIEW_REVISION_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', ctx.document.site_id)
    .eq('document_id', ctx.document.id)

  if (revisionId)
    request = request.eq('id', revisionId)
  else
    request = request.order('revision_number', { ascending: false }).limit(1)

  const { data, error } = await request.maybeSingle()
  assertNoDbError(error)
  const revision = data as { id: string } | null
  if (!revision) {
    throw revisionId
      ? cmsNotFound('Versão não encontrada')
      : cmsError(422, 'validation_failed', 'Ainda não há uma versão para pré-visualizar')
  }

  const issued = signCmsPreviewToken({
    tid: ctx.tenantId,
    sid: ctx.document.site_id,
    did: ctx.document.id,
    rid: revision.id,
  }, resolveCmsPreviewSecret(), nowMs)

  await recordCmsAudit(ctx, {
    action: 'preview.token',
    siteId: ctx.document.site_id,
    documentId: ctx.document.id,
    revisionId: revision.id,
    metadata: { expiresAt: issued.expiresAt },
  })

  return {
    token: issued.token,
    expiresAt: issued.expiresAt,
    revisionId: revision.id,
    previewPath: `${CMS_PREVIEW_PATH}?token=${encodeURIComponent(issued.token)}`,
  }
}

async function loadPreviewSite(client: WorkspaceClient, tenantId: string, siteId: string): Promise<PreviewSiteRow | null> {
  const { data, error } = await client
    .from(CMS_TABLES.sites)
    .select(PUBLIC_SITE_DELIVERY_COLUMNS)
    .eq('id', siteId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  assertNoDbError(error)
  return data as PreviewSiteRow | null
}

/**
 * Resolves a preview token to one revision snapshot. Expired and forged
 * tokens fail before any database read.
 */
export async function resolveCmsPreview(
  client: WorkspaceClient,
  token: string | undefined,
  nowMs = Date.now(),
): Promise<CmsPublicPreview> {
  const verified = verifyCmsPreviewToken(token ?? '', resolveCmsPreviewSecret(), nowMs)
  if (!verified.ok) {
    throw cmsError(
      401,
      'unauthenticated',
      verified.reason === 'expired'
        ? 'O link de pré-visualização expirou'
        : 'Link de pré-visualização inválido',
    )
  }

  const { claims } = verified
  const { data: revisionRow, error: revisionError } = await client
    .from(CMS_TABLES.revisions)
    .select(PREVIEW_SNAPSHOT_COLUMNS)
    .eq('id', claims.rid)
    .eq('document_id', claims.did)
    .eq('site_id', claims.sid)
    .eq('tenant_id', claims.tid)
    .maybeSingle()
  assertNoDbError(revisionError)
  const revision = revisionRow as PreviewRevisionRow | null
  if (!revision)
    throw cmsNotFound()

  const { data: documentRow, error: documentError } = await client
    .from(CMS_TABLES.documents)
    .select(PUBLIC_DOCUMENT_COLUMNS)
    .eq('id', claims.did)
    .eq('site_id', claims.sid)
    .eq('tenant_id', claims.tid)
    .is('deleted_at', null)
    .maybeSingle()
  assertNoDbError(documentError)
  const document = documentRow as PreviewDocumentRow | null
  if (!document)
    throw cmsNotFound()

  const site = await loadPreviewSite(client, claims.tid, claims.sid)
  if (!site)
    throw cmsNotFound()

  const { data: routeRow, error: routeError } = await client
    .from(CMS_TABLES.routes)
    .select(PUBLIC_ROUTE_COLUMNS)
    .eq('site_id', claims.sid)
    .eq('tenant_id', claims.tid)
    .eq('document_id', claims.did)
    .eq('locale', document.locale)
    .eq('route_kind', 'document')
    .maybeSingle()
  assertNoDbError(routeError)
  const route = routeRow as PreviewRouteRow | null
  const slug = snapshotSlug(revision.snapshot)
  const path = route?.path ?? (slug ? `/${slug}` : '/')

  const published = mapPublicDocument({
    document: { ...document, published_at: document.published_at || revision.created_at },
    revisionId: revision.id,
    path,
    content: revision.snapshot,
  })
  const seo: CmsSeo = { ...published.content.seo, noindex: true }

  return {
    ...published,
    seo,
    site: readPublicSiteChrome(site, document.locale),
    preview: true,
  }
}
