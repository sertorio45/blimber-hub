import { describe, expect, it, vi } from 'vitest'
import {
  BlimberMcpError,
  marketingCreateCampaign,
  marketingListPosts,
} from '../lib/blimber-mcp'

function createClient(opts: {
  tenantExists?: boolean
  posts?: Array<Record<string, unknown>>
  insertError?: string | null
  insertRow?: Record<string, unknown>
}) {
  const posts = opts.posts ?? []
  return {
    from(table: string) {
      const state: Record<string, unknown> = {}
      const chain: any = {
        select: () => chain,
        eq: (_c: string, v: unknown) => {
          state.eq = v
          return chain
        },
        is: () => chain,
        order: () => chain,
        range: async () => ({
          data: table === 'social_posts' ? posts : [],
          error: null,
          count: posts.length,
        }),
        limit: () => chain,
        maybeSingle: async () => {
          if (table === 'tenant') {
            return {
              data: opts.tenantExists === false ? null : { id: '11111111-1111-1111-1111-111111111111' },
              error: null,
            }
          }
          return { data: null, error: null }
        },
        insert: (payload: Record<string, unknown>) => {
          state.inserted = payload
          return {
            select: () => ({
              single: async () => ({
                data: opts.insertError
                  ? null
                  : (opts.insertRow || { id: 'camp-1', ...payload }),
                error: opts.insertError ? { message: opts.insertError } : null,
              }),
            }),
          }
        },
        ilike: () => chain,
        in: () => chain,
      }
      // list posts uses await on chain after range — also support thenable select path
      chain.then = undefined
      return chain
    },
  }
}

describe('blimber marketing tools (mocked)', () => {
  it('lists editorial posts for a tenant', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111'
    const client = createClient({
      posts: [
        {
          id: 'p1',
          title: 'Post A',
          content: 'Olá',
          status: 'draft',
          metadata: {},
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    const result = await marketingListPosts({ client }, { tenantId })
    expect(result.posts).toHaveLength(1)
    expect(result.posts[0].title).toBe('Post A')
    expect(result.pagination.total).toBe(1)
  })

  it('create campaign dry-run preview does not insert', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111'
    const insert = vi.fn()
    const client = {
      from(table: string) {
        if (table === 'tenant') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: tenantId }, error: null }),
              }),
            }),
          }
        }
        return {
          insert: (...args: unknown[]) => {
            insert(...args)
            return { select: () => ({ single: async () => ({ data: null, error: null }) }) }
          },
        }
      },
    }

    const result = await marketingCreateCampaign(
      { client: client as any, actorUserId: '22222222-2222-2222-2222-222222222222' },
      {
        tenantId,
        name: 'Campanha Março',
        confirm: true,
        confirmTenantId: tenantId,
        dryRun: true,
      },
    )

    expect(result).toMatchObject({ dryRun: true, wouldMutate: true, kind: 'editorial' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects create without confirmation', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111'
    await expect(
      marketingCreateCampaign(
        {
          client: createClient({}) as any,
          actorUserId: '22222222-2222-2222-2222-222222222222',
        },
        {
          tenantId,
          name: 'X',
          confirm: true,
          confirmTenantId: '33333333-3333-3333-3333-333333333333',
          dryRun: false,
        },
      ),
    ).rejects.toBeInstanceOf(BlimberMcpError)
  })

  it('create post dry-run requires actor and returns editorial kind', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111'
    const { marketingCreatePost } = await import('../lib/blimber-mcp')

    const chain: any = {
      select: () => chain,
      eq: () => chain,
      lte: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      in: () => chain,
    }

    const result = await marketingCreatePost(
      {
        client: { from: () => chain } as any,
        actorUserId: '22222222-2222-2222-2222-222222222222',
      },
      {
        tenantId,
        title: 'Post GPT',
        content: 'Texto',
        confirm: true,
        confirmTenantId: tenantId,
        dryRun: true,
      },
    )
    expect(result).toMatchObject({ dryRun: true, kind: 'editorial', wouldMutate: true })
  })
})
