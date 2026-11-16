import { beforeEach, describe, expect, it, vi } from 'vitest'

const processPublicationJob = vi.fn()
const enqueueApprovedPost = vi.fn()
const createContentVersion = vi.fn()
const recordSocialAudit = vi.fn()
const requireSocialContext = vi.fn()
const getRouterParam = vi.fn()
const readBody = vi.fn()

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    getRouterParam: (...args: any[]) => getRouterParam(...args),
    readBody: (...args: any[]) => readBody(...args),
  }
})

vi.mock('~/server/utils/social-publisher', () => ({
  processPublicationJob: (...args: any[]) => processPublicationJob(...args),
}))

vi.mock('~/server/utils/social-approval-domain', () => ({
  createContentVersion: (...args: any[]) => createContentVersion(...args),
  enqueueApprovedPost: (...args: any[]) => enqueueApprovedPost(...args),
}))

vi.mock('~/server/utils/social-audit', () => ({
  recordSocialAudit: (...args: any[]) => recordSocialAudit(...args),
}))

vi.mock('~/server/utils/social-context', () => ({
  requireSocialContext: (...args: any[]) => requireSocialContext(...args),
}))

vi.mock('~/constants/workspace', () => ({
  holdsCapability: () => true,
}))

describe('share-stories publishNow', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('defineEventHandler', (handler: any) => handler)
    vi.stubGlobal('createError', (input: any) => {
      const error = new Error(input.statusMessage || 'error') as any
      error.statusCode = input.statusCode
      error.statusMessage = input.statusMessage
      return error
    })

    getRouterParam.mockReturnValue('source-1')
    createContentVersion.mockResolvedValue({ id: 'ver-1', version: 1 })
    enqueueApprovedPost.mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }])
    processPublicationJob.mockResolvedValue({ ok: true })
    recordSocialAudit.mockResolvedValue(undefined)
  })

  function buildClient() {
    return {
      from(table: string) {
        const ctx: any = {
          select: () => ctx,
          eq: () => ctx,
          in: () => ctx,
          update: () => ctx,
          delete: () => ctx,
          insert: () => ctx,
          maybeSingle: async () => {
            if (table === 'social_posts') {
              return {
                data: {
                  id: 'source-1',
                  title: 'Post origem',
                  content: 'Texto',
                  status: 'published',
                  timezone: 'America/Sao_Paulo',
                  social_post_variants: [{
                    id: 'v1',
                    account_id: 'acc-ig',
                    platform: 'instagram',
                    caption: 'cap',
                    hashtags: [],
                    social_post_assets: [{
                      position: 0,
                      media_assets: { id: 'asset-1', purpose: 'publication' },
                    }],
                  }],
                },
                error: null,
              }
            }
            return { data: null, error: null }
          },
          single: async () => {
            if (table === 'social_posts') {
              return {
                data: {
                  id: 'story-post-1',
                  title: 'Stories · Post origem',
                  status: 'draft',
                },
                error: null,
              }
            }
            return { data: null, error: null }
          },
        }

        if (table === 'social_accounts') {
          Object.assign(ctx, {
            then(resolve: any) {
              resolve({
                data: [
                  { id: 'acc-ig', platform: 'instagram', name: 'IG' },
                  { id: 'acc-fb', platform: 'facebook', name: 'FB' },
                ],
                error: null,
              })
            },
          })
        }

        if (table === 'social_post_variants') {
          ctx.select = () => ({
            then(resolve: any) {
              resolve({
                data: [{ id: 'sv-1' }, { id: 'sv-2' }],
                error: null,
              })
            },
          })
        }

        if (table === 'social_post_assets') {
          Object.assign(ctx, {
            then(resolve: any) {
              resolve({ data: null, error: null })
            },
          })
        }

        return ctx
      },
    }
  }

  it('processes publication jobs inline when publishNow is true', async () => {
    const client = buildClient()
    requireSocialContext.mockResolvedValue({
      client,
      tenantId: 't1',
      user: { id: 'user-1' },
      workspace: { capabilities: ['marketing.social.publish'] },
      isPlatformStaff: true,
    })
    readBody.mockResolvedValue({ publishNow: true })

    const handler = (await import('~/server/api/marketing/social/posts/[id]/share-stories.post')).default
    const response = await handler({ __testClient: client } as any)

    expect(enqueueApprovedPost).toHaveBeenCalledWith(client, expect.objectContaining({
      tenantId: 't1',
      postId: 'story-post-1',
      publishNow: true,
    }))
    expect(processPublicationJob).toHaveBeenCalledTimes(2)
    expect(processPublicationJob).toHaveBeenNthCalledWith(
      1,
      client,
      { id: 'job-1' },
      'stories-share:user-1',
    )
    expect(response.data.storyPostId).toBe('story-post-1')
    expect(response.data.processResults).toHaveLength(2)
  })

  it('does not process jobs inline when only scheduling', async () => {
    const client = buildClient()
    requireSocialContext.mockResolvedValue({
      client,
      tenantId: 't1',
      user: { id: 'user-1' },
      workspace: { capabilities: ['marketing.social.publish'] },
      isPlatformStaff: true,
    })
    readBody.mockResolvedValue({
      publishNow: false,
      scheduledAt: '2030-01-01T12:00:00.000Z',
    })

    const handler = (await import('~/server/api/marketing/social/posts/[id]/share-stories.post')).default
    const response = await handler({ __testClient: client } as any)

    expect(processPublicationJob).not.toHaveBeenCalled()
    expect(response.data.processResults).toEqual([])
  })
})
