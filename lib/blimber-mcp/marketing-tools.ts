import { z } from 'zod'
import { fetchBrandContextForTenant } from '~/server/utils/brand-context'
import { LINKED_POSTS_EMBED_SELECT } from '~/server/utils/media-asset-deletion'
import { assertPackageAllowsNewPost } from '~/server/utils/social-packages'
import {
  assertBlimberWriteConfirmation,
  blimberWriteConfirmationFields,
  blimberWriteDryRunField,
  resolveDryRun,
} from './confirm'
import { resolveMcpActorUserId } from './auth'
import { BlimberMcpError, mapSupabaseRpcError } from './errors'
import type { BlimberMcpToolContext } from './types'
import {
  MARKETING_BRAND_URL,
  MARKETING_CAMPAIGNS_URL,
  MARKETING_CONTENT_URL,
  MARKETING_LIBRARY_URL,
} from './types'

const uuid = z.string().uuid()
const tenantIdField = z.string().uuid().describe('UUID do tenant (cliente).')

const socialCampaignStatus = z.enum([
  'draft',
  'active',
  'paused',
  'completed',
  'cancelled',
])

const platformEnum = z.enum(['facebook', 'instagram', 'linkedin'])
const formatEnum = z.enum(['static', 'carousel', 'video', 'story'])

function resolveOptionalActorUserId(
  ctx: BlimberMcpToolContext,
  override?: string,
): string | null {
  const id = resolveMcpActorUserId(override || ctx.actorUserId)
  if (!id)
    return null
  if (!uuid.safeParse(id).success) {
    throw new BlimberMcpError(
      'ACTOR_INVALID',
      'actorUserId / BLIMBER_MCP_ACTOR_USER_ID deve ser um UUID válido de auth.users.',
      400,
    )
  }
  return id
}

function isActorFkViolation(message: string): boolean {
  return /created_by/i.test(message)
}

function throwWriteError(error: { message?: string } | null | undefined): never {
  const message = error?.message || 'Falha ao gravar'
  if (isActorFkViolation(message)) {
    throw new BlimberMcpError(
      'ACTOR_NOT_FOUND',
      'actorUserId / BLIMBER_MCP_ACTOR_USER_ID não existe em auth.users.',
      400,
    )
  }
  throw new BlimberMcpError('DB_ERROR', message, 400)
}

/**
 * Optional pre-check. Never call Auth Admin on a client without a working
 * fetch (Nuxt `serverSupabaseServiceRole` on Vercel throws
 * "Cannot read properties of undefined (reading 'fetch')").
 * Skip when admin is missing/broken — `created_by` FK still enforces auth.users.
 */
async function assertActorUserExists(
  ctx: BlimberMcpToolContext,
  actorUserId: string,
): Promise<void> {
  const getUserById = ctx.client.auth?.admin?.getUserById
  if (typeof getUserById !== 'function')
    return

  try {
    const { data, error } = await getUserById(actorUserId)
    if (error || !data?.user?.id) {
      throw new BlimberMcpError(
        'ACTOR_NOT_FOUND',
        'actorUserId / BLIMBER_MCP_ACTOR_USER_ID não existe em auth.users.',
        400,
      )
    }
  }
  catch (error) {
    if (error instanceof BlimberMcpError)
      throw error
    // Auth Admin unavailable (undefined fetch / non-service client) — skip.
  }
}

/** Actor is required only on execute (dryRun=false). Preview never requires it. */
async function requireActorUserId(
  ctx: BlimberMcpToolContext,
  override?: string,
): Promise<string> {
  const id = resolveOptionalActorUserId(ctx, override)
  if (!id) {
    throw new BlimberMcpError(
      'ACTOR_REQUIRED',
      'Para gravar (dryRun=false), envie actorUserId (UUID de auth.users) ou defina BLIMBER_MCP_ACTOR_USER_ID no servidor. Preview (dryRun=true) não exige actor.',
      503,
    )
  }
  await assertActorUserExists(ctx, id)
  return id
}

function actorPreviewNote(actorUserId: string | null): string {
  return actorUserId
    ? `created_by=${actorUserId}`
    : 'Execute (dryRun=false) exige actorUserId no body ou BLIMBER_MCP_ACTOR_USER_ID no servidor.'
}

function mapCampaignRow(row: Record<string, any>, postsCount?: number) {
  return {
    kind: 'editorial' as const,
    entity: 'social_campaign',
    id: String(row.id),
    name: String(row.name),
    objective: row.objective ?? '',
    status: row.status,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    ownerId: row.owner_id ?? null,
    briefingSummary: row.briefing_summary ?? '',
    postsCount: postsCount ?? undefined,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    hubUrl: `${MARKETING_CAMPAIGNS_URL}/${row.id}`,
  }
}

