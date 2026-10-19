import type { CmsItem } from '~/lib/cms/contracts'
import type { CmsPublicResolveResult } from '~/server/utils/cms/public'

import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam } from 'h3'

import { defineCmsPublicHandler, readCmsQuery } from '~/server/utils/cms/http'
import { cmsPublicResolveQuerySchema, resolvePublicPath } from '~/server/utils/cms/public'

/** Unauthenticated: only published revisions of an active site are ever returned. */
export default defineCmsPublicHandler(async (event): Promise<CmsItem<CmsPublicResolveResult>> => {
  const query = readCmsQuery(event, cmsPublicResolveQuerySchema)
  const client = await serverSupabaseServiceRole(event)
  return { data: await resolvePublicPath(client, getRouterParam(event, 'siteKey'), query) }
})
