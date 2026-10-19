import type { ArticleTagRelationRecord } from '~/types/articles'

import { defineEventHandler } from 'h3'

import { requireArticleContext } from '~/server/utils/articles/context'
import { assertTagsInTenant, databaseError, findTenantRow } from '~/server/utils/articles/repository'
import {
  ARTICLE_TABLES,
  articleTagRelationsInputSchema,
  readArticleBody,
} from '~/server/utils/articles/schemas'

export default defineEventHandler(async (event) => {
  const { client, tenantId } = await requireArticleContext(event, 'update')
  const input = await readArticleBody(event, articleTagRelationsInputSchema)

  await findTenantRow(client, ARTICLE_TABLES.articles, tenantId, input.article_id, 'id, tenant_id')
  const tagIds = [...new Set(input.tag_ids)]
  await assertTagsInTenant(client, tenantId, tagIds)

  const { error: deleteError } = await client
    .from(ARTICLE_TABLES.tagRelations)
    .delete()
    .eq('article_id', input.article_id)
    .eq('tenant_id', tenantId)
  if (deleteError)
    throw databaseError(deleteError, 'Erro ao atualizar tags do artigo')

  if (!tagIds.length)
    return { data: [] as ArticleTagRelationRecord[] }

  const { data, error } = await client
    .from(ARTICLE_TABLES.tagRelations)
    .insert(tagIds.map(tagId => ({ article_id: input.article_id, tag_id: tagId, tenant_id: tenantId })))
    .select()

  if (error)
    throw databaseError(error, 'Erro ao atualizar tags do artigo')

  return { data: (data || []) as ArticleTagRelationRecord[] }
})
