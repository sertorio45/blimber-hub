import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { createError } from 'h3'

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

export type CmsAssetUsageKind = 'draft' | 'revision' | 'global'

export interface CmsAssetUsageSummary {
  /** Null for site-wide (`global`) usages such as logos in site settings. */
  documentId: string | null
  revisionId: string | null
  usageKind: CmsAssetUsageKind
  fieldPath: string
}

/** Everything that keeps an asset alive, grouped for "Onde este arquivo é usado". */
export interface MediaAssetUsages {
  socialPosts: LinkedPostSummary[]
  cmsDocuments: CmsAssetUsageSummary[]
}

export interface MediaAssetDeletePreviewItem {
  id: string
  name: string
  previewUrl: string | null
  purpose: string
  linkedPostCount: number
  linkedPosts: LinkedPostSummary[]
  cmsUsageCount: number
  usages: MediaAssetUsages
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

export const CMS_ASSET_USAGES_TABLE = 'cms_asset_usages'
const CMS_USAGE_SAMPLE_LIMIT = 50
const CMS_USAGE_KINDS = new Set<CmsAssetUsageKind>(['draft', 'revision', 'global'])

/**
 * `cms_asset_usages` ships in a separate migration, so environments without it
 * must keep deleting marketing assets. Only "relation does not exist" (Postgres
 * 42P01, or PostgREST PGRST205 when the schema cache lacks the table) is
 * tolerated; every other failure still blocks the deletion.
 */
export function isMissingRelationError(error: { code?: string | null } | null | undefined): boolean {
  const code = String(error?.code || '')
  return code === '42P01' || code === 'PGRST205'
}

export async function fetchCmsAssetUsages(
  client: SupabaseClient,
  tenantId: string,
  assetId: string,
): Promise<{ count: number, usages: CmsAssetUsageSummary[] }> {
  const { data, count, error } = await client
    .from(CMS_ASSET_USAGES_TABLE)
    .select('document_id, revision_id, usage_kind, field_path', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('asset_id', assetId)
    .limit(CMS_USAGE_SAMPLE_LIMIT)

  if (error) {
    if (isMissingRelationError(error))
      return { count: 0, usages: [] }
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  const rows = (data || []) as Array<{
    document_id?: string | null
    revision_id?: string | null
    usage_kind?: string | null
    field_path?: string | null
  }>

  const usages: CmsAssetUsageSummary[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const usageKind = CMS_USAGE_KINDS.has(row.usage_kind as CmsAssetUsageKind)
      ? row.usage_kind as CmsAssetUsageKind
      : 'draft'
    const item: CmsAssetUsageSummary = {
      documentId: row.document_id ? String(row.document_id) : null,
      revisionId: row.revision_id ? String(row.revision_id) : null,
      usageKind,
      fieldPath: String(row.field_path || ''),
    }
    const key = [item.documentId, item.revisionId, item.usageKind, item.fieldPath].join('|')
    if (seen.has(key))
      continue
    seen.add(key)
    usages.push(item)
  }

  return { count: typeof count === 'number' ? count : rows.length, usages }
}

export async function fetchMediaAssetUsages(
  client: SupabaseClient,
  tenantId: string,
  assetId: string,
): Promise<{ linkedPostCount: number, cmsUsageCount: number, usages: MediaAssetUsages }> {
  const [linkedPostCount, socialPosts, cms] = await Promise.all([
    fetchLinkedPostCount(client, tenantId, assetId),
    fetchLinkedPosts(client, tenantId, assetId),
    fetchCmsAssetUsages(client, tenantId, assetId),
  ])

  return {
    linkedPostCount,
    cmsUsageCount: cms.count,
    usages: { socialPosts, cmsDocuments: cms.usages },
  }
}

function isBlocked(item: MediaAssetDeletePreviewItem): boolean {
  return item.linkedPostCount > 0 || item.cmsUsageCount > 0
}

function blockedMessage(blocked: MediaAssetDeletePreviewItem[], single: boolean): string {
  const hasSocialLinks = blocked.some(item => item.linkedPostCount > 0)
  if (single) {
    return hasSocialLinks
      ? 'Este arquivo está vinculado a uma publicação. Remova o vínculo antes de excluir.'
      : 'Este arquivo está em uso no site. Remova-o das páginas antes de excluir.'
  }
  return hasSocialLinks
    ? 'Alguns arquivos estão vinculados a publicações. Remova os vínculos antes de excluir.'
    : 'Alguns arquivos estão em uso no site. Remova-os das páginas antes de excluir.'
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
    const usage = await fetchMediaAssetUsages(client, tenantId, assetId)
    items.push({
      id: asset.id,
      name: asset.name,
      previewUrl: previewUrls.get(asset.object_path) || null,
      purpose: asset.purpose,
      linkedPostCount: usage.linkedPostCount,
      linkedPosts: usage.usages.socialPosts,
      cmsUsageCount: usage.cmsUsageCount,
      usages: usage.usages,
    })
  }

  const blocked = items.filter(isBlocked)
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
      statusMessage: blockedMessage(preview.blocked, true),
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
      statusMessage: blockedMessage(preview.blocked, false),
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
