import type { ArticleRecord } from '~/types/articles'

import { defineEventHandler, setResponseStatus } from 'h3'

import { requireArticleContext } from '~/server/utils/articles/context'
import {
  assertCategoryInTenant,
  assertSlugAvailable,
  databaseError,
} from '~/server/utils/articles/repository'
import { ARTICLE_TABLES, articleInputSchema, readArticleBody } from '~/server/utils/articles/schemas'

export default defineEventHandler(async (event) => {
  const { client, tenantId } = await requireArticleContext(event, 'create')
  const input = await readArticleBody(event, articleInputSchema)

  await assertCategoryInTenant(client, tenantId, input.category_id)
  await assertSlugAvailable(client, ARTICLE_TABLES.articles, tenantId, input.slug)

  const { data, error } = await client
    .from(ARTICLE_TABLES.articles)
    .insert({
      title: input.title,
      slug: input.slug,
      content: input.content,
      meta_description: input.meta_description ?? null,
      publish_status: input.publish_status,
      category_id: input.category_id,
      tenant_id: tenantId,
    })
    .select()
    .single()

  if (error || !data)
    throw databaseError(error, 'Falha ao criar artigo')

  setResponseStatus(event, 201)
  return { data: data as ArticleRecord }
})
