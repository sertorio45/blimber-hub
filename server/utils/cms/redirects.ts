import type { CmsPage, CmsRedirect, CmsRedirectInput } from '~/lib/cms/contracts'
import type { CmsSiteContext } from '~/server/utils/cms/context'
import type { CmsDbError } from '~/server/utils/cms/errors'

import { z } from 'zod'

import { CMS_RPC, CMS_TABLES, cmsRedirectSchema } from '~/lib/cms/contracts'
import { assertAnyCmsCapability, assertCmsCapability } from '~/server/utils/cms/context'
import { assertNoDbError, cmsDbError, cmsError, cmsNotFound } from '~/server/utils/cms/errors'

const ROUTE_COLUMNS = 'id, site_id, locale, path, document_id, created_at, updated_at'

interface RouteRow {
  id: string
  site_id: string
  locale: string
  path: string
  document_id: string | null
  created_at: string
  updated_at: string
}

function mapRedirect(row: RouteRow, titles: Map<string, string>): CmsRedirect {
  const parsed = cmsRedirectSchema.safeParse({
    id: row.id,
    siteId: row.site_id,
    locale: row.locale,
    path: row.path,
    documentId: row.document_id,
    documentTitle: row.document_id ? titles.get(row.document_id) ?? null : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
  if (!parsed.success) {
    console.error('[cms] invalid redirect row', row.id, parsed.error)
    throw cmsError(500, 'internal_error', 'Erro ao ler o redirecionamento')
  }
  return parsed.data
}

/** Redirects are `cms_routes` rows with `route_kind = redirect`. */
export async function listRedirects(ctx: CmsSiteContext): Promise<CmsPage<CmsRedirect>> {
  assertAnyCmsCapability(ctx, ['cms.read', 'cms.settings.manage', 'cms.publish'])

  const { data, error } = await ctx.client
    .from(CMS_TABLES.routes)
    .select(ROUTE_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', ctx.site.id)
    .eq('route_kind', 'redirect')
    .order('path', { ascending: true })
    .limit(200)
  assertNoDbError(error, 'Erro ao listar redirecionamentos')

  const rows = (data ?? []) as RouteRow[]
  const documentIds = [...new Set(rows.map(row => row.document_id).filter((id): id is string => Boolean(id)))]
  const titles = new Map<string, string>()
  if (documentIds.length) {
    const documents = await ctx.client
      .from(CMS_TABLES.documents)
      .select('id, title')
      .eq('tenant_id', ctx.tenantId)
      .in('id', documentIds)
    assertNoDbError(documents.error)
    for (const document of (documents.data ?? []) as Array<{ id: string, title: string }>)
      titles.set(document.id, document.title)
  }

  return { data: rows.map(row => mapRedirect(row, titles)), nextCursor: null }
}

function raiseRedirectError(error: CmsDbError, fallback: string): never {
  if (error.code === 'P0404')
    throw cmsNotFound('Conteúdo ou redirecionamento não encontrado')
  if (error.code === 'P0410')
    throw cmsError(409, 'route_conflict', 'Este endereço já está em uso por outro conteúdo')
  if (error.code === 'P0422')
    throw cmsError(422, 'validation_failed', 'Este endereço não pode virar um redirecionamento.', { field: 'path' })
  throw cmsDbError(error, fallback)
}

export async function upsertRedirect(ctx: CmsSiteContext, input: CmsRedirectInput): Promise<CmsRedirect> {
  assertCmsCapability(ctx, 'cms.publish', 'Sem permissão para criar redirecionamentos')

  const { data, error } = await ctx.client.rpc(CMS_RPC.upsertRedirect, {
    p_site_id: ctx.site.id,
    p_path: input.path,
    p_document_id: input.documentId,
    p_actor: ctx.userId,
  })
  if (error)
    raiseRedirectError(error, 'Erro ao salvar o redirecionamento')

  const listed = await listRedirects(ctx)
  const created = listed.data.find(row => row.id === data?.id)
  if (!created)
    throw cmsError(500, 'internal_error', 'Erro ao salvar o redirecionamento')
  return created
}

export async function deleteRedirect(ctx: CmsSiteContext, routeId: string): Promise<void> {
  assertCmsCapability(ctx, 'cms.publish', 'Sem permissão para remover redirecionamentos')
  if (!z.string().uuid().safeParse(routeId).success)
    throw cmsNotFound('Redirecionamento não encontrado')

  const { error } = await ctx.client.rpc(CMS_RPC.deleteRedirect, {
    p_route_id: routeId,
    p_actor: ctx.userId,
  })
  if (error)
    raiseRedirectError(error, 'Erro ao remover o redirecionamento')
}
