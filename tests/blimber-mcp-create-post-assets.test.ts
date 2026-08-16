import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns/promises')>()
  return {
    ...actual,
    lookup: vi.fn(async (_host: string, options?: { all?: boolean }) => {
      const record = { address: '1.1.1.1', family: 4 as const }
      if (options?.all)
        return [record]
      return record
    }),
  }
})

import { BlimberMcpError, marketingCreatePost, marketingUpdatePost } from '../lib/blimber-mcp'
import { mediaAssetsForVariant } from '../server/utils/social-publisher'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'
const ACTOR_ID = '22222222-2222-2222-2222-222222222222'
const ACCOUNT_ID = '66666666-6666-6666-6666-666666666666'
const PUB_ASSET_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const REF_ASSET_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const UPLOADED_ASSET_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const POST_ID = '33333333-3333-3333-3333-333333333333'

/** 1×1 PNG */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_BUFFER = Buffer.from(PNG_BASE64, 'base64')

afterEach(() => {
  vi.unstubAllGlobals()
})

function createPostClient(opts: {
  accounts?: Array<{ id: string, platform: string }>
  assets?: Array<{ id: string, purpose: string, mime_type: string }>
  existingPost?: Record<string, unknown> | null
  assetsInsertError?: string
}) {
  const inserts: Record<string, unknown[]> = {}
  const assets = [...(opts.assets || [])]

  function chainFor(table: string) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      lte: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === 'social_accounts') {
          return { data: opts.accounts?.[0] || null, error: null }
        }
        if (table === 'social_posts') {
          return { data: opts.existingPost ?? null, error: null }
        }
        return { data: null, error: null }
      },
      in: async (_column: string, ids: string[]) => {
        if (table === 'media_assets') {
          const rows = assets.filter(asset => ids.includes(asset.id))
          return { data: rows, error: null }
        }
        return { data: opts.accounts || [], error: null }
      },
      insert: (payload: unknown) => {
        inserts[table] = inserts[table] || []
        inserts[table].push(payload)
        const row = Array.isArray(payload) ? payload[0] : payload
        if (table === 'media_assets') {
          const id = UPLOADED_ASSET_ID
          assets.push({
            id,
            purpose: String((row as any)?.purpose || 'publication'),
            mime_type: String((row as any)?.mime_type || 'image/png'),
          })
          return {
            select: () => ({
              single: async () => ({
                data: { id, ...row as object },
                error: null,
              }),
            }),
          }
        }
        const insertError = table === 'social_post_assets' && opts.assetsInsertError
          ? { message: opts.assetsInsertError }
          : null
        const createdId = table === 'social_posts' ? 'post-1' : 'variant-1'
        const createdRow = {
          id: createdId,
          title: (row as any)?.title,
          ...row as object,
        }
        return {
          select: () => ({
            single: async () => ({
              data: createdRow,
              error: null,
            }),
            then: (resolve: (value: { data: unknown[], error: null }) => unknown) =>
              Promise.resolve({ data: [createdRow], error: null }).then(resolve),
          }),
          then: (resolve: (value: { error: typeof insertError }) => unknown) =>
            Promise.resolve({ error: insertError }).then(resolve),
        }
      },
      update: (payload: unknown) => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: { id: POST_ID, ...(opts.existingPost || {}), ...(payload as object) },
                error: null,
              }),
            }),
          }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: async () => ({ error: null }),
          is: async () => ({ error: null }),
        }),
      }),
    }
    return chain
  }

  return {
    inserts,
    client: {
      from: (table: string) => chainFor(table),
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          remove: async () => ({ error: null }),
          createSignedUrl: async () => ({
            data: { signedUrl: 'https://signed.example/preview.png' },
            error: null,
          }),
        }),
      },
    },
  }
}

const writeBase = {
  tenantId: TENANT_ID,
  title: 'Post com biblioteca',
  content: 'Caption',
  confirm: true as const,
  confirmTenantId: TENANT_ID,
  actorUserId: ACTOR_ID,
}

