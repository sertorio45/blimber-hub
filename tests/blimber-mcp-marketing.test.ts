import { describe, expect, it, vi } from 'vitest'
import {
  BlimberMcpError,
  marketingApprovePost,
  marketingCreateCampaign,
  marketingCreatePost,
  marketingDeletePost,
  marketingListPosts,
  marketingUpdatePost,
} from '../lib/blimber-mcp'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'
const ACTOR_ID = '22222222-2222-2222-2222-222222222222'

function insertResult(payload: Record<string, unknown>, id = 'camp-1') {
  return {
    select: () => ({
      single: async () => ({ data: { id, ...payload }, error: null }),
    }),
  }
}

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
      { client: client as any },
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

  it('create campaign dry-run works without actor', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111'
    const previousActor = process.env.BLIMBER_MCP_ACTOR_USER_ID
    delete process.env.BLIMBER_MCP_ACTOR_USER_ID

    try {
      const result = await marketingCreateCampaign(
        { client: { from: () => ({}) } as any },
        {
          tenantId,
          name: 'Farmaestética Agosto',
          confirm: true,
          confirmTenantId: tenantId,
          dryRun: true,
        },
      )
      expect(result).toMatchObject({ dryRun: true, wouldMutate: true, kind: 'editorial' })
      expect((result as { preview: { created_by: string | null } }).preview.created_by).toBeNull()
    }
    finally {
      if (previousActor === undefined)
        delete process.env.BLIMBER_MCP_ACTOR_USER_ID
      else
        process.env.BLIMBER_MCP_ACTOR_USER_ID = previousActor
    }
  })

  it('create campaign execute without actor returns ACTOR_REQUIRED', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111'
    const previousActor = process.env.BLIMBER_MCP_ACTOR_USER_ID
    delete process.env.BLIMBER_MCP_ACTOR_USER_ID

    try {
      await expect(
        marketingCreateCampaign(
          { client: createClient({}) as any },
          {
            tenantId,
            name: 'Farmaestética Agosto',
            confirm: true,
            confirmTenantId: tenantId,
            dryRun: false,
          },
        ),
      ).rejects.toMatchObject({
        code: 'ACTOR_REQUIRED',
        statusCode: 503,
      })
    }
    finally {
      if (previousActor === undefined)
        delete process.env.BLIMBER_MCP_ACTOR_USER_ID
      else
        process.env.BLIMBER_MCP_ACTOR_USER_ID = previousActor
    }
  })

  it('create campaign execute inserts via .from() without auth.admin', async () => {
    const previousActor = process.env.BLIMBER_MCP_ACTOR_USER_ID
    delete process.env.BLIMBER_MCP_ACTOR_USER_ID
    const insert = vi.fn((payload: Record<string, unknown>) => insertResult(payload))
    const client = {
      from(table: string) {
        expect(table).toBe('social_campaigns')
        return { insert }
      },
    }

    try {
      const result = await marketingCreateCampaign(
        { client: client as any },
        {
          tenantId: TENANT_ID,
          name: 'Farmaestética Agosto',
          confirm: true,
          confirmTenantId: TENANT_ID,
          dryRun: false,
          actorUserId: ACTOR_ID,
        },
      )
      expect(insert).toHaveBeenCalledTimes(1)
      expect(insert.mock.calls[0][0]).toMatchObject({
        tenant_id: TENANT_ID,
        name: 'Farmaestética Agosto',
        created_by: ACTOR_ID,
        status: 'draft',
      })
      expect(result).toMatchObject({
        dryRun: false,
        kind: 'editorial',
        campaign: { name: 'Farmaestética Agosto', id: 'camp-1' },
      })
    }
    finally {
      if (previousActor === undefined)
        delete process.env.BLIMBER_MCP_ACTOR_USER_ID
      else
        process.env.BLIMBER_MCP_ACTOR_USER_ID = previousActor
    }
  })

  it('create campaign execute skips broken auth.admin (fetch undefined) and still inserts', async () => {
    const previousActor = process.env.BLIMBER_MCP_ACTOR_USER_ID
    delete process.env.BLIMBER_MCP_ACTOR_USER_ID
    const insert = vi.fn((payload: Record<string, unknown>) => insertResult(payload))
    const getUserById = vi.fn(async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'fetch')")
    })
    const client = {
      from: () => ({ insert }),
      auth: { admin: { getUserById } },
    }

    try {
      const result = await marketingCreateCampaign(
        { client: client as any },
        {
          tenantId: TENANT_ID,
          name: 'Farmaestética Agosto',
          confirm: true,
          confirmTenantId: TENANT_ID,
          dryRun: false,
          actorUserId: ACTOR_ID,
        },
      )
      expect(getUserById).toHaveBeenCalledWith(ACTOR_ID)
      expect(insert).toHaveBeenCalledTimes(1)
      expect(insert.mock.calls[0][0]).toMatchObject({
        tenant_id: TENANT_ID,
        created_by: ACTOR_ID,
      })
      expect(result).toMatchObject({ dryRun: false, kind: 'editorial' })
    }
    finally {
      if (previousActor === undefined)
        delete process.env.BLIMBER_MCP_ACTOR_USER_ID
      else
        process.env.BLIMBER_MCP_ACTOR_USER_ID = previousActor
    }
  })

  it('create campaign execute maps created_by FK violation to ACTOR_NOT_FOUND', async () => {
    const previousActor = process.env.BLIMBER_MCP_ACTOR_USER_ID
    delete process.env.BLIMBER_MCP_ACTOR_USER_ID
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: {
                message: 'insert or update on table "social_campaigns" violates foreign key constraint "social_campaigns_created_by_fkey"',
              },
            }),
          }),
        }),
      }),
    }

    try {
      await expect(
        marketingCreateCampaign(
          { client: client as any },
          {
            tenantId: TENANT_ID,
            name: 'Farmaestética Agosto',
            confirm: true,
            confirmTenantId: TENANT_ID,
            dryRun: false,
            actorUserId: ACTOR_ID,
          },
        ),
      ).rejects.toMatchObject({ code: 'ACTOR_NOT_FOUND', statusCode: 400 })
    }
    finally {
      if (previousActor === undefined)
        delete process.env.BLIMBER_MCP_ACTOR_USER_ID
      else
        process.env.BLIMBER_MCP_ACTOR_USER_ID = previousActor
    }
  })

  it('create campaign execute rejects unknown actor in auth.users', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111'
    const actorUserId = '22222222-2222-2222-2222-222222222222'
    const previousActor = process.env.BLIMBER_MCP_ACTOR_USER_ID
    delete process.env.BLIMBER_MCP_ACTOR_USER_ID

    const client = {
      ...createClient({}),
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: null }, error: null }),
        },
      },
    }

    try {
      await expect(
        marketingCreateCampaign(
          { client: client as any },
          {
            tenantId,
            name: 'Farmaestética Agosto',
            confirm: true,
            confirmTenantId: tenantId,
            dryRun: false,
            actorUserId,
          },
        ),
      ).rejects.toMatchObject({ code: 'ACTOR_NOT_FOUND', statusCode: 400 })
    }
    finally {
      if (previousActor === undefined)
        delete process.env.BLIMBER_MCP_ACTOR_USER_ID
      else
        process.env.BLIMBER_MCP_ACTOR_USER_ID = previousActor
    }
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

  it('create post dry-run works without actor and returns editorial kind', async () => {
    const previousActor = process.env.BLIMBER_MCP_ACTOR_USER_ID
    delete process.env.BLIMBER_MCP_ACTOR_USER_ID

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

    try {
      const result = await marketingCreatePost(
        { client: { from: () => chain } as any },
        {
          tenantId: TENANT_ID,
          title: 'Post GPT',
          content: 'Texto',
          confirm: true,
          confirmTenantId: TENANT_ID,
          dryRun: true,
        },
      )
      expect(result).toMatchObject({ dryRun: true, kind: 'editorial', wouldMutate: true })
    }
    finally {
      if (previousActor === undefined)
        delete process.env.BLIMBER_MCP_ACTOR_USER_ID
      else
        process.env.BLIMBER_MCP_ACTOR_USER_ID = previousActor
    }
  })

  it('create post execute inserts via .from() without auth.admin', async () => {
    const previousActor = process.env.BLIMBER_MCP_ACTOR_USER_ID
    delete process.env.BLIMBER_MCP_ACTOR_USER_ID
    const insert = vi.fn((payload: Record<string, unknown>) => insertResult(payload, 'post-1'))
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      lte: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      in: () => chain,
      insert,
    }

    try {
      const result = await marketingCreatePost(
        { client: { from: () => chain } as any },
        {
          tenantId: TENANT_ID,
          title: 'Post GPT',
          content: 'Texto',
          confirm: true,
          confirmTenantId: TENANT_ID,
          dryRun: false,
          actorUserId: ACTOR_ID,
        },
      )
      expect(insert).toHaveBeenCalledTimes(1)
      expect(insert.mock.calls[0][0]).toMatchObject({
        tenant_id: TENANT_ID,
        title: 'Post GPT',
        created_by: ACTOR_ID,
      })
      expect(result).toMatchObject({
        dryRun: false,
        kind: 'editorial',
        post: { id: 'post-1', title: 'Post GPT' },
      })
    }
    finally {
      if (previousActor === undefined)
        delete process.env.BLIMBER_MCP_ACTOR_USER_ID
      else
        process.env.BLIMBER_MCP_ACTOR_USER_ID = previousActor
    }
  })

  it('create post execute skips broken auth.admin and still inserts', async () => {
    const previousActor = process.env.BLIMBER_MCP_ACTOR_USER_ID
    delete process.env.BLIMBER_MCP_ACTOR_USER_ID
    const insert = vi.fn((payload: Record<string, unknown>) => insertResult(payload, 'post-1'))
    const getUserById = vi.fn(async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'fetch')")
    })
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      lte: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      in: () => chain,
      insert,
    }

    try {
      const result = await marketingCreatePost(
        {
          client: {
            from: () => chain,
            auth: { admin: { getUserById } },
          } as any,
        },
        {
          tenantId: TENANT_ID,
          title: 'Post GPT',
          content: 'Texto',
          confirm: true,
          confirmTenantId: TENANT_ID,
          dryRun: false,
          actorUserId: ACTOR_ID,
        },
      )
      expect(getUserById).toHaveBeenCalledWith(ACTOR_ID)
      expect(insert).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({ dryRun: false, kind: 'editorial' })
    }
    finally {
      if (previousActor === undefined)
        delete process.env.BLIMBER_MCP_ACTOR_USER_ID
      else
        process.env.BLIMBER_MCP_ACTOR_USER_ID = previousActor
    }
  })

  it('update post dry-run shows variants preview', async () => {
    const postId = '33333333-3333-3333-3333-333333333333'
    const accountId = '66666666-6666-6666-6666-666666666666'
    const existing = {
      id: postId,
      title: 'Post A',
      content: 'Texto',
      status: 'draft',
      tenant_id: TENANT_ID,
      deleted_at: null,
      metadata: {},
    }
    const client = {
      from(table: string) {
        if (table === 'social_accounts') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: async () => ({
                    data: [{ id: accountId, platform: 'instagram' }],
                  }),
                }),
              }),
            }),
          }
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: existing, error: null }),
              }),
            }),
          }),
        }
      },
    }

    const result = await marketingUpdatePost(
      { client: client as any },
      {
        tenantId: TENANT_ID,
        postId,
        variants: [{ accountId, platform: 'instagram', format: 'static' }],
        confirm: true,
        confirmTenantId: TENANT_ID,
        dryRun: true,
      },
    )
    expect(result).toMatchObject({ dryRun: true, wouldMutate: true })
    expect((result as any).variantsPreview).toHaveLength(1)
    expect((result as any).variantsPreview[0].accountId).toBe(accountId)
  })

  it('update post execute replaces variants', async () => {
    const postId = '33333333-3333-3333-3333-333333333333'
    const accountId = '66666666-6666-6666-6666-666666666666'
    const deleteFn = vi.fn(() => ({
      eq: () => ({
        eq: async () => ({ error: null }),
      }),
    }))
    const insertFn = vi.fn(async () => ({ error: null }))
    const existing = {
      id: postId,
      title: 'Post A',
      content: 'Texto',
      status: 'draft',
      tenant_id: TENANT_ID,
      deleted_at: null,
      metadata: {},
    }
    let callCount = 0
    const client = {
      from(table: string) {
        if (table === 'social_accounts') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: async () => ({
                    data: [{ id: accountId, platform: 'instagram' }],
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'social_post_variants') {
          return {
            delete: deleteFn,
            insert: (payload: unknown) => {
              insertFn(payload)
              const rows = Array.isArray(payload) ? payload : [payload]
              return {
                select: async () => ({
                  data: rows.map((row: Record<string, unknown>, index: number) => ({
                    id: `var-${index}`,
                    ...row,
                  })),
                  error: null,
                }),
              }
            },
          }
        }
        callCount++
        if (callCount === 1) {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: existing, error: null }),
                }),
              }),
            }),
          }
        }
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: existing, error: null }),
                }),
              }),
            }),
          }),
        }
      },
    }

    const result = await marketingUpdatePost(
      { client: client as any },
      {
        tenantId: TENANT_ID,
        postId,
        variants: [{ accountId, platform: 'instagram' }],
        confirm: true,
        confirmTenantId: TENANT_ID,
        dryRun: false,
      },
    )
    expect(result).toMatchObject({ dryRun: false, kind: 'editorial' })
    expect(deleteFn).toHaveBeenCalledTimes(1)
    expect(insertFn).toHaveBeenCalledTimes(1)
    expect(insertFn.mock.calls[0][0][0]).toMatchObject({
      account_id: accountId,
      platform: 'instagram',
      post_id: postId,
      tenant_id: TENANT_ID,
    })
  })

  it('update post rejects invalid account', async () => {
    const postId = '33333333-3333-3333-3333-333333333333'
    const badAccountId = '77777777-7777-7777-7777-777777777777'
    const existing = {
      id: postId,
      title: 'Post A',
      content: 'Texto',
      status: 'draft',
      tenant_id: TENANT_ID,
      deleted_at: null,
      metadata: {},
    }
    const client = {
      from(table: string) {
        if (table === 'social_accounts') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: async () => ({ data: [] }),
                }),
              }),
            }),
          }
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: existing, error: null }),
              }),
            }),
          }),
        }
      },
    }

    await expect(
      marketingUpdatePost(
        { client: client as any },
        {
          tenantId: TENANT_ID,
          postId,
          variants: [{ accountId: badAccountId, platform: 'instagram' }],
          confirm: true,
          confirmTenantId: TENANT_ID,
          dryRun: false,
        },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ACCOUNT' })
  })

  const POST_ID = '33333333-3333-3333-3333-333333333333'
  const OTHER_TENANT_ID = '44444444-4444-4444-4444-444444444444'
  const CAMPAIGN_ID = '55555555-5555-5555-5555-555555555555'

  function editorialPost(overrides: Record<string, unknown> = {}) {
    return {
      id: POST_ID,
      title: 'Post duplicado',
      campaign_id: CAMPAIGN_ID,
      tenant_id: TENANT_ID,
      deleted_at: null,
      status: 'draft',
      publication_status: 'not_scheduled',
      ...overrides,
    }
  }

  function createDeleteClient(opts: {
    post: Record<string, unknown> | null
    rpc?: ReturnType<typeof vi.fn>
  }) {
    const rpc = opts.rpc ?? vi.fn(async () => ({ data: true, error: null }))
    const update = vi.fn(() => ({
      eq: () => ({
        eq: () => ({
          is: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { id: POST_ID }, error: null }),
            }),
          }),
        }),
      }),
    }))
    return {
      rpc,
      update,
      from() {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          update,
          maybeSingle: async () => ({ data: opts.post, error: null }),
        }
        return chain
      },
    }
  }

  it('delete post dry-run returns preview and does not delete', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    const client = createDeleteClient({ post: editorialPost(), rpc })

    const result = await marketingDeletePost(
      { client: client as any },
      {
        tenantId: TENANT_ID,
        postId: POST_ID,
        confirm: true,
        confirmTenantId: TENANT_ID,
        dryRun: true,
      },
    )

    expect(result).toMatchObject({
      dryRun: true,
      wouldMutate: true,
      kind: 'editorial',
      deleteMode: 'soft',
      preview: { id: POST_ID, title: 'Post duplicado', campaignId: CAMPAIGN_ID },
    })
    expect(rpc).not.toHaveBeenCalled()
    expect(client.update).not.toHaveBeenCalled()
  })

  it('delete post rejects wrong tenant without mutating', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    const client = createDeleteClient({
      post: editorialPost({ tenant_id: OTHER_TENANT_ID }),
      rpc,
    })

    await expect(
      marketingDeletePost(
        { client: client as any },
        {
          tenantId: TENANT_ID,
          postId: POST_ID,
          confirm: true,
          confirmTenantId: TENANT_ID,
          dryRun: false,
        },
      ),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    })
    expect(rpc).not.toHaveBeenCalled()
    expect(client.update).not.toHaveBeenCalled()
  })

  it('delete post execute soft-deletes via domain RPC', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    const client = createDeleteClient({ post: editorialPost(), rpc })

    const result = await marketingDeletePost(
      { client: client as any },
      {
        tenantId: TENANT_ID,
        postId: POST_ID,
        confirm: true,
        confirmTenantId: TENANT_ID,
        dryRun: false,
        actorUserId: ACTOR_ID,
      },
    )

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('marketing_delete_social_post')
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_tenant_id: TENANT_ID,
      p_post_id: POST_ID,
      p_deleted_by: ACTOR_ID,
      p_mode: 'system_only',
      p_remote_status: 'not_applicable',
    })
    expect(client.update).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      dryRun: false,
      kind: 'editorial',
      deleted: true,
      deleteMode: 'soft',
      post: { id: POST_ID, title: 'Post duplicado', campaignId: CAMPAIGN_ID },
    })
  })
})

