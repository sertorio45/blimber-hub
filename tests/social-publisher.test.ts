import { describe, expect, it, vi } from 'vitest'

import { processPublicationJob } from '~/server/utils/social-publisher'

vi.mock('~/server/utils/social-audit', () => ({
  writeSocialAudit: vi.fn(),
  createSocialNotification: vi.fn(),
}))

vi.mock('~/server/utils/social-publishers/linkedin-publisher', () => ({
  publishToLinkedin: vi.fn().mockResolvedValue({ externalPostId: 'li-123', externalPostUrl: 'https://linkedin.com/post/123' }),
}))

vi.mock('~/server/utils/social-publishers/meta-publisher', () => ({
  publishToMeta: vi.fn().mockResolvedValue({ externalPostId: 'meta-456', externalPostUrl: 'https://instagram.com/p/456' }),
}))

vi.mock('~/server/utils/social-automations', () => ({
  emitSocialAutomation: vi.fn(),
}))

function createMockClient(opts: {
  remainingJobs?: number
  provider?: string
  postDeleted?: boolean
}) {
  const updates: Record<string, any[]> = {}

  const builder = (table: string) => {
    const ctx: any = {
      _table: table,
      _filters: [] as any[],
      _updatePayload: null as any,
      select: () => ctx,
      eq: (col: string, val: any) => { ctx._filters.push({ col, val }); return ctx },
      neq: () => ctx,
      in: () => ctx,
      order: () => ctx,
      maybeSingle: () => {
        if (table === 'publication_jobs') {
          return { data: { id: 'job-1', tenant_id: 't1', post_id: 'post-1', variant_id: 'v1', account_id: 'acc-1', version_id: 'ver-1', attempts: 0, max_attempts: 3 } }
        }
        if (table === 'content_versions') {
          return { data: { snapshot: { variants: [{ id: 'v1', caption: 'test' }], assets: [] } } }
        }
        if (table === 'social_accounts') {
          return { data: { id: 'acc-1', provider: opts.provider ?? 'linkedin', platform: 'linkedin', tenant_id: 't1' } }
        }
        if (table === 'social_posts') {
          return {
            data: {
              title: 'Test Post',
              created_by: 'user-1',
              deleted_at: opts.postDeleted ? new Date().toISOString() : null,
              publication_status: 'scheduled',
              deletion_status: null,
            },
          }
        }
        return { data: null }
      },
      single: () => ctx.maybeSingle(),
      update: (payload: any) => {
        ctx._updatePayload = payload
        if (!updates[table]) updates[table] = []
        updates[table].push(payload)
        return ctx
      },
      insert: () => ctx,
    }
    const origSelect = ctx.select
    ctx.select = (_cols?: string, selectOpts?: any) => {
      if (selectOpts?.count === 'exact' && selectOpts?.head) {
        const countCtx = {
          eq: () => countCtx,
          neq: () => ({ count: opts.remainingJobs ?? 0 }),
        }
        return countCtx
      }
      return origSelect(_cols, selectOpts)
    }
    return ctx
  }

  return {
    from: builder,
    _updates: updates,
  }
}

describe('processPublicationJob', () => {
  it('sets publication_status to published when all jobs finish', async () => {
    const client = createMockClient({ remainingJobs: 0 })
    const result = await processPublicationJob(client, { id: 'job-1', attempts: 0 }, 'worker-test')

    expect(result.success).toBe(true)
    const postUpdates = client._updates.social_posts || []
    const publishedUpdate = postUpdates.find((u: any) => u.publication_status === 'published')
    expect(publishedUpdate).toBeTruthy()
    expect(publishedUpdate.published_at).toBeTruthy()
  })

  it('does NOT set publication_status when other jobs remain', async () => {
    const client = createMockClient({ remainingJobs: 1 })
    const result = await processPublicationJob(client, { id: 'job-1', attempts: 0 }, 'worker-test')

    expect(result.success).toBe(true)
    const postUpdates = client._updates.social_posts || []
    const publishedUpdate = postUpdates.find((u: any) => u.publication_status === 'published')
    expect(publishedUpdate).toBeUndefined()
  })

  it('skips deleted posts', async () => {
    const client = createMockClient({ postDeleted: true })
    const result = await processPublicationJob(client, { id: 'job-1', attempts: 0 }, 'worker-test')

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('deletion_in_progress')
  })
})