function mapPostRow(row: Record<string, any>) {
  const meta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {}
  return {
    kind: 'editorial' as const,
    entity: 'social_post',
    id: String(row.id),
    title: String(row.title || ''),
    content: String(row.content || ''),
    status: row.status,
    editorialStatus: row.editorial_status ?? null,
    publicationStatus: row.publication_status ?? null,
    productionStatus: row.production_status ?? null,
    campaignId: row.campaign_id ?? null,
    scheduledAt: row.scheduled_at ?? null,
    timezone: row.timezone ?? 'America/Sao_Paulo',
    artText: (meta as any).art_text ?? null,
    cta: (meta as any).cta ?? null,
    hashtags: Array.isArray((meta as any).hashtags) ? (meta as any).hashtags : [],
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    hubUrl: `${MARKETING_CONTENT_URL}/${row.id}`,
  }
}

// --- Schemas ---

export const marketingListSocialAccountsSchema = z.object({
  tenantId: tenantIdField,
})

export const marketingListAssetsSchema = z.object({
  tenantId: tenantIdField,
  limit: z.number().int().min(1).max(100).optional(),
  search: z.string().max(120).optional(),
  purpose: z.enum(['reference', 'publication']).optional(),
  mime: z.string().max(80).optional(),
  campaignId: uuid.optional(),
})

export const marketingGetBrandContextSchema = z.object({
  tenantId: tenantIdField,
})

export const marketingListPostsSchema = z.object({
  tenantId: tenantIdField,
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
  status: z.string().max(40).optional(),
  campaignId: uuid.optional(),
  search: z.string().max(120).optional(),
})

export const marketingGetPostSchema = z.object({
  tenantId: tenantIdField,
  postId: uuid,
})

