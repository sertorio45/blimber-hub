/**
 * Canonical capability matrix for system organization roles.
 * Kept in sync with supabase/migrations/*organization_roles_seed*.sql
 * and social_post_deletion_flow (force/retry grants).
 *
 * Tests assert this matrix; if seed SQL drifts, tests fail.
 */

import type { CmsCapability } from '~/constants/workspace'
import { CMS_CAPABILITIES } from '~/constants/workspace'

export type AgencyRoleSlug
  = | 'owner'
    | 'agency_admin'
    | 'marketing_manager'
    | 'social_media'
    | 'designer'
    | 'copywriter'
    | 'internal_approver'
    | 'analyst'

export type DirectRoleSlug = 'owner' | 'approver' | 'editor' | 'viewer'

export type AccessAction
  = | 'list_organizations'
    | 'access_tenant'
    | 'list_clients'
    | 'edit_client'
    | 'manage_team'
    | 'manage_roles'
    | 'create_post'
    | 'edit_post'
    | 'comment_internal'
    | 'comment_shared'
    | 'submit_approval'
    | 'approve_internal'
    | 'approve_client'
    | 'schedule'
    | 'publish'
    | 'delete_local'
    | 'delete_remote'
    | 'delete_force'
    | 'manage_integrations'
    | 'view_reports'

/** Capability required for each product action. */
export const ACCESS_ACTION_CAPABILITY: Record<AccessAction, string> = {
  list_organizations: 'organization.read',
  access_tenant: 'marketing.social.read',
  list_clients: 'agency.clients.read',
  edit_client: 'agency.clients.manage',
  manage_team: 'organization.team.manage',
  manage_roles: 'organization.roles.manage',
  create_post: 'marketing.social.create',
  edit_post: 'marketing.social.update',
  comment_internal: 'marketing.social.approval.internal',
  comment_shared: 'marketing.social.comment',
  submit_approval: 'marketing.social.approval.submit',
  approve_internal: 'marketing.social.approval.internal',
  approve_client: 'marketing.social.approval.client',
  schedule: 'marketing.social.schedule',
  publish: 'marketing.social.publish',
  delete_local: 'marketing.social.delete.local',
  delete_remote: 'marketing.social.delete.remote',
  delete_force: 'marketing.social.delete.force',
  manage_integrations: 'marketing.social.integrations',
  view_reports: 'marketing.social.reports',
}

/**
 * CMS capability tiers, kept in sync with
 * supabase/migrations/20261019110000_cms_module_entitlement.sql.
 */
export const CMS_READ_ONLY_CAPABILITIES = [
  'cms.read',
  'cms.media.read',
] as const satisfies readonly CmsCapability[]

/** Baseline for collaborators (`atendente`): draft content, never publish. */
export const CMS_CONTRIBUTOR_CAPABILITIES = [
  'cms.read',
  'cms.publications.create',
  'cms.publications.update',
  'cms.media.read',
  'cms.media.upload',
] as const satisfies readonly CmsCapability[]

export const CMS_AUTHOR_CAPABILITIES = [
  'cms.read',
  'cms.pages.create',
  'cms.pages.update',
  'cms.publications.create',
  'cms.publications.update',
  'cms.media.read',
  'cms.media.upload',
] as const satisfies readonly CmsCapability[]

export const CMS_EDITOR_CAPABILITIES = [
  ...CMS_AUTHOR_CAPABILITIES,
  'cms.pages.delete',
  'cms.publications.delete',
  'cms.media.delete',
  'cms.navigation.manage',
] as const satisfies readonly CmsCapability[]

export const CMS_PUBLISHER_CAPABILITIES = [
  ...CMS_EDITOR_CAPABILITIES,
  'cms.publish',
] as const satisfies readonly CmsCapability[]

export const CMS_SITE_ADMIN_CAPABILITIES: readonly CmsCapability[] = CMS_CAPABILITIES

export type CmsRolePresetSlug = 'cms_author' | 'cms_editor' | 'cms_publisher' | 'cms_site_admin'

export interface CmsRolePreset {
  slug: CmsRolePresetSlug
  name: string
  description: string
  capabilities: readonly CmsCapability[]
}

