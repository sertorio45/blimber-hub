import { createHash, randomUUID } from 'node:crypto'

import { createError } from 'h3'

import { holdsCapability } from '~/constants/workspace'
import { canDecideApprovalRequest } from '~/server/utils/social-approval-ux'
import { createSocialNotification } from '~/server/utils/social-audit'

/**
 * Social approval domain service.
 *
 * Single source of truth for the editorial lifecycle of a social post:
 * versioning, multi-stage approval runs, revisions, bypass and the guards that
 * gate scheduling/publishing. Endpoints and the legacy `social-workflow`
 * wrappers delegate here so the same rules apply everywhere.
 *
 * Editorial state (`social_posts.editorial_status`) and publication state
 * (`social_posts.publication_status`) are independent; a DB trigger keeps the
 * legacy `status` column in sync for older queries.
 */

// System workflow templates seeded by migration.
export const SYSTEM_WORKFLOW_IDS = {
  simpleClient: '11111111-1111-4111-8111-111111111101',
  agencyInternalClient: '11111111-1111-4111-8111-111111111102',
  noApproval: '11111111-1111-4111-8111-111111111103',
} as const

export type EditorialStatus
  = | 'draft'
    | 'internal_review'
    | 'client_review'
    | 'changes_requested'
    | 'approved'
    | 'rejected'
    | 'cancelled'

export type DecisionValue = 'approved' | 'changes_requested' | 'rejected'
export type StageType = 'internal' | 'client' | 'custom'
export type StageMode = 'any' | 'all' | 'minimum'

interface WorkflowStageRow {
  id: string
  workflow_id: string
  position: number
  name: string
  stage_type: StageType
  mode: StageMode
  minimum_approvals: number
  due_hours: number | null
  required_capability: string | null
  allow_self_approval: boolean
  auto_advance: boolean
  require_comment_on_reject: boolean
  allow_rejection: boolean
}

interface WorkflowRow {
  id: string
  organization_id: string | null
  tenant_id: string | null
  name: string
  slug: string
  description: string
  is_system: boolean
  is_default: boolean
  is_active: boolean
}

interface ApproverSnapshot {
  userId: string
  roleId: string | null
  roleName: string | null
  roleSlug: string | null
  assignedCapability: string | null
  isAlternate: boolean
}

