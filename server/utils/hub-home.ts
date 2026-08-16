import type { HubAttentionItem, HubAttentionTone, HubPersona } from '~/composables/useHubHome'
import type { WorkspaceContext } from '~/server/utils/workspace-context'

import { resolveTenantModuleSlugs } from '~/constants/modules'
import {
  assertAgencyOrganization,
  countByTenantIds,
  listAccessibleManagedClientIds,
} from '~/server/utils/agency-ops'

export type { HubAttentionItem, HubAttentionTone }

type CountClient = WorkspaceContext['client']

async function countRows(
  client: CountClient,
  table: string,
  apply: (query: any) => any,
): Promise<number> {
  let query = client.from(table).select('id', { count: 'exact', head: true })
  query = apply(query)
  const { count, error } = await query
  if (error) {
    console.error(`[hub-home] count failed on ${table}`, error.message)
    return 0
  }
  return count ?? 0
}

async function sumWhatsAppUnread(
  client: CountClient,
  tenantId: string,
  assignedTo?: string | null,
): Promise<number> {
  let query = client
    .from('whatsapp_conversation')
    .select('unread_count')
    .eq('tenant_id', tenantId)
    .gt('unread_count', 0)

  if (assignedTo)
    query = query.eq('assigned_to', assignedTo)

  const { data, error } = await query
  if (error) {
    console.error('[hub-home] unread sum failed', error.message)
    return 0
  }
  return (data || []).reduce((sum: number, row: { unread_count?: number | null }) =>
    sum + Number(row.unread_count || 0), 0)
}

function hasModule(modules: string[], slug: string): boolean {
  return resolveTenantModuleSlugs(modules).includes(slug as any)
}

function pushIf(
  items: HubAttentionItem[],
  item: HubAttentionItem,
) {
  if (item.count > 0)
    items.push(item)
}

async function countTenantsWithoutModules(client: CountClient): Promise<number> {
  const [{ data: tenants, error: tenantError }, { data: moduleRows, error: moduleError }] = await Promise.all([
    client.from('tenant').select('id').eq('is_active', true),
    client.from('tenant_modules').select('tenant_id').eq('is_active', true),
  ])

  if (tenantError) {
    console.error('[hub-home] tenants without modules failed', tenantError.message)
    return 0
  }
  if (moduleError) {
    console.error('[hub-home] tenant_modules scan failed', moduleError.message)
    return 0
  }

  const withModules = new Set((moduleRows || []).map((row: { tenant_id: string }) => row.tenant_id))
  return (tenants || []).filter((row: { id: string }) => !withModules.has(row.id)).length
}

export async function buildStaffAttention(client: CountClient): Promise<HubAttentionItem[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = new Date().toISOString()
  const recentFailuresSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    tenantsWithoutModules,
    pendingInvites,
    failedOnboardings,
    incompleteOnboardings,
    expiredSocialAccounts,
    failedPosts,
  ] = await Promise.all([
    countTenantsWithoutModules(client),
    countRows(client, 'organization_invites', q =>
      q.eq('status', 'pending')),
    countRows(client, 'agency_client_onboardings', q =>
      q.eq('status', 'failed').gte('updated_at', since)),
    countRows(client, 'agency_client_onboardings', q =>
      q.in('status', ['draft', 'in_progress'])),
    countRows(client, 'social_accounts', q =>
      q.eq('is_active', true).not('token_expires_at', 'is', null).lt('token_expires_at', nowIso)),
    countRows(client, 'social_posts', q =>
      q.eq('status', 'failed').gte('updated_at', recentFailuresSince)),
  ])

  const items: HubAttentionItem[] = []
  pushIf(items, {
    id: 'failed-onboardings',
    title: 'Onboardings com falha',
    description: 'Provisionamento que precisa revisão',
    count: failedOnboardings,
    to: '/admin/agencies',
    icon: 'lucide:circle-alert',
    tone: 'danger',
  })
  pushIf(items, {
    id: 'failed-posts-platform',
    title: 'Publicações com erro',
    description: 'Falhas de publish nos últimos 7 dias — abra a empresa afetada',
    count: failedPosts,
    to: '/admin/tenants',
    icon: 'lucide:circle-alert',
    tone: 'danger',
  })
  pushIf(items, {
    id: 'expired-social',
    title: 'Integrações sociais expiradas',
    description: 'Contas ativas com token vencido — selecione o tenant no seletor',
    count: expiredSocialAccounts,
    to: '/admin/tenants',
    icon: 'lucide:plug-zap',
    tone: 'warning',
  })
  pushIf(items, {
    id: 'tenants-without-modules',
    title: 'Empresas sem módulo',
    description: 'Tenants ativos sem CRM, Marketing ou WhatsApp',
    count: tenantsWithoutModules,
    to: '/admin/tenants',
    icon: 'lucide:boxes',
    tone: 'warning',
  })
  pushIf(items, {
    id: 'incomplete-onboardings',
    title: 'Onboardings incompletos',
    description: 'Rascunhos ou em andamento',
    count: incompleteOnboardings,
    to: '/admin/agencies',
    icon: 'lucide:list-todo',
    tone: 'warning',
  })
  pushIf(items, {
    id: 'pending-invites',
    title: 'Convites pendentes',
    description: 'Convites de organização ainda não aceitos',
    count: pendingInvites,
    to: '/admin/users',
    icon: 'lucide:mail',
    tone: 'default',
  })
  return sortAttention(items)
}

