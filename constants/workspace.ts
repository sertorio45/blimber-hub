/**
 * Workspace scopes shared by the Nitro resolver and the UI.
 *
 * Three commercial models live side by side:
 * - `platform`: administra o SaaS inteiro;
 * - `agency`: atende uma carteira de clientes;
 * - `direct`: empresa que contratou o sistema para si mesma.
 *
 * Cargos profissionais (Designer, Social Media, Aprovador...) são expressos por
 * `organization_roles` + capabilities, nunca pelo enum global `app_role`.
 */

export type OrganizationType = 'platform' | 'agency' | 'direct'

export type OrganizationRelationshipType = 'owner' | 'managed'

export const ORGANIZATION_TYPES: OrganizationType[] = ['platform', 'agency', 'direct']

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  platform: 'Plataforma',
  agency: 'Agência',
  // Product jargon "Cliente direto" confused agency operators — keep it neutral.
  direct: 'Conta própria',
}

export const ORGANIZATION_RELATIONSHIP_LABELS: Record<OrganizationRelationshipType, string> = {
  owner: 'Empresa principal',
  managed: 'Cliente atendido',
}

export const PLATFORM_CAPABILITIES = [
  'platform.organizations.read',
  'platform.organizations.manage',
  'platform.tenants.read',
  'platform.context.switch',
  'platform.audit.read',
] as const

/** Organization-scoped capabilities. Legacy keys stay for backward compatibility. */
export const ORGANIZATION_CAPABILITIES = [
  'organization.read',
  'organization.manage',
  'organization.team.read',
  'organization.team.manage',
  'organization.roles.read',
  'organization.roles.manage',
  'organization.members.manage',
  'organization.tenants.read',
  'organization.approvals.read',
  'agency.clients.read',
  'agency.clients.manage',
] as const

export const MARKETING_SOCIAL_CAPABILITIES = [
  'marketing.social.read',
  'marketing.social.create',
  'marketing.social.update',
  'marketing.social.comment',
  'marketing.social.approval.submit',
  'marketing.social.approval.internal',
  'marketing.social.approval.client',
  'marketing.social.approval.bypass',
  'marketing.social.workflow.manage',
  'marketing.social.schedule',
  'marketing.social.publish',
  'marketing.social.delete.local',
  'marketing.social.delete.remote',
  'marketing.social.delete.force',
  'marketing.social.delete.retry',
  'marketing.social.integrations',
  'marketing.social.reports',
  'marketing.social.review_link.create',
  'marketing.social.review_link.revoke',
  'marketing.social.production.move',
  'marketing.social.production.manage',
  'marketing.social.tasks.manage',
  'marketing.social.campaigns.read',
  'marketing.social.campaigns.manage',
  'marketing.social.briefing.create',
  'marketing.social.briefing.manage',
  'marketing.social.library.manage',
  'marketing.social.brand_guide.read',
  'marketing.social.brand_guide.manage',
  'marketing.social.packages.read',
  'marketing.social.packages.manage',
  'marketing.social.sla.manage',
  'marketing.social.ops_metrics.read',
  'marketing.social.automations.read',
  'marketing.social.automations.manage',
  'marketing.social.manage',
  // Legacy keys kept so existing endpoints keep working while they migrate.
  'marketing.social.approve',
] as const

export const CMS_CAPABILITIES = [
  'cms.read',
  'cms.pages.create',
  'cms.pages.update',
  'cms.pages.delete',
  'cms.publications.create',
  'cms.publications.update',
  'cms.publications.delete',
  'cms.publish',
  'cms.media.read',
  'cms.media.upload',
  'cms.media.delete',
  'cms.navigation.manage',
  'cms.appearance.manage',
  'cms.settings.manage',
  'cms.schemas.manage',
] as const

export type PlatformCapability = typeof PLATFORM_CAPABILITIES[number]
export type OrganizationCapability = typeof ORGANIZATION_CAPABILITIES[number]
export type MarketingSocialCapability = typeof MARKETING_SOCIAL_CAPABILITIES[number]
export type CmsCapability = typeof CMS_CAPABILITIES[number]
export type WorkspaceCapability
  = | PlatformCapability
    | OrganizationCapability
    | MarketingSocialCapability
    | CmsCapability

