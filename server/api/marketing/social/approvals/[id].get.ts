import { getRouterParam, getQuery } from 'h3'
import { z } from 'zod'

import {
  attachApprovalPreviewUrls,
  canDecideApprovalRequest,
  canSeeInternalComments,
  mapApprovalListItem,
} from '~/server/utils/social-approval-ux'
import { requireSocialContext } from '~/server/utils/social-context'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

const querySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

/**
 * Full approval review payload for a single request.
 * Always binds preview/captions to the exact version being approved.
 */
export default defineEventHandler(async (event) => {
  const { id } = paramsSchema.parse({ id: getRouterParam(event, 'id') })
  const query = querySchema.parse(getQuery(event))

  let client: any
  let tenantId: string
  let userId: string
  let capabilities: string[]
  let isPlatformStaff = false

  if (query.organizationId && query.tenant_id) {
    const workspace = await requireWorkspaceContext(event, {
      organizationId: query.organizationId,
      tenantId: query.tenant_id,
      capability: 'marketing.social.read',
    })
    client = workspace.client
    tenantId = query.tenant_id
    userId = workspace.userId
    capabilities = workspace.capabilities
    isPlatformStaff = workspace.isPlatformStaff
  }
  else {
    const ctx = await requireSocialContext(event, 'marketing.social.read', query.tenant_id)
    client = ctx.client
    tenantId = ctx.tenantId
    userId = ctx.user.id
    capabilities = ctx.workspace.capabilities
    isPlatformStaff = ctx.isPlatformStaff
  }

  const { data: row, error } = await client
    .from('approval_requests')
    .select(`
      *,
      social_posts!approval_requests_post_id_fkey (
        id, title, content, status, scheduled_at, current_version, assigned_to, created_by,
        editorial_status, publication_status, approved_version_id, timezone
      ),
      content_versions!approval_requests_version_id_fkey (id, version, snapshot, checksum, created_at, created_by),
      approval_request_approvers!approval_request_approvers_request_id_fkey (
        user_id, role_name, role_slug, assigned_capability, is_alternate
      ),
      approval_decisions!approval_decisions_request_id_fkey (
        id, approver_id, decision, comment, change_category, created_at
      )
    `)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Solicitação não encontrada' })

  await attachApprovalPreviewUrls(client, [row])

  const post = Array.isArray(row.social_posts) ? row.social_posts[0] : row.social_posts
  const version = Array.isArray(row.content_versions) ? row.content_versions[0] : row.content_versions

  // Version history for the same post (for comparison UI).
  const { data: versions } = await client
    .from('content_versions')
    .select('id, version, snapshot, checksum, created_at, created_by')
    .eq('tenant_id', tenantId)
    .eq('post_id', row.post_id)
    .order('version', { ascending: false })
    .limit(20)

  const previousVersion = (versions || []).find(
    (item: any) => Number(item.version) === Number(version?.version || 0) - 1,
  ) || null

  const showInternal = canSeeInternalComments(capabilities, isPlatformStaff)

  let commentsQuery = client
    .from('social_comments')
    .select('id, body, author_id, version_id, visibility, parent_id, created_at, resolved_at, anchor_type, x_percent, y_percent, slide_index, media_time_ms, asset_id')
    .eq('tenant_id', tenantId)
    .eq('post_id', row.post_id)
    .order('created_at', { ascending: true })

  if (!showInternal)
    commentsQuery = commentsQuery.eq('visibility', 'shared')

  const { data: comments } = await commentsQuery

  // Timeline from audit events (safe fields only for clients).
  let timelineQuery = client
    .from('audit_events')
    .select('id, action, actor_id, entity_type, entity_id, created_at, after_data')
    .eq('tenant_id', tenantId)
    .or(`entity_id.eq.${row.post_id},entity_id.eq.${row.id}`)
    .order('created_at', { ascending: false })
    .limit(40)

  const { data: timeline } = await timelineQuery

  const safeTimeline = (timeline || []).filter((event: any) => {
    if (showInternal)
      return true
    const blocked = /token|secret|integration|cost|internal/i.test(String(event.action || ''))
    return !blocked
  }).map((event: any) => ({
    id: event.id,
    action: event.action,
    actor_id: event.actor_id,
    created_at: event.created_at,
    summary: summarizeTimelineAction(event.action),
  }))

  const { data: tenant } = await client
    .from('tenant')
    .select('id, name, slug')
    .eq('id', tenantId)
    .maybeSingle()

  const item = mapApprovalListItem(row, tenant || null)
  const canManage = isPlatformStaff
    || capabilities.includes('marketing.social.manage')
    || capabilities.includes('marketing.social.workflow.manage')

  const errorState = resolveErrorState(row, version)
  const lastChangeDecision = [...(row.approval_decisions || [])]
    .reverse()
    .find((d: any) => d.decision === 'changes_requested')

  const accounts = (version?.snapshot?.variants || [])
    .map((variant: any) => ({
      id: variant.account_id || null,
      name: variant.account_name || variant.account?.name || null,
      platform: variant.platform,
      username: variant.account_username || variant.account?.username || null,
    }))
    .filter((account: any, index: number, list: any[]) =>
      list.findIndex(item =>
        (item.id && item.id === account.id)
        || (!item.id && item.platform === account.platform && item.name === account.name),
      ) === index,
    )

  return {
    data: {
      ...item,
      error_state: errorState,
      can_decide: canDecideApprovalRequest({
        status: row.status,
        stage: row.stage,
        approverIds: (row.approval_request_approvers || []).map((a: any) => a.user_id),
        userId,
        capabilities,
        isPlatformStaff,
      }),
      can_cancel: row.status === 'pending' && canManage,
      can_edit: canManage || capabilities.includes('marketing.social.update'),
      revision_reason: lastChangeDecision?.comment || null,
      revision_category: lastChangeDecision?.change_category || null,
      accounts,
      version: version
        ? {
            id: version.id,
            number: version.version,
            snapshot: version.snapshot,
            created_at: version.created_at,
            created_by: version.created_by,
            checksum: version.checksum,
          }
        : null,
      previous_version: previousVersion
        ? {
            id: previousVersion.id,
            number: previousVersion.version,
            snapshot: previousVersion.snapshot,
            created_at: previousVersion.created_at,
            created_by: previousVersion.created_by,
          }
        : null,
      versions: (versions || []).map((v: any) => ({
        id: v.id,
        number: v.version,
        created_at: v.created_at,
        created_by: v.created_by,
        is_current_approval: v.id === row.version_id,
      })),
      comments: (comments || []).map((c: any) => ({
        id: c.id,
        body: c.body,
        author_id: c.author_id,
        version_id: c.version_id,
        visibility: c.visibility || 'shared',
        created_at: c.created_at,
        resolved_at: c.resolved_at,
        anchor_type: c.anchor_type || 'none',
        x_percent: c.x_percent,
        y_percent: c.y_percent,
        slide_index: c.slide_index,
        media_time_ms: c.media_time_ms,
        asset_id: c.asset_id,
      })),
      timeline: safeTimeline,
      post: post
        ? {
            id: post.id,
            title: post.title,
            editorial_status: post.editorial_status,
            publication_status: post.publication_status,
            scheduled_at: post.scheduled_at,
            timezone: post.timezone,
            approved_version_id: post.approved_version_id,
            created_by: post.created_by,
          }
        : null,
    },
  }
})

