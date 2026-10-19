import type { CmsItem, CmsPublicCollectionFeed } from '~/lib/cms/contracts'

import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam } from 'h3'

import { defineCmsPublicHandler, readCmsQuery } from '~/server/utils/cms/http'
import { cmsPublicCollectionQuerySchema, listPublicCollectionEntries } from '~/server/utils/cms/public'

/** Unauthenticated feed of one collection: only entries saved as published. */
export default defineCmsPublicHandler(async (event): Promise<CmsItem<CmsPublicCollectionFeed>> => {
  const query = readCmsQuery(event, cmsPublicCollectionQuerySchema)
  const client = await serverSupabaseServiceRole(event)
  return {
    data: await listPublicCollectionEntries(
      client,
      getRouterParam(event, 'siteKey'),
      getRouterParam(event, 'collectionKey'),
      query,
    ),
  }
})
