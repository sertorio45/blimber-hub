import type { SupabaseClient } from '@supabase/supabase-js'
import { createError, type H3Event } from 'h3'

import { recordSocialAudit } from '~/server/utils/social-audit'

/** post_id FK only — social_post_assets also has a composite post_tenant FK to social_posts. */
export const LINKED_POSTS_EMBED_SELECT = 'post_id, social_posts!social_post_assets_post_id_fkey(id, title)'

export interface MediaAssetRow {
  id: string
  tenant_id: string
  name: string
  object_path: string
  purpose: string
  mime_type?: string | null
  [key: string]: unknown
}

export interface LinkedPostSummary {
  id: string
  title: string | null
}

export interface MediaAssetDeletePreviewItem {
  id: string
  name: string
  previewUrl: string | null
  purpose: string
  linkedPostCount: number
  linkedPosts: LinkedPostSummary[]
}

export interface MediaAssetDeletePreviewResult {
  assets: MediaAssetDeletePreviewItem[]
  blocked: MediaAssetDeletePreviewItem[]
  canDeleteAll: boolean
}

export interface DeleteMediaAssetResult {
  assetId: string
  name: string
}

async function fetchLinkedPostCount(
  client: SupabaseClient,
  tenantId: string,
  assetId: string,
): Promise<number> {
  const { count, error } = await client
    .from('social_post_assets')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('asset_id', assetId)

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  return count || 0
}

async function fetchLinkedPosts(
  client: SupabaseClient,
  tenantId: string,
  assetId: string,
): Promise<LinkedPostSummary[]> {
  const { data, error } = await client
    .from('social_post_assets')
    .select(LINKED_POSTS_EMBED_SELECT)
    .eq('tenant_id', tenantId)
    .eq('asset_id', assetId)
    .limit(5)

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  const posts = new Map<string, LinkedPostSummary>()
  for (const row of data || []) {
    const post = (row as { social_posts?: LinkedPostSummary | LinkedPostSummary[] }).social_posts
    const resolved = Array.isArray(post) ? post[0] : post
    if (resolved?.id)
      posts.set(resolved.id, { id: resolved.id, title: resolved.title || null })
  }

  return [...posts.values()]
}

export async function previewMediaAssetDeletion(
  client: SupabaseClient,
  tenantId: string,
  assetIds: string[],
  previewUrls: Map<string, string | null> = new Map(),
): Promise<MediaAssetDeletePreviewResult> {
  const uniqueIds = [...new Set(assetIds.filter(Boolean))]
  if (!uniqueIds.length) {
    return { assets: [], blocked: [], canDeleteAll: true }
  }

  const { data: assets, error } = await client
    .from('media_assets')
    .select('id, name, purpose, object_path')
    .eq('tenant_id', tenantId)
    .in('id', uniqueIds)

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  const assetMap = new Map((assets || []).map(row => [row.id, row as MediaAssetRow]))
  const missing = uniqueIds.filter(id => !assetMap.has(id))
  if (missing.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Um ou mais arquivos não foram encontrados.',
    })
  }

  const items: MediaAssetDeletePreviewItem[] = []
  for (const assetId of uniqueIds) {
    const asset = assetMap.get(assetId)!
    const [linkedPostCount, linkedPosts] = await Promise.all([
      fetchLinkedPostCount(client, tenantId, assetId),
      fetchLinkedPosts(client, tenantId, assetId),
    ])
    items.push({
      id: asset.id,
      name: asset.name,
      previewUrl: previewUrls.get(asset.object_path) || null,
      purpose: asset.purpose,
      linkedPostCount,
      linkedPosts,
    })
  }

  const blocked = items.filter(item => item.linkedPostCount > 0)
  return {
    assets: items,
    blocked,
    canDeleteAll: blocked.length === 0,
  }
}

export async function deleteMediaAsset(
  event: H3Event,
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  assetId: string,
): Promise<DeleteMediaAssetResult> {
  const { data: asset, error: assetError } = await client
    .from('media_assets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', assetId)
    .maybeSingle()

  if (assetError || !asset)
    throw createError({ statusCode: 404, statusMessage: 'Arquivo não encontrado' })

  const preview = await previewMediaAssetDeletion(client, tenantId, [assetId])
  if (preview.blocked.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Este arquivo está vinculado a uma publicação. Remova o vínculo antes de excluir.',
      data: {
        blocked: preview.blocked,
      },
    })
  }

  const { data: derivatives } = await client
    .from('media_asset_derivatives')
    .select('object_path')
    .eq('tenant_id', tenantId)
    .eq('asset_id', assetId)

  const { error } = await client
    .from('media_assets')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', assetId)

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  await recordSocialAudit(event, client, {
    tenantId,
    actorId: userId,
    action: 'media_asset.deleted',
    entityType: 'media_asset',
    entityId: assetId,
    before: asset,
  })

  const paths = [asset.object_path]
  paths.push(...(derivatives || []).map((item: { object_path?: string | null }) => item.object_path).filter(Boolean) as string[])
  if (paths.length)
    await client.storage.from('marketing-assets').remove(paths)

  return {
    assetId,
    name: asset.name,
  }
}

export async function deleteMediaAssetsBulk(
  event: H3Event,
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  assetIds: string[],
): Promise<{ deleted: DeleteMediaAssetResult[], count: number }> {
  const uniqueIds = [...new Set(assetIds.filter(Boolean))]
  if (!uniqueIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Informe ao menos um arquivo.' })
  }

  const preview = await previewMediaAssetDeletion(client, tenantId, uniqueIds)
  if (!preview.canDeleteAll) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Alguns arquivos estão vinculados a publicações. Remova os vínculos antes de excluir.',
      data: {
        blocked: preview.blocked,
      },
    })
  }

  const deleted: DeleteMediaAssetResult[] = []
  for (const assetId of uniqueIds)
    deleted.push(await deleteMediaAsset(event, client, tenantId, userId, assetId))

  return {
    deleted,
    count: deleted.length,
  }
}