function hashSnapshot(snapshot: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

function holdsAny(capabilities: Iterable<string> | undefined | null, required: string[]): boolean {
  if (!capabilities)
    return false
  const set = new Set(capabilities)
  return required.some(capability => holdsCapability(set, capability))
}

/** Editorial status a post enters while a given stage is open. */
function editorialForStage(stageType: StageType): EditorialStatus {
  return stageType === 'internal' ? 'internal_review' : 'client_review'
}

/** Maps a configurable stage type onto the legacy `approval_stage` enum. */
function mapStage(stageType: StageType): 'internal' | 'client' {
  return stageType === 'internal' ? 'internal' : 'client'
}

// ---------------------------------------------------------------------------
// Snapshotting
// ---------------------------------------------------------------------------

export async function buildSocialPostSnapshot(
  client: any,
  tenantId: string,
  postId: string,
) {
  const { data: post, error: postError } = await client
    .from('social_posts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', postId)
    .maybeSingle()

  if (postError || !post)
    throw createError({ statusCode: 404, statusMessage: 'Publicação não encontrada' })

  const { data: variants, error: variantError } = await client
    .from('social_post_variants')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .order('created_at')

  if (variantError)
    throw createError({ statusCode: 400, statusMessage: variantError.message })

  const { data: postAssets, error: assetsError } = await client
    .from('social_post_assets')
    .select('id, variant_id, asset_id, position, media_assets!social_post_assets_asset_id_fkey(id, name, bucket, object_path, mime_type, purpose, metadata)')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .order('position')

  if (assetsError)
    throw createError({ statusCode: 400, statusMessage: assetsError.message })

  return {
    post: {
      id: post.id,
      title: post.title,
      content: post.content,
      scheduled_at: post.scheduled_at,
      timezone: post.timezone,
      approval_policy: post.approval_policy,
      minimum_approvals: post.minimum_approvals,
    },
    variants: variants || [],
    assets: postAssets || [],
  }
}

export async function createContentVersion(
  client: any,
  tenantId: string,
  postId: string,
  userId: string,
) {
  const snapshot = await buildSocialPostSnapshot(client, tenantId, postId)

  const { data: latest } = await client
    .from('content_versions')
    .select('version')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const version = Number(latest?.version || 0) + 1
  const { data, error } = await client
    .from('content_versions')
    .insert({
      tenant_id: tenantId,
      post_id: postId,
      version,
      snapshot,
      checksum: hashSnapshot(snapshot),
      created_by: userId,
    })
    .select('*')
    .single()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  await client
    .from('social_posts')
    .update({ current_version: version })
    .eq('tenant_id', tenantId)
    .eq('id', postId)

  return data
}

async function latestContentVersion(client: any, tenantId: string, postId: string) {
  const { data } = await client
    .from('content_versions')
    .select('id, version')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data || null
}

// ---------------------------------------------------------------------------
// Material-change detection
// ---------------------------------------------------------------------------

/**
 * A "material" change is one that alters what would be published, so a fresh
 * approval round is required. Timezone, assignment and pure scheduling tweaks
 * are intentionally excluded.
 */
export function isMaterialContentChange(
  before: {
    title?: string | null
    content?: string | null
    variants?: Array<Record<string, unknown>>
    referenceAssetIds?: string[]
  } | null | undefined,
  after: {
    title?: string | null
    content?: string | null
    variants?: Array<Record<string, unknown>>
    referenceAssetIds?: string[]
  } | null | undefined,
): boolean {
  const normalizeVariant = (variant: Record<string, any>) => ({
    accountId: variant.accountId ?? variant.account_id ?? null,
    platform: variant.platform ?? null,
    format: variant.format ?? 'static',
    caption: variant.caption ?? '',
    linkUrl: variant.linkUrl ?? variant.link_url ?? null,
    hashtags: [...(variant.hashtags ?? [])].sort(),
    assetIds: [...(variant.assetIds ?? [])].sort(),
  })

  const normalize = (value: typeof before) => JSON.stringify({
    title: value?.title ?? '',
    content: value?.content ?? '',
    variants: (value?.variants ?? [])
      .map(normalizeVariant)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    referenceAssetIds: [...(value?.referenceAssetIds ?? [])].sort(),
  })

  return normalize(before) !== normalize(after)
}

// ---------------------------------------------------------------------------
// Workflow resolution
// ---------------------------------------------------------------------------

async function loadWorkflowStages(client: any, workflowId: string): Promise<WorkflowStageRow[]> {
  const { data } = await client
    .from('social_approval_workflow_stages')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('position', { ascending: true })
  return ((data || []) as WorkflowStageRow[]).slice().sort((a, b) => a.position - b.position)
}

export interface ResolvedWorkflow {
  workflow: WorkflowRow
  stages: WorkflowStageRow[]
  settings: {
    tenant_id: string
    requires_internal_review: boolean
    default_workflow_id: string | null
    allow_no_approval_workflow: boolean
  } | null
}

export async function resolveWorkflowForTenant(
  client: any,
  input: {
    tenantId: string
    workflowId?: string | null
    settings?: ResolvedWorkflow['settings']
  },
): Promise<ResolvedWorkflow> {
  let settings = input.settings ?? null
  if (settings === null) {
    const { data } = await client
      .from('social_approval_settings')
      .select('tenant_id, requires_internal_review, default_workflow_id, allow_no_approval_workflow')
      .eq('tenant_id', input.tenantId)
      .maybeSingle()
    settings = data || null
  }

  let workflowId = input.workflowId?.trim() || null
  if (!workflowId)
    workflowId = settings?.default_workflow_id || null
  if (!workflowId) {
    workflowId = settings?.requires_internal_review
      ? SYSTEM_WORKFLOW_IDS.agencyInternalClient
      : SYSTEM_WORKFLOW_IDS.simpleClient
  }

  const { data: workflow } = await client
    .from('social_approval_workflows')
    .select('*')
    .eq('id', workflowId)
    .maybeSingle()

  if (!workflow)
    throw createError({ statusCode: 404, statusMessage: 'Fluxo de aprovação não encontrado' })

  const isAccessible = workflow.is_system
    || (workflow.tenant_id && String(workflow.tenant_id) === input.tenantId)
    || Boolean(workflow.organization_id)
  if (!isAccessible)
    throw createError({ statusCode: 403, statusMessage: 'Fluxo de aprovação indisponível para esta empresa' })
  if (workflow.is_active === false)
    throw createError({ statusCode: 409, statusMessage: 'Fluxo de aprovação inativo' })

  const stages = await loadWorkflowStages(client, workflow.id)
  return { workflow, stages, settings }
}

// ---------------------------------------------------------------------------
// Approver resolution & snapshotting
// ---------------------------------------------------------------------------

/** Snapshots each approver's current org role so history survives role edits. */
async function snapshotApprovers(
  client: any,
  tenantId: string,
  userIds: string[],
  overrides?: Map<string, Partial<ApproverSnapshot>>,
): Promise<ApproverSnapshot[]> {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length)
    return []

  const { data: orgRows } = await client
    .from('organization_tenants')
    .select('organization_id')
    .eq('tenant_id', tenantId)
  const organizationIds = [...new Set((orgRows || []).map((row: any) => String(row.organization_id)))]

  const roleByUser = new Map<string, string>()
  if (organizationIds.length) {
    const { data: memberships } = await client
      .from('organization_memberships')
      .select('user_id, role_id, organization_id, is_active')
      .in('user_id', unique)
      .in('organization_id', organizationIds)
    for (const row of memberships || []) {
      if (row.is_active === false)
        continue
      if (row.role_id && !roleByUser.has(String(row.user_id)))
        roleByUser.set(String(row.user_id), String(row.role_id))
    }
  }

  const roleIds = [...new Set([...roleByUser.values()])]
  const roleMeta = new Map<string, { name: string | null, slug: string | null }>()
  if (roleIds.length) {
    const { data: roles } = await client
      .from('organization_roles')
      .select('id, name, slug')
      .in('id', roleIds)
    for (const row of roles || []) {
      roleMeta.set(String(row.id), {
        name: row.name ? String(row.name) : null,
        slug: row.slug ? String(row.slug) : null,
      })
    }
  }

  return unique.map((userId) => {
    const override = overrides?.get(userId)
    const roleId = override?.roleId ?? roleByUser.get(userId) ?? null
    const meta = roleId ? roleMeta.get(roleId) : undefined
    return {
      userId,
      roleId,
      roleName: override?.roleName ?? meta?.name ?? null,
      roleSlug: override?.roleSlug ?? meta?.slug ?? null,
      assignedCapability: override?.assignedCapability ?? null,
      isAlternate: override?.isAlternate ?? false,
    }
  })
}

/** Resolves the concrete users assigned to a stage (user + role assignees). */
async function resolveStageApprovers(
  client: any,
  tenantId: string,
  stage: WorkflowStageRow,
): Promise<string[]> {
  const { data: assignees } = await client
    .from('social_approval_stage_assignees')
    .select('assignee_type, user_id, role_id')
    .eq('stage_id', stage.id)

  const userIds = new Set<string>()
  const roleIds: string[] = []
  for (const row of assignees || []) {
    if (row.assignee_type === 'user' && row.user_id)
      userIds.add(String(row.user_id))
    else if (row.assignee_type === 'role' && row.role_id)
      roleIds.push(String(row.role_id))
  }

  if (roleIds.length) {
    const { data: orgRows } = await client
      .from('organization_tenants')
      .select('organization_id')
      .eq('tenant_id', tenantId)
    const organizationIds = [...new Set((orgRows || []).map((row: any) => String(row.organization_id)))]
    if (organizationIds.length) {
      const { data: members } = await client
        .from('organization_memberships')
        .select('user_id, role_id, organization_id, is_active')
        .in('role_id', roleIds)
        .in('organization_id', organizationIds)
      for (const row of members || []) {
        if (row.is_active !== false && row.user_id)
          userIds.add(String(row.user_id))
      }
    }
  }

  return [...userIds]
}