export const marketingCreatePostSchema = z.object({
  tenantId: tenantIdField,
  title: z.string().trim().min(2).max(180),
  content: z.string().max(10000).default(''),
  artText: z.string().max(2000).nullable().optional(),
  cta: z.string().max(240).nullable().optional(),
  hashtags: z.array(z.string().max(100)).max(30).default([]),
  campaignId: uuid.nullable().optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().min(1).max(80).default('America/Sao_Paulo'),
  referenceAssetIds: z.array(uuid).max(20).default([]),
  /** Optional single-channel draft (requires accountId from listSocialAccounts). */
  accountId: uuid.optional(),
  platform: platformEnum.optional(),
  format: formatEnum.default('static'),
  caption: z.string().max(5000).optional(),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

const variantInputSchema = z.object({
  accountId: uuid.describe('UUID of the social account (from listSocialAccounts).'),
  platform: platformEnum,
  format: formatEnum.default('static'),
  caption: z.string().max(5000).optional(),
})

export const marketingUpdatePostSchema = z.object({
  tenantId: tenantIdField,
  postId: uuid,
  title: z.string().trim().min(2).max(180).optional(),
  content: z.string().max(10000).optional(),
  artText: z.string().max(2000).nullable().optional(),
  cta: z.string().max(240).nullable().optional(),
  hashtags: z.array(z.string().max(100)).max(30).optional(),
  campaignId: uuid.nullable().optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().min(1).max(80).optional(),
  /** Replaces all variants (social channels) linked to this post. */
  variants: z.array(variantInputSchema).max(10).optional(),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export const marketingDeletePostSchema = z.object({
  tenantId: tenantIdField,
  postId: uuid,
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export const marketingDeleteAssetSchema = z.object({
  tenantId: tenantIdField,
  assetId: uuid,
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export const marketingListCampaignsSchema = z.object({
  tenantId: tenantIdField,
  status: socialCampaignStatus.or(z.literal('all')).optional(),
  search: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

export const marketingGetCampaignSchema = z.object({
  tenantId: tenantIdField,
  campaignId: uuid,
})

export const marketingCreateCampaignSchema = z.object({
  tenantId: tenantIdField,
  name: z.string().trim().min(1).max(180),
  objective: z.string().max(5000).default(''),
  status: socialCampaignStatus.default('draft'),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  briefingSummary: z.string().max(10000).default(''),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export const marketingUpdateCampaignSchema = z.object({
  tenantId: tenantIdField,
  campaignId: uuid,
  name: z.string().trim().min(1).max(180).optional(),
  objective: z.string().max(5000).optional(),
  status: socialCampaignStatus.optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  briefingSummary: z.string().max(10000).optional(),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export type MarketingToolName =
  | 'marketing_list_social_accounts'
  | 'marketing_list_assets'
  | 'marketing_get_brand_context'
  | 'marketing_list_posts'
  | 'marketing_get_post'
  | 'marketing_create_post'
  | 'marketing_update_post'
  | 'marketing_delete_post'
  | 'marketing_delete_asset'
  | 'marketing_list_campaigns'
  | 'marketing_get_campaign'
  | 'marketing_create_campaign'
  | 'marketing_update_campaign'

export const MARKETING_TOOL_DESCRIPTIONS: Record<MarketingToolName, string> = {
  marketing_list_social_accounts: 'Lista contas sociais ativas do tenant (para variant/accountId).',
  marketing_list_assets: 'Lista mídias da Biblioteca (ids para referência em posts). Sem upload binário.',
  marketing_get_brand_context: 'Lê Brand Context (tom, CTAs, restrições) do Brand Center do tenant.',
  marketing_list_posts: 'Lista posts editoriais (social_posts) do tenant.',
  marketing_get_post: 'Detalhe de um post editorial por postId.',
  marketing_create_post: 'Cria rascunho de post editorial (dryRun default true sem actor; execute exige actorUserId ou env).',
  marketing_update_post: 'Atualiza campos de um post draft, incluindo variants/contas sociais (dryRun default true).',
  marketing_delete_post: 'Soft-delete de 1 post editorial (dryRun default true). Isolado por tenant; sem exclusão em massa nem remota.',
  marketing_delete_asset: 'Remove 1 mídia da Biblioteca (storage + DB). dryRun default true. Bloqueia se vinculada a posts.',
  marketing_list_campaigns: 'Lista campanhas EDITORIAIS (social_campaigns) — não são Meta Ads.',
  marketing_get_campaign: 'Detalhe de campanha editorial + posts vinculados.',
  marketing_create_campaign: 'Cria campanha editorial (dryRun default true sem actor; execute exige actorUserId ou env).',
  marketing_update_campaign: 'Atualiza campanha editorial (nome, status, briefing, datas).',
}

export const MARKETING_TOOL_SCHEMAS = {
  marketing_list_social_accounts: marketingListSocialAccountsSchema,
  marketing_list_assets: marketingListAssetsSchema,
  marketing_get_brand_context: marketingGetBrandContextSchema,
  marketing_list_posts: marketingListPostsSchema,
  marketing_get_post: marketingGetPostSchema,
  marketing_create_post: marketingCreatePostSchema,
  marketing_update_post: marketingUpdatePostSchema,
  marketing_delete_post: marketingDeletePostSchema,
  marketing_delete_asset: marketingDeleteAssetSchema,
  marketing_list_campaigns: marketingListCampaignsSchema,
  marketing_get_campaign: marketingGetCampaignSchema,
  marketing_create_campaign: marketingCreateCampaignSchema,
  marketing_update_campaign: marketingUpdateCampaignSchema,
} as const

// --- Handlers ---

export async function marketingListSocialAccounts(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingListSocialAccountsSchema.parse(raw)
  const { data, error } = await ctx.client
    .from('social_accounts')
    .select('id, name, username, platform, is_active, external_account_id')
    .eq('tenant_id', input.tenantId)
    .eq('is_active', true)
    .order('platform')
    .order('name')

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)

  return {
    tenantId: input.tenantId,
    accounts: (data || []).map((row: any) => ({
      id: String(row.id),
      name: row.name,
      username: row.username ?? null,
      platform: row.platform,
      externalAccountId: row.external_account_id ?? null,
    })),
  }
}

export async function marketingListAssets(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingListAssetsSchema.parse(raw)
  const limit = input.limit ?? 40

  let request = ctx.client
    .from('media_assets')
    .select('id, name, mime_type, purpose, category, size_bytes, width, height, object_path, campaign_id, created_at, lifecycle, status')
    .eq('tenant_id', input.tenantId)
    .neq('status', 'archived')
    .neq('lifecycle', 'discontinued')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.purpose)
    request = request.eq('purpose', input.purpose)
  if (input.mime)
    request = request.like('mime_type', `${input.mime}%`)
  if (input.search)
    request = request.ilike('name', `%${input.search.trim()}%`)
  if (input.campaignId)
    request = request.eq('campaign_id', input.campaignId)

  const { data, error } = await request
  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)

  const rows = data || []
  const paths = rows.map((row: any) => row.object_path).filter(Boolean)
  const signedRows = paths.length && ctx.client.storage
    ? (await ctx.client.storage.from('marketing-assets').createSignedUrls(paths, 60 * 60)).data
    : []
  const signedUrls = new Map((signedRows || []).map((row: any) => [row.path, row.signedUrl]))

  return {
    tenantId: input.tenantId,
    libraryUrl: MARKETING_LIBRARY_URL,
    note: 'Upload binário via GPT não é suportado. Use a Biblioteca no Hub e referencie assetIds nos posts.',
    assets: rows.map((asset: any) => ({
      id: String(asset.id),
      name: asset.name,
      mimeType: asset.mime_type,
      purpose: asset.purpose,
      category: asset.category ?? null,
      sizeBytes: asset.size_bytes,
      width: asset.width ?? null,
      height: asset.height ?? null,
      campaignId: asset.campaign_id ?? null,
      createdAt: asset.created_at,
      previewUrl: signedUrls.get(asset.object_path) || null,
    })),
  }
}

export async function marketingGetBrandContext(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingGetBrandContextSchema.parse(raw)
  const data = await fetchBrandContextForTenant(ctx.client as any, input.tenantId)
  return {
    tenantId: input.tenantId,
    hubUrl: MARKETING_BRAND_URL,
    brand: data,
  }
}

export async function marketingListPosts(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingListPostsSchema.parse(raw)
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let request = ctx.client
    .from('social_posts')
    .select('*', { count: 'exact' })
    .eq('tenant_id', input.tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (input.status && input.status !== 'all')
    request = request.eq('status', input.status)
  if (input.campaignId)
    request = request.eq('campaign_id', input.campaignId)
  if (input.search)
    request = request.ilike('title', `%${input.search.trim()}%`)

  const { data, error, count } = await request
  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)

  return {
    tenantId: input.tenantId,
    hubUrl: MARKETING_CONTENT_URL,
    posts: (data || []).map((row: any) => mapPostRow(row)),
    pagination: {
      page,
      pageSize,
      total: count || 0,
      pageCount: Math.ceil((count || 0) / pageSize),
    },
  }
}

export async function marketingGetPost(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingGetPostSchema.parse(raw)
  const { data, error } = await ctx.client
    .from('social_posts')
    .select(`
      *,
      social_post_variants (
        id, account_id, platform, format, caption, link_url, hashtags
      )
    `)
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!data)
    throw new BlimberMcpError('NOT_FOUND', 'Publicação não encontrada', 404)

  return {
    tenantId: input.tenantId,
    post: {
      ...mapPostRow(data),
      variants: (data.social_post_variants || []).map((v: any) => ({
        id: v.id,
        accountId: v.account_id,
        platform: v.platform,
        format: v.format,
        caption: v.caption,
        linkUrl: v.link_url,
        hashtags: v.hashtags || [],
      })),
    },
  }
}

export async function marketingCreatePost(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingCreatePostSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const actorUserId = dryRun
    ? resolveOptionalActorUserId(ctx, input.actorUserId)
    : await requireActorUserId(ctx, input.actorUserId)

  if (input.campaignId) {
    const { data: campaign } = await ctx.client
      .from('social_campaigns')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.campaignId)
      .maybeSingle()
    if (!campaign) {
      throw new BlimberMcpError(
        'INVALID_CAMPAIGN',
        'campaignId inválido para este tenant (deve ser social_campaigns editorial).',
        400,
      )
    }
  }

  if (input.referenceAssetIds.length) {
    const { data: assets } = await ctx.client
      .from('media_assets')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .in('id', input.referenceAssetIds)
    if ((assets || []).length !== input.referenceAssetIds.length) {
      throw new BlimberMcpError(
        'INVALID_ASSETS',
        'Um ou mais referenceAssetIds não pertencem ao tenant.',
        400,
      )
    }
  }

  if (input.accountId || input.platform) {
    if (!input.accountId || !input.platform) {
      throw new BlimberMcpError(
        'VARIANT_INCOMPLETE',
        'Para criar com canal, informe accountId e platform juntos.',
        400,
      )
    }
    const { data: account } = await ctx.client
      .from('social_accounts')
      .select('id, platform')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.accountId)
      .eq('is_active', true)
      .maybeSingle()
    if (!account) {
      throw new BlimberMcpError('INVALID_ACCOUNT', 'Conta social inválida para o tenant.', 400)
    }
  }

  const packageGate = await assertPackageAllowsNewPost(ctx.client, input.tenantId)

  const insertPayload = {
    tenant_id: input.tenantId,
    title: input.title,
    content: input.content,
    campaign_id: input.campaignId || null,
    scheduled_at: input.scheduledAt || null,
    timezone: input.timezone,
    created_by: actorUserId,
    package_id: packageGate.package?.id || null,
    metadata: {
      art_text: input.artText?.trim() || null,
      cta: input.cta?.trim() || null,
      hashtags: input.hashtags || [],
      source: 'blimber_mcp',
    },
  }

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'social_post',
      kind: 'editorial' as const,
      preview: {
        ...insertPayload,
        variant: input.accountId
          ? {
              accountId: input.accountId,
              platform: input.platform,
              format: input.format,
              caption: input.caption || input.content,
            }
          : null,
        referenceAssetIds: input.referenceAssetIds,
        packageWarned: packageGate.warned,
      },
      notes: [
        'Post editorial (social_posts), não anúncio Meta.',
        'Default dryRun=true — reenvie com dryRun=false após confirmação.',
        actorPreviewNote(actorUserId),
        `Hub: ${MARKETING_CONTENT_URL}`,
      ],
    }
  }

  const { data: post, error: postError } = await ctx.client
    .from('social_posts')
    .insert(insertPayload)
    .select('*')
    .single()

  if (postError)
    throwWriteError(postError)

  try {
    if (input.accountId && input.platform) {
      const { data: createdVariant, error: variantError } = await ctx.client
        .from('social_post_variants')
        .insert({
          tenant_id: input.tenantId,
          post_id: post.id,
          account_id: input.accountId,
          platform: input.platform,
          format: input.format,
          caption: input.caption || input.content,
          hashtags: input.hashtags || [],
          platform_config: {
            artText: input.artText?.trim() || '',
            cta: input.cta?.trim() || '',
          },
        })
        .select('id')
        .single()

      if (variantError)
        throw new Error(variantError.message)

      void createdVariant
    }

    if (input.referenceAssetIds.length) {
      const { error: referenceError } = await ctx.client
        .from('social_post_assets')
        .insert(input.referenceAssetIds.map((assetId, position) => ({
          tenant_id: input.tenantId,
          post_id: post.id,
          variant_id: null,
          asset_id: assetId,
          position,
        })))
      if (referenceError)
        throw new Error(referenceError.message)
    }
  }
  catch (error) {
    await ctx.client.from('social_posts').delete().eq('id', post.id)
    throw new BlimberMcpError(
      'CREATE_FAILED',
      error instanceof Error ? error.message : 'Falha ao criar canais/assets do post',
      400,
    )
  }

  return {
    dryRun: false as const,
    kind: 'editorial' as const,
    post: mapPostRow(post),
    packageWarned: packageGate.warned,
  }
}

export async function marketingUpdatePost(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingUpdatePostSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)

  const { data: existing } = await ctx.client
    .from('social_posts')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
    .maybeSingle()

  if (!existing)
    throw new BlimberMcpError('NOT_FOUND', 'Publicação não encontrada', 404)
  if (existing.deleted_at) {
    throw new BlimberMcpError('GONE', 'Publicação excluída não pode ser alterada', 409)
  }
  if (['publishing', 'published'].includes(String(existing.status))) {
    throw new BlimberMcpError(
      'LOCKED',
      'Uma publicação enviada ou publicada não pode ser alterada via GPT.',
      409,
    )
  }

  if (input.campaignId) {
    const { data: campaign } = await ctx.client
      .from('social_campaigns')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.campaignId)
      .maybeSingle()
    if (!campaign) {
      throw new BlimberMcpError('INVALID_CAMPAIGN', 'Campanha editorial inválida.', 400)
    }
  }

  const meta = (existing.metadata && typeof existing.metadata === 'object')
    ? { ...existing.metadata as Record<string, unknown> }
    : {}

  if (input.artText !== undefined)
    meta.art_text = input.artText?.trim() || null
  if (input.cta !== undefined)
    meta.cta = input.cta?.trim() || null
  if (input.hashtags !== undefined)
    meta.hashtags = input.hashtags

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    metadata: meta,
  }
  if (input.title !== undefined)
    updatePayload.title = input.title
  if (input.content !== undefined)
    updatePayload.content = input.content
  if (input.campaignId !== undefined)
    updatePayload.campaign_id = input.campaignId
  if (input.scheduledAt !== undefined)
    updatePayload.scheduled_at = input.scheduledAt
  if (input.timezone !== undefined)
    updatePayload.timezone = input.timezone

  if (input.variants?.length) {
    const accountIds = input.variants.map(v => v.accountId)
    const { data: accounts } = await ctx.client
      .from('social_accounts')
      .select('id, platform')
      .eq('tenant_id', input.tenantId)
      .eq('is_active', true)
      .in('id', accountIds)
    if ((accounts || []).length !== new Set(accountIds).size) {
      throw new BlimberMcpError(
        'INVALID_ACCOUNT',
        'Um ou mais accountId não pertencem ao tenant ou estão inativos.',
        400,
      )
    }
  }

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'social_post',
      kind: 'editorial' as const,
      before: mapPostRow(existing),
      afterPreview: updatePayload,
      variantsPreview: input.variants ?? null,
      notes: ['Reenvie com dryRun=false após confirmação.'],
    }
  }

  const { data, error } = await ctx.client
    .from('social_posts')
    .update(updatePayload)
    .eq('id', input.postId)
    .eq('tenant_id', input.tenantId)
    .select('*')
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!data)
    throw new BlimberMcpError('NOT_FOUND', 'Publicação não encontrada', 404)

  if (input.variants) {
    const { error: delError } = await ctx.client
      .from('social_post_variants')
      .delete()
      .eq('post_id', input.postId)
      .eq('tenant_id', input.tenantId)
    if (delError)
      throw new BlimberMcpError('DB_ERROR', delError.message, 400)

    if (input.variants.length) {
      const caption = input.content ?? existing.content ?? ''
      const hashtags = input.hashtags ?? ((existing.metadata as any)?.hashtags || [])
      const { error: insError } = await ctx.client
        .from('social_post_variants')
        .insert(input.variants.map(v => ({
          tenant_id: input.tenantId,
          post_id: input.postId,
          account_id: v.accountId,
          platform: v.platform,
          format: v.format,
          caption: v.caption || caption,
          hashtags,
          platform_config: {
            artText: input.artText?.trim() ?? ((existing.metadata as any)?.art_text || ''),
            cta: input.cta?.trim() ?? ((existing.metadata as any)?.cta || ''),
          },
        })))
      if (insError)
        throw new BlimberMcpError('DB_ERROR', insError.message, 400)
    }
  }

  return {
    dryRun: false as const,
    kind: 'editorial' as const,
    post: mapPostRow(data),
  }
}

