import { getQuery, readMultipartFormData } from 'h3'

import { BlimberMcpError } from '~/lib/blimber-mcp/errors'
import { persistLibraryAsset } from '~/server/utils/media-library-upload'
import {
  inferImageMimeType,
  isLikelyImageFile,
  type ImageUploadFormatHint,
} from '~/server/utils/media-upload-image'
import { recordSocialAudit } from '~/server/utils/social-audit'
import { requireSocialContext } from '~/server/utils/social-context'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedTenantId = typeof query.tenant_id === 'string' ? query.tenant_id : null

  const { client, tenantId, user } = await requireSocialContext(
    event,
    'marketing.social.create',
    requestedTenantId,
  )

  const parts = await readMultipartFormData(event)
  if (!parts?.length)
    throw createError({ statusCode: 400, statusMessage: 'Nenhum arquivo enviado' })

  const filePart = parts.find(part => part.name === 'file')
  if (!filePart?.data?.length)
    throw createError({ statusCode: 400, statusMessage: 'Campo "file" obrigatório' })

  const inputMime = inferImageMimeType(filePart.type, filePart.filename)
  if (!isLikelyImageFile(filePart.type, filePart.filename)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Apenas imagens são aceitas para compressão',
    })
  }

  const formatHint = (parts.find(part => part.name === 'format')?.data?.toString() || 'auto') as ImageUploadFormatHint
  const purpose = (parts.find(part => part.name === 'purpose')?.data?.toString() || 'reference') as 'reference' | 'publication'
  const category = parts.find(part => part.name === 'category')?.data?.toString() || null

  let persisted
  try {
    persisted = await persistLibraryAsset({
      client,
      tenantId,
      createdBy: user.id,
      filename: filePart.filename || 'upload.jpg',
      buffer: filePart.data,
      inputMime,
      purpose,
      category,
      formatHint,
      signedUrlSeconds: 60 * 60 * 4,
    })
  }
  catch (error: any) {
    if (error instanceof BlimberMcpError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message,
      })
    }
    throw createError({
      statusCode: 400,
      statusMessage: error?.message || 'Falha no upload',
    })
  }

  await recordSocialAudit(event, client, {
    tenantId,
    actorId: user.id,
    action: 'media_asset.created',
    entityType: 'media_asset',
    entityId: String(persisted.asset.id),
    after: persisted.asset,
  })

  return {
    data: {
      ...persisted.asset,
      preview_url: persisted.previewUrl,
      previewUrl: persisted.previewUrl,
    },
    meta: {
      originalSize: persisted.meta.originalSize,
      compressedSize: persisted.meta.compressedSize,
      width: persisted.meta.width,
      height: persisted.meta.height,
      format: persisted.meta.format,
      compressed: persisted.meta.compressed,
      reductionPercent: persisted.meta.reductionPercent,
    },
  }
})