async function insertStageApprovers(
  client: any,
  tenantId: string,
  requestId: string,
  approvers: ApproverSnapshot[],
) {
  if (!approvers.length)
    return
  const { error } = await client
    .from('approval_request_approvers')
    .insert(approvers.map(approver => ({
      tenant_id: tenantId,
      request_id: requestId,
      user_id: approver.userId,
      role_id: approver.roleId,
      role_name: approver.roleName,
      role_slug: approver.roleSlug,
      assigned_capability: approver.assignedCapability,
      is_alternate: approver.isAlternate,
    })))
  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })
}

// ---------------------------------------------------------------------------
// Content validation for submission (channels + media completeness)
// ---------------------------------------------------------------------------

async function assertReadyForSubmission(client: any, tenantId: string, postId: string) {
  const { data: variants } = await client
    .from('social_post_variants')
    .select('id, format, platform')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
  if (!variants?.length)
    throw createError({ statusCode: 400, statusMessage: 'Selecione ao menos uma rede social' })

  const { data: publicationAssets } = await client
    .from('social_post_assets')
    .select('variant_id')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .not('variant_id', 'is', null)
  const assetCountByVariant = new Map<string, number>()
  for (const relation of publicationAssets || []) {
    if (!relation.variant_id)
      continue
    assetCountByVariant.set(
      String(relation.variant_id),
      (assetCountByVariant.get(String(relation.variant_id)) || 0) + 1,
    )
  }

  for (const variant of variants) {
    const assetCount = assetCountByVariant.get(String(variant.id)) || 0
    if (variant.format === 'story' && !['facebook', 'instagram'].includes(variant.platform)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Stories só está disponível no Facebook e Instagram',
      })
    }
    const minimumAssets = variant.format === 'carousel' ? 2 : 1
    const maximumAssets = variant.format === 'story' ? 1 : 10
    if (assetCount < minimumAssets || assetCount > maximumAssets) {
      throw createError({
        statusCode: 400,
        statusMessage: variant.format === 'carousel'
          ? 'Cada carrossel precisa de pelo menos duas peças'
          : variant.format === 'story'
            ? 'Stories precisa de exatamente uma peça'
            : 'Cada canal precisa de uma peça final',
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function notifyStageApprovers(
  client: any,
  input: { tenantId: string, postTitle: string, requestId: string, postId: string, approverIds: string[] },
) {
  await Promise.all(input.approverIds.map(userId => createSocialNotification(client, {
    tenantId: input.tenantId,
    userId,
    type: 'approval_requested',
    title: 'Nova arte para aprovação',
    body: `${input.postTitle} aguarda sua decisão.`,
    actionUrl: `/marketing/approvals?request=${input.requestId}`,
    metadata: { postId: input.postId, requestId: input.requestId },
    idempotencyKey: `approval_requested:${input.requestId}:${userId}`,
  })))
}

async function notifyScheduleReady(
  client: any,
  input: { tenantId: string, postId: string, postTitle: string, versionId: string, userId: string | null },
) {
  if (!input.userId)
    return
  await createSocialNotification(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    type: 'approved',
    title: 'Arte aprovada',
    body: `${input.postTitle} está aprovada e pronta para agendar.`,
    actionUrl: `/marketing/content/${input.postId}`,
    metadata: { postId: input.postId, versionId: input.versionId },
    idempotencyKey: `schedule_ready:${input.postId}:${input.versionId}`,
  })
}

// ---------------------------------------------------------------------------
// Start a workflow
// ---------------------------------------------------------------------------

export interface StartApprovalInput {
  tenantId: string
  postId: string
  userId: string
  workflowId?: string | null
  /** Explicit approvers picked in the UI (already validated by the caller). */
  approverIds?: string[]
  dueAt?: string | null
  capabilities?: string[]
  isPlatformStaff?: boolean
}

export async function startApprovalWorkflow(client: any, input: StartApprovalInput) {
  const { data: post, error: postError } = await client
    .from('social_posts')
    .select('id, title, created_by, editorial_status, publication_status, approval_policy, minimum_approvals')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
    .maybeSingle()

  if (postError || !post)
    throw createError({ statusCode: 404, statusMessage: 'Publicação não encontrada' })

  const editorial = String(post.editorial_status || 'draft')
  if (['internal_review', 'client_review'].includes(editorial))
    throw createError({ statusCode: 409, statusMessage: 'Esta publicação já está em aprovação' })
  if (editorial === 'approved')
    throw createError({ statusCode: 409, statusMessage: 'Esta publicação já foi aprovada' })

  await assertReadyForSubmission(client, input.tenantId, input.postId)

  const resolved = await resolveWorkflowForTenant(client, {
    tenantId: input.tenantId,
    workflowId: input.workflowId,
  })

  const version = await createContentVersion(client, input.tenantId, input.postId, input.userId)

  await client
    .from('social_posts')
    .update({ workflow_id: resolved.workflow.id })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)

  // --- No-approval workflow --------------------------------------------------
  if (!resolved.stages.length) {
    const allowed = resolved.settings?.allow_no_approval_workflow
      || input.isPlatformStaff
      || holdsAny(input.capabilities, ['marketing.social.workflow.manage', 'marketing.social.approval.bypass'])
    if (!allowed) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Fluxo sem aprovação não está habilitado para esta empresa',
      })
    }

    await client
      .from('social_posts')
      .update({ editorial_status: 'approved', approved_version_id: version.id })
      .eq('tenant_id', input.tenantId)
      .eq('id', input.postId)

    await notifyScheduleReady(client, {
      tenantId: input.tenantId,
      postId: input.postId,
      postTitle: post.title,
      versionId: version.id,
      userId: post.created_by ? String(post.created_by) : null,
    })

    return {
      mode: 'no_approval' as const,
      workflowId: resolved.workflow.id,
      versionId: version.id,
      request: null,
    }
  }

  // --- Staged workflow -------------------------------------------------------
  const stage = resolved.stages[0]!
  const explicit = [...new Set((input.approverIds || []).filter(Boolean))]
  const approverIds = explicit.length
    ? explicit
    : await resolveStageApprovers(client, input.tenantId, stage)

  if (!approverIds.length)
    throw createError({ statusCode: 400, statusMessage: 'Selecione ao menos um aprovador' })

  const approvers = await snapshotApprovers(client, input.tenantId, approverIds)

  const minimumApprovals = stage.mode === 'minimum'
    ? Math.max(1, Math.min(stage.minimum_approvals, approvers.length))
    : 1

  const runGroupId = randomUUID()
  const dueAt = input.dueAt
    || (stage.due_hours ? new Date(Date.now() + stage.due_hours * 3600_000).toISOString() : null)

  const { data: request, error: requestError } = await client
    .from('approval_requests')
    .insert({
      tenant_id: input.tenantId,
      post_id: input.postId,
      version_id: version.id,
      status: 'pending',
      run_status: 'pending',
      policy: stage.mode,
      minimum_approvals: minimumApprovals,
      requested_by: input.userId,
      due_at: dueAt,
      workflow_id: resolved.workflow.id,
      workflow_stage_id: stage.id,
      run_group_id: runGroupId,
      stage_position: stage.position,
      stage: mapStage(stage.stage_type),
    })
    .select('*')
    .single()

  if (requestError)
    throw createError({ statusCode: 400, statusMessage: requestError.message })

  await insertStageApprovers(client, input.tenantId, request.id, approvers)

  await client
    .from('social_posts')
    .update({
      editorial_status: editorialForStage(stage.stage_type),
      approved_version_id: null,
    })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)

  await notifyStageApprovers(client, {
    tenantId: input.tenantId,
    postTitle: post.title,
    requestId: request.id,
    postId: input.postId,
    approverIds,
  })

  return {
    mode: 'stage' as const,
    workflowId: resolved.workflow.id,
    versionId: version.id,
    request,
  }
}

