import { randomUUID } from 'node:crypto'

import { readMultipartFormData } from 'h3'
import sharp from 'sharp'

import { recordSocialAudit } from '~/server/utils/social-audit'
import { requireSocialContext } from '~/server/utils/social-context'

const DIMENSION_PRESETS = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
} as const

type FormatHint = keyof typeof DIMENSION_PRESETS | 'auto'

function detectBestPreset(width: number, height: number): keyof typeof DIMENSION_PRESETS {
  const ratio = width / height
  if (ratio >= 0.9 && ratio <= 1.1) return 'square'
  if (ratio >= 0.7 && ratio < 0.9) return 'portrait'
  if (ratio < 0.7) return 'story'
  return 'landscape'
}

export default defineEventHandler(async (event) => {
  const { client, tenantId, user } = await requireSocialContext(event, 'marketing.social.create')

  const parts = await readMultipartFormData(event)
  if (!parts?.length)
    throw createError({ statusCode: 400, statusMessage: 'Nenhum arquivo enviado' })

  const filePart = parts.find(p => p.name === 'file')
  if (!filePart?.data || !filePart.type)
    throw createError({ statusCode: 400, statusMessage: 'Campo "file" obrigatório' })

  if (!filePart.type.startsWith('image/'))
    throw createError({ statusCode: 400, statusMessage: 'Apenas imagens são aceitas para compressão' })

  const formatHint = (parts.find(p => p.name === 'format')?.data?.toString() || 'auto') as FormatHint
  const purpose = (parts.find(p => p.name === 'purpose')?.data?.toString() || 'reference') as 'reference' | 'publication'
  const category = parts.find(p => p.name === 'category')?.data?.toString() || null

  const originalBuffer = filePart.data
  const originalSize = originalBuffer.length

  const metadata = await sharp(originalBuffer).metadata()
  const inputWidth = metadata.width || 1080
  const inputHeight = metadata.height || 1080

  const preset = formatHint !== 'auto'
    ? DIMENSION_PRESETS[formatHint]
    : DIMENSION_PRESETS[detectBestPreset(inputWidth, inputHeight)]

  const keepPng = (filePart.type === 'image/png' || filePart.type === 'image/webp') && metadata.hasAlpha
  const outputFormat = keepPng ? 'png' as const : 'jpeg' as const

  let pipeline = sharp(originalBuffer)
    .rotate()
    .resize({
      width: preset.width,
      height: preset.height,
      fit: 'inside',
      withoutEnlargement: true,
    })

  if (outputFormat === 'jpeg')
    pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true })
  else
    pipeline = pipeline.png({ compressionLevel: 9 })

  const { data: compressedData, info } = await pipeline.toBuffer({ resolveWithObject: true })
  const compressedSize = compressedData.length

  const ext = outputFormat === 'jpeg' ? 'jpg' : 'png'
  const compressedMime = outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
  const objectPath = `${tenantId}/${randomUUID()}/optimized.${ext}`

  const { error: uploadError } = await client.storage
    .from('marketing-assets')
    .upload(objectPath, compressedData, {
      cacheControl: '3600',
      contentType: compressedMime,
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
      mime_type: compressedMime,
      size_bytes: compressedSize,
      width: info.width,
      height: info.height,
      purpose,
      category,
      metadata: {
        originalSize,
        originalMime: filePart.type,
        compressionRatio: Math.round((1 - compressedSize / originalSize) * 100),
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

  const { data: signed } = await client.storage
    .from('marketing-assets')
    .createSignedUrl(objectPath, 60 * 60)

  return {
    data: {
      ...asset,
      preview_url: signed?.signedUrl || null,
    },
    meta: {
      originalSize,
      compressedSize,
      width: info.width,
      height: info.height,
      format: outputFormat,
      reductionPercent: Math.round((1 - compressedSize / originalSize) * 100),
    },
  }
})
