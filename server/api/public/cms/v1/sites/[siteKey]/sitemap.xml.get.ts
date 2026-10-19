import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam, setResponseHeader } from 'h3'
import { z } from 'zod'

import { defineCmsPublicHandler, readCmsQuery } from '~/server/utils/cms/http'
import { listPublicSitemap, renderSitemapXml } from '~/server/utils/cms/public'

const sitemapQuerySchema = z.object({
  locale: z.string().max(16).optional(),
})

/** XML sitemap. The public site should proxy this URL or prefix `path` with its own origin. */
export default defineCmsPublicHandler(async (event): Promise<string> => {
  const query = readCmsQuery(event, sitemapQuerySchema)
  const client = await serverSupabaseServiceRole(event)
  const entries = await listPublicSitemap(client, getRouterParam(event, 'siteKey'), query.locale)
  setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  return renderSitemapXml(entries)
}, { robots: 'noindex' })