// ---------------------------------------------------------------------------
// Advance / complete a stage
// ---------------------------------------------------------------------------

interface AdvanceInput {
  tenantId: string
  request: any
  stage: WorkflowStageRow | null
}

export async function advanceApprovalStage(client: any, input: AdvanceInput) {
  const request = input.request
  const nowIso = new Date().toISOString()

  await client
    .from('approval_requests')
    .update({ status: 'approved', run_status: 'approved', resolved_at: nowIso, locked_at: null, locked_by: null })
    .eq('tenant_id', input.tenantId)
    .eq('id', request.id)

  const { data: post } = await client
    .from('social_posts')
    .select('id, title, created_by')
    .eq('tenant_id', input.tenantId)
    .eq('id', request.post_id)
    .maybeSingle()

  let nextStage: WorkflowStageRow | null = null
  if (request.workflow_id) {
    const stages = await loadWorkflowStages(client, request.workflow_id)
    nextStage = stages.find(candidate => candidate.position > Number(request.stage_position)) || null
  }

  // Final stage → approve the post.
  if (!nextStage) {
    await client
      .from('social_posts')
      .update({ editorial_status: 'approved', approved_version_id: request.version_id })
      .eq('tenant_id', input.tenantId)
      .eq('id', request.post_id)

    await notifyScheduleReady(client, {
      tenantId: input.tenantId,
      postId: request.post_id,
      postTitle: post?.title || 'Publicação',
      versionId: request.version_id,
      userId: post?.created_by ? String(post.created_by) : null,
    })

    const { emitSocialAutomation } = await import('~/server/utils/social-automations')
    await emitSocialAutomation(client, {
      tenantId: input.tenantId,
      trigger: 'editorial.approved',
      actorId: request.requested_by || post?.created_by || null,
      postId: request.post_id,
      entityType: 'approval_request',
      entityId: request.id,
      payload: { versionId: request.version_id },
    })

    return { status: 'approved' as const, nextStage: null }
  }

  // Otherwise open the next stage in the same run group.
  const approverIds = await resolveStageApprovers(client, input.tenantId, nextStage)
  if (!approverIds.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A próxima etapa do fluxo não possui aprovadores configurados',
    })
  }
  const approvers = await snapshotApprovers(client, input.tenantId, approverIds)
  const minimumApprovals = nextStage.mode === 'minimum'
    ? Math.max(1, Math.min(nextStage.minimum_approvals, approvers.length))
    : 1
  const dueAt = nextStage.due_hours
    ? new Date(Date.now() + nextStage.due_hours * 3600_000).toISOString()
    : null

  const { data: nextRequest, error: nextError } = await client
    .from('approval_requests')
    .insert({
      tenant_id: input.tenantId,
      post_id: request.post_id,
      version_id: request.version_id,
      status: 'pending',
      run_status: 'pending',
      policy: nextStage.mode,
      minimum_approvals: minimumApprovals,
      requested_by: request.requested_by,
      due_at: dueAt,
      workflow_id: request.workflow_id,
      workflow_stage_id: nextStage.id,
      run_group_id: request.run_group_id,
      stage_position: nextStage.position,
      stage: mapStage(nextStage.stage_type),
    })
    .select('*')
    .single()

  if (nextError)
    throw createError({ statusCode: 400, statusMessage: nextError.message })

  await insertStageApprovers(client, input.tenantId, nextRequest.id, approvers)

  await client
    .from('social_posts')
    .update({ editorial_status: editorialForStage(nextStage.stage_type), approved_version_id: null })
    .eq('tenant_id', input.tenantId)
    .eq('id', request.post_id)

  await notifyStageApprovers(client, {
    tenantId: input.tenantId,
    postTitle: post?.title || 'Publicação',
    requestId: nextRequest.id,
    postId: request.post_id,
    approverIds,
  })

  return { status: 'advanced' as const, nextStage, request: nextRequest }
}

// ---------------------------------------------------------------------------
// Submit a decision
// ---------------------------------------------------------------------------

export interface SubmitDecisionInput {
  tenantId: string
  requestId: string
  userId: string
  decision: DecisionValue
  comment?: string | null
  changeCategory?: 'art' | 'copy' | 'date' | 'platform' | 'incorrect_info' | 'other' | null
  capabilities?: string[]
  isPlatformAdmin?: boolean
}

