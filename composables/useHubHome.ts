import type { ModuleMeta } from '~/constants/modules'
import type { WorkspaceCapability } from '~/constants/workspace'

import { MODULE_LABELS_PT, MODULE_META, MODULE_DESCRIPTIONS_PT, resolveTenantModuleSlugs } from '~/constants/modules'
import { ROLE_LABELS, isStaffRole, type AppRoleSlug } from '~/constants/roles'
import { holdsCapability } from '~/constants/workspace'

export type HubPersona = 'staff' | 'agency' | 'client' | 'attendant'

export type HubAttentionTone = 'default' | 'warning' | 'danger'

export interface HubAttentionItem {
  id: string
  title: string
  description: string
  count: number
  to: string
  icon: string
  tone: HubAttentionTone
}

export interface HubHomePayload {
  persona: HubPersona
  tenant_id: string | null
  organization_id: string | null
  attention: HubAttentionItem[]
  generated_at: string
}

export interface HubAction {
  title: string
  description: string
  to: string
  icon: string
  primary?: boolean
}

export interface HubModuleTile {
  slug: string
  title: string
  description: string
  icon: string
  to: string
}

const MODULE_DESCRIPTIONS: Record<string, string> = {
  crm: MODULE_DESCRIPTIONS_PT.crm,
  marketing: MODULE_DESCRIPTIONS_PT.marketing,
  ads: MODULE_DESCRIPTIONS_PT.ads,
  whatsapp: MODULE_DESCRIPTIONS_PT.whatsapp,
  article: MODULE_DESCRIPTIONS_PT.article,
}

/**
 * Pure helpers for the hub home (P1). No network — feed from workspace context.
 */
export function resolveHubPersona(input: {
  isPlatformStaff: boolean
  isAgencyWorkspace: boolean
  effectiveRole: string | null
}): HubPersona {
  if (input.isPlatformStaff)
    return 'staff'
  if (input.isAgencyWorkspace)
    return 'agency'
  if (input.effectiveRole === 'atendente')
    return 'attendant'
  return 'client'
}

export function resolveActiveModuleMetas(moduleNames: string[]): ModuleMeta[] {
  return resolveTenantModuleSlugs(moduleNames)
    .map(slug => MODULE_META[slug])
    .filter((meta): meta is ModuleMeta => Boolean(meta))
}

export function moduleTileTitle(slug: string): string {
  return MODULE_LABELS_PT[slug] || MODULE_META[slug]?.title || slug
}

export function buildHubModuleTiles(moduleNames: string[]): HubModuleTile[] {
  return resolveActiveModuleMetas(moduleNames).map(meta => ({
    slug: meta.slug,
    title: moduleTileTitle(meta.slug),
    description: MODULE_DESCRIPTIONS[meta.slug] || 'Abrir módulo',
    icon: meta.icon,
    to: meta.defaultPath || meta.basePath,
  }))
}

