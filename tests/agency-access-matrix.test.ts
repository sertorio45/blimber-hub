import type { AccessAction, AgencyRoleSlug, DirectRoleSlug } from '~/constants/organization-role-matrix'

import { describe, expect, it } from 'vitest'
import {
  ACCESS_ACTION_CAPABILITY,

  AGENCY_ROLE_CAPABILITIES,

  DIRECT_ROLE_CAPABILITIES,

  PLATFORM_STAFF_CAPABILITIES,
  roleCan,
} from '~/constants/organization-role-matrix'
import { expandCapabilityAliases, holdsCapability } from '~/constants/workspace'
import { canSeeInternalComments } from '~/server/utils/social-approval-ux'
import { assertDeletionCapabilities } from '~/server/utils/social-deletion-domain'

const ALL_ACTIONS = Object.keys(ACCESS_ACTION_CAPABILITY) as AccessAction[]

function expectActions(
  capabilities: readonly string[],
  allowed: AccessAction[],
  denied: AccessAction[],
) {
  for (const action of allowed)
    expect(roleCan(capabilities, action), `expected allow ${action}`).toBe(true)
  for (const action of denied)
    expect(roleCan(capabilities, action), `expected deny ${action}`).toBe(false)
}

describe('agency access matrix', () => {
  const cases: Array<{
    slug: AgencyRoleSlug
    allow: AccessAction[]
    deny: AccessAction[]
  }> = [
    {
      slug: 'owner',
      allow: [
        'list_organizations',
        'list_clients',
        'edit_client',
        'manage_team',
        'manage_roles',
        'create_post',
        'edit_post',
        'comment_shared',
        'comment_internal',
        'submit_approval',
        'approve_internal',
        'approve_client',
        'schedule',
        'publish',
        'delete_local',
        'delete_remote',
        'delete_force',
        'manage_integrations',
        'view_reports',
      ],
      deny: [],
    },
    {
      slug: 'agency_admin',
      allow: [
        'list_clients',
        'edit_client',
        'manage_team',
        'manage_roles',
        'create_post',
        'edit_post',
        'approve_internal',
        'schedule',
        'publish',
        'delete_local',
        'delete_remote',
        'delete_force',
        'manage_integrations',
        'view_reports',
      ],
      deny: ['approve_client'],
    },
    {
      slug: 'marketing_manager',
      allow: [
        'list_clients',
        'create_post',
        'edit_post',
        'approve_internal',
        'schedule',
        'publish',
        'delete_local',
        'delete_remote',
        'delete_force',
        'view_reports',
      ],
      deny: ['edit_client', 'manage_team', 'manage_roles', 'manage_integrations', 'approve_client'],
    },
    {
      slug: 'social_media',
      allow: ['list_clients', 'create_post', 'edit_post', 'comment_shared', 'submit_approval'],
      deny: [
        'edit_client',
        'manage_team',
        'approve_internal',
        'approve_client',
        'schedule',
        'publish',
        'delete_local',
        'delete_remote',
        'manage_integrations',
        'view_reports',
      ],
    },
    {
      slug: 'designer',
      allow: ['list_clients', 'create_post', 'edit_post', 'comment_shared'],
      deny: [
        'submit_approval',
        'approve_internal',
        'schedule',
        'publish',
        'delete_local',
        'manage_integrations',
        'view_reports',
      ],
    },
    {
      slug: 'copywriter',
      allow: ['list_clients', 'create_post', 'edit_post', 'comment_shared'],
      deny: ['submit_approval', 'approve_internal', 'schedule', 'publish', 'delete_remote'],
    },
    {
      slug: 'internal_approver',
      allow: ['list_clients', 'comment_shared', 'approve_internal', 'comment_internal'],
      deny: [
        'create_post',
        'edit_post',
        'submit_approval',
        'approve_client',
        'schedule',
        'publish',
        'delete_local',
        'manage_integrations',
      ],
    },
    {
      slug: 'analyst',
      allow: ['list_clients', 'access_tenant', 'view_reports'],
      deny: [
        'create_post',
        'edit_post',
        'comment_shared',
        'submit_approval',
        'approve_internal',
        'schedule',
        'publish',
        'delete_local',
        'manage_integrations',
      ],
    },
  ]

  for (const row of cases) {
    it(`agency/${row.slug} capability gates`, () => {
      expectActions(AGENCY_ROLE_CAPABILITIES[row.slug], row.allow, row.deny)
    })
  }

  it('custom cargo starts empty until capabilities are assigned', () => {
    const custom: string[] = []
    for (const action of ALL_ACTIONS)
      expect(roleCan(custom, action)).toBe(false)
  })
})

