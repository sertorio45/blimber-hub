import { describe, expect, it, vi } from 'vitest'

import {
  LINKED_POSTS_EMBED_SELECT,
  deleteMediaAsset,
  previewMediaAssetDeletion,
} from '~/server/utils/media-asset-deletion'

vi.mock('~/server/utils/social-audit', () => ({
  recordSocialAudit: vi.fn(async () => {}),
}))

const TENANT_ID = '11111111-1111-1111-1111-111111111111'
const ASSET_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const POST_ID = '33333333-3333-3333-3333-333333333333'
const OBJECT_PATH = `${TENANT_ID}/${ASSET_ID}/original.png`

function mediaAssetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    tenant_id: TENANT_ID,
    name: 'banner-hero.png',
    object_path: OBJECT_PATH,
    purpose: 'reference',
    ...overrides,
  }
}

function createDeletionClient(opts: {
  asset?: Record<string, unknown> | null
  linkedPosts?: Array<{ id: string, title: string }>
  linkedCount?: number
}) {
  const asset = opts.asset === undefined ? mediaAssetRow() : opts.asset
  const linkedPosts = opts.linkedPosts ?? []
  const linkedCount = opts.linkedCount ?? linkedPosts.length
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
        in: async () => ({ data: asset ? [asset] : [], error: null }),
        limit: async () => ({ data: [], error: null }),
        delete: deleteFn,
        maybeSingle: async () => ({ data: asset, error: null }),
      }

      if (table === 'social_post_assets') {
        chain.select = (columns?: string, options?: { count?: string, head?: boolean }) => {
          if (columns)
            postAssetSelects.push(columns)
          if (options?.head) {
            return {
              eq: () => ({
                eq: async () => ({ count: linkedCount, error: null }),
              }),
            }
          }
          return {
            eq: () => ({
              eq: () => ({
                limit: async () => ({
                  data: linkedPosts.map(post => ({
                    post_id: post.id,
                    social_posts: { id: post.id, title: post.title },
                  })),
                  error: null,
                }),
              }),
            }),
          }
        }
      }

      if (table === 'media_asset_derivatives') {
        chain.select = () => ({
          eq: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        })
      }

      return chain
    },
  }

  return { client, remove, deleteFn, postAssetSelects }
}

describe('LINKED_POSTS_EMBED_SELECT', () => {
  it('disambiguates social_posts via the post_id foreign key', () => {
    expect(LINKED_POSTS_EMBED_SELECT).toContain('social_posts!social_post_assets_post_id_fkey')
    expect(LINKED_POSTS_EMBED_SELECT).not.toMatch(/social_posts!inner/)
  })
})

describe('previewMediaAssetDeletion', () => {
  it('uses the post_id FK hint when embedding social_posts', async () => {
    const { client, postAssetSelects } = createDeletionClient({
      linkedPosts: [{ id: POST_ID, title: 'Campanha janeiro' }],
    })

    const preview = await previewMediaAssetDeletion(client as any, TENANT_ID, [ASSET_ID])

    expect(postAssetSelects).toContain(LINKED_POSTS_EMBED_SELECT)
    expect(preview.canDeleteAll).toBe(false)
    expect(preview.blocked).toHaveLength(1)
    expect(preview.assets[0]).toMatchObject({
      id: ASSET_ID,
      linkedPostCount: 1,
      linkedPosts: [{ id: POST_ID, title: 'Campanha janeiro' }],
    })
  })

  it('allows deletion when the asset is unused', async () => {
    const { client, postAssetSelects } = createDeletionClient({})

    const preview = await previewMediaAssetDeletion(client as any, TENANT_ID, [ASSET_ID])

    expect(postAssetSelects).toContain(LINKED_POSTS_EMBED_SELECT)
    expect(preview.canDeleteAll).toBe(true)
    expect(preview.blocked).toHaveLength(0)
  })
})

describe('deleteMediaAsset', () => {
  it('deletes an unused asset', async () => {
    const { client, remove, deleteFn } = createDeletionClient({})

    const result = await deleteMediaAsset(
      {} as any,
      client as any,
      TENANT_ID,
      'user-1',
      ASSET_ID,
    )

    expect(deleteFn).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith([OBJECT_PATH])
    expect(result).toEqual({ assetId: ASSET_ID, name: 'banner-hero.png' })
  })

  it('blocks deletion when the asset is linked to a post', async () => {
    const { client, remove, deleteFn } = createDeletionClient({
      linkedPosts: [{ id: POST_ID, title: 'Campanha janeiro' }],
    })

    await expect(
      deleteMediaAsset({} as any, client as any, TENANT_ID, 'user-1', ASSET_ID),
    ).rejects.toMatchObject({
      statusCode: 409,
    })

    expect(deleteFn).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})