function summarizeTimelineAction(action: string) {
  const map: Record<string, string> = {
    'social_post.submitted': 'Enviado para aprovação',
    'approval.approved': 'Aprovado',
    'approval.changes_requested': 'Alterações solicitadas',
    'approval.rejected': 'Reprovado',
    'social_post.scheduled': 'Agendado',
    'social_post.publish_now': 'Publicado',
    'social_post.approval_bypassed': 'Aprovação ignorada (bypass)',
    'social_comment.created': 'Novo comentário',
    'approval.cancelled': 'Solicitação cancelada',
  }
  return map[action] || action
}

function resolveErrorState(row: any, version: any) {
  if (row.status === 'cancelled' || row.run_status === 'cancelled')
    return 'cancelled'
  if (row.run_status === 'superseded')
    return 'superseded'
  if (!version?.snapshot)
    return 'version_missing'

  const assets = version.snapshot.assets || []
  const missingMedia = assets.some((rel: any) =>
    rel.media_assets && !rel.media_assets.object_path && !rel.media_assets.preview_url,
  )
  if (missingMedia)
    return 'media_unavailable'

  const variants = version.snapshot.variants || []
  // Soft check — full account validation happens on schedule.
  if (!variants.length)
    return 'no_channels'

  const inactiveIntegration = variants.some((variant: any) =>
    variant.account_is_active === false || variant.integration_removed === true,
  )
  if (inactiveIntegration)
    return 'integration_removed'

  return null
}
