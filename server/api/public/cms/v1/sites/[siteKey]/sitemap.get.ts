import type { CmsSitemapEntry } from '~/lib/cms/contracts'

import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam } from 'h3'
import { z } from 'zod'

import { defineCmsPublicHandler, readCmsQuery } from '~/server/utils/cms/http'
import { listPublicSitemap } from '~/server/utils/cms/public'

const sitemapQuerySchema = z.object({
  locale: z.string().max(16).optional(),
})

/** JSON sitemap for the site renderer. Paths are canonical published routes only. */
export default defineCmsPublicHandler(async (event): Promise<{ data: CmsSitemapEntry[] }> => {
  const query = readCmsQuery(event, sitemapQuerySchema)
  const client = await serverSupabaseServiceRole(event)
  return { data: await listPublicSitemap(client, getRouterParam(event, 'siteKey'), query.locale) }
}, { robots: 'noindex' })