export function buildHubActions(input: {
  persona: HubPersona
  modules: string[]
  capabilities: readonly string[]
}): HubAction[] {
  const can = (cap: WorkspaceCapability) => holdsCapability(input.capabilities, cap)
  const has = (slug: string) => {
    const names = resolveTenantModuleSlugs(input.modules)
    return names.includes(slug as any)
  }
  const actions: HubAction[] = []

  if (input.persona === 'staff') {
    actions.push(
      { title: 'Empresas', description: 'Gerenciar tenants', to: '/admin/tenants', icon: 'lucide:building-2', primary: true },
      { title: 'Usuários', description: 'Contas da plataforma', to: '/admin/users', icon: 'lucide:users' },
      { title: 'Agências', description: 'Organizações agency', to: '/admin/agencies', icon: 'lucide:network' },
      { title: 'Logs marketing', description: 'Auditoria social da plataforma', to: '/marketing/logs', icon: 'lucide:scroll-text' },
    )
    return actions.slice(0, 4)
  }

  if (input.persona === 'agency') {
    if (can('agency.clients.read')) {
      actions.push({
        title: 'Carteira de clientes',
        description: 'Visão geral da agência',
        to: '/organization',
        icon: 'lucide:layout-dashboard',
        primary: true,
      })
      actions.push({
        title: 'Clientes',
        description: 'Lista e acessos',
        to: '/organization/clients',
        icon: 'lucide:building-2',
      })
    }
    if (can('agency.clients.manage')) {
      actions.push({
        title: 'Novo cliente',
        description: 'Onboarding com convite',
        to: '/organization/clients/onboarding',
        icon: 'lucide:user-plus',
      })
    }
    if (has('marketing')) {
      actions.push({
        title: 'Aprovações',
        description: 'Fila de revisões',
        to: '/marketing/approvals',
        icon: 'lucide:badge-check',
      })
    }
    return actions.slice(0, 4)
  }

  if (input.persona === 'attendant') {
    if (has('whatsapp')) {
      actions.push({
        title: 'Abrir inbox',
        description: 'Conversas do WhatsApp',
        to: '/whatsapp/conversations',
        icon: 'lucide:messages-square',
        primary: true,
      })
    }
    if (has('crm')) {
      actions.push({
        title: 'Funil de vendas',
        description: 'Leads e etapas',
        to: '/crm/funnel',
        icon: 'lucide:trending-up',
      })
    }
    return actions.slice(0, 4)
  }

  // client (Administrador da empresa)
  if (has('crm')) {
    actions.push({
      title: 'Funil de vendas',
      description: 'Pipeline e leads',
      to: '/crm/funnel',
      icon: 'lucide:trending-up',
      primary: true,
    })
  }
  if (has('whatsapp')) {
    actions.push({
      title: 'WhatsApp',
      description: 'Conversas e campanhas',
      to: '/whatsapp/conversations',
      icon: 'lucide:message-circle',
      primary: !has('crm'),
    })
  }
  if (has('marketing')) {
    actions.push({
      title: 'Marketing',
      description: 'Calendário e posts',
      to: '/marketing',
      icon: 'lucide:megaphone',
    })
  }
  if (has('article')) {
    actions.push({
      title: 'Artigos',
      description: 'Conteúdo do CMS',
      to: '/articles',
      icon: 'lucide:book-a',
    })
  }

  return actions.slice(0, 4)
}

/**
 * Where to send the user after login when no explicit ?redirect= is set.
 * Single-module tenant users enter that module directly.
 * Agency / staff / multi-module stay on hub `/`.
 */
export function resolveHubLandingPath(input: {
  persona: HubPersona
  modules: string[]
  canAgencyRead: boolean
}): string {
  // Agency stays on hub (with CTAs to /organization) so Início remains useful.
  void input.canAgencyRead

  const tiles = buildHubModuleTiles(input.modules)
  if ((input.persona === 'client' || input.persona === 'attendant') && tiles.length === 1)
    return tiles[0].to

  return '/'
}

export function formatHubRoleLabel(effectiveRole: string | null, isPlatformStaff: boolean): string {
  if (isPlatformStaff && effectiveRole && isStaffRole(effectiveRole))
    return ROLE_LABELS[effectiveRole as AppRoleSlug] || effectiveRole
  if (effectiveRole && effectiveRole in ROLE_LABELS)
    return ROLE_LABELS[effectiveRole as AppRoleSlug]
  if (effectiveRole)
    return effectiveRole
  return 'Usuário'
}

export function formatHubGreetingName(user: { email?: string | null, user_metadata?: Record<string, unknown> } | null): string {
  const metaName = user?.user_metadata?.name || user?.user_metadata?.full_name
  if (typeof metaName === 'string' && metaName.trim())
    return metaName.trim().split(/\s+/)[0]
  const email = user?.email
  if (email)
    return email.split('@')[0]
  return 'olá'
}

