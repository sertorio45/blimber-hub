import { getQuery, getRouterParam, setHeader } from 'h3'

import { requireMarketingMediaContext } from '~/server/utils/media/marketing-adapter'
import { getAssetFile } from '~/server/utils/media/service'

function inlineFilename(name: string): string {
  return name.replace(/[\r\n"]/g, '_').slice(0, 180) || 'asset'
}

export default defineEventHandler(async (event) => {
  const assetId = String(getRouterParam(event, 'id') || '')
  if (!assetId)
    throw createError({ statusCode: 400, statusMessage: 'Arquivo inválido' })

  const query = getQuery(event)
  const requestedTenantId = typeof query.tenant_id === 'string' ? query.tenant_id : null
  const ctx = await requireMarketingMediaContext(event, 'read', requestedTenantId)

  const { asset, buffer } = await getAssetFile(ctx, assetId)

  setHeader(event, 'Content-Type', asset.mime_type || 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `inline; filename="${inlineFilename(asset.name)}"`)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  setHeader(event, 'Content-Length', String(buffer.length))
  // Uint8Array so Nitro sends raw bytes instead of JSON-encoding a Buffer.
  return new Uint8Array(buffer)
})
