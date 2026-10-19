import type {
  CmsCreateTaxonomyInput,
  CmsCreateTermInput,
  CmsTaxonomy,
  CmsTaxonomyKind,
  CmsTerm,
  CmsTermListQuery,
  CmsUpdateTaxonomyInput,
  CmsUpdateTermInput,
} from '~/lib/cms/contracts'
import type { CmsContext } from '~/server/utils/cms/context'
import type { CmsTaxonomyRow, CmsTermRow } from '~/server/utils/cms/mappers'

import { CMS_TABLES } from '~/lib/cms/contracts'
import { recordCmsAudit } from '~/server/utils/cms/audit'
import { assertCmsEditorial, loadTenantSite } from '~/server/utils/cms/context'
import { cmsError, cmsNotFound } from '~/server/utils/cms/errors'
import { mapTaxonomy, mapTerm, TAXONOMY_COLUMNS, TERM_COLUMNS } from '~/server/utils/cms/mappers'
import { allocateCmsSlug, throwIfSlugConflict } from '~/server/utils/cms/slugs'

const LIST_LIMIT = 500

const DEFAULT_TAXONOMY: Record<CmsTaxonomyKind, { name: string, slug: string }> = {
  category: { name: 'Categorias', slug: 'categorias' },
  tag: { name: 'Tags', slug: 'tags' },
}

