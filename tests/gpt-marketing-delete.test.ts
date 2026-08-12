import { describe, expect, it, vi } from 'vitest'
import {
  BlimberMcpError,
  formatBlimberMcpError,
  mapSupabaseRpcError,
  marketingDeletePost,
} from '../lib/blimber-mcp'
import {
  buildMarketingDeletePostArgs,
  parseConfirmTrue,
} from '../server/utils/blimber-gpt-api'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'
const POST_ID = '33333333-3333-3333-3333-333333333333'
const ACTOR_ID = '22222222-2222-2222-2222-222222222222'
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
  const rpc = opts.rpc ?? vi.fn(async function rpcImpl() {
    return { data: true, error: null }
  })
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

  const client = {
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

  return { client, rpc }
}

describe('marketingDeletePost execute', () => {
  it('dry-run does not call RPC', async () => {
    const { client, rpc } = createDeleteClient({ post: editorialPost() })

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

    expect(result).toMatchObject({ dryRun: true, wouldMutate: true })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('execute calls RPC bound to client (not detached)', async () => {
    let rpcThis: unknown
    const { client, rpc } = createDeleteClient({
      post: editorialPost(),
      rpc: vi.fn(async function rpcImpl(this: unknown) {
        rpcThis = this
        return { data: true, error: null }
      }),
    })

    const result = await marketingDeletePost(
      { client: client as any },
      {
        tenantId: TENANT_ID,
        postId: POST_ID,
        confirm: true,
        confirmTenantId: TENANT_ID,
        dryRun: false,
      },
    )

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('marketing_delete_social_post')
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_tenant_id: TENANT_ID,
      p_post_id: POST_ID,
      p_mode: 'system_only',
      p_remote_status: 'not_applicable',
    })
    expect(rpcThis).toBe(client)
    expect(result).toMatchObject({
      dryRun: false,
      deleted: true,
      post: { id: POST_ID, title: 'Post duplicado', campaignId: CAMPAIGN_ID },
    })
  })

  it('wrong tenant returns 403 without mutating', async () => {
    const { client, rpc } = createDeleteClient({
      post: editorialPost({ tenant_id: '44444444-4444-4444-4444-444444444444' }),
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
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })

    expect(rpc).not.toHaveBeenCalled()
  })

  it('supabase RPC error maps to structured JSON via formatBlimberMcpError', async () => {
    const { client } = createDeleteClient({
      post: editorialPost(),
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: 'function not found', code: '42883' },
      })),
    })

    const caught = await marketingDeletePost(
      { client: client as any },
      {
        tenantId: TENANT_ID,
        postId: POST_ID,
        confirm: true,
        confirmTenantId: TENANT_ID,
        dryRun: false,
      },
    ).catch(error => error)

    expect(caught).toBeInstanceOf(BlimberMcpError)

    const formatted = formatBlimberMcpError(caught)
    expect(formatted.ok).toBe(false)
    if (!formatted.ok) {
      expect(formatted.error.code).toBe('DB_ERROR')
      expect(formatted.error.message).toContain('function not found')
      expect(formatted.error.statusCode).toBe(400)
    }
  })
})

describe('mapSupabaseRpcError', () => {
  it('wraps PostgREST-like errors', () => {
    const mapped = mapSupabaseRpcError({
      message: 'duplicate key',
      code: '23505',
      details: 'Key already exists',
    })

    expect(mapped).toMatchObject({
      code: 'DB_ERROR',
      message: 'duplicate key',
      statusCode: 400,
    })
  })
})

describe('buildMarketingDeletePostArgs', () => {
  it('parses body fields for deletePost handler', () => {
    expect(
      buildMarketingDeletePostArgs(POST_ID, {
        tenantId: TENANT_ID,
        confirmTenantId: TENANT_ID,
        confirm: true,
        dryRun: false,
        actorUserId: ACTOR_ID,
      }),
    ).toEqual({
      tenantId: TENANT_ID,
      postId: POST_ID,
      actorUserId: ACTOR_ID,
      confirmTenantId: TENANT_ID,
      confirm: true,
      dryRun: false,
    })
  })

  it('coerces dryRun from query string fallback', () => {
    expect(
      buildMarketingDeletePostArgs(POST_ID, {
        tenantId: TENANT_ID,
        confirmTenantId: TENANT_ID,
        confirm: true,
        dryRun: 'false',
      }).dryRun,
    ).toBe(false)
  })

  it('coerces confirm from query string "true"', () => {
    expect(
      buildMarketingDeletePostArgs(POST_ID, {
        tenantId: TENANT_ID,
        confirmTenantId: TENANT_ID,
        confirm: 'true',
        dryRun: true,
      }).confirm,
    ).toBe(true)
  })

  it('builds args from query-only payload (ChatGPT DELETE without body)', () => {
    expect(
      buildMarketingDeletePostArgs(POST_ID, {
        tenantId: TENANT_ID,
        confirmTenantId: TENANT_ID,
        confirm: 'true',
        dryRun: 'true',
      }),
    ).toEqual({
      tenantId: TENANT_ID,
      postId: POST_ID,
      actorUserId: undefined,
      confirmTenantId: TENANT_ID,
      confirm: true,
      dryRun: true,
    })
  })
})

describe('parseConfirmTrue', () => {
  it('accepts boolean and string forms', () => {
    expect(parseConfirmTrue(true)).toBe(true)
    expect(parseConfirmTrue('true')).toBe(true)
    expect(parseConfirmTrue('false')).not.toBe(true)
  })
})
