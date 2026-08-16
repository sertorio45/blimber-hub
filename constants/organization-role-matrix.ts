/**
 * Canonical capability matrix for system organization roles.
 * Kept in sync with supabase/migrations/*organization_roles_seed*.sql
 * and social_post_deletion_flow (force/retry grants).
 *
 * Tests assert this matrix; if seed SQL drifts, tests fail.
 */

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
  ],
  approver: [
    'organization.read',
    'marketing.social.read',
    'marketing.social.comment',
    'marketing.social.approval.client',
    'marketing.social.approve',
    'marketing.social.reports',
  ],
  editor: [
    'organization.read',
    'marketing.social.read',
    'marketing.social.create',
    'marketing.social.update',
    'marketing.social.comment',
    'marketing.social.approval.submit',
  ],
  viewer: [
    'organization.read',
    'marketing.social.read',
    'marketing.social.reports',
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
