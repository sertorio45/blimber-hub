import { describe, expect, it } from 'vitest'

import {
  canDecideApprovalRequest,
  canSeeInternalComments,
  isOverdue,
  mapApprovalListItem,
  waitingMs,
} from '~/server/utils/social-approval-ux'

describe('social-approval-ux', () => {
  it('never exposes internal comments capability to bare client approvers', () => {
    expect(canSeeInternalComments(['marketing.social.approve', 'marketing.social.read'], false)).toBe(false)
    expect(canSeeInternalComments(['agency.clients.read'], false)).toBe(true)
    expect(canSeeInternalComments(['marketing.social.approval.internal'], false)).toBe(true)
    expect(canSeeInternalComments([], true)).toBe(true)
  })

  it('maps list items bound to the approval version snapshot', () => {
    const row = {
      id: 'req-1',
      tenant_id: 'tenant-1',
      post_id: 'post-1',
      status: 'pending',
      stage: 'client',
      version_id: 'ver-2',
      due_at: '2099-01-01T00:00:00.000Z',
      created_at: new Date(Date.now() - 3_600_000).toISOString(),
      requested_by: 'user-1',
      social_posts: { title: 'Campanha Q3', content: '', assigned_to: 'user-2', scheduled_at: null },
      content_versions: {
        version: 2,
        snapshot: {
          variants: [
            { platform: 'instagram', format: 'carousel', caption: 'Olá' },
            { platform: 'facebook', format: 'static', caption: 'Oi' },
          ],
          assets: [],
        },
      },
      approval_request_approvers: [{ user_id: 'approver-1' }],
      approval_decisions: [],
    }

    const item = mapApprovalListItem(row, { id: 'tenant-1', name: 'Cliente X', slug: 'cliente-x' })

    expect(item.client.name).toBe('Cliente X')
    expect(item.version_number).toBe(2)
    expect(item.platforms).toEqual(['instagram', 'facebook'])
    expect(item.formats).toContain('carousel')
    expect(item.overdue).toBe(false)
    expect(item.waiting_ms).toBeGreaterThan(0)
    expect(item.preview_snapshot?.variants?.[0]?.caption).toBe('Olá')
  })

  it('flags overdue pending requests', () => {
    expect(isOverdue('2000-01-01T00:00:00.000Z', 'pending')).toBe(true)
    expect(isOverdue('2000-01-01T00:00:00.000Z', 'approved')).toBe(false)
    expect(waitingMs(null)).toBeNull()
  })

  it('company admin can decide unassigned client-stage requests', () => {
    expect(canDecideApprovalRequest({
      status: 'pending',
      stage: 'client',
      approverIds: ['someone-else'],
      userId: 'admin-1',
      capabilities: ['marketing.social.approval.client'],
    })).toBe(true)

    expect(canDecideApprovalRequest({
      status: 'pending',
      stage: 'internal',
      approverIds: ['someone-else'],
      userId: 'admin-1',
      capabilities: ['marketing.social.approval.client'],
    })).toBe(false)

    expect(canDecideApprovalRequest({
      status: 'pending',
      stage: 'client',
      approverIds: ['approver-1'],
      userId: 'approver-1',
      capabilities: ['marketing.social.approval.client'],
    })).toBe(true)

    expect(canDecideApprovalRequest({
      status: 'approved',
      stage: 'client',
      approverIds: [],
      userId: 'admin-1',
      capabilities: ['marketing.social.approval.client'],
    })).toBe(false)
  })
})