export async function submitApprovalDecision(client: any, input: SubmitDecisionInput) {
  // Serialize concurrent decisions on the same request (FOR UPDATE + pending guard).
  const { data: locked, error: lockError } = await client
    .rpc('lock_approval_request', {
      p_request_id: input.requestId,
      p_actor_id: input.userId,
    })

  if (lockError) {
    const message = String(lockError.message || '')
    if (message.includes('not_found'))
      throw createError({ statusCode: 404, statusMessage: 'Solicitação não encontrada' })
    if (message.includes('not_pending'))
      throw createError({ statusCode: 409, statusMessage: 'Esta solicitação já foi encerrada' })
    throw createError({ statusCode: 409, statusMessage: 'Não foi possível bloquear a solicitação' })
  }

  const request = Array.isArray(locked) ? locked[0] : locked
  if (!request)
    throw createError({ statusCode: 404, statusMessage: 'Solicitação não encontrada' })

  // Tenant isolation: a locked row from another tenant is never actionable here.
  if (String(request.tenant_id) !== input.tenantId)
    throw createError({ statusCode: 404, statusMessage: 'Solicitação não encontrada' })

  const { data: post } = await client
    .from('social_posts')
    .select('id, title, created_by')
    .eq('tenant_id', input.tenantId)
    .eq('id', request.post_id)
    .maybeSingle()

  let stage: WorkflowStageRow | null = null
  if (request.workflow_stage_id) {
    const { data: stageRow } = await client
      .from('social_approval_workflow_stages')
      .select('*')
      .eq('id', request.workflow_stage_id)
      .maybeSingle()
    stage = (stageRow as WorkflowStageRow) || null
  }

  const allowSelfApproval = stage?.allow_self_approval ?? false
  const allowRejection = stage?.allow_rejection ?? true
  const requireCommentOnReject = stage?.require_comment_on_reject ?? true
  const mode: StageMode = (stage?.mode as StageMode) || (request.policy as StageMode) || 'any'

  const { data: approver } = await client
    .from('approval_request_approvers')
    .select('id')
    .eq('request_id', input.requestId)
    .eq('user_id', input.userId)
    .maybeSingle()

  const stageType = stage?.stage_type || request.stage || 'client'
  const canDecide = canDecideApprovalRequest({
    status: 'pending',
    stage: stageType,
    approverIds: approver ? [input.userId] : [],
    userId: input.userId,
    capabilities: input.capabilities || [],
    isPlatformStaff: input.isPlatformAdmin,
  })
  if (!canDecide)
    throw createError({ statusCode: 403, statusMessage: 'Você não é aprovador desta solicitação' })

  // Stage capability is authoritative: legacy `marketing.social.approve` must NOT
  // satisfy a granular internal/client stage (avoids client closing internal review).
  if (stage?.required_capability && !input.isPlatformAdmin) {
    const caps = input.capabilities instanceof Set
      ? input.capabilities
      : new Set(input.capabilities || [])
    const required = String(stage.required_capability)
    const canActOnStage = caps.has(required)
      || caps.has('marketing.social.manage')
      || caps.has('marketing.social.workflow.manage')
    if (!canActOnStage) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Sem permissão para decidir nesta etapa de aprovação',
      })
    }
  }

  // Self-approval guard.
  if (!allowSelfApproval && post?.created_by && String(post.created_by) === input.userId && !input.isPlatformAdmin)
    throw createError({ statusCode: 403, statusMessage: 'Você não pode aprovar a própria publicação' })

  if (input.decision === 'rejected' && !allowRejection)
    throw createError({ statusCode: 400, statusMessage: 'Este fluxo não permite reprovar' })

  const comment = input.comment?.trim() || null
  if ((input.decision === 'changes_requested' || input.decision === 'rejected')
    && requireCommentOnReject && !comment) {
    throw createError({ statusCode: 400, statusMessage: 'Descreva o motivo para o autor' })
  }

  // Immutable, insert-only. A duplicate is a concurrent double-decision → 409.
  const { error: decisionError } = await client
    .from('approval_decisions')
    .insert({
      tenant_id: input.tenantId,
      request_id: input.requestId,
      approver_id: input.userId,
      decision: input.decision,
      comment,
      change_category: input.decision === 'changes_requested'
        ? (input.changeCategory || null)
        : null,
    })

  if (decisionError) {
    if (String((decisionError as any).code) === '23505'
      || String(decisionError.message || '').includes('duplicate')) {
      throw createError({ statusCode: 409, statusMessage: 'Você já registrou uma decisão nesta etapa' })
    }
    if (String(decisionError.message || '').includes('immutable'))
      throw createError({ statusCode: 409, statusMessage: 'Decisões não podem ser alteradas' })
    throw createError({ statusCode: 400, statusMessage: decisionError.message })
  }

  const nowIso = new Date().toISOString()

  // Terminal negative outcomes end the run immediately.
  if (input.decision === 'changes_requested' || input.decision === 'rejected') {
    const editorialStatus: EditorialStatus = input.decision === 'rejected' ? 'rejected' : 'changes_requested'
    await client
      .from('approval_requests')
      .update({ status: input.decision, run_status: input.decision, resolved_at: nowIso, locked_at: null, locked_by: null })
      .eq('tenant_id', input.tenantId)
      .eq('id', input.requestId)

    await client
      .from('social_posts')
      .update({ editorial_status: editorialStatus, approved_version_id: null })
      .eq('tenant_id', input.tenantId)
      .eq('id', request.post_id)

    if (post?.created_by) {
      await createSocialNotification(client, {
        tenantId: input.tenantId,
        userId: String(post.created_by),
        type: input.decision,
        title: input.decision === 'rejected' ? 'Publicação reprovada' : 'Ajustes solicitados',
        body: `${post.title} recebeu uma nova decisão.`,
        actionUrl: `/marketing/content/${request.post_id}`,
        metadata: { postId: request.post_id, requestId: request.id, decision: input.decision },
        idempotencyKey: `decision:${request.id}:${input.decision}`,
      })
    }

    if (input.decision === 'changes_requested') {
      const { emitSocialAutomation } = await import('~/server/utils/social-automations')
      await emitSocialAutomation(client, {
        tenantId: input.tenantId,
        trigger: 'approval.changes_requested',
        actorId: input.userId,
        postId: request.post_id,
        entityType: 'approval_request',
        entityId: request.id,
        payload: { decision: input.decision },
      })
    }

    return {
      status: input.decision,
      stage: request.stage,
      requestId: request.id,
    }
  }

  // Approval: evaluate whether the stage is complete.
  const { data: decisions } = await client
    .from('approval_decisions')
    .select('decision')
    .eq('request_id', input.requestId)
  const approvedCount = (decisions || []).filter((row: any) => row.decision === 'approved').length

  const { data: approverRows } = await client
    .from('approval_request_approvers')
    .select('id')
    .eq('request_id', input.requestId)
  const approverCount = (approverRows || []).length

  const stageComplete = input.isPlatformAdmin
    || (mode === 'all'
      ? approvedCount >= Math.max(1, approverCount)
      : mode === 'minimum'
        ? approvedCount >= Number(stage?.minimum_approvals || request.minimum_approvals || 1)
        : approvedCount >= 1)

  if (!stageComplete) {
    // Release the lock so other assigned approvers can still act on this stage.
    await client
      .from('approval_requests')
      .update({ locked_at: null, locked_by: null })
      .eq('tenant_id', input.tenantId)
      .eq('id', input.requestId)

    return {
      status: 'pending' as const,
      approvedCount,
      approverCount,
      stage: request.stage,
      requestId: request.id,
    }
  }

  const advance = await advanceApprovalStage(client, {
    tenantId: input.tenantId,
    request,
    stage,
  })

  return {
    status: advance.status,
    approvedCount,
    approverCount,
    stage: request.stage,
    requestId: request.id,
    nextStage: advance.status === 'advanced' ? advance.nextStage : null,
  }
}