/** Scope caps every CMS preset needs to reach the tenant, per organization type. */
export const CMS_PRESET_BASE_CAPABILITIES: Record<'agency' | 'direct', readonly string[]> = {
  agency: ['organization.read', 'organization.tenants.read', 'agency.clients.read'],
  direct: ['organization.read'],
}

/**
 * System cargo templates (organization_id IS NULL) seeded for agency and direct
 * organizations. They carry `cms.*` plus the scope caps above only; a member who
 * also works on Marketing needs per-user grants or a custom cargo.
 */
export const CMS_ROLE_PRESETS: readonly CmsRolePreset[] = [
  {
    slug: 'cms_author',
    name: 'Autor CMS',
    description: 'Cria e edita páginas e publicações do site e envia mídia. Sem excluir nem publicar.',
    capabilities: CMS_AUTHOR_CAPABILITIES,
  },
  {
    slug: 'cms_editor',
    name: 'Editor CMS',
    description: 'Tudo do Autor, mais excluir conteúdo e mídia e gerenciar menus do site. Sem publicar.',
    capabilities: CMS_EDITOR_CAPABILITIES,
  },
  {
    slug: 'cms_publisher',
    name: 'Publicador CMS',
    description: 'Tudo do Editor, mais publicar páginas e publicações no site.',
    capabilities: CMS_PUBLISHER_CAPABILITIES,
  },
  {
    slug: 'cms_site_admin',
    name: 'Administrador do site',
    description: 'Acesso total ao CMS, incluindo aparência e configurações do site.',
    capabilities: CMS_SITE_ADMIN_CAPABILITIES,
  },
]

/** Default `cms.*` per legacy app role (`role_capabilities`). Staff short-circuits to everything. */
export const CMS_LEGACY_ROLE_DEFAULTS: Record<'admin' | 'funcionario' | 'cliente' | 'atendente', readonly CmsCapability[]> = {
  admin: CMS_CAPABILITIES,
  funcionario: CMS_CAPABILITIES,
  cliente: CMS_CAPABILITIES,
  atendente: CMS_CONTRIBUTOR_CAPABILITIES,
}

