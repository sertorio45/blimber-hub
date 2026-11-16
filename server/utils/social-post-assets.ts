import { createError } from 'h3'

interface VariantAssetInput {
  platform?: 'facebook' | 'instagram' | 'linkedin'
  format: 'static' | 'carousel' | 'video' | 'story'
  assetIds: string[]
}

/** Instagram Content Publishing allows up to 20 carousel items; Facebook feed stays at 10. */
export function maxCarouselAssets(platform?: string | null): number {
  return platform === 'instagram' ? 20 : 10
}

export async function validateSocialPostAssets(
  client: any,
  tenantId: string,
  variants: VariantAssetInput[],
  referenceAssetIds: string[],
) {
  const publicationAssetIds = [...new Set(variants.flatMap(variant => variant.assetIds))]
  const allAssetIds = [...new Set([...publicationAssetIds, ...referenceAssetIds])]
  if (!allAssetIds.length)
    return

  const { data: assets, error } = await client
    .from('media_assets')
    .select('id, purpose, mime_type, size_bytes')
    .eq('tenant_id', tenantId)
    .in('id', allAssetIds)

  if (error || (assets || []).length !== allAssetIds.length)
    throw createError({ statusCode: 400, statusMessage: 'Um dos arquivos selecionados é inválido' })

  const assetsById = new Map<string, any>(
    (assets || []).map((asset: any): [string, any] => [asset.id, asset]),
  )
  if (publicationAssetIds.some(id => assetsById.get(id)?.purpose !== 'publication'))
    throw createError({ statusCode: 400, statusMessage: 'Peças finais devem usar arquivos de publicação' })
  if (referenceAssetIds.some(id => assetsById.get(id)?.purpose !== 'reference'))
    throw createError({ statusCode: 400, statusMessage: 'Referências devem usar arquivos de referência' })

  for (const variant of variants) {
    const selectedAssets: any[] = variant.assetIds.map(id => assetsById.get(id)).filter(Boolean)
    const carouselMax = maxCarouselAssets(variant.platform)

    if (variant.format === 'carousel' && selectedAssets.length > carouselMax) {
      throw createError({
        statusCode: 400,
        statusMessage: variant.platform === 'instagram'
          ? 'Carrosséis do Instagram aceitam no máximo 20 peças'
          : 'Carrosséis aceitam no máximo 10 peças',
      })
    }
    if (variant.format !== 'carousel' && selectedAssets.length > 1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Post estático, Stories ou vídeo aceita somente um arquivo',
      })
    }
    if (variant.format === 'video' && selectedAssets.some(asset => !asset.mime_type?.startsWith('video/')))
      throw createError({ statusCode: 400, statusMessage: 'O formato vídeo exige um arquivo de vídeo' })
    if (variant.format === 'story') {
      const invalid = selectedAssets.some((asset) => {
        const mime = String(asset.mime_type || '')
        return !mime.startsWith('image/') && !mime.startsWith('video/')
      })
      if (invalid) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Stories aceita somente imagem ou vídeo',
        })
      }
    }
    else if (variant.format !== 'video' && selectedAssets.some(asset => asset.mime_type?.startsWith('video/'))) {
      throw createError({ statusCode: 400, statusMessage: 'Use o formato vídeo ou Stories para publicar este arquivo' })
    }
    if (variant.platform === 'linkedin' && variant.format === 'video') {
      const video = selectedAssets[0]
      const mime = String(video?.mime_type || '').toLowerCase()
      if (mime && mime !== 'video/mp4' && !mime.includes('mp4')) {
        throw createError({
          statusCode: 400,
          statusMessage: 'O LinkedIn aceita apenas vídeo MP4',
        })
      }
      const sizeBytes = Number(video?.size_bytes)
      if (Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes > 100 * 1024 * 1024) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Vídeo LinkedIn limitado a 100 MB por publicação automática',
        })
      }
    }
  }
}
