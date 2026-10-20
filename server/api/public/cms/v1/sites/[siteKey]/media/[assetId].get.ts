import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam, sendRedirect } from 'h3'

import { defineCmsPublicHandler } from '~/server/utils/cms/http'
import { resolvePublicMediaUrl } from '~/server/utils/cms/public'

/**
 * Public media delivery: 302 to a fresh signed URL for the asset. Use it
 * directly as `<img src>` — the asset must belong to the site's tenant.
 */
export default defineCmsPublicHandler(async (event) => {
  const client = await serverSupabaseServiceRole(event)
  const url = await resolvePublicMediaUrl(
    client,
    getRouterParam(event, 'siteKey'),
    getRouterParam(event, 'assetId'),
  )
  return sendRedirect(event, url, 302)
}, { robots: 'noindex' })
