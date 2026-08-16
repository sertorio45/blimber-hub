import type { H3Event } from 'h3'

import { createError } from 'h3'

import { holdsCapability } from '~/constants/workspace'

/**
 * Enriches approval request rows with signed preview URLs from the snapshot.
 * Mutates rows in place and returns them.
 */
export async function attachApprovalPreviewUrls(client: any, rows: any[]) {
  const paths = rows.flatMap((row) => {
    const version = Array.isArray(row.content_versions) ? row.content_versions[0] : row.content_versions
    return (version?.snapshot?.assets || [])
      .map((asset: any) => asset.media_assets?.object_path)
      .filter(Boolean)
  })

  const uniquePaths = [...new Set(paths)]
  const { data: signedRows } = uniquePaths.length
    ? await client.storage.from('marketing-assets').createSignedUrls(uniquePaths, 60 * 60)
    : { data: [] }

  const signedByPath = new Map((signedRows || []).map((row: any) => [row.path, row.signedUrl]))

  for (const row of rows) {
    const version = Array.isArray(row.content_versions) ? row.content_versions[0] : row.content_versions
    for (const relation of version?.snapshot?.assets || []) {
      const asset = relation.media_assets
      if (asset?.object_path)
        asset.preview_url = signedByPath.get(asset.object_path) || null
    }
  }

  return rows
}

export function waitingMs(createdAt: string | null | undefined) {
  if (!createdAt)
    return null
  return Math.max(0, Date.now() - new Date(createdAt).getTime())
}

export function isOverdue(dueAt: string | null | undefined, status: string) {
  if (status !== 'pending' || !dueAt)
    return false
  return new Date(dueAt).getTime() < Date.now()
}

/** Whether the actor may register a decision on this approval request. */
export function canDecideApprovalRequest(input: {
  status: string
  stage?: string | null
  approverIds?: string[] | null
  userId: string
  capabilities: Iterable<string>
  isPlatformStaff?: boolean
}): boolean {
  if (input.status !== 'pending')
    return false
  if (input.isPlatformStaff)
    return true

  const assigned = (input.approverIds || []).includes(input.userId)
  const stage = input.stage || 'client'

  if (assigned)
    return true

  return stage === 'client'
    && holdsCapability(input.capabilities, 'marketing.social.approval.client')
}

/** Client-facing roles must never see internal comments. */
export function canSeeInternalComments(capabilities: Iterable<string>, isPlatformStaff: boolean) {
  if (isPlatformStaff)
    return true
  const set = capabilities instanceof Set ? capabilities : new Set(capabilities)
  return set.has('agency.clients.read')
    || set.has('marketing.social.approval.internal')
    || set.has('marketing.social.manage')
    || set.has('marketing.social.workflow.manage')
}

export function mapApprovalListItem(row: any, tenantMeta?: { id: string, name: string, slug: string } | null) {
  const post = Array.isArray(row.social_posts) ? row.social_posts[0] : row.social_posts
  const version = Array.isArray(row.content_versions) ? row.content_versions[0] : row.content_versions
  const variants = version?.snapshot?.variants || []
  const platforms = [...new Set(variants.map((v: any) => v.platform).filter(Boolean))]
  const formats = [...new Set(variants.map((v: any) => v.format).filter(Boolean))]
  const overdue = isOverdue(row.due_at, row.status)

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    client: tenantMeta || {
      id: row.tenant_id,
      name: post?.tenant_name || null,
      slug: null,
    },
    post_id: row.post_id,
    title: post?.title || 'Sem título',
    content: post?.content || '',
    status: row.status,
    run_status: row.run_status || row.status,
    stage: row.stage || 'client',
    stage_position: row.stage_position || 1,
    version_id: row.version_id,
    version_number: version?.version ?? null,
    platforms,
    formats,
    due_at: row.due_at,
    overdue,
    waiting_ms: waitingMs(row.created_at),
    created_at: row.created_at,
    requested_by: row.requested_by,
    assigned_to: post?.assigned_to || null,
    approver_ids: (row.approval_request_approvers || []).map((a: any) => a.user_id),
    decisions: row.approval_decisions || [],
    scheduled_at: post?.scheduled_at || version?.snapshot?.post?.scheduled_at || null,
    preview_snapshot: version?.snapshot || null,
    raw: row,
  }
}

export function assertDecisionConflict(error: any) {
  const message = String(error?.message || error?.statusMessage || '')
  if (
    message.includes('approval_request_not_pending')
    || message.includes('já foi encerrada')
    || message.includes('já registrou')
    || message.includes('23505')
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Outra pessoa já registrou uma decisão nesta solicitação. Atualize a lista.',
      data: { code: 'approval_conflict' },
    })
  }
  if (message.includes('approval_decisions_are_immutable')) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Esta decisão já foi registrada e não pode ser alterada.',
      data: { code: 'decision_immutable' },
    })
  }
}

export function unusedEvent(_event: H3Event) {
  // helper module marker for tree-shaking friendliness
}