export async function buildAgencyAttention(context: WorkspaceContext): Promise<HubAttentionItem[]> {
  assertAgencyOrganization(context)
  const organizationId = context.organization!.id
  const tenantIds = await listAccessibleManagedClientIds(context, organizationId)
  const nowIso = new Date().toISOString()
  const recentFailuresSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  if (!tenantIds.length)
    return []

  const [
    overdueApprovals,
    pendingClient,
    publicationErrors,
    changesRequested,
    assignedTasks,
  ] = await Promise.all([
    countByTenantIds(context.client, 'approval_requests', tenantIds, query =>
      query.eq('status', 'pending').lt('due_at', nowIso).not('due_at', 'is', null)),
    countByTenantIds(context.client, 'approval_requests', tenantIds, query =>
      query.eq('status', 'pending').eq('stage', 'client')),
    countByTenantIds(context.client, 'social_posts', tenantIds, query =>
      query.eq('status', 'failed').gte('updated_at', recentFailuresSince)),
    countByTenantIds(context.client, 'social_posts', tenantIds, query =>
      query.eq('status', 'changes_requested')),
    countByTenantIds(context.client, 'social_posts', tenantIds, query =>
      query.eq('assigned_to', context.userId).not('status', 'in', '("published","archived","failed")')),
  ])

  const items: HubAttentionItem[] = []
  pushIf(items, {
    id: 'overdue-approvals',
    title: 'Aprovações atrasadas',
    description: 'Passaram do prazo na carteira',
    count: overdueApprovals,
    to: '/marketing/approvals',
    icon: 'lucide:alarm-clock',
    tone: 'danger',
  })
  pushIf(items, {
    id: 'pending-client',
    title: 'Aguardando cliente',
    description: 'Revisões na etapa do cliente',
    count: pendingClient,
    to: '/marketing/approvals',
    icon: 'lucide:user-round-check',
    tone: 'warning',
  })
  pushIf(items, {
    id: 'publication-errors',
    title: 'Publicações com erro',
    description: 'Falhas nos últimos 7 dias',
    count: publicationErrors,
    to: '/marketing/publishing?mvp_status=erro',
    icon: 'lucide:circle-alert',
    tone: 'danger',
  })
  pushIf(items, {
    id: 'changes-requested',
    title: 'Alterações solicitadas',
    description: 'Posts que precisam de ajustes',
    count: changesRequested,
    to: '/marketing/content?mvp_status=producao',
    icon: 'lucide:message-square-warning',
    tone: 'warning',
  })
  pushIf(items, {
    id: 'my-tasks',
    title: 'Minhas tarefas',
    description: 'Produção atribuída a você',
    count: assignedTasks,
    to: '/marketing/production/tasks',
    icon: 'lucide:list-todo',
    tone: 'default',
  })
  return sortAttention(items)
}