function mapDeletePreview(row: Record<string, any>) {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    campaignId: row.campaign_id ?? null,
  }
}

/**
 * Local soft-delete of one editorial post (deleted_at tombstone).
 * Does not call Meta/LinkedIn remote delete — Hub UI owns that cascade.
 */
export async function marketingDeletePost(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingDeletePostSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)

  const { data: existing, error } = await ctx.client
    .from('social_posts')
    .select('id, title, campaign_id, tenant_id, deleted_at, status, publication_status')
    .eq('id', input.postId)
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!existing)
    throw new BlimberMcpError('NOT_FOUND', 'Publicação não encontrada', 404)
  if (String(existing.tenant_id) !== input.tenantId) {
    throw new BlimberMcpError(
      'FORBIDDEN',
      'Publicação pertence a outro tenant.',
      403,
    )
  }
  if (existing.deleted_at) {
    throw new BlimberMcpError('GONE', 'Publicação já excluída', 409)
  }
  if (['publishing'].includes(String(existing.status))
    || String(existing.publication_status) === 'publishing') {
    throw new BlimberMcpError(
      'LOCKED',
      'Há publicação em andamento. Aguarde o término antes de excluir.',
      409,
    )
  }

  const preview = mapDeletePreview(existing)

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'social_post',
      kind: 'editorial' as const,
      deleteMode: 'soft' as const,
      preview,
      notes: [
        'Soft-delete local (deleted_at). Não remove o post das redes (Meta/LinkedIn).',
        'Um post por chamada — para duplicados, confirme e chame de novo por id.',
        'Reenvie com dryRun=false após confirmação.',
      ],
    }
  }

  const actorUserId = resolveOptionalActorUserId(ctx, input.actorUserId)

  if (typeof ctx.client.rpc === 'function') {
    try {
      const { data: ok, error: rpcError } = await ctx.client.rpc('marketing_delete_social_post', {
        p_tenant_id: input.tenantId,
        p_post_id: input.postId,
        p_deleted_by: actorUserId,
        p_mode: 'system_only',
        p_reason: 'gpt_marketing_delete_post',
        p_remote_status: 'not_applicable',
      })
      if (rpcError)
        throw mapSupabaseRpcError(rpcError, 'Falha ao excluir publicação')
      if (ok === false) {
        throw new BlimberMcpError('NOT_FOUND', 'Publicação não encontrada', 404)
      }
    }
    catch (error) {
      if (error instanceof BlimberMcpError)
        throw error
      throw mapSupabaseRpcError(error, 'Falha ao excluir publicação')
    }
  }
  else {
    const now = new Date().toISOString()
    const { data, error: updateError } = await ctx.client
      .from('social_posts')
      .update({
        deleted_at: now,
        deleted_by: actorUserId,
        deletion_mode: 'system_only',
        deletion_status: 'completed',
        deletion_reason: 'gpt_marketing_delete_post',
        remote_deletion_status: 'not_applicable',
        publication_status: 'deleted',
        editorial_status: 'cancelled',
        status: 'archived',
        scheduled_at: null,
        updated_at: now,
      })
      .eq('id', input.postId)
      .eq('tenant_id', input.tenantId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle()

    if (updateError)
      throw new BlimberMcpError('DB_ERROR', updateError.message, 400)
    if (!data)
      throw new BlimberMcpError('NOT_FOUND', 'Publicação não encontrada', 404)
  }

  return {
    dryRun: false as const,
    kind: 'editorial' as const,
    deleted: true,
    deleteMode: 'soft' as const,
    post: preview,
  }
}

