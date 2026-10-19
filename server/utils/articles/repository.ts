import type { WorkspaceClient } from '~/server/utils/workspace-context'
import type { TenantScopedRecord } from '~/types/articles'

import { getRouterParam } from 'h3'

import { articleError } from '~/server/utils/articles/errors'
import { ARTICLE_TABLES, articleRowIdSchema } from '~/server/utils/articles/schemas'

export type ArticleTable = typeof ARTICLE_TABLES[keyof typeof ARTICLE_TABLES]

interface DatabaseError {
  code?: string
  message?: string
}

const NOT_FOUND_MESSAGE: Record<ArticleTable, string> = {
  articles: 'Artigo não encontrado',
  articles_category: 'Categoria não encontrada',
  articles_tag: 'Tag não encontrada',
  articles_tag_relations: 'Relação não encontrada',
}

/** Unknown or malformed ids are indistinguishable from rows of another tenant. */
export function readRowId(event: any, table: ArticleTable, param = 'id'): number {
  const parsed = articleRowIdSchema.safeParse(getRouterParam(event, param))
  if (!parsed.success)
    throw articleError(404, 'not_found', NOT_FOUND_MESSAGE[table])
  return parsed.data
}

export function databaseError(error: DatabaseError | null | undefined, fallback: string) {
  if (error?.code === '23505')
    return articleError(409, 'route_conflict', 'Já existe um registro com este slug')
  if (error?.code === '23503')
    return articleError(409, 'route_conflict', 'Registro em uso por outro item')
  return articleError(500, 'internal_error', fallback)
}

export async function findTenantRow<T extends TenantScopedRecord = TenantScopedRecord>(
  client: WorkspaceClient,
  table: ArticleTable,
  tenantId: string,
  id: number,
  columns = '*',
): Promise<T> {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error)
    throw databaseError(error, 'Erro ao carregar registro')
  if (!data)
    throw articleError(404, 'not_found', NOT_FOUND_MESSAGE[table])
  return data as T
}

export async function listTenantRows<T extends TenantScopedRecord = TenantScopedRecord>(
  client: WorkspaceClient,
  table: ArticleTable,
  tenantId: string,
  filters: Record<string, string | number> = {},
): Promise<T[]> {
  let query = client.from(table).select('*').eq('tenant_id', tenantId)
  for (const [column, value] of Object.entries(filters))
    query = query.eq(column, value)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error)
    throw databaseError(error, 'Erro ao listar registros')
  return (data || []) as T[]
}

export async function assertSlugAvailable(
  client: WorkspaceClient,
  table: ArticleTable,
  tenantId: string,
  slug: string,
  exceptId?: number,
) {
  let query = client.from(table).select('id').eq('tenant_id', tenantId).eq('slug', slug)
  if (exceptId !== undefined)
    query = query.neq('id', exceptId)

  const { data, error } = await query.limit(1)
  if (error)
    throw databaseError(error, 'Erro ao verificar slug')
  if ((data || []).length)
    throw articleError(409, 'route_conflict', 'Já existe um registro com este slug')
}

export async function assertCategoryInTenant(
  client: WorkspaceClient,
  tenantId: string,
  categoryId: number | null,
) {
  if (categoryId === null)
    return

  const { data, error } = await client
    .from(ARTICLE_TABLES.categories)
    .select('id')
    .eq('id', categoryId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error)
    throw databaseError(error, 'Erro ao validar categoria')
  if (!data)
    throw articleError(422, 'validation_failed', 'Categoria inválida para esta empresa', { field: 'category_id' })
}

export async function assertTagsInTenant(
  client: WorkspaceClient,
  tenantId: string,
  tagIds: number[],
) {
  const unique = [...new Set(tagIds)]
  if (!unique.length)
    return

  const { data, error } = await client
    .from(ARTICLE_TABLES.tags)
    .select('id')
    .eq('tenant_id', tenantId)
    .in('id', unique)

  if (error)
    throw databaseError(error, 'Erro ao validar tags')
  if ((data || []).length !== unique.length)
    throw articleError(422, 'validation_failed', 'Tag inválida para esta empresa', { field: 'tag_ids' })
}
