import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../server/utils/media-library-upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/media-library-upload')>()
  return {
    ...actual,
    persistLibraryAsset: vi.fn(async (input: { filename: string }) => ({
      asset: {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        name: input.filename,
        purpose: 'publication',
      },
      objectPath: 'tenant/obj.jpg',
      previewUrl: 'https://signed.example/preview.jpg',
      meta: {
        originalSize: 70,
        compressedSize: 70,
        width: 1,
        height: 1,
        format: 'png',
        compressed: false,
        reductionPercent: 0,
        mimeType: 'image/png',
        kind: 'image' as const,
      },
    })),
  }
})

vi.mock('../server/utils/media-url-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/media-url-fetch')>()
  return {
    ...actual,
    fetchPublicHttpsMedia: vi.fn(async (url: string) => ({
      buffer: Buffer.from('fake-image'),
      contentType: 'image/png',
      filenameHint: 'from-url.png',
      sourceUrl: url,
    })),
    assertPublicMediaUrl: vi.fn(async (url: string) => new URL(url)),
  }
})

import { BlimberMcpError, marketingCreatePost } from '../lib/blimber-mcp'
import { persistLibraryAsset } from '../server/utils/media-library-upload'
import { fetchPublicHttpsMedia } from '../server/utils/media-url-fetch'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'
const ACTOR_ID = '22222222-2222-2222-2222-222222222222'
const ACCOUNT_ID = '33333333-3333-3333-3333-333333333333'
const LIBRARY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function writeConfirm() {
  return {
    tenantId: TENANT_ID,
    confirm: true as const,
    confirmTenantId: TENANT_ID,
  }
}

function thenable(data: unknown) {
  return Promise.resolve({ data, error: null })
}