/** Convenience wrapper that always requires a comment. */
export async function requestChanges(
  client: any,
  input: Omit<SubmitDecisionInput, 'decision'> & { comment: string },
) {
  if (!input.comment?.trim())
    throw createError({ statusCode: 400, statusMessage: 'Descreva os ajustes necessários' })
  return submitApprovalDecision(client, { ...input, decision: 'changes_requested' })
}

// ---------------------------------------------------------------------------
// Revisions & cancellation
// ---------------------------------------------------------------------------

/**
 * A material edit invalidates any in-flight or completed approval: pending runs
 * are superseded and the post returns to draft so a fresh round is required.
 */
export async function createRevision(
  client: any,
  input: { tenantId: string, postId: string },
) {
  const nowIso = new Date().toISOString()
  await client
    .from('approval_requests')
    .update({ run_status: 'superseded', status: 'cancelled', superseded_at: nowIso, resolved_at: nowIso, locked_at: null, locked_by: null })
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)
    .eq('run_status', 'pending')

  await client
    .from('social_posts')
    .update({ editorial_status: 'draft', approved_version_id: null })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
}

/** Explicitly cancels the open approval run and returns the post to draft. */
export async function cancelApprovalRun(
  client: any,
  input: { tenantId: string, postId: string },
) {
  const nowIso = new Date().toISOString()
  await client
    .from('approval_requests')
    .update({ run_status: 'cancelled', status: 'cancelled', resolved_at: nowIso, locked_at: null, locked_by: null })
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)
    .eq('run_status', 'pending')

  await client
    .from('social_posts')
    .update({ editorial_status: 'draft', approved_version_id: null })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
}

// ---------------------------------------------------------------------------
// Scheduling / publishing guards
// ---------------------------------------------------------------------------

async function assertAccountsActive(client: any, tenantId: string, postId: string) {
  const { data: variants } = await client
    .from('social_post_variants')
    .select('account_id')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
  const accountIds = [...new Set((variants || []).map((row: any) => String(row.account_id)).filter(Boolean))]
  if (!accountIds.length)
    throw createError({ statusCode: 400, statusMessage: 'Adicione ao menos um canal de publicação' })

  const { data: accounts } = await client
    .from('social_accounts')
    .select('id, is_active')
    .eq('tenant_id', tenantId)
    .in('id', accountIds)
  const activeIds = new Set((accounts || []).filter((row: any) => row.is_active !== false).map((row: any) => String(row.id)))
  if (accountIds.some(id => !activeIds.has(id)))
    throw createError({ statusCode: 409, statusMessage: 'Uma das contas conectadas está inativa' })
}

async function assertMediaReady(client: any, tenantId: string, postId: string) {
  const { data: relations } = await client
    .from('social_post_assets')
    .select('asset_id, variant_id, media_assets!social_post_assets_asset_id_fkey(status)')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .not('variant_id', 'is', null)

  for (const relation of relations || []) {
    const asset = Array.isArray(relation.media_assets) ? relation.media_assets[0] : relation.media_assets
    if (asset && asset.status && asset.status !== 'ready')
      throw createError({ statusCode: 409, statusMessage: 'Há peças de mídia que ainda não estão prontas' })
  }
}

/**
 * End-customer (direct org / tenant role without agency portfolio) schedules and
 * publishes their own content — no human approval round.
 */
export function isSelfServeSocialRelease(input: {
  isPlatformStaff?: boolean
  organizationType?: string | null
  effectiveRole?: string | null
  capabilities?: Iterable<string> | null
}): boolean {
  if (input.isPlatformStaff)
    return false
  if (input.organizationType === 'direct')
    return true

  const role = input.effectiveRole
  if (role !== 'cliente' && role !== 'atendente')
    return false

  return !holdsAny(input.capabilities, ['agency.clients.read', 'agency.clients.manage'])
}

/**
 * Snapshots the current draft and marks it approved so schedule/publish can proceed
 * without an approval workflow. Agency-managed tenants never take this path.
 */
