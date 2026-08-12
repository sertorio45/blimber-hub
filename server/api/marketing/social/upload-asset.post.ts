import { randomUUID } from 'node:crypto'

import { getQuery, readMultipartFormData } from 'h3'

import { extractStorageSignedUrl } from '~/server/utils/media-asset-preview'
import {
  compressImageForUpload,
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

  const originalBuffer = filePart.data
  const originalSize = originalBuffer.length

  let processed: Awaited<ReturnType<typeof compressImageForUpload>>
  try {
    processed = await compressImageForUpload(originalBuffer, {
      inputMime,
      formatHint,
    })
  }
  catch (error: any) {
    throw createError({
      statusCode: 400,
      statusMessage: error?.message || 'Formato de imagem não suportado',
    })
  }

  const ext = processed.format === 'jpeg'
    ? 'jpg'
    : processed.format === 'png'
      ? 'png'
      : (filePart.filename?.includes('.') ? filePart.filename.split('.').pop() : 'jpg') || 'jpg'

  const objectPath = `${tenantId}/${randomUUID()}/${processed.compressed ? 'optimized' : 'original'}.${ext}`
  const compressedSize = processed.data.length

  const { error: uploadError } = await client.storage
    .from('marketing-assets')
    .upload(objectPath, processed.data, {
      cacheControl: '3600',
      contentType: processed.mimeType,
      upsert: false,
    })

  if (uploadError)
    throw createError({ statusCode: 500, statusMessage: uploadError.message })

  const { data: asset, error: insertError } = await client
    .from('media_assets')
    .insert({
      tenant_id: tenantId,
      name: filePart.filename || 'upload.jpg',
      object_path: objectPath,
      mime_type: processed.mimeType,
      size_bytes: compressedSize,
      width: processed.width,
      height: processed.height,
      purpose,
      category,
      metadata: {
        originalSize,
        originalMime: inputMime,
        compressionRatio: processed.compressed
          ? Math.round((1 - compressedSize / originalSize) * 100)
          : 0,
        compressed: processed.compressed,
      },
      created_by: user.id,
    })
    .select('*')
    .single()

  if (insertError) {
    await client.storage.from('marketing-assets').remove([objectPath])
    throw createError({ statusCode: 400, statusMessage: insertError.message })
  }

  await recordSocialAudit(event, client, {
    tenantId,
    actorId: user.id,
    action: 'media_asset.created',
    entityType: 'media_asset',
    entityId: asset.id,
    after: asset,
  })

  const { data: signed, error: signError } = await client.storage
    .from('marketing-assets')
    .createSignedUrl(objectPath, 60 * 60 * 4)

  if (signError) {
    console.warn('[media_assets] upload signed URL generation failed:', signError.message)
  }

  const preview = extractStorageSignedUrl(signed)

  return {
    data: {
      ...asset,
      preview_url: preview,
      previewUrl: preview,
    },
    meta: {
      originalSize,
      compressedSize,
      width: processed.width,
      height: processed.height,
      format: processed.format,
      compressed: processed.compressed,
      reductionPercent: processed.compressed
        ? Math.round((1 - compressedSize / originalSize) * 100)
        : 0,
    },
  }
})
