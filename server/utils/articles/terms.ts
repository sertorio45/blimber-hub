import type { ArticleTermRecord } from '~/types/articles'

import { setResponseStatus } from 'h3'

import { requireArticleContext } from '~/server/utils/articles/context'
import {
  assertSlugAvailable,
  databaseError,
  findTenantRow,
  listTenantRows,
  readRowId,
} from '~/server/utils/articles/repository'
import { ARTICLE_TABLES, articleTermInputSchema, readArticleBody } from '~/server/utils/articles/schemas'

export type ArticleTermTable = typeof ARTICLE_TABLES.categories | typeof ARTICLE_TABLES.tags

/** Categories and tags share the same columns and tenant rules. */
export function createArticleTermHandlers(table: ArticleTermTable) {
  return {
    async list(event: any) {
      const { client, tenantId } = await requireArticleContext(event, 'read')
      return { data: await listTenantRows<ArticleTermRecord>(client, table, tenantId) }
    },

    async get(event: any) {
      const { client, tenantId } = await requireArticleContext(event, 'read')
      const id = readRowId(event, table)
      return { data: await findTenantRow<ArticleTermRecord>(client, table, tenantId, id) }
    },

    async create(event: any) {
      const { client, tenantId } = await requireArticleContext(event, 'create')
      const input = await readArticleBody(event, articleTermInputSchema)
      await assertSlugAvailable(client, table, tenantId, input.slug)

      const { data, error } = await client
        .from(table)
        .insert({
          title: input.title,
          slug: input.slug,
          description: input.description ?? null,
          publish_status: input.publish_status,
          tenant_id: tenantId,
        })
        .select()
        .single()

      if (error || !data)
        throw databaseError(error, 'Falha ao criar registro')

      setResponseStatus(event, 201)
      return { data: data as ArticleTermRecord }
    },

    async update(event: any) {
      const { client, tenantId } = await requireArticleContext(event, 'update')
      const id = readRowId(event, table)
      await findTenantRow(client, table, tenantId, id, 'id, tenant_id')

      const input = await readArticleBody(event, articleTermInputSchema)
      await assertSlugAvailable(client, table, tenantId, input.slug, id)

      const { data, error } = await client
        .from(table)
        .update({
          title: input.title,
          slug: input.slug,
          description: input.description ?? null,
          publish_status: input.publish_status,
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .maybeSingle()

      if (error || !data)
        throw databaseError(error, 'Erro ao atualizar registro')

      return { data: data as ArticleTermRecord }
    },

    async remove(event: any) {
      const { client, tenantId } = await requireArticleContext(event, 'delete')
      const id = readRowId(event, table)
      await findTenantRow(client, table, tenantId, id, 'id, tenant_id')

      if (table === ARTICLE_TABLES.tags) {
        const { error: relationError } = await client
          .from(ARTICLE_TABLES.tagRelations)
          .delete()
          .eq('tag_id', id)
          .eq('tenant_id', tenantId)
        if (relationError)
          throw databaseError(relationError, 'Erro ao remover relações da tag')
      }

      const { error } = await client
        .from(table)
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId)

      if (error)
        throw databaseError(error, 'Erro ao excluir registro')

      return { data: { id } }
    },
  }
}

export const articleCategoryHandlers = createArticleTermHandlers(ARTICLE_TABLES.categories)
export const articleTagHandlers = createArticleTermHandlers(ARTICLE_TABLES.tags)