export async function ensureSelfServeApproved(
  client: any,
  input: { tenantId: string, postId: string, userId: string },
) {
  const { data: post } = await client
    .from('social_posts')
    .select('id, editorial_status, approved_version_id, approval_bypassed')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
    .maybeSingle()

  if (!post)
    throw createError({ statusCode: 404, statusMessage: 'Publicação não encontrada' })

  if (post.approval_bypassed === true)
    return

  const latest = await latestContentVersion(client, input.tenantId, input.postId)
  const alreadyApproved = String(post.editorial_status) === 'approved'
    && post.approved_version_id
    && latest
    && String(latest.id) === String(post.approved_version_id)

  if (alreadyApproved)
    return

  await assertReadyForSubmission(client, input.tenantId, input.postId)

  await client
    .from('approval_requests')
    .update({
      run_status: 'superseded',
      status: 'cancelled',
      resolved_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)
    .eq('run_status', 'pending')

  const version = await createContentVersion(client, input.tenantId, input.postId, input.userId)

  await client
    .from('social_posts')
    .update({
      editorial_status: 'approved',
      approved_version_id: version.id,
      workflow_id: SYSTEM_WORKFLOW_IDS.noApproval,
      approval_bypassed: false,
    })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
}

interface AssertScheduleInput {
  tenantId: string
  postId: string
  capabilities?: string[]
  isPlatformStaff?: boolean
  requirePublish?: boolean
}

async function assertPostReleasable(client: any, input: AssertScheduleInput) {
  const { data: post } = await client
    .from('social_posts')
    .select('id, editorial_status, publication_status, approved_version_id, approval_bypassed')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
    .maybeSingle()

  if (!post)
    throw createError({ statusCode: 404, statusMessage: 'Publicação não encontrada' })

  const requiredCapabilities = input.requirePublish
    ? ['marketing.social.publish']
    : ['marketing.social.schedule', 'marketing.social.publish']
  if (input.capabilities && !input.isPlatformStaff && !holdsAny(input.capabilities, requiredCapabilities))
    throw createError({ statusCode: 403, statusMessage: 'Sem permissão para esta ação' })

  const editorialApproved = String(post.editorial_status) === 'approved' || post.approval_bypassed === true
  if (!editorialApproved)
    throw createError({ statusCode: 409, statusMessage: 'A publicação precisa estar aprovada' })

  if (!post.approved_version_id)
    throw createError({ statusCode: 409, statusMessage: 'A versão atual ainda não foi aprovada' })

  const latest = await latestContentVersion(client, input.tenantId, input.postId)
  if (latest && String(latest.id) !== String(post.approved_version_id)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A versão aprovada está desatualizada — reenvie a nova versão para aprovação',
    })
  }

  const publicationStatus = String(post.publication_status || 'not_scheduled')
  if (['deletion_pending', 'deleted'].includes(publicationStatus))
    throw createError({ statusCode: 409, statusMessage: 'Publicação em processo de exclusão' })

  await assertAccountsActive(client, input.tenantId, input.postId)
  await assertMediaReady(client, input.tenantId, input.postId)

  return post
}

export async function assertPostCanBeScheduled(
  client: any,
  input: { tenantId: string, postId: string, capabilities?: string[], isPlatformStaff?: boolean },
) {
  return assertPostReleasable(client, { ...input, requirePublish: false })
}

export async function assertPostCanBePublished(
  client: any,
  input: { tenantId: string, postId: string, capabilities?: string[], isPlatformStaff?: boolean },
) {
  return assertPostReleasable(client, { ...input, requirePublish: true })
}

// ---------------------------------------------------------------------------
// Enqueue approved post for publication
// ---------------------------------------------------------------------------

export async function enqueueApprovedPost(
  client: any,
  input: {
    tenantId: string
    postId: string
    scheduledAt?: string | null
    publishNow?: boolean
    capabilities?: string[]
    isPlatformStaff?: boolean
    /** Client portal: auto-approve current draft before release checks. */
    selfServe?: boolean
    userId?: string
  },
) {
  if (input.selfServe) {
    if (!input.userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Usuário obrigatório para publicação sem aprovação',
      })
    }
    await ensureSelfServeApproved(client, {
      tenantId: input.tenantId,
      postId: input.postId,
      userId: input.userId,
    })
  }

  await assertPostReleasable(client, {
    tenantId: input.tenantId,
    postId: input.postId,
    capabilities: input.capabilities,
    isPlatformStaff: input.isPlatformStaff,
    requirePublish: Boolean(input.publishNow),
  })

  const { data: post, error: postError } = await client
    .from('social_posts')
    .select('id, approved_version_id, scheduled_at')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
    .maybeSingle()

  if (postError || !post)
    throw createError({ statusCode: 404, statusMessage: 'Publicação não encontrada' })

  const scheduledAt = input.publishNow
    ? new Date().toISOString()
    : (input.scheduledAt || post.scheduled_at || new Date().toISOString())

  const { data: variants, error: variantsError } = await client
    .from('social_post_variants')
    .select('id, account_id')
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)

  if (variantsError || !variants?.length)
    throw createError({ statusCode: 400, statusMessage: 'Adicione ao menos um canal de publicação' })

  const { data: existingJobs } = await client
    .from('publication_jobs')
    .select('id, variant_id, status, idempotency_key')
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)
    .eq('version_id', post.approved_version_id)

  const publishedVariantIds = new Set(
    (existingJobs || [])
      .filter((job: any) => job.status === 'published' || job.status === 'processing')
      .map((job: any) => String(job.variant_id)),
  )

  const rows = variants
    .filter((variant: { id: string }) => !publishedVariantIds.has(String(variant.id)))
    .map((variant: { id: string, account_id: string }) => ({
      tenant_id: input.tenantId,
      post_id: input.postId,
      variant_id: variant.id,
      version_id: post.approved_version_id,
      account_id: variant.account_id,
      scheduled_at: scheduledAt,
      status: 'pending',
      next_attempt_at: null,
      last_error_code: null,
      last_error_message: null,
      locked_at: null,
      locked_by: null,
      attempts: 0,
      idempotency_key: `${input.postId}:${post.approved_version_id}:${variant.id}`,
    }))

  if (!rows.length && publishedVariantIds.size === variants.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Todos os canais desta versão já foram publicados',
    })
  }

  let jobs: any[] = []
  if (rows.length) {
    const { data, error: jobsError } = await client
      .from('publication_jobs')
      .upsert(rows, { onConflict: 'idempotency_key' })
      .select('*')
    if (jobsError)
      throw createError({ statusCode: 400, statusMessage: jobsError.message })
    jobs = data || []
  }

  await client
    .from('publication_jobs')
    .update({
      scheduled_at: scheduledAt,
      status: 'pending',
      next_attempt_at: null,
      last_error_code: null,
      last_error_message: null,
      locked_at: null,
      locked_by: null,
    })
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)
    .eq('version_id', post.approved_version_id)
    .in('status', ['pending', 'retrying', 'failed'])

  await client
    .from('social_posts')
    .update({ publication_status: 'scheduled', scheduled_at: scheduledAt })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)

  return jobs
}

const UNSCHEDULE_BLOCKED = [
  'publishing',
  'published',
  'partially_published',
  'deletion_pending',
  'deleted',
] as const

/**
 * Cancel pending publication jobs and return publication_status to not_scheduled.
 * Does not delete remote posts (Meta/LinkedIn). Matches Hub PUT job-cancel + calendar slot cancel.
 */
