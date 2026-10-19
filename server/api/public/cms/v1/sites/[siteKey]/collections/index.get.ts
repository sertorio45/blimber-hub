import type { CmsItem, CmsPublicCollection } from '~/lib/cms/contracts'

import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam } from 'h3'

import { defineCmsPublicHandler } from '~/server/utils/cms/http'
import { listPublicCollections } from '~/server/utils/cms/public'

/** Unauthenticated list of the site's collection definitions (key, name, schema). */
export default defineCmsPublicHandler(async (event): Promise<CmsItem<CmsPublicCollection[]>> => {
  const client = await serverSupabaseServiceRole(event)
  return { data: await listPublicCollections(client, getRouterParam(event, 'siteKey')) }
})