function mapAssetPreview(asset: Record<string, any>) {
  return {
    id: String(asset.id),
    name: String(asset.name || ''),
    mimeType: asset.mime_type ?? null,
    purpose: asset.purpose ?? null,
    sizeBytes: asset.size_bytes ?? null,
    objectPath: asset.object_path ?? null,
    createdAt: asset.created_at ?? null,
  }
}

type LinkedPostRef = { id: string, title: string }

async function fetchAssetLinkedPosts(
  ctx: BlimberMcpToolContext,
  tenantId: string,
  assetId: string,
): Promise<LinkedPostRef[]> {
  const { data, error } = await ctx.client
    .from('social_post_assets')
    .select(LINKED_POSTS_EMBED_SELECT)
    .eq('tenant_id', tenantId)
    .eq('asset_id', assetId)

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)

  const seen = new Set<string>()
  const linked: LinkedPostRef[] = []
  for (const row of data || []) {
    const post = (row as any).social_posts
    if (!post?.id)
      continue
    const id = String(post.id)
    if (seen.has(id))
      continue
    seen.add(id)
    linked.push({
      id,
      title: String(post.title || ''),
    })
  }
  return linked
}

/**
 * Hard-delete of one media asset (storage object + DB row).
 * Blocks deletion when linked via social_post_assets (same rule as Hub UI).
 */