function createMediaClient(opts?: {
  assets?: Array<{ id: string, purpose: string, mime_type: string }>
  insertPostFail?: boolean
  attachFail?: boolean
  postDeletes?: Array<string>
}) {
  const inserts: Array<{ table: string, payload: unknown }> = []
  const postDeletes = opts?.postDeletes || []
  let variantIdSeq = 0

  const client = {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        lte: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === 'social_accounts')
            return { data: { id: ACCOUNT_ID, platform: 'instagram' }, error: null }
          return { data: null, error: null }
        },
        in: async (_col: string, ids: string[]) => {
          if (table === 'media_assets') {
            const all = opts?.assets || []
            const wanted = new Set(ids)
            return { data: all.filter(asset => wanted.has(asset.id)), error: null }
          }
          if (table === 'social_accounts')
            return { data: [{ id: ACCOUNT_ID, platform: 'instagram' }], error: null }
          return { data: [], error: null }
        },
        insert: (payload: unknown) => {
          inserts.push({ table, payload })
          if (table === 'social_posts' && opts?.insertPostFail) {
            return {
              select: () => ({
                single: async () => ({ data: null, error: { message: 'post insert failed' } }),
              }),
            }
          }
          if (table === 'social_post_assets' && opts?.attachFail) {
            return Promise.resolve({ error: { message: 'asset link failed' } })
          }
          if (table === 'social_post_variants') {
            variantIdSeq += 1
            return {
              select: () => ({
                single: async () => ({
                  data: { id: `variant-${variantIdSeq}` },
                  error: null,
                }),
              }),
            }
          }
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'post-1', title: 'Post GPT', ...(payload as object) },
                error: null,
              }),
            }),
          }
        },
        delete: () => {
          const del = {
            eq: (_col: string, id: string) => {
              postDeletes.push(id)
              return del
            },
          }
          return del
        },
      }
      chain.then = (resolve: (value: unknown) => unknown) => resolve(thenable(null))
      return chain
    },
  }

  return { client, inserts, postDeletes }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('marketingCreatePost media (mocked)', () => {
  it('dryRun lists library ids and planned URLs without writing', async () => {
    const persist = vi.mocked(persistLibraryAsset)
    const fetchMedia = vi.mocked(fetchPublicHttpsMedia)
    const { client, inserts } = createMediaClient({
      assets: [{ id: LIBRARY_ID, purpose: 'publication', mime_type: 'image/png' }],
    })

    const result = await marketingCreatePost(
      { client: client as any },
      {
        ...writeConfirm(),
        title: 'Post com arte',
        content: 'Caption',
        accountId: ACCOUNT_ID,
        platform: 'instagram',
        format: 'carousel',
        assetIds: [LIBRARY_ID],
        sourceUrls: ['https://cdn.example.com/art.png'],
        dryRun: true,
      },
    )

    expect(result).toMatchObject({ dryRun: true, wouldMutate: true })
    expect((result as any).preview.plannedAssets).toMatchObject({
      libraryPublicationIds: [LIBRARY_ID],
      libraryReferenceIds: [],
      inlineUploads: [
        expect.objectContaining({
          source: 'url',
          sourceUrl: 'https://cdn.example.com/art.png',
        }),
      ],
    })
    expect(persist).not.toHaveBeenCalled()
    expect(fetchMedia).not.toHaveBeenCalled()
    expect(inserts).toHaveLength(0)
  })

  it('rejects publication media without a social channel', async () => {
    await expect(
      marketingCreatePost(
        { client: createMediaClient().client as any },
        {
          ...writeConfirm(),
          title: 'Sem canal',
          assetIds: [LIBRARY_ID],
          dryRun: true,
        },
      ),
    ).rejects.toMatchObject({ code: 'VARIANT_REQUIRED' })
  })

  it('rejects library ids from another tenant', async () => {
    const { client } = createMediaClient({ assets: [] })
    await expect(
      marketingCreatePost(
        { client: client as any },
        {
          ...writeConfirm(),
          title: 'Cross tenant',
          accountId: ACCOUNT_ID,
          platform: 'instagram',
          assetIds: [LIBRARY_ID],
          dryRun: true,
        },
      ),
    ).rejects.toBeInstanceOf(BlimberMcpError)
  })

  it('uploads inline then attaches library + uploaded ids to the variant', async () => {
    const persist = vi.mocked(persistLibraryAsset)
    const { client, inserts, postDeletes } = createMediaClient({
      assets: [
        { id: LIBRARY_ID, purpose: 'publication', mime_type: 'image/png' },
        { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', purpose: 'publication', mime_type: 'image/png' },
      ],
    })

    const result = await marketingCreatePost(
      { client: client as any, actorUserId: ACTOR_ID },
      {
        ...writeConfirm(),
        title: 'Post com upload',
        content: 'Caption',
        accountId: ACCOUNT_ID,
        platform: 'instagram',
        format: 'carousel',
        assetIds: [LIBRARY_ID],
        sourceUrls: ['https://cdn.example.com/slide.png'],
        dryRun: false,
        actorUserId: ACTOR_ID,
      },
    )

    expect(persist).toHaveBeenCalledOnce()
    expect(vi.mocked(fetchPublicHttpsMedia)).toHaveBeenCalledOnce()
    expect(inserts.some(row => row.table === 'social_posts')).toBe(true)
    expect(inserts.some(row => row.table === 'social_post_variants')).toBe(true)
    const assetInsert = inserts.find(row => row.table === 'social_post_assets')
    expect(assetInsert?.payload).toEqual([
      expect.objectContaining({ asset_id: LIBRARY_ID, variant_id: 'variant-1', position: 0 }),
      expect.objectContaining({
        asset_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        variant_id: 'variant-1',
        position: 1,
      }),
    ])
    expect(postDeletes).toHaveLength(0)
    expect(result).toMatchObject({
      dryRun: false,
      assetIds: [LIBRARY_ID, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'],
      uploadedAssetIds: ['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'],
    })
  })

  it('does not create a post if inline upload fails', async () => {
    vi.mocked(persistLibraryAsset).mockRejectedValueOnce(
      new BlimberMcpError('FETCH_FAILED', 'cdn down', 502),
    )
    const { client, inserts } = createMediaClient()

    await expect(
      marketingCreatePost(
        { client: client as any, actorUserId: ACTOR_ID },
        {
          ...writeConfirm(),
          title: 'Falha upload',
          accountId: ACCOUNT_ID,
          platform: 'instagram',
          sourceBase64: [`data:image/png;base64,${PNG_BASE64}`],
          dryRun: false,
          actorUserId: ACTOR_ID,
        },
      ),
    ).rejects.toMatchObject({
      code: 'FETCH_FAILED',
      details: expect.objectContaining({ postCreated: false }),
    })

    expect(inserts.some(row => row.table === 'social_posts')).toBe(false)
  })

  it('returns postId when attach fails and does not delete the draft', async () => {
    const { client, postDeletes } = createMediaClient({
      assets: [{ id: LIBRARY_ID, purpose: 'publication', mime_type: 'image/png' }],
      attachFail: true,
    })

    await expect(
      marketingCreatePost(
        { client: client as any, actorUserId: ACTOR_ID },
        {
          ...writeConfirm(),
          title: 'Attach fail',
          accountId: ACCOUNT_ID,
          platform: 'instagram',
          assetIds: [LIBRARY_ID],
          dryRun: false,
          actorUserId: ACTOR_ID,
        },
      ),
    ).rejects.toMatchObject({
      code: 'ATTACH_FAILED',
      details: expect.objectContaining({ postId: 'post-1' }),
    })

    expect(postDeletes).toHaveLength(0)
  })
})