describe('createPost library publication assets', () => {
  it('dryRun preview includes assetIds without inserting', async () => {
    const { inserts, client } = createPostClient({
      accounts: [{ id: ACCOUNT_ID, platform: 'instagram' }],
      assets: [{ id: PUB_ASSET_ID, purpose: 'publication', mime_type: 'image/jpeg' }],
    })

    const result = await marketingCreatePost(
      { client: client as any },
      {
        ...writeBase,
        accountId: ACCOUNT_ID,
        platform: 'instagram',
        format: 'static',
        assetIds: [PUB_ASSET_ID],
        dryRun: true,
      },
    )

    expect(result).toMatchObject({
      dryRun: true,
      kind: 'editorial',
      preview: {
        assetIds: [PUB_ASSET_ID],
        variant: { accountId: ACCOUNT_ID, assetIds: [PUB_ASSET_ID] },
      },
    })
    expect(inserts.social_posts).toBeUndefined()
  })

  it('execute attaches publication assets to the variant (not as reference)', async () => {
    const { inserts, client } = createPostClient({
      accounts: [{ id: ACCOUNT_ID, platform: 'instagram' }],
      assets: [{ id: PUB_ASSET_ID, purpose: 'publication', mime_type: 'image/jpeg' }],
    })

    const result = await marketingCreatePost(
      { client: client as any },
      {
        ...writeBase,
        accountId: ACCOUNT_ID,
        platform: 'instagram',
        format: 'static',
        assetIds: [PUB_ASSET_ID],
        dryRun: false,
      },
    )

    expect(result).toMatchObject({
      dryRun: false,
      assetIds: [PUB_ASSET_ID],
      post: { id: 'post-1' },
    })
    expect(inserts.social_post_assets).toHaveLength(1)
    expect(inserts.social_post_assets[0]).toEqual([
      {
        tenant_id: TENANT_ID,
        post_id: 'post-1',
        variant_id: 'variant-1',
        asset_id: PUB_ASSET_ID,
        position: 0,
      },
    ])
  })

  it('keeps referenceAssetIds on the post with variant_id null', async () => {
    const { inserts, client } = createPostClient({
      assets: [{ id: REF_ASSET_ID, purpose: 'reference', mime_type: 'image/png' }],
    })

    await marketingCreatePost(
      { client: client as any },
      {
        ...writeBase,
        referenceAssetIds: [REF_ASSET_ID],
        dryRun: false,
      },
    )

    expect(inserts.social_post_assets[0]).toEqual([
      {
        tenant_id: TENANT_ID,
        post_id: 'post-1',
        variant_id: null,
        asset_id: REF_ASSET_ID,
        position: 0,
      },
    ])
  })

  it('rejects publication assetIds without a social channel', async () => {
    await expect(
      marketingCreatePost(
        { client: createPostClient({}).client as any },
        {
          ...writeBase,
          assetIds: [PUB_ASSET_ID],
          dryRun: true,
        },
      ),
    ).rejects.toMatchObject({
      code: 'VARIANT_REQUIRED',
    })
  })

  it('rejects another tenant library id', async () => {
    const { client } = createPostClient({
      accounts: [{ id: ACCOUNT_ID, platform: 'instagram' }],
      assets: [],
    })

    await expect(
      marketingCreatePost(
        { client: client as any },
        {
          ...writeBase,
          accountId: ACCOUNT_ID,
          platform: 'instagram',
          assetIds: [PUB_ASSET_ID],
          dryRun: true,
        },
      ),
    ).rejects.toBeInstanceOf(BlimberMcpError)
  })
})