export const AGENCY_ROLE_CAPABILITIES: Record<AgencyRoleSlug, readonly string[]> = {
  owner: [
    'organization.read',
    'organization.manage',
    'organization.team.read',
    'organization.team.manage',
    'organization.members.manage',
    'organization.roles.read',
    'organization.roles.manage',
    'organization.tenants.read',
    'organization.approvals.read',
    'agency.clients.read',
    'agency.clients.manage',
    'marketing.social.read',
    'marketing.social.create',
    'marketing.social.update',
    'marketing.social.comment',
    'marketing.social.approval.submit',
    'marketing.social.approval.internal',
    'marketing.social.approval.client',
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
    'marketing.social.approve',
    ...CMS_CAPABILITIES,
  ],
  agency_admin: [
    'organization.read',
    'organization.team.read',
    'organization.team.manage',
    'organization.members.manage',
    'organization.roles.read',
    'organization.roles.manage',
    'organization.tenants.read',
    'organization.approvals.read',
    'agency.clients.read',
    'agency.clients.manage',
    'marketing.social.read',
    'marketing.social.create',
    'marketing.social.update',
    'marketing.social.comment',
    'marketing.social.approval.submit',
    'marketing.social.approval.internal',
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
    'marketing.social.approve',
    ...CMS_CAPABILITIES,
  ],
  marketing_manager: [
    'organization.read',
    'organization.team.read',
    'organization.tenants.read',
    'organization.approvals.read',
    'agency.clients.read',
    'marketing.social.read',
    'marketing.social.create',
    'marketing.social.update',
    'marketing.social.comment',
    'marketing.social.approval.submit',
    'marketing.social.approval.internal',
    'marketing.social.schedule',
    'marketing.social.publish',
    'marketing.social.delete.local',
    'marketing.social.delete.force',
    'marketing.social.delete.retry',
    'marketing.social.delete.remote',
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
    'marketing.social.approve',
    ...CMS_CONTRIBUTOR_CAPABILITIES,
  ],
  social_media: [
    'organization.read',
    'organization.tenants.read',
    'agency.clients.read',
    'marketing.social.read',
    'marketing.social.create',
    'marketing.social.update',
    'marketing.social.comment',
    'marketing.social.approval.submit',
    'marketing.social.production.move',
    'marketing.social.production.manage',
    'marketing.social.tasks.manage',
    'marketing.social.campaigns.read',
    'marketing.social.briefing.create',
    'marketing.social.library.manage',
    'marketing.social.brand_guide.read',
    'marketing.social.packages.read',
    'marketing.social.ops_metrics.read',
    'marketing.social.automations.read',
    ...CMS_CONTRIBUTOR_CAPABILITIES,
  ],
  designer: [
    'organization.read',
    'organization.tenants.read',
    'agency.clients.read',
    'marketing.social.read',
    'marketing.social.create',
    'marketing.social.update',
    'marketing.social.comment',
    'marketing.social.production.move',
    'marketing.social.tasks.manage',
    'marketing.social.campaigns.read',
    'marketing.social.briefing.create',
    'marketing.social.library.manage',
    'marketing.social.brand_guide.read',
    ...CMS_CONTRIBUTOR_CAPABILITIES,
  ],
  copywriter: [
    'organization.read',
    'organization.tenants.read',
    'agency.clients.read',
    'marketing.social.read',
    'marketing.social.update',
    'marketing.social.comment',
    'marketing.social.create',
    'marketing.social.production.move',
    'marketing.social.tasks.manage',
    'marketing.social.campaigns.read',
    'marketing.social.briefing.create',
    'marketing.social.library.manage',
    'marketing.social.brand_guide.read',
    ...CMS_CONTRIBUTOR_CAPABILITIES,
  ],
  internal_approver: [
    'organization.read',
    'organization.tenants.read',
    'agency.clients.read',
    'organization.approvals.read',
    'marketing.social.read',
    'marketing.social.comment',
    'marketing.social.approval.internal',
    'marketing.social.approve',
    ...CMS_READ_ONLY_CAPABILITIES,
  ],
  analyst: [
    'organization.read',
    'organization.tenants.read',
    'agency.clients.read',
    'marketing.social.read',
    'marketing.social.reports',
    'marketing.social.packages.read',
    'marketing.social.ops_metrics.read',
    'marketing.social.automations.read',
    ...CMS_READ_ONLY_CAPABILITIES,
  ],
}

export const DIRECT_ROLE_CAPABILITIES: Record<DirectRoleSlug, readonly string[]> = {
  owner: [
    'organization.read',
    'organization.manage',
    'organization.team.read',
    'organization.team.manage',
    'organization.members.manage',
    'organization.roles.read',
    'organization.roles.manage',
    'marketing.social.read',
    'marketing.social.create',
    'marketing.social.update',
    'marketing.social.comment',
    'marketing.social.approval.client',
    'marketing.social.approve',
    'marketing.social.schedule',
    'marketing.social.publish',
    'marketing.social.reports',
    'marketing.social.integrations',
    ...CMS_CAPABILITIES,
  ],
  approver: [
    'organization.read',
    'marketing.social.read',
    'marketing.social.comment',
    'marketing.social.approval.client',
    'marketing.social.approve',
    'marketing.social.reports',
    ...CMS_READ_ONLY_CAPABILITIES,
  ],
  editor: [
    'organization.read',
    'marketing.social.read',
    'marketing.social.create',
    'marketing.social.update',
    'marketing.social.comment',
    'marketing.social.approval.submit',
    ...CMS_CONTRIBUTOR_CAPABILITIES,
  ],
  viewer: [
    'organization.read',
    'marketing.social.read',
    'marketing.social.reports',
    ...CMS_READ_ONLY_CAPABILITIES,
  ],
}

/** Platform staff capabilities (app_metadata role admin/funcionario). */
export const PLATFORM_STAFF_CAPABILITIES = [
  'platform.organizations.read',
  'platform.organizations.manage',
  'platform.tenants.read',
  'platform.context.switch',
  'platform.audit.read',
] as const

export function roleCan(capabilities: readonly string[], action: AccessAction): boolean {
  const required = ACCESS_ACTION_CAPABILITY[action]
  return capabilities.includes(required)
}
