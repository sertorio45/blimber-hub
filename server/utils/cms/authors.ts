import type {
  CmsAuthor,
  CmsCreateAuthorInput,
  CmsUpdateAuthorInput,
} from '~/lib/cms/contracts'
import type { CmsContext } from '~/server/utils/cms/context'
import type { CmsAuthorRow } from '~/server/utils/cms/mappers'

import { CMS_TABLES } from '~/lib/cms/contracts'
import { recordCmsAudit } from '~/server/utils/cms/audit'
import { assertCmsEditorial, loadTenantSite } from '~/server/utils/cms/context'
import { cmsNotFound } from '~/server/utils/cms/errors'
import { AUTHOR_COLUMNS, mapAuthor } from '~/server/utils/cms/mappers'
import { allocateCmsSlug, throwIfSlugConflict } from '~/server/utils/cms/slugs'

const LIST_LIMIT = 500

async function loadAuthor(ctx: CmsContext, authorId: string): Promise<CmsAuthorRow> {
  const { data, error } = await ctx.client
    .from(CMS_TABLES.authors)
    .select(AUTHOR_COLUMNS)
    .eq('id', authorId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  throwIfSlugConflict(error, 'Erro ao carregar o autor')
  if (!data)
    throw cmsNotFound('Autor não encontrado')
  return data as CmsAuthorRow
}

export async function listAuthors(ctx: CmsContext, siteId: string): Promise<CmsAuthor[]> {
  const site = await loadTenantSite(ctx, siteId)
  const { data, error } = await ctx.client
    .from(CMS_TABLES.authors)
    .select(AUTHOR_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', site.id)
    .order('name', { ascending: true })
    .limit(LIST_LIMIT)
  throwIfSlugConflict(error, 'Erro ao listar os autores')
  return ((data ?? []) as CmsAuthorRow[]).map(mapAuthor)
}

export async function getAuthor(ctx: CmsContext, authorId: string): Promise<CmsAuthor> {
  return mapAuthor(await loadAuthor(ctx, authorId))
}

export async function createAuthor(ctx: CmsContext, input: CmsCreateAuthorInput): Promise<CmsAuthor> {
  assertCmsEditorial(ctx)
  const site = await loadTenantSite(ctx, input.siteId)
  const slug = await allocateCmsSlug(ctx, {
    table: CMS_TABLES.authors,
    base: input.slug || input.name,
    explicit: input.slug,
    scope: [{ column: 'site_id', value: site.id }],
    fallback: 'autor',
  })

  const { data, error } = await ctx.client
    .from(CMS_TABLES.authors)
    .insert({
      tenant_id: ctx.tenantId,
      site_id: site.id,
      name: input.name,
      slug,
      bio: input.bio?.trim() || null,
      avatar_asset_id: null,
      user_id: null,
    })
    .select(AUTHOR_COLUMNS)
    .single()
  throwIfSlugConflict(error, 'Erro ao criar o autor')

  const row = data as CmsAuthorRow
  await recordCmsAudit(ctx, {
    action: 'author.create',
    siteId: site.id,
    metadata: { authorId: row.id, slug: row.slug },
  })
  return mapAuthor(row)
}

export async function updateAuthor(
  ctx: CmsContext,
  authorId: string,
  input: CmsUpdateAuthorInput,
): Promise<CmsAuthor> {
  assertCmsEditorial(ctx)
  const current = await loadAuthor(ctx, authorId)
  const patch: Partial<Pick<CmsAuthorRow, 'name' | 'slug' | 'bio'>> = {}

  if (input.name !== undefined)
    patch.name = input.name
  if (input.bio !== undefined)
    patch.bio = input.bio?.trim() || null
  if (input.slug !== undefined && input.slug !== current.slug) {
    patch.slug = await allocateCmsSlug(ctx, {
      table: CMS_TABLES.authors,
      base: input.slug,
      explicit: input.slug,
      scope: [{ column: 'site_id', value: current.site_id }],
      fallback: 'autor',
      exceptId: current.id,
    })
  }

  if (!Object.keys(patch).length)
    return mapAuthor(current)

  const { data, error } = await ctx.client
    .from(CMS_TABLES.authors)
    .update(patch)
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .select(AUTHOR_COLUMNS)
    .single()
  throwIfSlugConflict(error, 'Erro ao salvar o autor')

  const row = data as CmsAuthorRow
  await recordCmsAudit(ctx, {
    action: 'author.update',
    siteId: row.site_id,
    metadata: { authorId: row.id, fields: Object.keys(patch) },
  })
  return mapAuthor(row)
}

export async function deleteAuthor(ctx: CmsContext, authorId: string): Promise<{ id: string }> {
  assertCmsEditorial(ctx)
  const current = await loadAuthor(ctx, authorId)
  const { data, error } = await ctx.client
    .from(CMS_TABLES.authors)
    .delete()
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .select('id')
  throwIfSlugConflict(error, 'Erro ao excluir o autor')

  const removed = ((data ?? []) as Array<{ id: string }>)[0]
  if (!removed)
    throw cmsNotFound('Autor não encontrado')

  await recordCmsAudit(ctx, {
    action: 'author.delete',
    siteId: current.site_id,
    metadata: { authorId: current.id },
  })
  return { id: removed.id }
}