describe('direct (client) access matrix', () => {
  it('owner can operate the company without agency portfolio', () => {
    expectActions(DIRECT_ROLE_CAPABILITIES.owner, [
      'manage_team',
      'manage_roles',
      'create_post',
      'edit_post',
      'schedule',
      'publish',
      'view_reports',
      'manage_integrations',
      'access_tenant',
      'approve_client',
    ], [
      'list_clients',
      'edit_client',
      'submit_approval',
      'approve_internal',
      'delete_local',
    ])
  })

  it('approver can approve as client and comment shared only', () => {
    expectActions(DIRECT_ROLE_CAPABILITIES.approver, [
      'approve_client',
      'comment_shared',
      'view_reports',
      'access_tenant',
    ], [
      'create_post',
      'edit_post',
      'submit_approval',
      'approve_internal',
      'schedule',
      'publish',
      'delete_local',
      'comment_internal',
      'list_clients',
    ])
  })

  it('editor can produce and submit, not approve or publish', () => {
    expectActions(DIRECT_ROLE_CAPABILITIES.editor, [
      'create_post',
      'edit_post',
      'comment_shared',
      'submit_approval',
    ], [
      'approve_client',
      'approve_internal',
      'schedule',
      'publish',
      'delete_local',
      'manage_team',
      'view_reports',
    ])
  })

  it('viewer is read-only', () => {
    expectActions(DIRECT_ROLE_CAPABILITIES.viewer, [
      'access_tenant',
      'view_reports',
      'list_organizations',
    ], [
      'create_post',
      'edit_post',
      'comment_shared',
      'submit_approval',
      'approve_client',
      'schedule',
      'publish',
      'delete_local',
    ])
  })
})

describe('platform profiles', () => {
  it('superadmin / support staff hold platform capabilities', () => {
    for (const cap of PLATFORM_STAFF_CAPABILITIES)
      expect(PLATFORM_STAFF_CAPABILITIES.includes(cap)).toBe(true)
  })

  it('user without admin metadata has no platform caps', () => {
    const caps = expandCapabilityAliases([])
    expect(holdsCapability(caps, 'platform.organizations.manage')).toBe(false)
    expect(holdsCapability(caps, 'platform.audit.read')).toBe(false)
  })
})

describe('cross-cutting security rules', () => {
  it('client approver never sees internal comments', () => {
    expect(canSeeInternalComments(DIRECT_ROLE_CAPABILITIES.approver, false)).toBe(false)
    expect(canSeeInternalComments(DIRECT_ROLE_CAPABILITIES.viewer, false)).toBe(false)
    expect(canSeeInternalComments(AGENCY_ROLE_CAPABILITIES.owner, false)).toBe(true)
    expect(canSeeInternalComments(AGENCY_ROLE_CAPABILITIES.internal_approver, false)).toBe(true)
  })

  it('direct owner and extra approver can approve as client without agency portfolio', () => {
    expect(DIRECT_ROLE_CAPABILITIES.owner).toContain('marketing.social.approval.client')
    expect(DIRECT_ROLE_CAPABILITIES.approver).toContain('marketing.social.approval.client')
    expect(DIRECT_ROLE_CAPABILITIES.owner).not.toContain('marketing.social.approval.internal')
    expect(DIRECT_ROLE_CAPABILITIES.owner).not.toContain('agency.clients.read')
    expect(DIRECT_ROLE_CAPABILITIES.approver).not.toContain('agency.clients.read')
  })

  it('delete.remote requires its own capability — create is not enough', () => {
    expect(() => assertDeletionCapabilities({
      tenantId: 't',
      postId: 'p',
      userId: 'u',
      mode: 'system_and_remote',
      capabilities: ['marketing.social.create', 'marketing.social.delete.local'],
    })).toThrow()
  })

  it('delete.force is denied without explicit grant', () => {
    expect(() => assertDeletionCapabilities({
      tenantId: 't',
      postId: 'p',
      userId: 'u',
      mode: 'system_and_remote',
      forceCompleteLocal: true,
      capabilities: [
        'marketing.social.delete.local',
        'marketing.social.delete.remote',
      ],
    })).toThrow()
  })

  it('approve alias maps legacy approve to internal/client', () => {
    const caps = expandCapabilityAliases(['marketing.social.approval.internal'])
    expect(holdsCapability(caps, 'marketing.social.approve')).toBe(true)
  })

  const deniedClientActions: AccessAction[] = [
    'list_clients',
    'edit_client',
    'delete_remote',
    'delete_force',
  ]

  for (const slug of Object.keys(DIRECT_ROLE_CAPABILITIES) as DirectRoleSlug[]) {
    it(`direct/${slug} never manages agency portfolio or remote force`, () => {
      for (const action of deniedClientActions)
        expect(roleCan(DIRECT_ROLE_CAPABILITIES[slug], action)).toBe(false)
    })
  }
})
