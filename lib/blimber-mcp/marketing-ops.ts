import { z } from 'zod'
import { fetchBrandGuideForTenant } from '~/server/utils/brand-guide'
import {
  listPostSchedules,
  syncPostNextScheduledAt,
} from '~/server/utils/marketing-schedules'
import { createBriefingLink } from '~/server/utils/social-briefing-links'
import { createReviewLink, DEFAULT_REVIEW_ACTIONS } from '~/server/utils/social-review-links'
import { listEligibleSocialApprovers } from '~/server/utils/social-approvers'
import {
  mapMarketingPostSchedule,
  MARKETING_POST_SCHEDULE_STATUSES,
} from '~/types/marketing-schedules'
import {
  assertBlimberWriteConfirmation,
  blimberWriteConfirmationFields,
  blimberWriteDryRunField,
  resolveDryRun,
} from './confirm'
import { BlimberMcpError } from './errors'
import {
  assertMcpCapability,
  mapH3LikeToMcp,
  resolveMcpEditorialActor,
} from './marketing-editorial'
import type { BlimberMcpToolContext } from './types'
import {
  MARKETING_APP_ORIGIN,
  MARKETING_APPROVALS_URL,
  MARKETING_BRAND_URL,
  MARKETING_BRIEFINGS_URL,
  MARKETING_CALENDAR_URL,
  MARKETING_CONTENT_URL,
} from './types'

const uuid = z.string().uuid()
const tenantIdField = z.string().uuid().describe('UUID do tenant (cliente).')
const platformEnum = z.enum(['facebook', 'instagram', 'linkedin'])
const formatEnum = z.enum(['static', 'carousel', 'video', 'story'])
const scheduleStatusEnum = z.enum(MARKETING_POST_SCHEDULE_STATUSES)

type MarketingHandler = (ctx: BlimberMcpToolContext, raw: unknown) => Promise<unknown>

async function requireWriteActor(
  ctx: BlimberMcpToolContext,
  tenantId: string,
  actorUserId: string | undefined,
  capabilities: string[],
  message: string,
) {
  const actor = await resolveMcpEditorialActor(ctx, tenantId, actorUserId)
  assertMcpCapability(actor, capabilities, message)
  return actor
}

// --- Schemas ---

export const marketingListApprovalsSchema = z.object({
  tenantId: tenantIdField,
  status: z.enum(['pending', 'approved', 'changes_requested', 'rejected', 'cancelled', 'all']).optional(),
  stage: z.enum(['internal', 'client']).optional(),
  limit: z.number().int().min(1).max(200).optional(),
})

export const marketingListApproversSchema = z.object({
  tenantId: tenantIdField,
})

export const marketingListCalendarSchema = z.object({
  tenantId: tenantIdField,
  start: z.string().min(1).max(40).describe('ISO início do intervalo.'),
  end: z.string().min(1).max(40).describe('ISO fim do intervalo.'),
  campaignId: uuid.optional(),
  platform: platformEnum.optional(),
})

