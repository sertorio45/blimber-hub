import { getQuery } from 'h3'
import { z } from 'zod'

import {
  attachApprovalPreviewUrls,
  canDecideApprovalRequest,
  mapApprovalListItem,
} from '~/server/utils/social-approval-ux'
import { requireSocialContext } from '~/server/utils/social-context'
import { listAccessibleManagedClientIds } from '~/server/utils/agency-ops'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'
import { holdsCapability } from '~/constants/workspace'

const querySchema = z.object({
  status: z.string().optional(),
  stage: z.enum(['internal', 'client']).optional(),
  assignedToMe: z.coerce.boolean().optional(),
  overdue: z.coerce.boolean().optional(),
  format: z.string().optional(),
  platform: z.string().optional(),
  responsibleId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  groupBy: z.enum(['month']).optional(),
  /** Company portal inbox: assigned + tenant client-stage they can decide. */
  inbox: z.enum(['client']).optional(),
  /** When set with agency capability, list across accessible managed tenants. */
  organizationId: z.string().uuid().optional(),
  tenantIdFilter: z.string().uuid().optional(),
})

const SELECT = `
  *,
  social_posts!approval_requests_post_id_fkey (
    id, title, content, status, scheduled_at, current_version, assigned_to, created_by,
    editorial_status, publication_status
  ),
  content_versions!approval_requests_version_id_fkey (id, version, snapshot, created_at, created_by),
  approval_request_approvers!approval_request_approvers_request_id_fkey (
    user_id, role_name, role_slug, assigned_capability, is_alternate
  ),
  approval_decisions!approval_decisions_request_id_fkey (
    approver_id, decision, comment, change_category, created_at
  )
`

export default defineEventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))

  // Agency org-wide board: caller may aggregate managed clients they can reach.
  if (query.organizationId) {
    const workspace = await requireWorkspaceContext(event, {
      organizationId: query.organizationId,
      capability: 'agency.clients.read',
    })

    let tenantIds = await listAccessibleManagedClientIds(workspace, query.organizationId)
    if (query.tenantIdFilter) {
      if (!tenantIds.includes(query.tenantIdFilter))
        return { data: [] }
      tenantIds = [query.tenantIdFilter]
    }
    if (!tenantIds.length)
      return { data: [] }

    let request = workspace.client
      .from('approval_requests')
      .select(SELECT)
      .in('tenant_id', tenantIds)
      .order('created_at', { ascending: false })
      .limit(200)

    request = applyCommonFilters(request, query, workspace.userId)

    const { data, error } = await request
    if (error)
      throw createError({ statusCode: 400, statusMessage: error.message })

    let rows = data || []
    if (query.assignedToMe) {
      rows = rows.filter((row: any) =>
        (row.approval_request_approvers || []).some((a: any) => a.user_id === workspace.userId),
      )
    }

    rows = await attachApprovalPreviewUrls(workspace.client, rows)
    const { data: tenants } = await workspace.client
      .from('tenant')
      .select('id, name, slug')
      .in('id', tenantIds)
    const tenantById = new Map<string, { id: string, name: string, slug: string }>(
      (tenants || []).map((t: any) => [String(t.id), { id: String(t.id), name: String(t.name), slug: String(t.slug) }]),
    )

    const mapped = rows
      .map((row: any) => withCanDecide(
        mapApprovalListItem(row, tenantById.get(row.tenant_id) || null),
        workspace.userId,
        workspace.capabilities,
        workspace.isPlatformStaff,
      ))
      .filter((item: any) => matchesClientFilters(item, query))

    return {
      data: mapped,
      meta: {
        scope: 'organization',
        tenant_count: tenantIds.length,
        groups: query.groupBy === 'month' ? groupApprovalsByMonth(mapped) : undefined,
      },
    }
  }

  const { client, tenantId, user, workspace, isPlatformStaff } = await requireSocialContext(event, 'marketing.social.read')

  let request = client
    .from('approval_requests')
    .select(SELECT)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  request = applyCommonFilters(request, query, user.id)

  const canDecideClientStage = holdsCapability(workspace.capabilities, 'marketing.social.approval.client')
  const clientInbox = query.inbox === 'client' && (isPlatformStaff || canDecideClientStage)

  // Restrict to assigned requests when the caller is an approver without
  // portfolio/manage scope — except company admins/approvers listing the portal inbox.
  const restrictToAssigned = Boolean(query.assignedToMe)
    || (
      !clientInbox
      && !isPlatformStaff
      && !holdsCapability(workspace.capabilities, 'marketing.social.manage')
      && !holdsCapability(workspace.capabilities, 'agency.clients.read')
    )

  if (restrictToAssigned) {
    const { data: assigned } = await client
      .from('approval_request_approvers')
      .select('request_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
    const requestIds = (assigned || []).map((row: any) => row.request_id)
    if (!requestIds.length)
      return { data: [] }
    request = request.in('id', requestIds)
  }

  const { data, error } = await request
  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  const rows = await attachApprovalPreviewUrls(client, data || [])
  const { data: tenant } = await client
    .from('tenant')
    .select('id, name, slug')
    .eq('id', tenantId)
    .maybeSingle()

  const mapped = rows
    .map((row: any) => withCanDecide(
      mapApprovalListItem(row, tenant || null),
      user.id,
      workspace.capabilities,
      isPlatformStaff,
    ))
    .filter((item: any) => {
      if (!matchesClientFilters(item, query))
        return false
      if (!clientInbox)
        return true
      if (item.stage === 'internal' && !item.approver_ids.includes(user.id))
        return false
      return true
    })

  return {
    data: mapped,
    meta: {
      scope: 'tenant',
      groups: query.groupBy === 'month' ? groupApprovalsByMonth(mapped) : undefined,
    },
  }
})

