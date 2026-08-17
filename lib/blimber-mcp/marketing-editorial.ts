import { z } from 'zod'
import { isGlobalStaffFromJwt } from '~/constants/roles'
import { ALL_WORKSPACE_CAPABILITIES, holdsCapability } from '~/constants/workspace'
import { createBlimberServiceRoleClient } from '~/server/utils/blimber-service-client'
import { resolveEffectiveCapabilities } from '~/server/utils/resolve-capabilities'
import {
  bypassApproval,
  cancelApprovalRun,
  submitApprovalDecision,
  type DecisionValue,
} from '~/server/utils/social-approval-domain'
import { resolveMcpActorUserId } from './auth'
import { BlimberMcpError } from './errors'
import type { BlimberMcpToolContext } from './types'

const uuid = z.string().uuid()

export const editorialDecisionEnum = z.enum([
  'approved',
  'changes_requested',
  'rejected',
  'draft',
])

export type EditorialDecision = z.infer<typeof editorialDecisionEnum>

export type McpEditorialActor = {
  userId: string
  isPlatformStaff: boolean
  capabilities: string[]
}

export type EditorialPath = 'already' | 'bypass' | 'decision' | 'cancel'

const DEFAULT_BYPASS_JUSTIFICATION = 'Aprovado via MCP pelo ator da plataforma.'

export function mapH3LikeToMcp(error: unknown, fallback = 'Falha editorial'): never {
  if (error instanceof BlimberMcpError)
    throw error
  const statusMessage = String((error as any)?.statusMessage || (error as any)?.message || fallback)
  const statusCode = Number((error as any)?.statusCode) || 400
  const code = statusCode === 403
    ? 'FORBIDDEN'
    : statusCode === 404
      ? 'NOT_FOUND'
      : statusCode === 409
        ? 'CONFLICT'
        : 'EDITORIAL_ERROR'
  throw new BlimberMcpError(code, statusMessage, statusCode)
}

export function mapLegacyStatusToEditorial(status: string | undefined): EditorialDecision | undefined {
  if (!status)
    return undefined
  if (status === 'draft' || status === 'approved')
    return status
  throw new BlimberMcpError(
    'PUBLICATION_STATUS_UNSUPPORTED',
    'status só aceita draft ou approved (mapeados para editorial_status). Para agendar use schedulePost / publicationStatus=scheduled; para publicar use publishPost.',
    400,
  )
}

export function resolveRequestedEditorial(input: {
  editorialStatus?: EditorialDecision
  status?: string
}): EditorialDecision | undefined {
  const fromEditorial = input.editorialStatus
  const fromStatus = mapLegacyStatusToEditorial(input.status)
  if (fromEditorial && fromStatus && fromEditorial !== fromStatus) {
    throw new BlimberMcpError(
      'STATUS_CONFLICT',
      'editorialStatus e status apontam para estados diferentes. Envie só editorialStatus.',
      400,
    )
  }
  return fromEditorial || fromStatus
}

