import type { ArticleRecord } from '~/types/articles'

import { defineEventHandler } from 'h3'

import { requireArticleContext } from '~/server/utils/articles/context'
import { findTenantRow, readRowId } from '~/server/utils/articles/repository'
import { ARTICLE_TABLES } from '~/server/utils/articles/schemas'

export default defineEventHandler(async (event) => {
  const { client, tenantId } = await requireArticleContext(event, 'read')
  const id = readRowId(event, ARTICLE_TABLES.articles)
  const data = await findTenantRow<ArticleRecord>(client, ARTICLE_TABLES.articles, tenantId, id)
  return { data }
})
