import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam, setResponseHeaders } from 'h3'

import { defineCmsPublicHandler } from '~/server/utils/cms/http'
import { downloadPublicMedia } from '~/server/utils/cms/public'

/**
 * Public media delivery: the Hub streams the bytes on its own domain, so the
 * storage URL never reaches the visitor. Use it directly as `<img src>` —
 * the asset must belong to the site's tenant.
 */
export default defineCmsPublicHandler(async (event) => {
  const client = await serverSupabaseServiceRole(event)
  const { body, mimeType } = await downloadPublicMedia(
    client,
    getRouterParam(event, 'siteKey'),
    getRouterParam(event, 'assetId'),
  )
  setResponseHeaders(event, {
    'Content-Type': mimeType,
    'Content-Length': String(body.byteLength),
    'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
  })
  return body
}, { robots: 'noindex' })