export function useHubHome() {
  const workspace = useWorkspace()
  const { currentUser, currentRole } = useAuth()
  const { setCurrentModuleBySlug } = useModule()
  const navigationMemory = useHubNavigationMemory()

  const isReady = computed(() => Boolean(workspace.context.value) && !workspace.isLoading.value)

  const persona = computed(() => resolveHubPersona({
    isPlatformStaff: workspace.isPlatformStaff.value,
    isAgencyWorkspace: workspace.isAgencyWorkspace.value,
    effectiveRole: workspace.effectiveRole.value || currentRole.value,
  }))

  const moduleTiles = computed(() => buildHubModuleTiles(workspace.modules.value || []))

  const actions = computed(() => buildHubActions({
    persona: persona.value,
    modules: workspace.modules.value || [],
    capabilities: workspace.capabilities.value || [],
  }))

  const roleLabel = computed(() => formatHubRoleLabel(
    workspace.effectiveRole.value || currentRole.value,
    workspace.isPlatformStaff.value,
  ))

  const greetingName = computed(() => formatHubGreetingName(currentUser.value as any))

  const tenantName = computed(() =>
    workspace.tenant.value?.name
    || workspace.organization.value?.name
    || 'seu workspace',
  )

  const organizationName = computed(() => workspace.organization.value?.name || null)

  const landingPath = computed(() => resolveHubLandingPath({
    persona: persona.value,
    modules: workspace.modules.value || [],
    canAgencyRead: workspace.can('agency.clients.read'),
  }))

  /** True when P1 should skip the hub and enter a focused destination. */
  const shouldAutoEnter = computed(() => landingPath.value !== '/')

  const attentionCacheKey = computed(() => {
    const tenantId = workspace.tenant.value?.id || 'none'
    const orgId = workspace.organization.value?.id || 'none'
    return `hub-home-${persona.value}-${orgId}-${tenantId}`
  })

  const {
    data: homePayload,
    pending: attentionPending,
    showSkeleton: attentionSkeleton,
    refresh: refreshAttention,
  } = useCachedAsyncData<HubHomePayload | null>(
    attentionCacheKey,
    async () => {
      if (!workspace.context.value)
        return null
      const response = await $fetch<{ data: HubHomePayload }>('/api/workspace/home')
      return response.data
    },
    {
      default: () => null,
      enabled: computed(() => Boolean(workspace.context.value) && !shouldAutoEnter.value),
      watch: [attentionCacheKey],
    },
  )

  const attentionItems = computed(() => homePayload.value?.attention ?? [])

  const preferredDestination = computed(() => navigationMemory.preferred.value)
  const continueItems = computed(() => navigationMemory.continueItems.value)
  const showContinue = computed(() =>
    Boolean(preferredDestination.value) || continueItems.value.length > 0,
  )

  async function ensureReady() {
    if (!workspace.context.value)
      await workspace.load()
    navigationMemory.hydrateFromStorage()
  }

  function openModule(tile: HubModuleTile) {
    setCurrentModuleBySlug(tile.slug)
    return navigateTo(tile.to)
  }

  function setPreferredModule(tile: HubModuleTile) {
    navigationMemory.setPreferredModule(tile.slug)
    setCurrentModuleBySlug(tile.slug)
  }

  function setPreferredPath(to: string, title?: string, icon?: string) {
    navigationMemory.setPreferredPath(to, title, icon)
  }

  function clearPreferred() {
    navigationMemory.clearPreferred()
  }

  return {
    isReady,
    isLoading: workspace.isLoading,
    persona,
    moduleTiles,
    actions,
    roleLabel,
    greetingName,
    tenantName,
    organizationName,
    landingPath,
    shouldAutoEnter,
    attentionItems,
    attentionPending,
    attentionSkeleton,
    refreshAttention,
    preferredDestination,
    continueItems,
    showContinue,
    setPreferredModule,
    setPreferredPath,
    clearPreferred,
    ensureReady,
    openModule,
    showAgencyPortfolio: workspace.showAgencyPortfolio,
    isPlatformStaff: workspace.isPlatformStaff,
  }
}