export const ALL_WORKSPACE_CAPABILITIES: WorkspaceCapability[] = [
  ...PLATFORM_CAPABILITIES,
  ...ORGANIZATION_CAPABILITIES,
  ...MARKETING_SOCIAL_CAPABILITIES,
  ...CMS_CAPABILITIES,
]

/**
 * Bidirectional aliases so a check for either the legacy or the new key succeeds
 * when the other is present in the effective set.
 */
export const CAPABILITY_ALIASES: Record<string, readonly string[]> = {
  'organization.members.manage': ['organization.team.manage'],
  'organization.team.manage': ['organization.members.manage'],
  'organization.tenants.read': ['agency.clients.read'],
  'agency.clients.read': ['organization.tenants.read'],
  'marketing.social.approve': [
    'marketing.social.approval.internal',
    'marketing.social.approval.client',
  ],
  'marketing.social.approval.internal': ['marketing.social.approve'],
  'marketing.social.approval.client': ['marketing.social.approve'],
  'marketing.social.create': ['marketing.social.update'],
}

/** Capability groups used by the roles UI. */
export const CAPABILITY_GROUPS: Array<{
  key: string
  label: string
  capabilities: readonly WorkspaceCapability[]
}> = [
  {
    key: 'organization',
    label: 'Organização',
    capabilities: [
      'organization.read',
      'organization.manage',
      'organization.team.read',
      'organization.team.manage',
      'organization.roles.read',
      'organization.roles.manage',
      'agency.clients.read',
      'agency.clients.manage',
      'organization.approvals.read',
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing social',
    capabilities: [
      'marketing.social.read',
      'marketing.social.create',
      'marketing.social.update',
      'marketing.social.comment',
      'marketing.social.approval.submit',
      'marketing.social.approval.internal',
      'marketing.social.approval.client',
      'marketing.social.approval.bypass',
      'marketing.social.workflow.manage',
      'marketing.social.schedule',
      'marketing.social.publish',
      'marketing.social.delete.local',
      'marketing.social.delete.remote',
      'marketing.social.delete.force',
      'marketing.social.delete.retry',
      'marketing.social.integrations',
      'marketing.social.reports',
      'marketing.social.review_link.create',
      'marketing.social.review_link.revoke',
      'marketing.social.production.move',
      'marketing.social.production.manage',
      'marketing.social.tasks.manage',
      'marketing.social.campaigns.read',
      'marketing.social.campaigns.manage',
      'marketing.social.briefing.create',
      'marketing.social.briefing.manage',
      'marketing.social.library.manage',
      'marketing.social.brand_guide.read',
      'marketing.social.brand_guide.manage',
      'marketing.social.packages.read',
      'marketing.social.packages.manage',
      'marketing.social.sla.manage',
      'marketing.social.ops_metrics.read',
      'marketing.social.automations.read',
      'marketing.social.automations.manage',
      'marketing.social.manage',
    ],
  },
  {
    key: 'cms',
    label: 'CMS',
    capabilities: CMS_CAPABILITIES,
  },
]

export const CAPABILITY_LABELS: Partial<Record<WorkspaceCapability, string>> = {
  'organization.read': 'Visualizar organização',
  'organization.manage': 'Administrar organização',
  'organization.team.read': 'Visualizar equipe',
  'organization.team.manage': 'Gerenciar equipe',
  'organization.roles.read': 'Visualizar cargos',
  'organization.roles.manage': 'Gerenciar cargos',
  'organization.members.manage': 'Gerenciar membros (legado)',
  'organization.tenants.read': 'Visualizar empresas',
  'organization.approvals.read': 'Acompanhar aprovações',
  'agency.clients.read': 'Visualizar clientes',
  'agency.clients.manage': 'Gerenciar clientes',
  'marketing.social.read': 'Visualizar posts',
  'marketing.social.create': 'Criar conteúdo',
  'marketing.social.update': 'Editar conteúdo',
  'marketing.social.comment': 'Comentar',
  'marketing.social.approval.submit': 'Enviar para aprovação',
  'marketing.social.approval.internal': 'Aprovar etapa interna',
  'marketing.social.approval.client': 'Aprovar como cliente',
  'marketing.social.approval.bypass': 'Ignorar aprovação (com justificativa)',
  'marketing.social.workflow.manage': 'Gerenciar fluxo de aprovação',
  'marketing.social.schedule': 'Agendar publicação',
  'marketing.social.publish': 'Publicar',
  'marketing.social.delete.local': 'Excluir localmente',
  'marketing.social.delete.remote': 'Excluir nas redes',
  'marketing.social.delete.force': 'Forçar exclusão local após falha remota',
  'marketing.social.delete.retry': 'Repetir exclusão remota',
  'marketing.social.integrations': 'Gerenciar integrações',
  'marketing.social.reports': 'Ver relatórios',
  'marketing.social.review_link.create': 'Gerar link mágico de aprovação',
  'marketing.social.review_link.revoke': 'Revogar link mágico de aprovação',
  'marketing.social.production.move': 'Mover cards no Kanban',
  'marketing.social.production.manage': 'Gerenciar produção operacional',
  'marketing.social.tasks.manage': 'Gerenciar tarefas de produção',
  'marketing.social.campaigns.read': 'Visualizar campanhas',
  'marketing.social.campaigns.manage': 'Gerenciar campanhas',
  'marketing.social.briefing.create': 'Criar briefing / link mágico',
  'marketing.social.briefing.manage': 'Gerenciar briefings',
  'marketing.social.library.manage': 'Gerenciar biblioteca',
  'marketing.social.brand_guide.read': 'Visualizar marca (Brand Center)',
  'marketing.social.brand_guide.manage': 'Editar marca (Brand Center)',
  'marketing.social.packages.read': 'Visualizar pacotes',
  'marketing.social.packages.manage': 'Gerenciar pacotes',
  'marketing.social.sla.manage': 'Gerenciar SLA',
  'marketing.social.ops_metrics.read': 'Ver métricas operacionais',
  'marketing.social.automations.read': 'Visualizar automações',
  'marketing.social.automations.manage': 'Gerenciar automações',
  'marketing.social.manage': 'Administrar marketing social',
  'marketing.social.approve': 'Aprovar (legado)',
  'cms.read': 'Visualizar CMS',
  'cms.pages.create': 'Criar páginas',
  'cms.pages.update': 'Editar páginas',
  'cms.pages.delete': 'Excluir páginas',
  'cms.publications.create': 'Criar publicações',
  'cms.publications.update': 'Editar publicações',
  'cms.publications.delete': 'Excluir publicações',
  'cms.publish': 'Publicar no site',
  'cms.media.read': 'Visualizar mídia do site',
  'cms.media.upload': 'Enviar mídia do site',
  'cms.media.delete': 'Excluir mídia do site',
  'cms.navigation.manage': 'Gerenciar menus do site',
  'cms.appearance.manage': 'Gerenciar aparência do site',
  'cms.settings.manage': 'Gerenciar configurações do site',
  'cms.schemas.manage': 'Gerenciar coleções',
}

/** Header carrying the organization the client is asking for. Always revalidated server-side. */
export const ORGANIZATION_HEADER = 'X-Organization-Id'
/** Header carrying the tenant the client is asking for. Always revalidated server-side. */
export const TENANT_HEADER = 'X-Tenant-Id'

export function isAgencyOrganization(type?: OrganizationType | null): boolean {
  return type === 'agency'
}

export function isPlatformOrganization(type?: OrganizationType | null): boolean {
  return type === 'platform'
}

/**
 * Expands a capability set with its aliases so a check for either key succeeds.
 */
export function expandCapabilityAliases(capabilities: Iterable<string>): Set<string> {
  const result = new Set<string>()
  for (const capability of capabilities) {
    result.add(capability)
    for (const alias of CAPABILITY_ALIASES[capability] ?? [])
      result.add(alias)
  }
  return result
}

export function holdsCapability(
  capabilities: Iterable<string> | ReadonlySet<string>,
  required: string,
): boolean {
  const set = capabilities instanceof Set ? capabilities : new Set(capabilities)
  if (set.has(required))
    return true
  for (const alias of CAPABILITY_ALIASES[required] ?? []) {
    if (set.has(alias))
      return true
  }
  return false
}

/** Ordered steps for the agency client onboarding wizard. */
export const AGENCY_ONBOARDING_STEPS = [
  'client_data',
  'tenant',
  'modules',
  'agency_owners',
  'client_invite',
  'approval_flow',
  'social_connect',
  'review',
] as const

export type AgencyOnboardingStep = typeof AGENCY_ONBOARDING_STEPS[number]