function groupApprovalsByMonth(items: any[]) {
  const groups = new Map<string, { key: string, label: string, ids: string[] }>()
  for (const item of items) {
    const raw = item.due_at || item.created_at || null
    const date = raw ? new Date(raw) : null
    const key = date && !Number.isNaN(date.getTime())
      ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      : 'sem-data'
    const label = key === 'sem-data'
      ? 'Sem data'
      : date!.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    const existing = groups.get(key) || { key, label, ids: [] as string[] }
    existing.ids.push(String(item.id))
    groups.set(key, existing)
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function applyCommonFilters(request: any, query: z.infer<typeof querySchema>, userId: string) {
  let next = request

  if (query.status && query.status !== 'all') {
    if (query.status === 'overdue') {
      next = next.eq('status', 'pending').lt('due_at', new Date().toISOString())
    }
    else if (query.status === 'pending') {
      next = next.eq('status', 'pending')
    }
    else {
      next = next.eq('status', query.status)
    }
  }

  if (query.stage)
    next = next.eq('stage', query.stage)

  if (query.from)
    next = next.gte('created_at', query.from)
  if (query.to)
    next = next.lte('created_at', query.to)

  if (query.overdue && query.status !== 'overdue')
    next = next.eq('status', 'pending').lt('due_at', new Date().toISOString())

  if (query.assignedToMe) {
    // Handled by caller via approver join for tenant scope; for org scope filter in-memory.
  }

  void userId
  return next
}

function withCanDecide(
  item: ReturnType<typeof mapApprovalListItem>,
  userId: string,
  capabilities: Iterable<string>,
  isPlatformStaff?: boolean,
) {
  return {
    ...item,
    can_decide: canDecideApprovalRequest({
      status: item.status,
      stage: item.stage,
      approverIds: item.approver_ids,
      userId,
      capabilities,
      isPlatformStaff,
    }),
  }
}

function matchesClientFilters(item: any, query: z.infer<typeof querySchema>) {
  if (query.platform && !item.platforms.includes(query.platform))
    return false
  if (query.format && !item.formats.includes(query.format))
    return false
  if (query.responsibleId) {
    const matchesApprover = item.approver_ids?.includes(query.responsibleId)
    const matchesAssignee = item.assigned_to === query.responsibleId
    if (!matchesApprover && !matchesAssignee)
      return false
  }
  if (query.search) {
    const q = query.search.toLowerCase()
    const hay = `${item.title} ${item.client?.name || ''}`.toLowerCase()
    if (!hay.includes(q))
      return false
  }
  return true
}
