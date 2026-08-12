import { readBody } from 'h3'
import { z } from 'zod'

import { previewMediaAssetDeletion } from '~/server/utils/media-asset-deletion'
import { requireSocialContext } from '~/server/utils/social-context'

const schema = z.object({
  tenant_id: z.string().uuid().optional(),
  assetIds: z.array(z.string().uuid()).min(1).max(50),
})

export default defineEventHandler(async (event) => {
  const input = schema.parse(await readBody(event))
  const { client, tenantId } = await requireSocialContext(
    event,
    'marketing.social.read',
    input.tenant_id,
  )

  const { data: assets } = await client
    .from('media_assets')
    .select('object_path')
    .eq('tenant_id', tenantId)
    .in('id', input.assetIds)

  const paths = (assets || []).map(row => row.object_path).filter(Boolean)
  const { data: signedRows } = paths.length
    ? await client.storage.from('marketing-assets').createSignedUrls(paths, 60 * 10)
    : { data: [] }

  const previewUrls = new Map<string, string | null>()
  for (const row of assets || []) {
    const signed = (signedRows || []).find(item => item.path === row.object_path)
    previewUrls.set(row.object_path, signed?.signedUrl || null)
  }

  const preview = await previewMediaAssetDeletion(
    client,
    tenantId,
    input.assetIds,
    previewUrls,
  )

  return { data: preview }
})