async function loadTaxonomy(ctx: CmsContext, taxonomyId: string): Promise<CmsTaxonomyRow> {
  const { data, error } = await ctx.client
    .from(CMS_TABLES.taxonomies)
    .select(TAXONOMY_COLUMNS)
    .eq('id', taxonomyId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  throwIfSlugConflict(error, 'Erro ao carregar a taxonomia')
  if (!data)
    throw cmsNotFound('Taxonomia não encontrada')
  return data as CmsTaxonomyRow
}

async function loadTerm(ctx: CmsContext, termId: string): Promise<CmsTermRow> {
  const { data, error } = await ctx.client
    .from(CMS_TABLES.terms)
    .select(TERM_COLUMNS)
    .eq('id', termId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  throwIfSlugConflict(error, 'Erro ao carregar o termo')
  if (!data)
    throw cmsNotFound('Termo não encontrado')
  return data as CmsTermRow
}

async function kindForTaxonomy(ctx: CmsContext, taxonomyId: string, siteId: string): Promise<CmsTaxonomyKind> {
  const taxonomy = await loadTaxonomy(ctx, taxonomyId)
  if (taxonomy.site_id !== siteId)
    throw cmsNotFound('Taxonomia não encontrada')
  return taxonomy.kind
}

export async function listTaxonomies(
  ctx: CmsContext,
  siteId: string,
  kind?: CmsTaxonomyKind,
): Promise<CmsTaxonomy[]> {
  const site = await loadTenantSite(ctx, siteId)
  let query = ctx.client
    .from(CMS_TABLES.taxonomies)
    .select(TAXONOMY_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', site.id)
    .order('name', { ascending: true })
    .limit(LIST_LIMIT)
  if (kind)
    query = query.eq('kind', kind)

  const { data, error } = await query
  throwIfSlugConflict(error, 'Erro ao listar as taxonomias')
  return ((data ?? []) as CmsTaxonomyRow[]).map(mapTaxonomy)
}

export async function getTaxonomy(ctx: CmsContext, taxonomyId: string): Promise<CmsTaxonomy> {
  return mapTaxonomy(await loadTaxonomy(ctx, taxonomyId))
}

export async function createTaxonomy(ctx: CmsContext, input: CmsCreateTaxonomyInput): Promise<CmsTaxonomy> {
  assertCmsEditorial(ctx)
  const site = await loadTenantSite(ctx, input.siteId)
  const slug = await allocateCmsSlug(ctx, {
    table: CMS_TABLES.taxonomies,
    base: input.slug || input.name,
    explicit: input.slug,
    scope: [
      { column: 'site_id', value: site.id },
      { column: 'kind', value: input.kind },
    ],
    fallback: input.kind === 'tag' ? 'tag' : 'categoria',
  })

  const { data, error } = await ctx.client
    .from(CMS_TABLES.taxonomies)
    .insert({
      tenant_id: ctx.tenantId,
      site_id: site.id,
      kind: input.kind,
      name: input.name,
      slug,
    })
    .select(TAXONOMY_COLUMNS)
    .single()
  throwIfSlugConflict(error, 'Erro ao criar a taxonomia')

  const row = data as CmsTaxonomyRow
  await recordCmsAudit(ctx, {
    action: 'taxonomy.create',
    siteId: site.id,
    metadata: { taxonomyId: row.id, kind: row.kind, slug: row.slug },
  })
  return mapTaxonomy(row)
}

export async function updateTaxonomy(
  ctx: CmsContext,
  taxonomyId: string,
  input: CmsUpdateTaxonomyInput,
): Promise<CmsTaxonomy> {
  assertCmsEditorial(ctx)
  const current = await loadTaxonomy(ctx, taxonomyId)
  const patch: Partial<Pick<CmsTaxonomyRow, 'name' | 'slug'>> = {}

  if (input.name !== undefined)
    patch.name = input.name
  if (input.slug !== undefined && input.slug !== current.slug) {
    patch.slug = await allocateCmsSlug(ctx, {
      table: CMS_TABLES.taxonomies,
      base: input.slug,
      explicit: input.slug,
      scope: [
        { column: 'site_id', value: current.site_id },
        { column: 'kind', value: current.kind },
      ],
      fallback: 'categoria',
      exceptId: current.id,
    })
  }

  if (!Object.keys(patch).length)
    return mapTaxonomy(current)

  const { data, error } = await ctx.client
    .from(CMS_TABLES.taxonomies)
    .update(patch)
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .select(TAXONOMY_COLUMNS)
    .single()
  throwIfSlugConflict(error, 'Erro ao salvar a taxonomia')

  const row = data as CmsTaxonomyRow
  await recordCmsAudit(ctx, {
    action: 'taxonomy.update',
    siteId: row.site_id,
    metadata: { taxonomyId: row.id, fields: Object.keys(patch) },
  })
  return mapTaxonomy(row)
}

export async function deleteTaxonomy(ctx: CmsContext, taxonomyId: string): Promise<{ id: string }> {
  assertCmsEditorial(ctx)
  const current = await loadTaxonomy(ctx, taxonomyId)
  const { data, error } = await ctx.client
    .from(CMS_TABLES.taxonomies)
    .delete()
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .select('id')
  throwIfSlugConflict(error, 'Erro ao excluir a taxonomia')

  const removed = ((data ?? []) as Array<{ id: string }>)[0]
  if (!removed)
    throw cmsNotFound('Taxonomia não encontrada')

  await recordCmsAudit(ctx, {
    action: 'taxonomy.delete',
    siteId: current.site_id,
    metadata: { taxonomyId: current.id, kind: current.kind },
  })
  return { id: removed.id }
}

async function taxonomyKindMap(ctx: CmsContext, siteId: string): Promise<Map<string, CmsTaxonomyKind>> {
  const { data, error } = await ctx.client
    .from(CMS_TABLES.taxonomies)
    .select('id, kind')
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', siteId)
    .limit(LIST_LIMIT)
  throwIfSlugConflict(error, 'Erro ao listar as taxonomias')
  return new Map(((data ?? []) as Array<{ id: string, kind: CmsTaxonomyKind }>).map(row => [row.id, row.kind]))
}

export async function listTerms(ctx: CmsContext, query: CmsTermListQuery): Promise<CmsTerm[]> {
  const site = await loadTenantSite(ctx, query.siteId)
  const kinds = await taxonomyKindMap(ctx, site.id)

  let request = ctx.client
    .from(CMS_TABLES.terms)
    .select(TERM_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', site.id)
    .order('name', { ascending: true })
    .limit(LIST_LIMIT)
  if (query.taxonomyId)
    request = request.eq('taxonomy_id', query.taxonomyId)

  const { data, error } = await request
  throwIfSlugConflict(error, 'Erro ao listar os termos')

  return ((data ?? []) as CmsTermRow[])
    .map((row) => {
      const kind = kinds.get(row.taxonomy_id)
      return kind ? mapTerm(row, kind) : null
    })
    .filter((term): term is CmsTerm => term !== null && (!query.kind || term.kind === query.kind))
}

export async function getTerm(ctx: CmsContext, termId: string): Promise<CmsTerm> {
  const row = await loadTerm(ctx, termId)
  const kind = await kindForTaxonomy(ctx, row.taxonomy_id, row.site_id)
  return mapTerm(row, kind)
}

/**
 * A term needs a taxonomy. When the editor only knows "category" or "tag",
 * reuse the site's taxonomy of that kind, creating the default one if needed.
 */
async function resolveTaxonomy(ctx: CmsContext, input: CmsCreateTermInput): Promise<CmsTaxonomyRow> {
  if (input.taxonomyId) {
    const taxonomy = await loadTaxonomy(ctx, input.taxonomyId)
    if (taxonomy.site_id !== input.siteId)
      throw cmsNotFound('Taxonomia não encontrada')
    if (input.kind && input.kind !== taxonomy.kind) {
      throw cmsError(422, 'validation_failed', 'O tipo não corresponde à taxonomia', {
        field: 'kind',
        reason: 'not_allowed',
      })
    }
    return taxonomy
  }

  if (!input.kind)
    throw cmsError(422, 'validation_failed', 'Informe a taxonomia ou o tipo', { field: 'kind', reason: 'not_allowed' })

  const kind = input.kind
  const { data, error } = await ctx.client
    .from(CMS_TABLES.taxonomies)
    .select(TAXONOMY_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', input.siteId)
    .eq('kind', kind)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  throwIfSlugConflict(error, 'Erro ao carregar a taxonomia')
  if (data)
    return data as CmsTaxonomyRow

  const defaults = DEFAULT_TAXONOMY[kind]
  const created = await createTaxonomy(ctx, {
    siteId: input.siteId,
    kind,
    name: defaults.name,
    slug: defaults.slug,
  })
  return loadTaxonomy(ctx, created.id)
}

async function assertParent(ctx: CmsContext, taxonomyId: string, parentId: string | null | undefined, termId?: string) {
  if (!parentId)
    return
  if (termId && parentId === termId)
    throw cmsError(422, 'validation_failed', 'Um termo não pode ser pai de si mesmo', { field: 'parentId', reason: 'not_allowed' })

  const { data, error } = await ctx.client
    .from(CMS_TABLES.terms)
    .select('id')
    .eq('id', parentId)
    .eq('tenant_id', ctx.tenantId)
    .eq('taxonomy_id', taxonomyId)
    .maybeSingle()
  throwIfSlugConflict(error, 'Erro ao validar o termo pai')
  if (!data)
    throw cmsError(422, 'validation_failed', 'Termo pai não encontrado', { field: 'parentId', reason: 'not_found' })
}

export async function createTerm(ctx: CmsContext, input: CmsCreateTermInput): Promise<CmsTerm> {
  assertCmsEditorial(ctx)
  const site = await loadTenantSite(ctx, input.siteId)
  const taxonomy = await resolveTaxonomy(ctx, { ...input, siteId: site.id })
  await assertParent(ctx, taxonomy.id, input.parentId)

  const slug = await allocateCmsSlug(ctx, {
    table: CMS_TABLES.terms,
    base: input.slug || input.name,
    explicit: input.slug,
    scope: [{ column: 'taxonomy_id', value: taxonomy.id }],
    fallback: 'termo',
  })

  const { data, error } = await ctx.client
    .from(CMS_TABLES.terms)
    .insert({
      tenant_id: ctx.tenantId,
      site_id: site.id,
      taxonomy_id: taxonomy.id,
      name: input.name,
      slug,
      parent_id: input.parentId ?? null,
    })
    .select(TERM_COLUMNS)
    .single()
  throwIfSlugConflict(error, 'Erro ao criar o termo')

  const row = data as CmsTermRow
  await recordCmsAudit(ctx, {
    action: 'term.create',
    siteId: site.id,
    metadata: { termId: row.id, taxonomyId: taxonomy.id, kind: taxonomy.kind },
  })
  return mapTerm(row, taxonomy.kind)
}

export async function updateTerm(ctx: CmsContext, termId: string, input: CmsUpdateTermInput): Promise<CmsTerm> {
  assertCmsEditorial(ctx)
  const current = await loadTerm(ctx, termId)
  const kind = await kindForTaxonomy(ctx, current.taxonomy_id, current.site_id)
  const patch: Partial<Pick<CmsTermRow, 'name' | 'slug' | 'parent_id'>> = {}

  if (input.name !== undefined)
    patch.name = input.name
  if (input.parentId !== undefined) {
    await assertParent(ctx, current.taxonomy_id, input.parentId, current.id)
    patch.parent_id = input.parentId
  }
  if (input.slug !== undefined && input.slug !== current.slug) {
    patch.slug = await allocateCmsSlug(ctx, {
      table: CMS_TABLES.terms,
      base: input.slug,
      explicit: input.slug,
      scope: [{ column: 'taxonomy_id', value: current.taxonomy_id }],
      fallback: 'termo',
      exceptId: current.id,
    })
  }

  if (!Object.keys(patch).length)
    return mapTerm(current, kind)

  const { data, error } = await ctx.client
    .from(CMS_TABLES.terms)
    .update(patch)
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .select(TERM_COLUMNS)
    .single()
  throwIfSlugConflict(error, 'Erro ao salvar o termo')

  const row = data as CmsTermRow
  await recordCmsAudit(ctx, {
    action: 'term.update',
    siteId: row.site_id,
    metadata: { termId: row.id, fields: Object.keys(patch) },
  })
  return mapTerm(row, kind)
}

export async function deleteTerm(ctx: CmsContext, termId: string): Promise<{ id: string }> {
  assertCmsEditorial(ctx)
  const current = await loadTerm(ctx, termId)
  const { data, error } = await ctx.client
    .from(CMS_TABLES.terms)
    .delete()
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .select('id')
  throwIfSlugConflict(error, 'Erro ao excluir o termo')

  const removed = ((data ?? []) as Array<{ id: string }>)[0]
  if (!removed)
    throw cmsNotFound('Termo não encontrado')

  await recordCmsAudit(ctx, {
    action: 'term.delete',
    siteId: current.site_id,
    metadata: { termId: current.id },
  })
  return { id: removed.id }
}
