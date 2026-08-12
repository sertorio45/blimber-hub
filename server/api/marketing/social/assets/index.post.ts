import { readBody } from 'h3'
import { z } from 'zod'

import { extractStorageSignedUrl } from '~/server/utils/media-asset-preview'
import { recordSocialAudit } from '~/server/utils/social-audit'
import { requireSocialContext } from '~/server/utils/social-context'

const LIBRARY_CATEGORIES = [
  'logo',
  'brand_manual',
  'photo',
  'video',
  'product',
  'document',
  'reference',
] as const

const schema = z.object({
  tenant_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(255),
  objectPath: z.string().min(1).max(1024),
  mimeType: z.string().min(1).max(150),
  sizeBytes: z.number().int().nonnegative().max(104857600),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
  checksum: z.string().max(128).nullable().optional(),
  purpose: z.enum(['reference', 'publication']).default('reference'),
  category: z.enum(LIBRARY_CATEGORIES).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
})

export default defineEventHandler(async (event) => {
  const input = schema.parse(await readBody(event))
  const requestedTenantId = typeof input.tenant_id === 'string' ? input.tenant_id : null
  const { client, tenantId, user } = await requireSocialContext(
    event,
    'marketing.social.create',
    requestedTenantId,
  )

  if (input.purpose === 'publication' && !/^(?:image|video)\//.test(input.mimeType))
    throw createError({ statusCode: 400, statusMessage: 'Peças finais devem ser imagens ou vídeos' })

  if (!input.objectPath.startsWith(`${tenantId}/`))
    throw createError({ statusCode: 400, statusMessage: 'Caminho do arquivo inválido' })

  const { data: objects } = await client.storage
    .from('marketing-assets')
    .list(input.objectPath.slice(0, input.objectPath.lastIndexOf('/')), {
      search: input.objectPath.slice(input.objectPath.lastIndexOf('/') + 1),
      limit: 1,
    })

  if (!objects?.length)
    throw createError({ statusCode: 400, statusMessage: 'Arquivo não encontrado no Storage' })

  const { data, error } = await client
    .from('media_assets')
    .insert({
      tenant_id: tenantId,
      name: input.name,
      object_path: input.objectPath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      width: input.width || null,
      height: input.height || null,
      duration_seconds: input.durationSeconds || null,
      checksum: input.checksum || null,
      purpose: input.purpose,
      category: input.category ?? null,
      metadata: input.metadata,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  await recordSocialAudit(event, client, {
    tenantId,
    actorId: user.id,
    action: 'media_asset.created',
    entityType: 'media_asset',
    entityId: data.id,
    after: data,
  })

  const { data: signed, error: signError } = await client.storage
    .from('marketing-assets')
    .createSignedUrl(data.object_path, 60 * 60 * 4)

  if (signError)
    console.warn('[media_assets] insert signed URL generation failed:', signError.message)

  const preview = extractStorageSignedUrl(signed)

  return {
    data: {
      ...data,
      preview_url: preview,
      previewUrl: preview,
    },
  }
})