async function loadPendingApprovalRequest(
  ctx: BlimberMcpToolContext,
  tenantId: string,
  postId: string,
  requestId?: string,
) {
  let query = ctx.client
    .from('approval_requests')
    .select('id, tenant_id, post_id, status, run_status, stage, workflow_stage_id')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .eq('run_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)

  if (requestId)
    query = query.eq('id', requestId)

  const { data, error } = await query.maybeSingle()
  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  return data || null
}

export function planEditorialPath(input: {
  editorialStatus: string | null | undefined
  decision: EditorialDecision
  pendingRequestId: string | null
}): { path: EditorialPath, notes: string[] } {
  const current = String(input.editorialStatus || 'draft')

  if (input.decision === 'draft') {
    if (current === 'draft' && !input.pendingRequestId) {
      return {
        path: 'already',
        notes: ['Post já está em rascunho editorial. Nenhuma mutação.'],
      }
    }
    return {
      path: 'cancel',
      notes: [
        'Usa cancelApprovalRun (mesmo do Hub): encerra approval_requests pendentes e volta editorial_status=draft.',
      ],
    }
  }

  if (input.decision === 'approved' && current === 'approved' && !input.pendingRequestId) {
    return {
      path: 'already',
      notes: ['Post já está aprovado. Nenhuma mutação.'],
    }
  }

  if (input.pendingRequestId) {
    return {
      path: 'decision',
      notes: [
        `Usa submitApprovalDecision no approval_request ${input.pendingRequestId} (mesmas caps do painel).`,
      ],
    }
  }

  if (input.decision === 'approved') {
    return {
      path: 'bypass',
      notes: [
        'Rascunho/sem fila: usa bypassApproval (agency path / marketing.social.approval.bypass ou superadmin).',
        'Não grava editorial_status direto — cria/usa content_version e marca approval_bypassed.',
      ],
    }
  }

  throw new BlimberMcpError(
    'NO_PENDING_REQUEST',
    'changes_requested e rejected exigem um approval_request pendente. Envie para aprovação no Hub ou aprove o rascunho.',
    409,
  )
}

type McpAuthUser = {
  id: string
  app_metadata?: { role?: string, tenant_roles?: Record<string, string> }
  user_metadata?: { role?: string }
}

/**
 * Hub platform staff for MCP writes: `app_metadata.role` is `admin` or
 * `funcionario` (Superadministrador / Funcionário). Never `user_metadata`
 * (user-editable) and never tenant `cliente` (Administrador da empresa).
 */
export function mcpActorIsPlatformStaff(user: McpAuthUser | null | undefined): boolean {
  if (!user)
    return false
  return isGlobalStaffFromJwt(user)
}

async function readAuthUserById(
  getUserById: (id: string) => Promise<{ data?: { user?: McpAuthUser | null } | null, error?: { message?: string } | null }>,
  userId: string,
): Promise<McpAuthUser> {
  const { data, error } = await getUserById(userId)
  if (error || !data?.user?.id) {
    throw new BlimberMcpError(
      'ACTOR_NOT_FOUND',
      'actorUserId / BLIMBER_MCP_ACTOR_USER_ID não existe em auth.users.',
      400,
    )
  }
  return data.user
}

/**
 * Live Auth Admin user (fresh app_metadata, not a session JWT).
 * Retries with the dedicated service-role client when the MCP client has no
 * working `auth.admin` (Nuxt service role + missing fetch on Vercel).
 */
export async function loadMcpActorAuthUser(
  ctx: BlimberMcpToolContext,
  userId: string,
): Promise<McpAuthUser | null> {
  const primary = ctx.client.auth?.admin?.getUserById
  if (typeof primary === 'function') {
    try {
      return await readAuthUserById(primary.bind(ctx.client.auth.admin), userId)
    }
    catch (error) {
      if (error instanceof BlimberMcpError)
        throw error
    }
  }

  const fallback = createBlimberServiceRoleClient()
  const fallbackGet = fallback?.auth?.admin?.getUserById
  if (typeof fallbackGet === 'function') {
    try {
      return await readAuthUserById(fallbackGet.bind(fallback.auth.admin), userId)
    }
    catch (error) {
      if (error instanceof BlimberMcpError)
        throw error
    }
  }

  return null
}

export async function resolveMcpEditorialActor(
  ctx: BlimberMcpToolContext,
  tenantId: string,
  override?: string,
): Promise<McpEditorialActor> {
  const userId = resolveMcpActorUserId(override || ctx.actorUserId)
  if (!userId) {
    throw new BlimberMcpError(
      'ACTOR_REQUIRED',
      'Para gravar (dryRun=false), envie actorUserId ou defina BLIMBER_MCP_ACTOR_USER_ID. Preview não exige actor.',
      503,
    )
  }
  if (!uuid.safeParse(userId).success) {
    throw new BlimberMcpError(
      'ACTOR_INVALID',
      'actorUserId / BLIMBER_MCP_ACTOR_USER_ID deve ser um UUID válido de auth.users.',
      400,
    )
  }

  const authUser = await loadMcpActorAuthUser(ctx, userId)
  if (mcpActorIsPlatformStaff(authUser)) {
    return {
      userId,
      isPlatformStaff: true,
      capabilities: [...ALL_WORKSPACE_CAPABILITIES],
    }
  }

  const { data: memberships, error: membershipError } = await ctx.client
    .from('organization_memberships')
    .select('id, organization_id, role, role_id, access_all_tenants, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (membershipError)
    throw new BlimberMcpError('DB_ERROR', membershipError.message, 400)

  const { data: links, error: linkError } = await ctx.client
    .from('organization_tenants')
    .select('organization_id, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  if (linkError)
    throw new BlimberMcpError('DB_ERROR', linkError.message, 400)

  const orgIds = new Set((links || []).map((row: any) => String(row.organization_id)))
  const candidates = (memberships || []).filter((row: any) => orgIds.has(String(row.organization_id)))
  if (!candidates.length) {
    throw new BlimberMcpError(
      'FORBIDDEN',
      'Ator MCP sem papel de plataforma nem membership na organização deste tenant.',
      403,
    )
  }

  const membershipIds = candidates.map((row: any) => String(row.id))
  const { data: assignments } = await ctx.client
    .from('organization_member_tenants')
    .select('organization_membership_id, tenant_id, is_active')
    .in('organization_membership_id', membershipIds)
    .eq('is_active', true)

  const assigned = new Set(
    (assignments || [])
      .filter((row: any) => String(row.tenant_id) === tenantId)
      .map((row: any) => String(row.organization_membership_id)),
  )

  const reaching = candidates.find((row: any) =>
    row.access_all_tenants === true || assigned.has(String(row.id)),
  )
  if (!reaching) {
    throw new BlimberMcpError(
      'FORBIDDEN',
      'Ator MCP não tem este tenant no portfólio da organização.',
      403,
    )
  }

  const resolved = await resolveEffectiveCapabilities({
    client: ctx.client,
    userId,
    organizationId: String(reaching.organization_id),
    organizationRoleId: reaching.role_id ? String(reaching.role_id) : null,
    tenantId,
    globalRole: authUser?.app_metadata?.role ?? null,
    isPlatformStaff: false,
    legacyRole: reaching.role ? String(reaching.role) : null,
  })

  return {
    userId,
    isPlatformStaff: false,
    capabilities: resolved.capabilities,
  }
}

export function assertMcpCapability(
  actor: McpEditorialActor,
  capabilities: string[],
  message: string,
) {
  if (actor.isPlatformStaff)
    return
  if (capabilities.some(cap => holdsCapability(actor.capabilities, cap)))
    return
  throw new BlimberMcpError('FORBIDDEN', message, 403)
}

function assertCanExecutePath(
  actor: McpEditorialActor,
  path: EditorialPath,
  decision: EditorialDecision,
) {
  if (path === 'already')
    return
  if (actor.isPlatformStaff)
    return

  if (path === 'bypass') {
    if (!holdsCapability(actor.capabilities, 'marketing.social.approval.bypass')) {
      throw new BlimberMcpError(
        'FORBIDDEN',
        'Sem permissão para ignorar a aprovação (marketing.social.approval.bypass).',
        403,
      )
    }
    return
  }

  if (path === 'cancel') {
    const canCancel = holdsCapability(actor.capabilities, 'marketing.social.workflow.manage')
      || holdsCapability(actor.capabilities, 'marketing.social.manage')
    if (!canCancel) {
      throw new BlimberMcpError(
        'FORBIDDEN',
        'Sem permissão para voltar o post a rascunho (cancelar aprovação).',
        403,
      )
    }
    return
  }

  if (path === 'decision') {
    const canDecide = holdsCapability(actor.capabilities, 'marketing.social.approve')
      || holdsCapability(actor.capabilities, 'marketing.social.approval.internal')
      || holdsCapability(actor.capabilities, 'marketing.social.approval.client')
    if (!canDecide) {
      throw new BlimberMcpError(
        'FORBIDDEN',
        `Sem permissão para registrar decisão ${decision} nesta solicitação.`,
        403,
      )
    }
  }
}

export async function previewEditorialTransition(
  ctx: BlimberMcpToolContext,
  input: {
    tenantId: string
    postId: string
    decision: EditorialDecision
    requestId?: string
    comment?: string | null
    justification?: string | null
  },
) {
  const pending = await loadPendingApprovalRequest(ctx, input.tenantId, input.postId, input.requestId)
  const { data: post, error } = await ctx.client
    .from('social_posts')
    .select('id, title, editorial_status, status, publication_status, approved_version_id, approval_bypassed, tenant_id, deleted_at')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!post)
    throw new BlimberMcpError('NOT_FOUND', 'Publicação não encontrada', 404)
  if (post.deleted_at)
    throw new BlimberMcpError('GONE', 'Publicação excluída não pode ser alterada', 409)

  const plan = planEditorialPath({
    editorialStatus: post.editorial_status,
    decision: input.decision,
    pendingRequestId: pending ? String(pending.id) : null,
  })

  return {
    post,
    pendingRequest: pending,
    path: plan.path,
    notes: plan.notes,
    decision: input.decision,
    comment: input.comment || null,
    justification: input.justification || (plan.path === 'bypass' ? DEFAULT_BYPASS_JUSTIFICATION : null),
  }
}

export async function executeEditorialTransition(
  ctx: BlimberMcpToolContext,
  input: {
    tenantId: string
    postId: string
    decision: EditorialDecision
    actorUserId?: string
    requestId?: string
    comment?: string | null
    justification?: string | null
  },
) {
  const preview = await previewEditorialTransition(ctx, input)
  const actor = await resolveMcpEditorialActor(ctx, input.tenantId, input.actorUserId)
  assertCanExecutePath(actor, preview.path, input.decision)

  try {
    if (preview.path === 'already') {
      return { path: preview.path, actor, preview }
    }

    if (preview.path === 'cancel') {
      await cancelApprovalRun(ctx.client, {
        tenantId: input.tenantId,
        postId: input.postId,
      })
      return { path: preview.path, actor, preview }
    }

    if (preview.path === 'bypass') {
      const justification = (input.justification || DEFAULT_BYPASS_JUSTIFICATION).trim()
      await bypassApproval(ctx.client, {
        tenantId: input.tenantId,
        postId: input.postId,
        userId: actor.userId,
        justification,
        capabilities: actor.capabilities,
        isPlatformStaff: actor.isPlatformStaff,
      })
      return { path: preview.path, actor, preview, justification }
    }

    const requestId = input.requestId || preview.pendingRequest?.id
    if (!requestId) {
      throw new BlimberMcpError('NO_PENDING_REQUEST', 'Solicitação de aprovação não encontrada.', 404)
    }

    const decision: DecisionValue = input.decision === 'draft'
      ? 'changes_requested'
      : input.decision

    await submitApprovalDecision(ctx.client, {
      tenantId: input.tenantId,
      requestId: String(requestId),
      userId: actor.userId,
      decision,
      comment: input.comment,
      isPlatformAdmin: actor.isPlatformStaff,
      capabilities: actor.capabilities,
    })
    return { path: preview.path, actor, preview, requestId: String(requestId) }
  }
  catch (error) {
    mapH3LikeToMcp(error)
  }
}
