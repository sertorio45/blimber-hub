import type { ArticleTagRelationRecord } from '~/types/articles'

import { defineEventHandler, getQuery } from 'h3'

import { requireArticleContext } from '~/server/utils/articles/context'
import { listTenantRows } from '~/server/utils/articles/repository'
import {
  ARTICLE_TABLES,
  articleTagRelationsQuerySchema,
  parseArticleInput,
} from '~/server/utils/articles/schemas'

export default defineEventHandler(async (event) => {
  const { client, tenantId } = await requireArticleContext(event, 'read')
  const query = parseArticleInput(articleTagRelationsQuerySchema, getQuery(event))

  const data = await listTenantRows<ArticleTagRelationRecord>(
    client,
    ARTICLE_TABLES.tagRelations,
    tenantId,
    query.article_id ? { article_id: query.article_id } : {},
  )
  return { data }
})
