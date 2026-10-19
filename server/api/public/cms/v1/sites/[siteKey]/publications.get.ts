import type { CmsPage } from '~/lib/cms/contracts'
import type { CmsPublicDocumentSummary } from '~/server/utils/cms/public'

import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam } from 'h3'

import { defineCmsPublicHandler, readCmsQuery } from '~/server/utils/cms/http'
import { cmsPublicListQuerySchema, listPublicPublications } from '~/server/utils/cms/public'

/** Unauthenticated feed of published articles/news, newest first, without body or blocks. */
export default defineCmsPublicHandler(async (event): Promise<CmsPage<CmsPublicDocumentSummary>> => {
  const query = readCmsQuery(event, cmsPublicListQuerySchema)
  const client = await serverSupabaseServiceRole(event)
  return listPublicPublications(client, getRouterParam(event, 'siteKey'), query)
})