export async function buildTenantAttention(input: {
  context: WorkspaceContext
  persona: Extract<HubPersona, 'client' | 'attendant'>
}): Promise<HubAttentionItem[]> {
  const { context, persona } = input
  const tenantId = context.tenant?.id
  if (!tenantId)
    return []

  const modules = context.modules || []
  const client = context.client
  const userId = context.userId
  const recentFailuresSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const tasks: Array<Promise<HubAttentionItem[]>> = []

  if (hasModule(modules, 'whatsapp')) {
    tasks.push((async () => {
      const local: HubAttentionItem[] = []
      const assignedFilter = persona === 'attendant' ? userId : null
      const [unread, openMine] = await Promise.all([
        sumWhatsAppUnread(client, tenantId, assignedFilter),
        persona === 'attendant'
          ? countRows(client, 'whatsapp_conversation', q =>
              q.eq('tenant_id', tenantId).eq('assigned_to', userId).in('status', ['open', 'pending']))
          : countRows(client, 'whatsapp_conversation', q =>
              q.eq('tenant_id', tenantId).in('status', ['open', 'pending'])),
      ])
      pushIf(local, {
        id: 'wa-unread',
        title: persona === 'attendant' ? 'Mensagens não lidas (minhas)' : 'Mensagens não lidas',
        description: 'Conversas com unread no WhatsApp',
        count: unread,
        to: '/whatsapp/conversations',
        icon: 'lucide:messages-square',
        tone: unread > 10 ? 'danger' : 'warning',
      })
      pushIf(local, {
        id: 'wa-open',
        title: persona === 'attendant' ? 'Conversas atribuídas' : 'Conversas abertas',
        description: 'Inbox ativo',
        count: openMine,
        to: '/whatsapp/conversations',
        icon: 'lucide:message-circle',
        tone: 'default',
      })
      return local
    })())
  }

  if (hasModule(modules, 'crm')) {
    tasks.push((async () => {
      const local: HubAttentionItem[] = []
      if (persona === 'attendant') {
        const myLeads = await countRows(client, 'crm_lead', q =>
          q.eq('tenant_id', tenantId).eq('assigned_to', userId).not('status', 'in', '("won","lost")'))
        pushIf(local, {
          id: 'crm-mine',
          title: 'Meus leads abertos',
          description: 'Negócios atribuídos a você',
          count: myLeads,
          to: '/crm/funnel',
          icon: 'lucide:trending-up',
          tone: 'default',
        })
      }
      else {
        const [unassigned, openLeads] = await Promise.all([
          countRows(client, 'crm_lead', q =>
            q.eq('tenant_id', tenantId).is('assigned_to', null).not('status', 'in', '("won","lost")')),
          countRows(client, 'crm_lead', q =>
            q.eq('tenant_id', tenantId).not('status', 'in', '("won","lost")')),
        ])
        pushIf(local, {
          id: 'crm-unassigned',
          title: 'Leads sem responsável',
          description: 'Abertos e sem assigned_to',
          count: unassigned,
          to: '/crm/funnel',
          icon: 'lucide:user-round-x',
          tone: 'warning',
        })
        pushIf(local, {
          id: 'crm-open',
          title: 'Leads em andamento',
          description: 'Fora de ganho/perda',
          count: openLeads,
          to: '/crm/funnel',
          icon: 'lucide:briefcase',
          tone: 'default',
        })
      }
      return local
    })())
  }

  if (hasModule(modules, 'marketing') && persona === 'client') {
    tasks.push((async () => {
      const local: HubAttentionItem[] = []
      const [pendingApprovals, failedPosts] = await Promise.all([
        countRows(client, 'approval_requests', q =>
          q.eq('tenant_id', tenantId).eq('status', 'pending').eq('stage', 'client')),
        countRows(client, 'social_posts', q =>
          q.eq('tenant_id', tenantId).eq('status', 'failed').gte('updated_at', recentFailuresSince)),
      ])
      pushIf(local, {
        id: 'mkt-approvals',
        title: 'Aguardando você',
        description: 'Peças na etapa de aprovação do cliente',
        count: pendingApprovals,
        to: '/marketing/approvals',
        icon: 'lucide:badge-check',
        tone: 'warning',
      })
      pushIf(local, {
        id: 'mkt-failed',
        title: 'Publicações com erro',
        description: 'Falhas recentes de publicação',
        count: failedPosts,
        // Client "Publicações" surface is content list, not the agency send queue.
        to: '/marketing/content?mvp_status=erro',
        icon: 'lucide:circle-alert',
        tone: 'danger',
      })
      return local
    })())
  }

  const buckets = await Promise.all(tasks)
  return sortAttention(buckets.flat())
}

function sortAttention(items: HubAttentionItem[]): HubAttentionItem[] {
  const toneRank: Record<HubAttentionTone, number> = { danger: 0, warning: 1, default: 2 }
  return items.sort((a, b) => {
    const toneDiff = toneRank[a.tone] - toneRank[b.tone]
    if (toneDiff !== 0)
      return toneDiff
    return b.count - a.count
  })
}

export async function buildHubAttention(
  context: WorkspaceContext,
  persona: HubPersona,
): Promise<HubAttentionItem[]> {
  if (persona === 'staff')
    return buildStaffAttention(context.client)
  if (persona === 'agency')
    return buildAgencyAttention(context)
  return buildTenantAttention({ context, persona })
}