export const marketingUpdateBrandSchema = z.object({
  tenantId: tenantIdField,
  toneOfVoice: z.string().max(5000).optional(),
  audience: z.string().max(5000).optional(),
  allowedWords: z.array(z.string().max(80)).max(100).optional(),
  forbiddenWords: z.array(z.string().max(80)).max(100).optional(),
  ctas: z.array(z.string().max(200)).max(50).optional(),
  hashtags: z.array(z.string().max(80)).max(100).optional(),
  restrictions: z.string().max(5000).optional(),
  legalNotes: z.string().max(5000).optional(),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export const marketingCreateReviewLinkSchema = z.object({
  tenantId: tenantIdField,
  requestId: uuid,
  expiresInHours: z.number().int().min(1).max(720).optional(),
  maxUses: z.number().int().min(1).max(1000).nullable().optional(),
  allowedActions: z.array(z.enum(['approve', 'changes_requested', 'reject', 'comment'])).max(4).optional(),
  afterDecision: z.enum(['read_only', 'invalidate']).optional(),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export const marketingListBriefingsSchema = z.object({
  tenantId: tenantIdField,
  status: z.string().max(40).optional(),
})

export const marketingCreateBriefingLinkSchema = z.object({
  tenantId: tenantIdField,
  title: z.string().trim().max(180).optional(),
  campaignId: uuid.nullable().optional(),
  expiresInHours: z.number().int().min(1).max(720).optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export const marketingListWorkflowsSchema = z.object({
  tenantId: tenantIdField,
})

export const marketingCreateCalendarSlotSchema = z.object({
  tenantId: tenantIdField,
  postId: uuid,
  scheduledAt: z.string().min(1).max(80),
  timezone: z.string().min(1).max(80).default('America/Sao_Paulo'),
  variantId: uuid.nullable().optional(),
  platform: platformEnum.nullable().optional(),
  format: formatEnum.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export const marketingUpdateCalendarSlotSchema = z.object({
  tenantId: tenantIdField,
  scheduleId: uuid,
  scheduledAt: z.string().min(1).max(80).optional(),
  timezone: z.string().min(1).max(80).optional(),
  variantId: uuid.nullable().optional(),
  platform: platformEnum.nullable().optional(),
  format: formatEnum.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  status: scheduleStatusEnum.optional(),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export const marketingDeleteCalendarSlotSchema = z.object({
  tenantId: tenantIdField,
  scheduleId: uuid,
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export type MarketingHubOpsToolName =
  | 'marketing_list_approvals'
  | 'marketing_list_approvers'
  | 'marketing_list_calendar'
  | 'marketing_update_brand'
  | 'marketing_create_review_link'
  | 'marketing_list_briefings'
  | 'marketing_create_briefing_link'
  | 'marketing_list_workflows'
  | 'marketing_create_calendar_slot'
  | 'marketing_update_calendar_slot'
  | 'marketing_delete_calendar_slot'

export const MARKETING_HUB_OPS_DESCRIPTIONS: Record<MarketingHubOpsToolName, string> = {
  marketing_list_approvals: 'Lista solicitações de aprovação (approval_requests) do tenant. Decida com marketing_approve_post.',
  marketing_list_approvers: 'Lista aprovadores elegíveis do tenant (IDs para submitPost.approverIds). Sem tokens.',
  marketing_list_calendar: 'Calendário editorial (marketing_post_schedules) no intervalo start/end — mesmo feed do Hub.',
  marketing_update_brand: 'Atualiza Brand Center (tom, CTAs, restrições). dryRun default true.',
  marketing_create_review_link: 'Gera link mágico de aprovação. dryRun default true. Token só na resposta — nunca logar.',
  marketing_list_briefings: 'Lista briefings do cliente (social_briefings) do tenant.',
  marketing_create_briefing_link: 'Cria briefing + link para o cliente preencher. dryRun default true. Token só na resposta.',
  marketing_list_workflows: 'Lista fluxos de aprovação (system + tenant) e settings. Use workflowId em submitPost.',
  marketing_create_calendar_slot: 'Cria slot planejado no calendário editorial. dryRun default true. Não publica.',
  marketing_update_calendar_slot: 'Atualiza slot do calendário (data/status/notas). dryRun default true.',
  marketing_delete_calendar_slot: 'Cancela slot do calendário (soft). dryRun default true. Não remove das redes.',
}

export const MARKETING_HUB_OPS_SCHEMAS = {
  marketing_list_approvals: marketingListApprovalsSchema,
  marketing_list_approvers: marketingListApproversSchema,
  marketing_list_calendar: marketingListCalendarSchema,
  marketing_update_brand: marketingUpdateBrandSchema,
  marketing_create_review_link: marketingCreateReviewLinkSchema,
  marketing_list_briefings: marketingListBriefingsSchema,
  marketing_create_briefing_link: marketingCreateBriefingLinkSchema,
  marketing_list_workflows: marketingListWorkflowsSchema,
  marketing_create_calendar_slot: marketingCreateCalendarSlotSchema,
  marketing_update_calendar_slot: marketingUpdateCalendarSlotSchema,
  marketing_delete_calendar_slot: marketingDeleteCalendarSlotSchema,
} as const

// --- Handlers ---

export async function marketingListApprovals(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingListApprovalsSchema.parse(raw)
  const limit = input.limit ?? 80

  let request = ctx.client
    .from('approval_requests')
    .select('id, tenant_id, post_id, status, run_status, stage, due_at, created_at, requested_by, version_id, workflow_id')
    .eq('tenant_id', input.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.status && input.status !== 'all')
    request = request.eq('run_status', input.status)
  if (input.stage)
    request = request.eq('stage', input.stage)

  const { data, error } = await request
  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)

  const rows = data || []
  const postIds = [...new Set(rows.map((row: any) => String(row.post_id)).filter(Boolean))]
  const requestIds = rows.map((row: any) => String(row.id))

  const postsById = new Map<string, any>()
  if (postIds.length) {
    const { data: posts } = await ctx.client
      .from('social_posts')
      .select('id, title, editorial_status, publication_status, scheduled_at')
      .eq('tenant_id', input.tenantId)
      .in('id', postIds)
    for (const post of posts || [])
      postsById.set(String(post.id), post)
  }

  const approversByRequest = new Map<string, string[]>()
  if (requestIds.length) {
    const { data: approvers } = await ctx.client
      .from('approval_request_approvers')
      .select('request_id, user_id')
      .eq('tenant_id', input.tenantId)
      .in('request_id', requestIds)
    for (const row of approvers || []) {
      const key = String(row.request_id)
      const list = approversByRequest.get(key) || []
      list.push(String(row.user_id))
      approversByRequest.set(key, list)
    }
  }

  return {
    tenantId: input.tenantId,
    hubUrl: MARKETING_APPROVALS_URL,
    note: 'Para decidir use marketing_approve_post (requestId + decision). Para enviar rascunho: marketing_submit_post.',
    approvals: rows.map((row: any) => {
      const post = postsById.get(String(row.post_id))
      return {
        id: String(row.id),
        postId: String(row.post_id),
        title: post?.title || 'Sem título',
        status: row.status,
        runStatus: row.run_status,
        stage: row.stage || 'client',
        dueAt: row.due_at ?? null,
        createdAt: row.created_at ?? null,
        requestedBy: row.requested_by ?? null,
        approverIds: approversByRequest.get(String(row.id)) || [],
        editorialStatus: post?.editorial_status ?? null,
        scheduledAt: post?.scheduled_at ?? null,
        hubUrl: `${MARKETING_CONTENT_URL}/${row.post_id}`,
      }
    }),
  }
}

export async function marketingListApprovers(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingListApproversSchema.parse(raw)
  try {
    const approvers = await listEligibleSocialApprovers(ctx.client, input.tenantId)
    return {
      tenantId: input.tenantId,
      note: 'Use userId em submitPost.approverIds (stage client).',
      approvers: approvers.map(item => ({
        userId: item.userId,
        name: item.name,
        email: item.email,
        role: item.role,
        isPlatformAdmin: item.isPlatformAdmin,
      })),
    }
  }
  catch (error) {
    mapH3LikeToMcp(error, 'Falha ao listar aprovadores')
  }
}

export async function marketingListCalendar(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingListCalendarSchema.parse(raw)

  let scheduleQuery = ctx.client
    .from('marketing_post_schedules')
    .select('id, post_id, variant_id, platform, format, scheduled_at, timezone, status, notes')
    .eq('tenant_id', input.tenantId)
    .neq('status', 'cancelled')
    .gte('scheduled_at', input.start)
    .lte('scheduled_at', input.end)
    .order('scheduled_at', { ascending: true })
    .limit(500)

  if (input.platform)
    scheduleQuery = scheduleQuery.eq('platform', input.platform)

  const { data: scheduleRows, error: scheduleError } = await scheduleQuery
  if (scheduleError)
    throw new BlimberMcpError('DB_ERROR', scheduleError.message, 400)

  const postIds = [...new Set((scheduleRows || []).map((row: any) => String(row.post_id)))]
  if (!postIds.length) {
    return {
      tenantId: input.tenantId,
      hubUrl: MARKETING_CALENDAR_URL,
      occurrences: [],
    }
  }

  let postsQuery = ctx.client
    .from('social_posts')
    .select('id, title, editorial_status, publication_status, campaign_id, scheduled_at')
    .eq('tenant_id', input.tenantId)
    .in('id', postIds)
    .is('deleted_at', null)

  if (input.campaignId)
    postsQuery = postsQuery.eq('campaign_id', input.campaignId)

  const { data: posts, error: postsError } = await postsQuery
  if (postsError)
    throw new BlimberMcpError('DB_ERROR', postsError.message, 400)

  const postsById = new Map((posts || []).map((post: any) => [String(post.id), post]))

  const occurrences = (scheduleRows || []).flatMap((row: any) => {
    const post = postsById.get(String(row.post_id))
    if (!post)
      return []
    return [{
      occurrenceId: String(row.id),
      scheduleId: String(row.id),
      postId: String(row.post_id),
      title: String(post.title || 'Sem título'),
      scheduledAt: String(row.scheduled_at),
      timezone: row.timezone || 'America/Sao_Paulo',
      platform: row.platform || null,
      format: row.format || null,
      scheduleStatus: row.status || null,
      editorialStatus: post.editorial_status ?? null,
      publicationStatus: post.publication_status ?? null,
      campaignId: post.campaign_id ?? null,
      hubUrl: `${MARKETING_CONTENT_URL}/${row.post_id}`,
    }]
  })

  return {
    tenantId: input.tenantId,
    hubUrl: MARKETING_CALENDAR_URL,
    occurrences,
  }
}

export async function marketingUpdateBrand(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingUpdateBrandSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)

  const existing = await fetchBrandGuideForTenant(ctx.client as any, input.tenantId)
  const patch = {
    toneOfVoice: input.toneOfVoice,
    audience: input.audience,
    allowedWords: input.allowedWords,
    forbiddenWords: input.forbiddenWords,
    ctas: input.ctas,
    hashtags: input.hashtags,
    restrictions: input.restrictions,
    legalNotes: input.legalNotes,
  }
  const hasPatch = Object.values(patch).some(value => value !== undefined)
  if (!hasPatch) {
    throw new BlimberMcpError(
      'EMPTY_UPDATE',
      'Informe ao menos um campo de marca (toneOfVoice, audience, ctas, hashtags, restrictions…).',
      400,
    )
  }

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'social_brand_guide' as const,
      before: {
        toneOfVoice: existing.toneOfVoice,
        audience: existing.audience,
        ctas: existing.ctas,
        hashtags: existing.hashtags,
        restrictions: existing.restrictions,
      },
      afterPreview: patch,
      notes: [
        'Atualiza social_brand_guides (Brand Center). Campos visuais/cores ficam no Hub.',
        'Reenvie com dryRun=false após confirmação.',
        `Hub: ${MARKETING_BRAND_URL}`,
      ],
    }
  }

  const actor = await requireWriteActor(
    ctx,
    input.tenantId,
    input.actorUserId,
    ['marketing.social.brand_guide.manage'],
    'Sem permissão para editar o Brand Center.',
  )

  const payload = {
    tenant_id: input.tenantId,
    tone_of_voice: input.toneOfVoice ?? existing.toneOfVoice ?? '',
    audience: input.audience ?? existing.audience ?? '',
    allowed_words: input.allowedWords ?? existing.allowedWords ?? [],
    forbidden_words: input.forbiddenWords ?? existing.forbiddenWords ?? [],
    ctas: input.ctas ?? existing.ctas ?? [],
    hashtags: input.hashtags ?? existing.hashtags ?? [],
    colors: existing.colors ?? [],
    fonts: existing.fonts ?? [],
    products: existing.products ?? [],
    competitors: existing.competitors ?? [],
    restrictions: input.restrictions ?? existing.restrictions ?? '',
    legal_notes: input.legalNotes ?? existing.legalNotes ?? '',
    logo_asset_ids: existing.logoAssetIds ?? [],
    metadata: existing.metadata ?? {},
    updated_by: actor.userId,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await ctx.client
    .from('social_brand_guides')
    .upsert(payload, { onConflict: 'tenant_id' })
    .select('id, tenant_id, tone_of_voice, audience, updated_at')
    .single()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)

  return {
    dryRun: false as const,
    updated: true,
    entity: 'social_brand_guide' as const,
    hubUrl: MARKETING_BRAND_URL,
    brand: {
      id: data?.id ?? null,
      toneOfVoice: data?.tone_of_voice ?? payload.tone_of_voice,
      audience: data?.audience ?? payload.audience,
      updatedAt: data?.updated_at ?? payload.updated_at,
    },
  }
}

export async function marketingCreateReviewLink(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingCreateReviewLinkSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)

  const { data: request, error } = await ctx.client
    .from('approval_requests')
    .select('id, tenant_id, post_id, status, run_status, stage')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.requestId)
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!request)
    throw new BlimberMcpError('NOT_FOUND', 'Solicitação não encontrada', 404)

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'social_review_link' as const,
      preview: {
        requestId: input.requestId,
        postId: request.post_id,
        stage: request.stage,
        expiresInHours: input.expiresInHours ?? 168,
        allowedActions: input.allowedActions?.length ? input.allowedActions : DEFAULT_REVIEW_ACTIONS,
      },
      notes: [
        'Gera /review/{token} para o cliente aprovar sem login no Hub.',
        'O token plaintext só aparece no execute — nunca registrar em log.',
        'Reenvie com dryRun=false após confirmação.',
      ],
    }
  }

  const actor = await requireWriteActor(
    ctx,
    input.tenantId,
    input.actorUserId,
    ['marketing.social.review_link.create', 'marketing.social.manage'],
    'Sem permissão para gerar link mágico.',
  )

  const { data: orgLink } = await ctx.client
    .from('organization_tenants')
    .select('organization_id')
    .eq('tenant_id', input.tenantId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  try {
    const created = await createReviewLink(ctx.client, {
      tenantId: input.tenantId,
      organizationId: orgLink?.organization_id || null,
      approvalRequestId: input.requestId,
      userId: actor.userId,
      expiresInHours: input.expiresInHours,
      maxUses: input.maxUses,
      allowedActions: input.allowedActions?.length ? input.allowedActions : DEFAULT_REVIEW_ACTIONS,
      afterDecision: input.afterDecision,
    })

    return {
      dryRun: false as const,
      created: true,
      entity: 'social_review_link' as const,
      reviewLink: {
        id: created.id,
        url: `${MARKETING_APP_ORIGIN}${created.path}`,
        path: created.path,
        expiresAt: created.expiresAt,
        allowedActions: created.allowedActions,
        afterDecision: created.afterDecision,
        maxUses: created.maxUses,
        token: created.token,
      },
    }
  }
  catch (error) {
    mapH3LikeToMcp(error, 'Falha ao gerar link mágico')
  }
}

export async function marketingListBriefings(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingListBriefingsSchema.parse(raw)

  let request = ctx.client
    .from('social_briefings')
    .select('id, title, status, client_email, submitted_at, post_id, campaign_id, created_at, needs_info_message')
    .eq('tenant_id', input.tenantId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (input.status && input.status !== 'all')
    request = request.eq('status', input.status)

  const { data, error } = await request
  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)

  return {
    tenantId: input.tenantId,
    hubUrl: MARKETING_BRIEFINGS_URL,
    briefings: (data || []).map((row: any) => ({
      id: String(row.id),
      title: row.title,
      status: row.status,
      clientEmail: row.client_email ?? null,
      submittedAt: row.submitted_at ?? null,
      postId: row.post_id ?? null,
      campaignId: row.campaign_id ?? null,
      createdAt: row.created_at ?? null,
    })),
  }
}

export async function marketingCreateBriefingLink(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingCreateBriefingLinkSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'social_briefing_link' as const,
      preview: {
        title: input.title || 'Novo briefing',
        campaignId: input.campaignId || null,
        expiresInHours: input.expiresInHours ?? 168,
      },
      notes: [
        'Cria social_briefings + link /briefing/{token} para o cliente.',
        'Token plaintext só no execute — nunca logar.',
        'Reenvie com dryRun=false após confirmação.',
      ],
    }
  }

  const actor = await requireWriteActor(
    ctx,
    input.tenantId,
    input.actorUserId,
    ['marketing.social.briefing.create', 'marketing.social.briefing.manage'],
    'Sem permissão para criar briefing.',
  )

  const { data: orgLink } = await ctx.client
    .from('organization_tenants')
    .select('organization_id')
    .eq('tenant_id', input.tenantId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  try {
    const created = await createBriefingLink(ctx.client, {
      tenantId: input.tenantId,
      organizationId: orgLink?.organization_id || null,
      userId: actor.userId,
      title: input.title,
      campaignId: input.campaignId,
      expiresInHours: input.expiresInHours,
      maxUses: input.maxUses,
    })

    return {
      dryRun: false as const,
      created: true,
      entity: 'social_briefing_link' as const,
      briefingLink: {
        id: created.id,
        briefingId: created.briefingId,
        url: `${MARKETING_APP_ORIGIN}${created.urlPath}`,
        path: created.urlPath,
        expiresAt: created.expiresAt,
        maxUses: created.maxUses,
        token: created.token,
      },
    }
  }
  catch (error) {
    mapH3LikeToMcp(error, 'Falha ao criar link de briefing')
  }
}

export async function marketingListWorkflows(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingListWorkflowsSchema.parse(raw)

  const { data: systemWorkflows, error: systemError } = await ctx.client
    .from('social_approval_workflows')
    .select('id, name, slug, is_system, is_default, is_active')
    .eq('is_system', true)
    .eq('is_active', true)
  if (systemError)
    throw new BlimberMcpError('DB_ERROR', systemError.message, 400)

  const { data: tenantWorkflows, error: tenantError } = await ctx.client
    .from('social_approval_workflows')
    .select('id, name, slug, is_system, is_default, is_active')
    .eq('tenant_id', input.tenantId)
    .eq('is_active', true)
  if (tenantError)
    throw new BlimberMcpError('DB_ERROR', tenantError.message, 400)

  const { data: orgRows } = await ctx.client
    .from('organization_tenants')
    .select('organization_id')
    .eq('tenant_id', input.tenantId)
    .eq('is_active', true)

  let orgWorkflows: any[] = []
  const organizationIds = [...new Set((orgRows || []).map((row: any) => String(row.organization_id)))]
  if (organizationIds.length) {
    const { data } = await ctx.client
      .from('social_approval_workflows')
      .select('id, name, slug, is_system, is_default, is_active')
      .in('organization_id', organizationIds)
      .is('tenant_id', null)
      .eq('is_active', true)
    orgWorkflows = data || []
  }

  const merged = new Map<string, any>()
  for (const workflow of [...(systemWorkflows || []), ...orgWorkflows, ...(tenantWorkflows || [])])
    merged.set(String(workflow.id), workflow)

  const workflowIds = [...merged.keys()]
  const stagesByWorkflow = new Map<string, any[]>()
  if (workflowIds.length) {
    const { data: stages } = await ctx.client
      .from('social_approval_workflow_stages')
      .select('id, workflow_id, position, name, stage_type')
      .in('workflow_id', workflowIds)
      .order('position', { ascending: true })
    for (const stage of stages || []) {
      const key = String(stage.workflow_id)
      const list = stagesByWorkflow.get(key) || []
      list.push({
        id: stage.id,
        position: stage.position,
        name: stage.name,
        stageType: stage.stage_type,
      })
      stagesByWorkflow.set(key, list)
    }
  }

  const { data: settings } = await ctx.client
    .from('social_approval_settings')
    .select('requires_internal_review, default_workflow_id, allow_no_approval_workflow')
    .eq('tenant_id', input.tenantId)
    .maybeSingle()

  return {
    tenantId: input.tenantId,
    settings: settings || null,
    note: 'submitPost stage=client usa simple_client. Passe workflowId para outro fluxo.',
    workflows: [...merged.values()].map(workflow => ({
      id: String(workflow.id),
      name: workflow.name,
      slug: workflow.slug,
      isSystem: Boolean(workflow.is_system),
      isDefault: Boolean(workflow.is_default),
      stages: (stagesByWorkflow.get(String(workflow.id)) || [])
        .slice()
        .sort((a, b) => Number(a.position) - Number(b.position)),
    })),
  }
}

async function loadOwnedSchedule(
  ctx: BlimberMcpToolContext,
  tenantId: string,
  scheduleId: string,
) {
  const { data, error } = await ctx.client
    .from('marketing_post_schedules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', scheduleId)
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!data || data.status === 'cancelled')
    throw new BlimberMcpError('NOT_FOUND', 'Agendamento não encontrado', 404)
  return data
}

export async function marketingCreateCalendarSlot(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingCreateCalendarSlotSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)

  const scheduledAt = new Date(input.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime()))
    throw new BlimberMcpError('INVALID_DATE', 'Data de agendamento inválida', 400)

  const { data: post, error } = await ctx.client
    .from('social_posts')
    .select('id, title')
    .eq('id', input.postId)
    .eq('tenant_id', input.tenantId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!post)
    throw new BlimberMcpError('NOT_FOUND', 'Conteúdo não encontrado', 404)

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'marketing_post_schedule' as const,
      preview: {
        postId: input.postId,
        title: post.title,
        scheduledAt: scheduledAt.toISOString(),
        timezone: input.timezone,
        platform: input.platform || null,
        status: 'planned',
      },
      notes: [
        'Cria slot planned no calendário. Não enfileira publication_jobs (use schedulePost após aprovado).',
        'Reenvie com dryRun=false após confirmação.',
        `Hub: ${MARKETING_CALENDAR_URL}`,
      ],
    }
  }

  const actor = await requireWriteActor(
    ctx,
    input.tenantId,
    input.actorUserId,
    ['marketing.social.create', 'marketing.social.schedule'],
    'Sem permissão para criar slot no calendário.',
  )

  const { data, error: insertError } = await ctx.client
    .from('marketing_post_schedules')
    .insert({
      tenant_id: input.tenantId,
      post_id: input.postId,
      variant_id: input.variantId || null,
      platform: input.platform || null,
      format: input.format || null,
      scheduled_at: scheduledAt.toISOString(),
      timezone: input.timezone,
      notes: input.notes || null,
      status: 'planned',
      created_by: actor.userId,
    })
    .select('*')
    .single()

  if (insertError)
    throw new BlimberMcpError('DB_ERROR', insertError.message, 400)

  try {
    await syncPostNextScheduledAt(ctx.client as any, input.tenantId, input.postId)
  }
  catch (error) {
    mapH3LikeToMcp(error, 'Slot criado, mas falhou sincronizar scheduled_at')
  }

  return {
    dryRun: false as const,
    created: true,
    entity: 'marketing_post_schedule' as const,
    slot: mapMarketingPostSchedule(data),
    schedules: await listPostSchedules(ctx.client as any, input.tenantId, input.postId),
  }
}

