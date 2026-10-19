import type { ArticleRecord } from '~/types/articles'

import { defineEventHandler } from 'h3'

import { requireArticleContext } from '~/server/utils/articles/context'
import {
  assertCategoryInTenant,
  assertSlugAvailable,
  databaseError,
  findTenantRow,
  readRowId,
} from '~/server/utils/articles/repository'
import { ARTICLE_TABLES, articleInputSchema, readArticleBody } from '~/server/utils/articles/schemas'

export default defineEventHandler(async (event) => {
  const { client, tenantId } = await requireArticleContext(event, 'update')
  const id = readRowId(event, ARTICLE_TABLES.articles)
  await findTenantRow(client, ARTICLE_TABLES.articles, tenantId, id, 'id, tenant_id')

  const input = await readArticleBody(event, articleInputSchema)
  await assertCategoryInTenant(client, tenantId, input.category_id)
  await assertSlugAvailable(client, ARTICLE_TABLES.articles, tenantId, input.slug, id)

  const { data, error } = await client
    .from(ARTICLE_TABLES.articles)
    .update({
      title: input.title,
      slug: input.slug,
      content: input.content,
      meta_description: input.meta_description ?? null,
      publish_status: input.publish_status,
      category_id: input.category_id,
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .maybeSingle()

  if (error)
    throw databaseError(error, 'Erro ao atualizar artigo')
  if (!data)
    throw databaseError(null, 'Erro ao atualizar artigo')

  return { data: data as ArticleRecord }
})
