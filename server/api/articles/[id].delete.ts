import { defineEventHandler } from 'h3'

import { requireArticleContext } from '~/server/utils/articles/context'
import { databaseError, findTenantRow, readRowId } from '~/server/utils/articles/repository'
import { ARTICLE_TABLES } from '~/server/utils/articles/schemas'

export default defineEventHandler(async (event) => {
  const { client, tenantId } = await requireArticleContext(event, 'delete')
  const id = readRowId(event, ARTICLE_TABLES.articles)
  await findTenantRow(client, ARTICLE_TABLES.articles, tenantId, id, 'id, tenant_id')

  const { error } = await client
    .from(ARTICLE_TABLES.articles)
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error)
    throw databaseError(error, 'Erro ao excluir artigo')

  return { data: { id } }
})