describe('blimber marketing editorial approve (mocked)', () => {
  const POST_ID = '33333333-3333-3333-3333-333333333333'

  function editorialChain(table: string, post: Record<string, unknown>, pending: Record<string, unknown> | null) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === 'social_posts')
          return { data: post, error: null }
        if (table === 'approval_requests')
          return { data: pending, error: null }
        return { data: null, error: null }
      },
    }
    return chain
  }

  it('approvePost dry-run on draft previews bypass path', async () => {
    const post = {
      id: POST_ID,
      title: 'Rascunho',
      content: 'Oi',
      status: 'draft',
      editorial_status: 'draft',
      tenant_id: TENANT_ID,
      deleted_at: null,
      metadata: {},
    }
    const client = {
      from: (table: string) => editorialChain(table, post, null),
    }

    const result = await marketingApprovePost(
      { client: client as any },
      {
        tenantId: TENANT_ID,
        postId: POST_ID,
        confirm: true,
        confirmTenantId: TENANT_ID,
        dryRun: true,
      },
    )

    expect(result).toMatchObject({
      dryRun: true,
      wouldMutate: true,
      decision: 'approved',
      path: 'bypass',
    })
  })

  it('updatePost editorialStatus=approved dry-run does not ignore status', async () => {
    const post = {
      id: POST_ID,
      title: 'Rascunho',
      content: 'Oi',
      status: 'draft',
      editorial_status: 'draft',
      tenant_id: TENANT_ID,
      deleted_at: null,
      metadata: {},
    }
    const client = {
      from: (table: string) => editorialChain(table, post, null),
    }

    const result = await marketingUpdatePost(
      { client: client as any },
      {
        tenantId: TENANT_ID,
        postId: POST_ID,
        editorialStatus: 'approved',
        confirm: true,
        confirmTenantId: TENANT_ID,
        dryRun: true,
      },
    )

    expect(result).toMatchObject({
      dryRun: true,
      editorial: { decision: 'approved', path: 'bypass' },
    })
  })

  it('updatePost rejects publication status values', async () => {
    await expect(
      marketingUpdatePost(
        { client: { from: () => ({}) } as any },
        {
          tenantId: TENANT_ID,
          postId: POST_ID,
          status: 'published',
          confirm: true,
          confirmTenantId: TENANT_ID,
          dryRun: true,
        },
      ),
    ).rejects.toMatchObject({ code: 'PUBLICATION_STATUS_UNSUPPORTED' })
  })

  it('changes_requested without pending request is 409', async () => {
    const post = {
      id: POST_ID,
      title: 'Rascunho',
      editorial_status: 'draft',
      tenant_id: TENANT_ID,
      deleted_at: null,
    }
    const client = {
      from: (table: string) => editorialChain(table, post, null),
    }

    await expect(
      marketingApprovePost(
        { client: client as any },
        {
          tenantId: TENANT_ID,
          postId: POST_ID,
          decision: 'changes_requested',
          comment: 'Ajustar headline',
          confirm: true,
          confirmTenantId: TENANT_ID,
          dryRun: true,
        },
      ),
    ).rejects.toMatchObject({ code: 'NO_PENDING_REQUEST', statusCode: 409 })
  })

  it('approvePost execute without actor returns ACTOR_REQUIRED', async () => {
    const previousActor = process.env.BLIMBER_MCP_ACTOR_USER_ID
    delete process.env.BLIMBER_MCP_ACTOR_USER_ID
    const post = {
      id: POST_ID,
      title: 'Rascunho',
      editorial_status: 'draft',
      tenant_id: TENANT_ID,
      deleted_at: null,
    }
    const client = {
      from: (table: string) => editorialChain(table, post, null),
    }

    try {
      await expect(
        marketingApprovePost(
          { client: client as any },
          {
            tenantId: TENANT_ID,
            postId: POST_ID,
            confirm: true,
            confirmTenantId: TENANT_ID,
            dryRun: false,
          },
        ),
      ).rejects.toMatchObject({ code: 'ACTOR_REQUIRED', statusCode: 503 })
    }
    finally {
      if (previousActor === undefined)
        delete process.env.BLIMBER_MCP_ACTOR_USER_ID
      else
        process.env.BLIMBER_MCP_ACTOR_USER_ID = previousActor
    }
  })

  it('approvePost execute bypasses draft as platform admin', async () => {
    const { createFakeDomainClient } = await import('./helpers/fake-supabase-domain')
    const versionId = '44444444-4444-4444-4444-444444444444'
    const db = {
      social_posts: [{
        id: POST_ID,
        title: 'Rascunho',
        content: 'Oi',
        tenant_id: TENANT_ID,
        editorial_status: 'draft',
        created_by: ACTOR_ID,
        deleted_at: null,
        approval_bypassed: false,
      }],
      approval_requests: [],
      content_versions: [{
        id: versionId,
        tenant_id: TENANT_ID,
        post_id: POST_ID,
        version: 1,
      }],
      notifications: [],
      social_automation_rules: [{ tenant_id: TENANT_ID, trigger_key: 'editorial.approved', enabled: false }],
      social_automation_runs: [],
    }
    const domain = createFakeDomainClient(db)
    const client = {
      ...domain,
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: { id: ACTOR_ID, app_metadata: { role: 'admin' } } },
            error: null,
          }),
        },
      },
    }

    const result = await marketingApprovePost(
      { client: client as any },
      {
        tenantId: TENANT_ID,
        postId: POST_ID,
        confirm: true,
        confirmTenantId: TENANT_ID,
        dryRun: false,
        actorUserId: ACTOR_ID,
      },
    )

    expect(result).toMatchObject({ dryRun: false, path: 'bypass', decision: 'approved' })
    expect((result as any).post.editorialStatus).toBe('approved')
    expect(db.social_posts[0]!.editorial_status).toBe('approved')
    expect(db.social_posts[0]!.approval_bypassed).toBe(true)
  })
})