describe('createPost inline library uploads', () => {
  it('dryRun lists planned URLs without writing', async () => {
    const { inserts, client } = createPostClient({
      accounts: [{ id: ACCOUNT_ID, platform: 'instagram' }],
    })

    const result: any = await marketingCreatePost(
      { client: client as any },
      {
        ...writeBase,
        accountId: ACCOUNT_ID,
        platform: 'instagram',
        format: 'static',
        sourceUrls: ['https://cdn.example.com/hero.png'],
        dryRun: true,
      },
    )

    expect(result.dryRun).toBe(true)
    expect(result.preview.plannedAssets.libraryPublicationIds).toEqual([])
    expect(result.preview.plannedAssets.inlineUploads).toEqual([
      expect.objectContaining({
        source: 'url',
        sourceUrl: 'https://cdn.example.com/hero.png',
        name: 'hero.png',
      }),
    ])
    expect(result.preview.plannedAssets.attachOrder).toContain('assetIds')
    expect(inserts.social_posts).toBeUndefined()
    expect(inserts.media_assets).toBeUndefined()
  })

  it('rejects private hosts on dryRun (SSRF)', async () => {
    await expect(
      marketingCreatePost(
        { client: createPostClient({ accounts: [{ id: ACCOUNT_ID, platform: 'instagram' }] }).client as any },
        {
          ...writeBase,
          accountId: ACCOUNT_ID,
          platform: 'instagram',
          sourceUrls: ['https://127.0.0.1/secret.png'],
          dryRun: true,
        },
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_URL_SSRF_BLOCKED' })
  })

  it('rejects inline publication without a social channel', async () => {
    await expect(
      marketingCreatePost(
        { client: createPostClient({}).client as any },
        {
          ...writeBase,
          sourceUrls: ['https://cdn.example.com/hero.png'],
          dryRun: true,
        },
      ),
    ).rejects.toMatchObject({ code: 'VARIANT_REQUIRED' })
  })

  it('execute uploads base64 then attaches after existing assetIds', async () => {
    const { inserts, client } = createPostClient({
      accounts: [{ id: ACCOUNT_ID, platform: 'instagram' }],
      assets: [{ id: PUB_ASSET_ID, purpose: 'publication', mime_type: 'image/jpeg' }],
    })

    const result: any = await marketingCreatePost(
      { client: client as any },
      {
        ...writeBase,
        accountId: ACCOUNT_ID,
        platform: 'instagram',
        format: 'carousel',
        assetIds: [PUB_ASSET_ID],
        sourceBase64: [`data:image/png;base64,${PNG_BASE64}`],
        dryRun: false,
      },
    )

    expect(result.assetIds).toEqual([PUB_ASSET_ID, UPLOADED_ASSET_ID])
    expect(result.uploadedAssetIds).toEqual([UPLOADED_ASSET_ID])
    expect(inserts.media_assets).toHaveLength(1)
    expect(inserts.social_post_assets[0]).toEqual([
      {
        tenant_id: TENANT_ID,
        post_id: 'post-1',
        variant_id: 'variant-1',
        asset_id: PUB_ASSET_ID,
        position: 0,
      },
      {
        tenant_id: TENANT_ID,
        post_id: 'post-1',
        variant_id: 'variant-1',
        asset_id: UPLOADED_ASSET_ID,
        position: 1,
      },
    ])
  })

  it('execute fetches HTTPS URL through the library pipeline', async () => {
    const fetchImpl = vi.fn(async () => new Response(PNG_BUFFER, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-disposition': 'attachment; filename="hero.png"' },
    }))
    vi.stubGlobal('fetch', fetchImpl)

    const { inserts, client } = createPostClient({
      accounts: [{ id: ACCOUNT_ID, platform: 'instagram' }],
    })

    const result: any = await marketingCreatePost(
      { client: client as any },
      {
        ...writeBase,
        accountId: ACCOUNT_ID,
        platform: 'instagram',
        format: 'static',
        sourceUrls: ['https://cdn.example.com/hero.png'],
        dryRun: false,
      },
    )

    expect(fetchImpl).toHaveBeenCalled()
    expect(result.uploadedAssetIds).toEqual([UPLOADED_ASSET_ID])
    expect(result.assetIds).toEqual([UPLOADED_ASSET_ID])
    expect(inserts.media_assets).toHaveLength(1)
    expect((inserts.media_assets[0] as any).purpose).toBe('publication')
    expect((inserts.media_assets[0] as any).tenant_id).toBe(TENANT_ID)
  })

  it('does not create a post when the upload fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const { inserts, client } = createPostClient({
      accounts: [{ id: ACCOUNT_ID, platform: 'instagram' }],
    })

    await expect(
      marketingCreatePost(
        { client: client as any },
        {
          ...writeBase,
          accountId: ACCOUNT_ID,
          platform: 'instagram',
          sourceUrls: ['https://cdn.example.com/hero.png'],
          dryRun: false,
        },
      ),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ postCreated: false }),
    })
    expect(inserts.social_posts).toBeUndefined()
  })

  it('returns post id when attach fails after create', async () => {
    const { client } = createPostClient({
      accounts: [{ id: ACCOUNT_ID, platform: 'instagram' }],
      assets: [{ id: PUB_ASSET_ID, purpose: 'publication', mime_type: 'image/jpeg' }],
      assetsInsertError: 'fk boom',
    })

    await expect(
      marketingCreatePost(
        { client: client as any },
        {
          ...writeBase,
          accountId: ACCOUNT_ID,
          platform: 'instagram',
          assetIds: [PUB_ASSET_ID],
          dryRun: false,
        },
      ),
    ).rejects.toMatchObject({
      code: 'ATTACH_FAILED',
      details: { postId: 'post-1', libraryAssetIds: [PUB_ASSET_ID], uploadedAssetIds: [] },
    })
  })
})

