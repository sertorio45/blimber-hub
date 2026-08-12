import { describe, expect, it, vi } from 'vitest'
import {
  BlimberMcpError,
  formatBlimberMcpError,
  marketingDeleteAsset,
} from '../lib/blimber-mcp'
import {
  buildMarketingDeleteAssetArgs,
} from '../server/utils/blimber-gpt-api'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_TENANT_ID = '44444444-4444-4444-4444-444444444444'
const ASSET_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const POST_ID = '33333333-3333-3333-3333-333333333333'

function mediaAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    name: 'banner-hero.png',
    mime_type: 'image/png',
    purpose: 'reference',
    size_bytes: 204800,
    object_path: `${TENANT_ID}/${ASSET_ID}/original.png`,
    bucket: 'marketing-assets',
    tenant_id: TENANT_ID,
    created_at: '2026-01-15T12:00:00.000Z',
    status: 'active',
    ...overrides,
  }
}

function createDeleteAssetClient(opts: {
  asset: Record<string, unknown> | null
  linkedPosts?: Array<{ id: string, title: string }>
  derivatives?: Array<{ object_path: string }>
}) {
  const linkedPosts = opts.linkedPosts ?? []
  const derivatives = opts.derivatives ?? []
  const postAssetSelects: string[] = []
  const remove = vi.fn(async () => ({ data: [], error: null }))
  const deleteFn = vi.fn(() => ({
    eq: () => ({
      eq: async () => ({ error: null }),
    }),
  }))

  const client = {
    storage: {
      from: vi.fn(() => ({ remove })),
    },
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        delete: deleteFn,
        maybeSingle: async () => {
          if (table === 'media_assets')
            return { data: opts.asset, error: null }
          return { data: null, error: null }
        },
      }

      if (table === 'social_post_assets') {
        chain.select = (columns?: string) => {
          if (columns)
            postAssetSelects.push(columns)
          return {
            eq: () => ({
              eq: async () => ({
                data: linkedPosts.map(post => ({
                  post_id: post.id,
                  social_posts: { id: post.id, title: post.title },
                })),
                error: null,
              }),
            }),
          }
        }
      }

      if (table === 'media_asset_derivatives') {
        chain.select = () => ({
          eq: () => ({
            eq: async () => ({ data: derivatives, error: null }),
          }),
        })
      }

      return chain
    },
  }

  return { client, remove, deleteFn, postAssetSelects }
}

const baseInput = {
  tenantId: TENANT_ID,
  assetId: ASSET_ID,
  confirm: true as const,
  confirmTenantId: TENANT_ID,
}

describe('marketingDeleteAsset', () => {
  it('dryRun returns preview without deleting', async () => {
    const { client, remove, deleteFn, postAssetSelects } = createDeleteAssetClient({
      asset: mediaAsset(),
      linkedPosts: [{ id: POST_ID, title: 'Post vinculado' }],
    })

    const result = await marketingDeleteAsset(
      { client: client as any },
      { ...baseInput, dryRun: true },
    )

    expect(result).toMatchObject({
      dryRun: true,
      wouldMutate: true,
      entity: 'media_asset',
      canDelete: false,
      linkedPostsCount: 1,
      preview: {
        id: ASSET_ID,
        name: 'banner-hero.png',
        sizeBytes: 204800,
      },
    })
    expect(remove).not.toHaveBeenCalled()
    expect(deleteFn).not.toHaveBeenCalled()
    expect(postAssetSelects.some(select =>
      select.includes('social_posts!social_post_assets_post_id_fkey'),
    )).toBe(true)
  })

  it('execute deletes when not linked', async () => {
    const { client, remove, deleteFn } = createDeleteAssetClient({
      asset: mediaAsset(),
      derivatives: [{ object_path: `${TENANT_ID}/${ASSET_ID}/thumb.webp` }],
    })

    const result = await marketingDeleteAsset(
      { client: client as any },
      { ...baseInput, dryRun: false },
    )

    expect(deleteFn).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith([
      `${TENANT_ID}/${ASSET_ID}/original.png`,
      `${TENANT_ID}/${ASSET_ID}/thumb.webp`,
    ])
    expect(result).toMatchObject({
      dryRun: false,
      deleted: true,
      deleteMode: 'hard',
      asset: { id: ASSET_ID, name: 'banner-hero.png' },
    })
  })

  it('rejects when asset linked to post', async () => {
    const { client, remove } = createDeleteAssetClient({
      asset: mediaAsset(),
      linkedPosts: [{ id: POST_ID, title: 'Campanha janeiro' }],
    })

    const caught = await marketingDeleteAsset(
      { client: client as any },
      { ...baseInput, dryRun: false },
    ).catch(error => error)

    expect(caught).toBeInstanceOf(BlimberMcpError)
    expect(caught).toMatchObject({
      code: 'ASSET_IN_USE',
      statusCode: 409,
    })

    const formatted = formatBlimberMcpError(caught)
    expect(formatted.ok).toBe(false)
    if (!formatted.ok) {
      expect(formatted.error.details).toMatchObject({
        linkedPosts: [{ id: POST_ID, title: 'Campanha janeiro' }],
        linkedPostsCount: 1,
      })
    }
    expect(remove).not.toHaveBeenCalled()
  })

  it('rejects wrong tenant', async () => {
    const { client, remove } = createDeleteAssetClient({
      asset: mediaAsset({ tenant_id: OTHER_TENANT_ID }),
    })

    await expect(
      marketingDeleteAsset(
        { client: client as any },
        { ...baseInput, dryRun: false },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })

    expect(remove).not.toHaveBeenCalled()
  })

  it('rejects without confirm', async () => {
    const { client } = createDeleteAssetClient({ asset: mediaAsset() })

    await expect(
      marketingDeleteAsset(
        { client: client as any },
        {
          tenantId: TENANT_ID,
          assetId: ASSET_ID,
          confirm: false as any,
          confirmTenantId: TENANT_ID,
          dryRun: true,
        },
      ),
    ).rejects.toMatchObject({ name: 'ZodError' })
  })

  it('rejects confirm tenant mismatch', async () => {
    const { client } = createDeleteAssetClient({ asset: mediaAsset() })

    await expect(
      marketingDeleteAsset(
        { client: client as any },
        {
          ...baseInput,
          confirmTenantId: OTHER_TENANT_ID,
          dryRun: true,
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFIRM_TENANT_MISMATCH', statusCode: 400 })
  })
})

describe('buildMarketingDeleteAssetArgs', () => {
  it('parses body fields for deleteAsset handler', () => {
    expect(
      buildMarketingDeleteAssetArgs(ASSET_ID, {
        tenantId: TENANT_ID,
        confirmTenantId: TENANT_ID,
        confirm: true,
        dryRun: false,
      }),
    ).toEqual({
      tenantId: TENANT_ID,
      assetId: ASSET_ID,
      actorUserId: undefined,
      confirmTenantId: TENANT_ID,
      confirm: true,
      dryRun: false,
    })
  })

  it('coerces dryRun and confirm from query string', () => {
    expect(
      buildMarketingDeleteAssetArgs(ASSET_ID, {
        tenantId: TENANT_ID,
        confirmTenantId: TENANT_ID,
        confirm: 'true',
        dryRun: 'true',
      }),
    ).toEqual({
      tenantId: TENANT_ID,
      assetId: ASSET_ID,
      actorUserId: undefined,
      confirmTenantId: TENANT_ID,
      confirm: true,
      dryRun: true,
    })
  })
})