export async function marketingDeleteAsset(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingDeleteAssetSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)

  const { data: asset, error } = await ctx.client
    .from('media_assets')
    .select('id, name, mime_type, purpose, size_bytes, object_path, bucket, tenant_id, created_at, status')
    .eq('id', input.assetId)
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!asset)
    throw new BlimberMcpError('NOT_FOUND', 'Mídia não encontrada', 404)
  if (String(asset.tenant_id) !== input.tenantId) {
    throw new BlimberMcpError(
      'FORBIDDEN',
      'Mídia pertence a outro tenant.',
      403,
    )
  }

  const linkedPosts = await fetchAssetLinkedPosts(ctx, input.tenantId, input.assetId)
  const preview = mapAssetPreview(asset)

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'media_asset' as const,
      deleteMode: 'hard' as const,
      preview,
      linkedPosts,
      linkedPostsCount: linkedPosts.length,
      canDelete: linkedPosts.length === 0,
      notes: [
        'Remove o arquivo do bucket marketing-assets e o registro em media_assets.',
        linkedPosts.length
          ? 'Não será possível excluir: mídia vinculada a publicações (veja linkedPosts).'
          : 'Nenhum vínculo com posts — seguro para excluir após confirmação.',
        'Reenvie com dryRun=false após confirmação.',
        `Hub: ${MARKETING_LIBRARY_URL}`,
      ],
    }
  }

  if (linkedPosts.length) {
    throw new BlimberMcpError(
      'ASSET_IN_USE',
      'Esta mídia está vinculada a publicações. Remova o vínculo antes de excluir.',
      409,
      { linkedPosts, linkedPostsCount: linkedPosts.length },
    )
  }

  const { data: derivatives } = await ctx.client
    .from('media_asset_derivatives')
    .select('object_path')
    .eq('tenant_id', input.tenantId)
    .eq('asset_id', input.assetId)

  const { error: deleteError } = await ctx.client
    .from('media_assets')
    .delete()
    .eq('tenant_id', input.tenantId)
    .eq('id', input.assetId)

  if (deleteError)
    throw new BlimberMcpError('DB_ERROR', deleteError.message, 400)

  const bucket = asset.bucket || 'marketing-assets'
  const paths = [asset.object_path, ...(derivatives || []).map((d: any) => d.object_path)].filter(Boolean)
  if (paths.length && ctx.client.storage) {
    const { error: storageError } = await ctx.client.storage.from(bucket).remove(paths)
    if (storageError) {
      throw new BlimberMcpError(
        'STORAGE_ERROR',
        storageError.message,
        500,
      )
    }
  }

  return {
    dryRun: false as const,
    deleted: true,
    deleteMode: 'hard' as const,
    asset: preview,
    removedPaths: paths,
  }
}