export async function unscheduleApprovedPost(
  client: any,
  input: {
    tenantId: string
    postId: string
    capabilities?: string[]
    isPlatformStaff?: boolean
    clearScheduledAt?: boolean
  },
) {
  const { data: post } = await client
    .from('social_posts')
    .select('id, publication_status, scheduled_at, deleted_at')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
    .maybeSingle()

  if (!post)
    throw createError({ statusCode: 404, statusMessage: 'Publicação não encontrada' })
  if (post.deleted_at)
    throw createError({ statusCode: 409, statusMessage: 'Publicação excluída não pode ser alterada' })

  if (input.capabilities && !input.isPlatformStaff && !holdsAny(input.capabilities, [
    'marketing.social.schedule',
    'marketing.social.publish',
  ])) {
    throw createError({ statusCode: 403, statusMessage: 'Sem permissão para cancelar o agendamento' })
  }

  const publicationStatus = String(post.publication_status || 'not_scheduled')
  if (UNSCHEDULE_BLOCKED.includes(publicationStatus as typeof UNSCHEDULE_BLOCKED[number])) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Não é possível cancelar o agendamento após publicação ou exclusão',
    })
  }

  await client
    .from('publication_jobs')
    .update({ status: 'cancelled', locked_at: null, locked_by: null })
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)
    .in('status', ['pending', 'retrying', 'failed'])

  await client
    .from('marketing_post_schedules')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)
    .in('status', ['planned', 'queued', 'failed'])

  await client
    .from('social_posts')
    .update({
      publication_status: 'not_scheduled',
      scheduled_at: input.clearScheduledAt ? null : post.scheduled_at,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)

  return {
    cancelled: true,
    publicationStatus: 'not_scheduled' as const,
    scheduledAt: input.clearScheduledAt ? null : (post.scheduled_at ?? null),
  }
}

// ---------------------------------------------------------------------------
// Bypass approval
// ---------------------------------------------------------------------------

export async function bypassApproval(
  client: any,
  input: {
    tenantId: string
    postId: string
    userId: string
    justification: string
    capabilities?: string[]
    isPlatformStaff?: boolean
  },
) {
  if (!input.isPlatformStaff
    && input.capabilities
    && !holdsCapability(new Set(input.capabilities), 'marketing.social.approval.bypass')) {
    throw createError({ statusCode: 403, statusMessage: 'Sem permissão para ignorar a aprovação' })
  }

  const justification = input.justification?.trim()
  if (!justification)
    throw createError({ statusCode: 400, statusMessage: 'Descreva a justificativa do bypass' })

  const { data: post } = await client
    .from('social_posts')
    .select('id, title, created_by')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)
    .maybeSingle()
  if (!post)
    throw createError({ statusCode: 404, statusMessage: 'Publicação não encontrada' })

  let latest = await latestContentVersion(client, input.tenantId, input.postId)
  if (!latest) {
    await assertReadyForSubmission(client, input.tenantId, input.postId)
    const created = await createContentVersion(client, input.tenantId, input.postId, input.userId)
    latest = { id: created.id, version: created.version }
  }

  const nowIso = new Date().toISOString()
  await client
    .from('approval_requests')
    .update({ run_status: 'superseded', status: 'cancelled', superseded_at: nowIso, resolved_at: nowIso, locked_at: null, locked_by: null })
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)
    .eq('run_status', 'pending')

  await client
    .from('social_posts')
    .update({
      approval_bypassed: true,
      approval_bypass_reason: justification,
      approval_bypassed_by: input.userId,
      approval_bypassed_at: nowIso,
      editorial_status: 'approved',
      approved_version_id: latest.id,
    })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.postId)

  if (post.created_by) {
    await createSocialNotification(client, {
      tenantId: input.tenantId,
      userId: String(post.created_by),
      type: 'approval_bypassed',
      title: 'Aprovação ignorada',
      body: `A aprovação de "${post.title}" foi ignorada com justificativa e a publicação está liberada.`,
      actionUrl: `/marketing/content/${input.postId}`,
      metadata: { postId: input.postId, versionId: latest.id, reason: justification },
      idempotencyKey: `bypass:${input.postId}:${latest.id}`,
    })
  }

  const { emitSocialAutomation } = await import('~/server/utils/social-automations')
  await emitSocialAutomation(client, {
    tenantId: input.tenantId,
    trigger: 'editorial.approved',
    actorId: input.userId,
    postId: input.postId,
    entityType: 'social_post',
    entityId: input.postId,
    payload: { bypass: true, versionId: latest.id },
  })

  return { versionId: latest.id, reason: justification }
}

export interface BatchDecisionItem {
  requestId: string
  decision: DecisionValue
  comment?: string | null
  changeCategory?: 'art' | 'copy' | 'date' | 'platform' | 'incorrect_info' | 'other' | null
}

export interface BatchDecisionInput {
  tenantId: string
  userId: string
  items: BatchDecisionItem[]
  capabilities?: string[]
  isPlatformAdmin?: boolean
}

/**
 * Applies individual decisions per request/version. Partial failures are
 * returned item-by-item — never a silent all-or-nothing success.
 */
export async function submitBatchApprovalDecisions(client: any, input: BatchDecisionInput) {
  if (!input.items.length)
    throw createError({ statusCode: 400, statusMessage: 'Selecione ao menos um conteúdo' })
  if (input.items.length > 50)
    throw createError({ statusCode: 400, statusMessage: 'Limite de 50 decisões por lote' })

  const results: Array<{
    requestId: string
    ok: boolean
    status?: string
    statusCode?: number
    message?: string
  }> = []

  for (const item of input.items) {
    try {
      const result = await submitApprovalDecision(client, {
        tenantId: input.tenantId,
        requestId: item.requestId,
        userId: input.userId,
        decision: item.decision,
        comment: item.comment,
        changeCategory: item.changeCategory,
        capabilities: input.capabilities,
        isPlatformAdmin: input.isPlatformAdmin,
      })
      results.push({
        requestId: item.requestId,
        ok: true,
        status: String(result.status),
      })
    }
    catch (error: any) {
      results.push({
        requestId: item.requestId,
        ok: false,
        statusCode: Number(error?.statusCode || 400),
        message: String(error?.statusMessage || error?.message || 'Falha na decisão'),
      })
    }
  }

  const succeeded = results.filter(row => row.ok).length
  const failed = results.length - succeeded

  return {
    total: results.length,
    succeeded,
    failed,
    results,
  }
}