export async function marketingUpdateCalendarSlot(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingUpdateCalendarSlotSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const existing = await loadOwnedSchedule(ctx, input.tenantId, input.scheduleId)

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (input.variantId !== undefined)
    updatePayload.variant_id = input.variantId
  if (input.platform !== undefined)
    updatePayload.platform = input.platform
  if (input.format !== undefined)
    updatePayload.format = input.format
  if (input.timezone !== undefined)
    updatePayload.timezone = input.timezone
  if (input.notes !== undefined)
    updatePayload.notes = input.notes
  if (input.status !== undefined)
    updatePayload.status = input.status
  if (input.scheduledAt !== undefined) {
    const scheduledAt = new Date(input.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime()))
      throw new BlimberMcpError('INVALID_DATE', 'Data de agendamento inválida', 400)
    updatePayload.scheduled_at = scheduledAt.toISOString()
  }

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'marketing_post_schedule' as const,
      before: mapMarketingPostSchedule(existing),
      afterPreview: updatePayload,
      notes: ['Reenvie com dryRun=false após confirmação.'],
    }
  }

  await requireWriteActor(
    ctx,
    input.tenantId,
    input.actorUserId,
    ['marketing.social.create', 'marketing.social.schedule'],
    'Sem permissão para atualizar slot do calendário.',
  )

  const { data, error } = await ctx.client
    .from('marketing_post_schedules')
    .update(updatePayload)
    .eq('tenant_id', input.tenantId)
    .eq('id', input.scheduleId)
    .select('*')
    .single()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)

  try {
    await syncPostNextScheduledAt(ctx.client as any, input.tenantId, String(existing.post_id))
  }
  catch (syncError) {
    mapH3LikeToMcp(syncError, 'Slot atualizado, mas falhou sincronizar scheduled_at')
  }

  return {
    dryRun: false as const,
    updated: true,
    entity: 'marketing_post_schedule' as const,
    slot: mapMarketingPostSchedule(data),
  }
}