export async function marketingListCampaigns(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingListCampaignsSchema.parse(raw)
  const limit = input.limit ?? 50

  let request = ctx.client
    .from('social_campaigns')
    .select('*', { count: 'exact' })
    .eq('tenant_id', input.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.status && input.status !== 'all')
    request = request.eq('status', input.status)
  if (input.search)
    request = request.ilike('name', `%${input.search.trim()}%`)

  const { data, error, count } = await request
  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)

  const campaignIds = (data || []).map((row: any) => row.id)
  const counts = new Map<string, number>()
  if (campaignIds.length) {
    const { data: posts } = await ctx.client
      .from('social_posts')
      .select('id, campaign_id')
      .eq('tenant_id', input.tenantId)
      .in('campaign_id', campaignIds)
      .is('deleted_at', null)
    for (const post of posts || []) {
      const key = String(post.campaign_id)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }

  return {
    tenantId: input.tenantId,
    kind: 'editorial' as const,
    entity: 'social_campaigns',
    note: 'Campanhas EDITORIAIS (calendário/social). Para Ads pagos Meta use as tools meta_*.',
    hubUrl: MARKETING_CAMPAIGNS_URL,
    campaigns: (data || []).map((row: any) =>
      mapCampaignRow(row, counts.get(String(row.id)) || 0),
    ),
    total: count || 0,
  }
}

