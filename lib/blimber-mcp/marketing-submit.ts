import { z } from 'zod'
import {
  startApprovalWorkflow,
  SYSTEM_WORKFLOW_IDS,
} from '~/server/utils/social-approval-domain'
import { listEligibleSocialApprovers } from '~/server/utils/social-approvers'
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
import { MARKETING_APPROVALS_URL, MARKETING_CONTENT_URL } from './types'

const uuid = z.string().uuid()
const tenantIdField = z.string().uuid().describe('UUID do tenant (cliente).')

export const submitStageEnum = z.enum(['client', 'internal'])

export const marketingSubmitPostSchema = z.object({
  tenantId: tenantIdField,
  postId: uuid,
  /** Client (or internal) approvers. From marketing_list_approvers. Required for simple client workflow. */
  approverIds: z.array(uuid).max(100).default([]),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  workflowId: uuid.nullable().optional(),
  /** client (default) = simple_client workflow. internal = agency_internal_client. Ignored when workflowId is set. */
  stage: submitStageEnum.default('client'),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export type MarketingSubmitPostInput = z.infer<typeof marketingSubmitPostSchema>

export function resolveSubmitWorkflowId(input: {
  stage: z.infer<typeof submitStageEnum>
  workflowId?: string | null
}): string {
  if (input.workflowId)
    return input.workflowId
  return input.stage === 'internal'
    ? SYSTEM_WORKFLOW_IDS.agencyInternalClient
    : SYSTEM_WORKFLOW_IDS.simpleClient
}

async function loadSubmitPost(
  ctx: BlimberMcpToolContext,
  tenantId: string,
  postId: string,
) {
  const { data: post, error } = await ctx.client
    .from('social_posts')
    .select('id, title, editorial_status, publication_status, tenant_id, deleted_at, campaign_id')
    .eq('tenant_id', tenantId)
    .eq('id', postId)
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!post)
    throw new BlimberMcpError('NOT_FOUND', 'Publicação não encontrada', 404)
  if (post.deleted_at)
    throw new BlimberMcpError('GONE', 'Publicação excluída não pode ser enviada', 409)

  const editorial = String(post.editorial_status || 'draft')
  if (['internal_review', 'client_review'].includes(editorial)) {
    throw new BlimberMcpError(
      'ALREADY_IN_REVIEW',
      'Esta publicação já está em aprovação.',
      409,
    )
  }
  if (editorial === 'approved') {
    throw new BlimberMcpError(
      'ALREADY_APPROVED',
      'Esta publicação já foi aprovada. Use schedulePost / publishPost.',
      409,
    )
  }

  return post
}

async function assertApproversEligibleForTenant(
  ctx: BlimberMcpToolContext,
  tenantId: string,
  approverIds: string[],
) {
  const unique = [...new Set(approverIds.filter(Boolean))]
  if (!unique.length)
    return unique

  try {
    const eligible = await listEligibleSocialApprovers(ctx.client, tenantId)
    const allowed = new Set(eligible.map(approver => approver.userId))
    if (unique.some(id => !allowed.has(id))) {
      throw new BlimberMcpError(
        'INVALID_APPROVER',
        'Um dos usuários selecionados não possui permissão para aprovar.',
        400,
      )
    }
  }
  catch (error) {
    if (error instanceof BlimberMcpError)
      throw error
    mapH3LikeToMcp(error, 'Falha ao validar aprovadores')
  }

  return unique
}

function mapSubmitPost(row: Record<string, any>) {
  return {
    kind: 'editorial' as const,
    entity: 'social_post',
    id: String(row.id),
    title: String(row.title || ''),
    editorialStatus: row.editorial_status ?? null,
    publicationStatus: row.publication_status ?? null,
    campaignId: row.campaign_id ?? null,
    hubUrl: `${MARKETING_CONTENT_URL}/${row.id}`,
  }
}

export async function marketingSubmitPost(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingSubmitPostSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const post = await loadSubmitPost(ctx, input.tenantId, input.postId)
  const workflowId = resolveSubmitWorkflowId({
    stage: input.stage,
    workflowId: input.workflowId,
  })

  if (dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      entity: 'approval_request' as const,
      kind: 'editorial' as const,
      action: 'submit' as const,
      stage: input.stage,
      workflowId,
      approverIds: input.approverIds,
      dueAt: input.dueAt || null,
      before: mapSubmitPost(post),
      notes: [
        input.stage === 'client'
          ? 'Envia para aprovação do CLIENTE (workflow simple_client, editorial_status=client_review).'
          : 'Envia para revisão INTERNA primeiro (workflow agency_internal_client).',
        'Usa startApprovalWorkflow do Hub — não grava editorial_status direto.',
        input.approverIds.length
          ? `${input.approverIds.length} aprovador(es) explícito(s).`
          : 'Sem approverIds: o Hub tenta os assignees do estágio. No fluxo simple_client isso costuma falhar — liste via listApprovers.',
        'Reenvie com dryRun=false após confirmação.',
        `Hub: ${MARKETING_APPROVALS_URL}`,
      ],
    }
  }

  const actor = await resolveMcpEditorialActor(ctx, input.tenantId, input.actorUserId)
  assertMcpCapability(
    actor,
    ['marketing.social.approval.submit', 'marketing.social.create'],
    'Sem permissão para enviar para aprovação.',
  )

  let approverIds = [...new Set(input.approverIds.filter(Boolean))]
  if (approverIds.length && !actor.isPlatformStaff)
    approverIds = await assertApproversEligibleForTenant(ctx, input.tenantId, approverIds)

  try {
    const result = await startApprovalWorkflow(ctx.client, {
      tenantId: input.tenantId,
      postId: input.postId,
      userId: actor.userId,
      approverIds,
      dueAt: input.dueAt,
      workflowId,
      capabilities: actor.capabilities,
      isPlatformStaff: actor.isPlatformStaff,
    })

    const { data: updated } = await ctx.client
      .from('social_posts')
      .select('id, title, editorial_status, publication_status, tenant_id, campaign_id')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.postId)
      .maybeSingle()

    return {
      dryRun: false as const,
      kind: 'editorial' as const,
      action: 'submit' as const,
      stage: input.stage,
      mode: result.mode,
      workflowId: result.workflowId,
      versionId: result.versionId,
      requestId: result.request?.id ? String(result.request.id) : null,
      requestStage: result.request?.stage ?? null,
      post: mapSubmitPost(updated || post),
      hubUrl: MARKETING_APPROVALS_URL,
    }
  }
  catch (error) {
    mapH3LikeToMcp(error, 'Falha ao enviar para aprovação')
  }
}
