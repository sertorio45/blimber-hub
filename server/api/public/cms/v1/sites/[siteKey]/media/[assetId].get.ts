import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam, sendRedirect, setResponseHeaders } from 'h3'

import { defineCmsPublicHandler } from '~/server/utils/cms/http'
import { resolvePublicMediaSignedUrl } from '~/server/utils/cms/public'

/**
 * Public media delivery: 302 to a short-lived signed storage URL.
 * Avoids proxying image/video bytes through the Hub serverless function.
 */
export default defineCmsPublicHandler(async (event) => {
  const client = await serverSupabaseServiceRole(event)
  const { url, mimeType } = await resolvePublicMediaSignedUrl(
    client,
    getRouterParam(event, 'siteKey'),
    getRouterParam(event, 'assetId'),
  )
  setResponseHeaders(event, {
    'Content-Type': mimeType,
    'Cache-Control': 'public, max-age=300, s-maxage=300',
  })
  return sendRedirect(event, url, 302)
}, { robots: 'noindex' })
