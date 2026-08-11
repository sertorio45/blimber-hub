import {
  createEmptyAiPreferences,
  createEmptyVisualDirection,
  normalizeBrandGuide,
} from '~/utils/brand-guide'
import type { BrandGuide, BrandGuideLogoAsset } from '~/types/brand-guide'

type SupabaseLike = {
  from: (table: string) => any
  storage: {
    from: (bucket: string) => {
      createSignedUrls: (paths: string[], expiresIn: number) => Promise<{ data: Array<{ signedUrl?: string | null, path?: string | null }> | null }>
    }
  }
}

async function hydrateMediaAssets(
  client: SupabaseLike,
  tenantId: string,
  assetIds: string[],
): Promise<BrandGuideLogoAsset[]> {
  if (!assetIds.length)
    return []

  const uniqueIds = [...new Set(assetIds.filter(Boolean))]
  const { data: assets, error: assetsError } = await client
    .from('media_assets')
    .select('id, name, mime_type, object_path, status')
    .eq('tenant_id', tenantId)
    .in('id', uniqueIds)

  if (assetsError || !assets?.length)
    return []

  const paths = assets
    .map((row: { object_path?: string | null }) => row.object_path)
    .filter((path: string | null | undefined): path is string => Boolean(path))

  const { data: signedRows } = paths.length
    ? await client.storage.from('marketing-assets').createSignedUrls(paths, 60 * 60)
    : { data: [] }

  const signedByPath = new Map<string, string>()
  for (const row of signedRows || []) {
    if (row?.path && row.signedUrl)
      signedByPath.set(row.path, row.signedUrl)
  }

  const byId = new Map<string, BrandGuideLogoAsset>()
  for (const asset of assets as Array<Record<string, unknown>>) {
    const id = String(asset.id)
    const objectPath = String(asset.object_path || '')
    byId.set(id, {
      id,
      name: String(asset.name || 'Asset'),
      mimeType: String(asset.mime_type || 'image/*'),
      objectPath,
      previewUrl: signedByPath.get(objectPath) || null,
    })
  }

  // Preserve caller order.
  return uniqueIds
    .map(id => byId.get(id))
    .filter((item): item is BrandGuideLogoAsset => Boolean(item))
}

export async function fetchBrandGuideForTenant(
  client: SupabaseLike,
  tenantId: string,
): Promise<BrandGuide> {
  const { data, error } = await client
    .from('social_brand_guides')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  const guide = normalizeBrandGuide(data || null, tenantId)
  const visualIds = guide.metadata.visualDirection?.visualReferenceAssetIds || []
  const allIds = [...new Set([...guide.logoAssetIds, ...visualIds])]

  if (!allIds.length)
    return guide

  const hydrated = await hydrateMediaAssets(client, tenantId, allIds)
  const byId = new Map(hydrated.map(asset => [asset.id, asset]))

  guide.logoAssets = guide.logoAssetIds
    .map(id => byId.get(id))
    .filter((item): item is BrandGuideLogoAsset => Boolean(item))

  guide.visualReferenceAssets = visualIds
    .map(id => byId.get(id))
    .filter((item): item is BrandGuideLogoAsset => Boolean(item))

  return guide
}

/** Deep-merge visual direction for partial brand-guide saves. */
export function mergeVisualDirection(
  existing: BrandGuide['metadata']['visualDirection'],
  incoming: BrandGuide['metadata']['visualDirection'] | undefined,
) {
  const base = existing || createEmptyVisualDirection()
  if (!incoming)
    return base

  return {
    ...base,
    ...incoming,
    styles: incoming.styles ?? base.styles,
    photography: {
      ...base.photography,
      ...(incoming.photography || {}),
    },
    composition: {
      ...base.composition,
      ...(incoming.composition || {}),
    },
    people: {
      ...base.people,
      ...(incoming.people || {}),
    },
    productsInImages: {
      ...base.productsInImages,
      ...(incoming.productsInImages || {}),
    },
    preferredElements: incoming.preferredElements ?? base.preferredElements,
    forbiddenElements: incoming.forbiddenElements ?? base.forbiddenElements,
    disallowedStyles: incoming.disallowedStyles ?? base.disallowedStyles,
    negativeGuidance: incoming.negativeGuidance ?? base.negativeGuidance,
    visualReferenceAssetIds: incoming.visualReferenceAssetIds ?? base.visualReferenceAssetIds,
  }
}

export function mergeAiPreferences(
  existing: BrandGuide['metadata']['aiPreferences'],
  incoming: BrandGuide['metadata']['aiPreferences'] | undefined,
) {
  const base = existing || createEmptyAiPreferences()
  if (!incoming)
    return base
  return {
    ...base,
    ...incoming,
  }
}
