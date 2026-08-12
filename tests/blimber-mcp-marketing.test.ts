import { describe, expect, it, vi } from 'vitest'
import {
  BlimberMcpError,
  marketingCreateCampaign,
  marketingCreatePost,
  marketingListPosts,
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
})