export async function marketingDeleteCalendarSlot(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingDeleteCalendarSlotSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const existing = await loadOwnedSchedule(ctx, input.tenantId, input.scheduleId)

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'marketing_post_schedule' as const,
      preview: mapMarketingPostSchedule(existing),
      notes: [
        'Soft-cancel (status=cancelled). Não remove o post das redes.',
        'Reenvie com dryRun=false após confirmação.',
      ],
    }
  }

  await requireWriteActor(
    ctx,
    input.tenantId,
    input.actorUserId,
    ['marketing.social.create', 'marketing.social.schedule'],
    'Sem permissão para cancelar slot do calendário.',
  )

  const { error } = await ctx.client
    .from('marketing_post_schedules')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.scheduleId)

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)

  try {
    await syncPostNextScheduledAt(ctx.client as any, input.tenantId, String(existing.post_id))
  }
  catch (syncError) {
    mapH3LikeToMcp(syncError, 'Slot cancelado, mas falhou sincronizar scheduled_at')
  }

  return {
    dryRun: false as const,
    cancelled: true,
    entity: 'marketing_post_schedule' as const,
    scheduleId: input.scheduleId,
  }
}

export const MARKETING_HUB_OPS_HANDLERS: Record<MarketingHubOpsToolName, MarketingHandler> = {
  marketing_list_approvals: marketingListApprovals,
  marketing_list_approvers: marketingListApprovers,
  marketing_list_calendar: marketingListCalendar,
  marketing_update_brand: marketingUpdateBrand,
  marketing_create_review_link: marketingCreateReviewLink,
  marketing_list_briefings: marketingListBriefings,
  marketing_create_briefing_link: marketingCreateBriefingLink,
  marketing_list_workflows: marketingListWorkflows,
  marketing_create_calendar_slot: marketingCreateCalendarSlot,
  marketing_update_calendar_slot: marketingUpdateCalendarSlot,
  marketing_delete_calendar_slot: marketingDeleteCalendarSlot,
}