export async function marketingGetCampaign(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingGetCampaignSchema.parse(raw)
  const { data: campaign, error } = await ctx.client
    .from('social_campaigns')
    .select('*')
    .eq('id', input.campaignId)
    .eq('tenant_id', input.tenantId)
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!campaign)
    throw new BlimberMcpError('NOT_FOUND', 'Campanha editorial não encontrada', 404)

  const { data: posts } = await ctx.client
    .from('social_posts')
    .select('id, title, status, editorial_status, publication_status, scheduled_at')
    .eq('tenant_id', input.tenantId)
    .eq('campaign_id', input.campaignId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return {
    tenantId: input.tenantId,
    kind: 'editorial' as const,
    campaign: mapCampaignRow(campaign, (posts || []).length),
    posts: (posts || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      editorialStatus: p.editorial_status,
      publicationStatus: p.publication_status,
      scheduledAt: p.scheduled_at,
      hubUrl: `${MARKETING_CONTENT_URL}/${p.id}`,
    })),
  }
}

export async function marketingCreateCampaign(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingCreateCampaignSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const actorUserId = dryRun
    ? resolveOptionalActorUserId(ctx, input.actorUserId)
    : await requireActorUserId(ctx, input.actorUserId)

  const insertPayload = {
    tenant_id: input.tenantId,
    name: input.name,
    objective: input.objective,
    status: input.status,
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
    briefing_summary: input.briefingSummary,
    created_by: actorUserId,
    metadata: { source: 'blimber_mcp' },
  }

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'social_campaign',
      kind: 'editorial' as const,
      preview: insertPayload,
      notes: [
        'Campanha EDITORIAL (social_campaigns) — NÃO é Meta Ads / marketing_campaigns paid.',
        'Para campanha paga Meta use meta_create_campaign.',
        'Reenvie com dryRun=false após confirmação.',
        actorPreviewNote(actorUserId),
      ],
    }
  }

  const { data, error } = await ctx.client
    .from('social_campaigns')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error)
    throwWriteError(error)

  return {
    dryRun: false as const,
    kind: 'editorial' as const,
    campaign: mapCampaignRow(data, 0),
  }
}

export async function marketingUpdateCampaign(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingUpdateCampaignSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)

  const { data: existing } = await ctx.client
    .from('social_campaigns')
    .select('*')
    .eq('id', input.campaignId)
    .eq('tenant_id', input.tenantId)
    .maybeSingle()

  if (!existing)
    throw new BlimberMcpError('NOT_FOUND', 'Campanha editorial não encontrada', 404)

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (input.name !== undefined)
    updatePayload.name = input.name
  if (input.objective !== undefined)
    updatePayload.objective = input.objective
  if (input.status !== undefined)
    updatePayload.status = input.status
  if (input.startsAt !== undefined)
    updatePayload.starts_at = input.startsAt
  if (input.endsAt !== undefined)
    updatePayload.ends_at = input.endsAt
  if (input.briefingSummary !== undefined)
    updatePayload.briefing_summary = input.briefingSummary

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'social_campaign',
      kind: 'editorial' as const,
      before: mapCampaignRow(existing),
      afterPreview: updatePayload,
      notes: ['Reenvie com dryRun=false após confirmação.'],
    }
  }

  const { data, error } = await ctx.client
    .from('social_campaigns')
    .update(updatePayload)
    .eq('id', input.campaignId)
    .eq('tenant_id', input.tenantId)
    .select('*')
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!data)
    throw new BlimberMcpError('NOT_FOUND', 'Campanha editorial não encontrada', 404)

  return {
    dryRun: false as const,
    kind: 'editorial' as const,
    campaign: mapCampaignRow(data),
  }
}

type MarketingHandler = (ctx: BlimberMcpToolContext, raw: unknown) => Promise<unknown>

export const MARKETING_TOOL_HANDLERS: Record<MarketingToolName, MarketingHandler> = {
  marketing_list_social_accounts: marketingListSocialAccounts,
  marketing_list_assets: marketingListAssets,
  marketing_get_brand_context: marketingGetBrandContext,
  marketing_list_posts: marketingListPosts,
  marketing_get_post: marketingGetPost,
  marketing_create_post: marketingCreatePost,
  marketing_update_post: marketingUpdatePost,
  marketing_delete_post: marketingDeletePost,
  marketing_delete_asset: marketingDeleteAsset,
  marketing_list_campaigns: marketingListCampaigns,
  marketing_get_campaign: marketingGetCampaign,
  marketing_create_campaign: marketingCreateCampaign,
  marketing_update_campaign: marketingUpdateCampaign,
}

export async function invokeMarketingTool(
  name: MarketingToolName,
  ctx: BlimberMcpToolContext,
  args: Record<string, unknown>,
) {
  const handler = MARKETING_TOOL_HANDLERS[name]
  if (!handler)
    throw new BlimberMcpError('UNKNOWN_TOOL', `Tool desconhecida: ${name}`, 404)
  return handler(ctx, args)
}
