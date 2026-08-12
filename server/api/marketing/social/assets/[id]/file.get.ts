import { getQuery, getRouterParam, setHeader } from 'h3'

import { requireSocialContext } from '~/server/utils/social-context'

function inlineFilename(name: string): string {
  return name.replace(/[\r\n"]/g, '_').slice(0, 180) || 'asset'
}

export default defineEventHandler(async (event) => {
  const assetId = String(getRouterParam(event, 'id') || '')
  if (!assetId)
    throw createError({ statusCode: 400, statusMessage: 'Arquivo inválido' })

  const query = getQuery(event)
  const requestedTenantId = typeof query.tenant_id === 'string' ? query.tenant_id : null
  const { client, tenantId } = await requireSocialContext(
    event,
    'marketing.social.read',
    requestedTenantId,
  )

  const { data: asset, error } = await client
    .from('media_assets')
    .select('id, name, mime_type, object_path, tenant_id')
    .eq('id', assetId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })
  if (!asset?.object_path)
    throw createError({ statusCode: 404, statusMessage: 'Arquivo não encontrado' })

  const { data: file, error: downloadError } = await client.storage
    .from('marketing-assets')
    .download(asset.object_path)

  if (downloadError || !file) {
    throw createError({
      statusCode: 404,
      statusMessage: downloadError?.message || 'Arquivo não encontrado no Storage',
    })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  setHeader(event, 'Content-Type', asset.mime_type || 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `inline; filename="${inlineFilename(asset.name)}"`)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  setHeader(event, 'Content-Length', String(buffer.length))
  // Uint8Array so Nitro sends raw bytes instead of JSON-encoding a Buffer.
  return new Uint8Array(buffer)
})
