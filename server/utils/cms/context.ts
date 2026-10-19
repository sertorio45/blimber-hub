import type { H3Event } from 'h3'

import type { CmsCapability } from '~/constants/workspace'
import type { CmsDocumentKind } from '~/lib/cms/contracts'
import type { CmsDocumentRow, CmsSiteRow } from '~/server/utils/cms/mappers'
import type { WorkspaceClient, WorkspaceContext } from '~/server/utils/workspace-context'

import { z } from 'zod'

import { CMS_TABLES } from '~/lib/cms/contracts'
import { assertNoDbError, cmsError, cmsForbidden, cmsNotFound, toCmsError } from '~/server/utils/cms/errors'
import { DOCUMENT_COLUMNS, SITE_COLUMNS } from '~/server/utils/cms/mappers'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'

export type CmsDocumentAction = 'create' | 'update' | 'delete'

export const CMS_DOCUMENT_CAPABILITIES: Record<CmsDocumentKind, Record<CmsDocumentAction, CmsCapability>> = {
  page: {
    create: 'cms.pages.create',
    update: 'cms.pages.update',
    delete: 'cms.pages.delete',
  },
  publication: {
    create: 'cms.publications.create',
    update: 'cms.publications.update',
    delete: 'cms.publications.delete',
  },
}

export interface CmsContext {
  ws: WorkspaceContext
  tenantId: string
  userId: string
  client: WorkspaceClient
  site?: CmsSiteRow
  document?: CmsDocumentRow
}

export interface CmsSiteContext extends CmsContext {
  site: CmsSiteRow
}

export interface CmsDocumentContext extends CmsContext {
  site: CmsSiteRow
  document: CmsDocumentRow
}

export interface CmsContextOptions {
  siteId?: string | null
  documentId?: string | null
}

const uuidSchema = z.string().uuid()

export function documentCapability(kind: CmsDocumentKind, action: CmsDocumentAction): CmsCapability {
  return CMS_DOCUMENT_CAPABILITIES[kind][action]
}

export function assertCmsCapability(
  ctx: Pick<CmsContext, 'ws'>,
  capability: CmsCapability,
  message = 'Sem permissão para esta ação',
): void {
  if (!ctx.ws.has(capability))
    throw cmsForbidden(message)
}

/** Loads a site of the context tenant; anything else is indistinguishable from "missing". */
export async function loadTenantSite(
  ctx: Pick<CmsContext, 'client' | 'tenantId'>,
  siteId: string | null | undefined,
): Promise<CmsSiteRow> {
  if (!siteId || !uuidSchema.safeParse(siteId).success)
    throw cmsNotFound('Site não encontrado')

  const { data, error } = await ctx.client
    .from(CMS_TABLES.sites)
    .select(SITE_COLUMNS)
    .eq('id', siteId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  assertNoDbError(error)
  if (!data)
    throw cmsNotFound('Site não encontrado')
  return data as CmsSiteRow
}

/** Loads a live (not trashed) document of the context tenant. */
export async function loadTenantDocument(
  ctx: Pick<CmsContext, 'client' | 'tenantId'>,
  documentId: string | null | undefined,
): Promise<CmsDocumentRow> {
  if (!documentId || !uuidSchema.safeParse(documentId).success)
    throw cmsNotFound()

  const { data, error } = await ctx.client
    .from(CMS_TABLES.documents)
    .select(DOCUMENT_COLUMNS)
    .eq('id', documentId)
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null)
    .maybeSingle()
  assertNoDbError(error)
  if (!data)
    throw cmsNotFound()
  return data as CmsDocumentRow
}

/**
 * Single gate for `/api/cms/**` handlers (except media). The tenant always comes
 * from the validated workspace scope; site and document ids are resolved with an
 * explicit `tenant_id` filter because the service-role client bypasses RLS.
 */
export async function requireCmsContext(
  event: H3Event,
  capability: CmsCapability | CmsCapability[] | null,
  options: { siteId: string | null | undefined, documentId: string | null | undefined },
): Promise<CmsDocumentContext>
export async function requireCmsContext(
  event: H3Event,
  capability: CmsCapability | CmsCapability[] | null,
  options: { documentId: string | null | undefined },
): Promise<CmsDocumentContext>
export async function requireCmsContext(
  event: H3Event,
  capability: CmsCapability | CmsCapability[] | null,
  options: { siteId: string | null | undefined },
): Promise<CmsSiteContext>
export async function requireCmsContext(
  event: H3Event,
  capability: CmsCapability | CmsCapability[] | null,
  options?: CmsContextOptions,
): Promise<CmsContext>
export async function requireCmsContext(
  event: H3Event,
  capability: CmsCapability | CmsCapability[] | null,
  options: CmsContextOptions = {},
): Promise<CmsContext> {
  let ws: WorkspaceContext
  try {
    ws = await requireWorkspaceContext(event, {
      module: 'cms',
      requireTenant: true,
      ...(capability ? { capability } : {}),
    })
  }
  catch (error: unknown) {
    throw toCmsError(error)
  }

  if (!ws.tenantId)
    throw cmsError(400, 'validation_failed', 'Selecione uma empresa')

  const ctx: CmsContext = { ws, tenantId: ws.tenantId, userId: ws.userId, client: ws.client }

  if ('documentId' in options) {
    const document = await loadTenantDocument(ctx, options.documentId)
    if (options.siteId && options.siteId !== document.site_id)
      throw cmsNotFound()
    ctx.document = document
    ctx.site = await loadTenantSite(ctx, document.site_id)
  }
  else if ('siteId' in options) {
    ctx.site = await loadTenantSite(ctx, options.siteId)
  }

  return ctx
}