describe('updatePost inline library uploads', () => {
  const existingPost = {
    id: POST_ID,
    title: 'Post A',
    content: 'Texto',
    status: 'draft',
    tenant_id: TENANT_ID,
    deleted_at: null,
    metadata: {},
  }

  it('dryRun previews URLs on the first variant without writing', async () => {
    const { inserts, client } = createPostClient({
      accounts: [{ id: ACCOUNT_ID, platform: 'instagram' }],
      existingPost,
    })

    const result: any = await marketingUpdatePost(
      { client: client as any },
      {
        tenantId: TENANT_ID,
        postId: POST_ID,
        confirm: true,
        confirmTenantId: TENANT_ID,
        variants: [{
          accountId: ACCOUNT_ID,
          platform: 'instagram',
          format: 'static',
          assetIds: [],
        }],
        sourceUrls: ['https://cdn.example.com/hero.png'],
        dryRun: true,
      },
    )

    expect(result.dryRun).toBe(true)
    expect(result.plannedAssets.inlineUploads[0].sourceUrl).toBe('https://cdn.example.com/hero.png')
    expect(inserts.media_assets).toBeUndefined()
  })

  it('execute merges uploaded id after variants[0].assetIds', async () => {
    const { inserts, client } = createPostClient({
      accounts: [{ id: ACCOUNT_ID, platform: 'instagram' }],
      assets: [{ id: PUB_ASSET_ID, purpose: 'publication', mime_type: 'image/jpeg' }],
      existingPost,
    })

    const result: any = await marketingUpdatePost(
      { client: client as any, actorUserId: ACTOR_ID },
      {
        tenantId: TENANT_ID,
        postId: POST_ID,
        confirm: true,
        confirmTenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        variants: [{
          accountId: ACCOUNT_ID,
          platform: 'instagram',
          format: 'carousel',
          assetIds: [PUB_ASSET_ID],
        }],
        sourceBase64: [`data:image/png;base64,${PNG_BASE64}`],
        dryRun: false,
      },
    )

    expect(result.uploadedAssetIds).toEqual([UPLOADED_ASSET_ID])
    expect(inserts.social_post_assets[0]).toEqual([
      expect.objectContaining({
        asset_id: PUB_ASSET_ID,
        position: 0,
        variant_id: 'variant-1',
      }),
      expect.objectContaining({
        asset_id: UPLOADED_ASSET_ID,
        position: 1,
        variant_id: 'variant-1',
      }),
    ])
  })
})

describe('publish path uses variant-linked library media', () => {
  it('includes publication rows and ignores reference (variant_id null)', () => {
    const publication = {
      id: 'file-1',
      object_path: `${TENANT_ID}/pub.jpg`,
      mime_type: 'image/jpeg',
      purpose: 'publication',
      bucket: 'marketing-assets',
    }
    const snapshot = {
      assets: [
        { variant_id: null, position: 0, media_assets: { id: 'ref', purpose: 'reference' } },
        { variant_id: 'variant-1', position: 1, media_assets: publication },
      ],
    }

    const media = mediaAssetsForVariant(snapshot, 'variant-1')
    expect(media).toEqual([publication])
    expect(mediaAssetsForVariant(snapshot, 'other-variant')).toEqual([])
  })
})
