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
import { BlimberMcpError, marketingUploadAsset } from '../lib/blimber-mcp'
import {
  decodeLibraryBase64,
  persistLibraryAsset,
} from '../server/utils/media-library-upload'
import { fetchPublicHttpsMedia } from '../server/utils/media-url-fetch'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'
const ACTOR_ID = '22222222-2222-2222-2222-222222222222'

/** 1×1 PNG */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_BUFFER = Buffer.from(PNG_BASE64, 'base64')

function writeConfirm() {
  return {
    tenantId: TENANT_ID,
    confirm: true as const,
    confirmTenantId: TENANT_ID,
  }
}

function createUploadClient(opts?: { insertError?: string }) {
  const upload = vi.fn(async () => ({ error: null }))
  const remove = vi.fn(async () => ({ error: null }))
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: 'https://signed.example/preview.png' },
    error: null,
  }))
  const insert = vi.fn((payload: Record<string, unknown>) => ({
    select: () => ({
      single: async () => ({
        data: opts?.insertError
          ? null
          : {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              ...payload,
              created_at: '2026-08-16T10:00:00.000Z',
            },
        error: opts?.insertError ? { message: opts.insertError } : null,
      }),
    }),
  }))

  return {
    upload,
    remove,
    createSignedUrl,
    insert,
    client: {
      from(table: string) {
        if (table === 'media_assets') {
          return { insert }
        }
        if (table === 'social_campaigns') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 'camp-1' }, error: null }),
                }),
              }),
            }),
          }
        }
        return {}
      },
      storage: {
        from: () => ({ upload, remove, createSignedUrl }),
      },
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('library upload helpers', () => {
  it('decodes data-URL base64', () => {
    const decoded = decodeLibraryBase64(`data:image/png;base64,${PNG_BASE64}`)
    expect(decoded.mimeHint).toBe('image/png')
    expect(decoded.buffer.equals(PNG_BUFFER)).toBe(true)
  })

  it('persists image via marketing-assets bucket (mocked storage)', async () => {
    const { client, upload, insert } = createUploadClient()
    const result = await persistLibraryAsset({
      client: client as any,
      tenantId: TENANT_ID,
      createdBy: ACTOR_ID,
      filename: 'pixel.png',
      buffer: PNG_BUFFER,
      inputMime: 'image/png',
      purpose: 'publication',
    })

    expect(upload).toHaveBeenCalledOnce()
    const [objectPath, body, options] = upload.mock.calls[0]!
    expect(String(objectPath).startsWith(`${TENANT_ID}/`)).toBe(true)
    expect(Buffer.isBuffer(body)).toBe(true)
    expect(options.contentType).toMatch(/^image\//)
    expect(insert).toHaveBeenCalledOnce()
    expect(result.asset.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    expect(result.previewUrl).toBe('https://signed.example/preview.png')
    expect(result.meta.kind).toBe('image')
  })

  it('persists CMS uploads in the cms-assets bucket', async () => {
    const { client, upload, remove, createSignedUrl, insert } = createUploadClient()
    const buckets: string[] = []
    const cmsClient = {
      ...client,
      storage: {
        from: (bucket: string) => {
          buckets.push(bucket)
          return { upload, remove, createSignedUrl }
        },
      },
    }
    await persistLibraryAsset({
      client: cmsClient as any,
      tenantId: TENANT_ID,
      createdBy: ACTOR_ID,
      filename: 'pixel.png',
      buffer: PNG_BUFFER,
      inputMime: 'image/png',
      purpose: 'reference',
      bucket: 'cms-assets',
    })

    expect(buckets).toContain('cms-assets')
    expect(buckets).not.toContain('marketing-assets')
    expect(insert.mock.calls[0]![0]).toMatchObject({ bucket: 'cms-assets' })
  })

  it('uploads video without going through image compression path', async () => {
    const { client, upload } = createUploadClient()
    const video = Buffer.from('fake-mp4-bytes')
    const result = await persistLibraryAsset({
      client: client as any,
      tenantId: TENANT_ID,
      createdBy: ACTOR_ID,
      filename: 'clip.mp4',
      buffer: video,
      inputMime: 'video/mp4',
      purpose: 'publication',
    })

    expect(upload.mock.calls[0]![2].contentType).toBe('video/mp4')
    expect(String(upload.mock.calls[0]![0]).endsWith('/original.mp4')).toBe(true)
    expect(result.meta.compressed).toBe(false)
    expect(result.meta.kind).toBe('video')
  })

  it('rejects unsupported types', async () => {
    const { client } = createUploadClient()
    await expect(persistLibraryAsset({
      client: client as any,
      tenantId: TENANT_ID,
      createdBy: ACTOR_ID,
      filename: 'notes.pdf',
      buffer: Buffer.from('%PDF'),
      inputMime: 'application/pdf',
      purpose: 'reference',
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' })
  })
})

describe('fetchPublicHttpsMedia', () => {
  it('blocks private hosts (SSRF)', async () => {
    await expect(fetchPublicHttpsMedia('https://127.0.0.1/secret.png', { resolveDns: false }))
      .rejects.toMatchObject({ code: 'MEDIA_URL_SSRF_BLOCKED' })
  })

  it('requires https', async () => {
    await expect(fetchPublicHttpsMedia('http://cdn.example.com/a.png', { resolveDns: false }))
      .rejects.toMatchObject({ code: 'MEDIA_URL_HTTPS_REQUIRED' })
  })

  it('reads body from mocked fetch', async () => {
    const fetchImpl = vi.fn(async () => new Response(PNG_BUFFER, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-disposition': 'attachment; filename="hero.png"' },
    }))

    const result = await fetchPublicHttpsMedia('https://cdn.example.com/ignored.bin', {
      resolveDns: false,
      fetchImpl: fetchImpl as any,
    })

    expect(result.contentType).toBe('image/png')
    expect(result.filenameHint).toBe('hero.png')
    expect(result.buffer.equals(PNG_BUFFER)).toBe(true)
  })

  it('caps oversized payloads', async () => {
    const fetchImpl = vi.fn(async () => new Response(Buffer.alloc(32), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }))

    await expect(fetchPublicHttpsMedia('https://cdn.example.com/big.png', {
      resolveDns: false,
      maxBytes: 8,
      fetchImpl: fetchImpl as any,
    })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', statusCode: 413 })
  })
})

describe('marketingUploadAsset', () => {
  it('dry-run with URL does not upload', async () => {
    const { client, upload, insert } = createUploadClient()
    const result = await marketingUploadAsset(
      { client: client as any, actorUserId: ACTOR_ID },
      {
        ...writeConfirm(),
        sourceUrl: 'https://example.com/hero.png',
        dryRun: true,
      },
    )

    expect(result).toMatchObject({ dryRun: true, wouldMutate: true, entity: 'media_asset' })
    expect(upload).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects localhost URL on dry-run', async () => {
    await expect(marketingUploadAsset(
      { client: { from: () => ({}) } as any },
      {
        ...writeConfirm(),
        sourceUrl: 'https://localhost/x.png',
        dryRun: true,
      },
    )).rejects.toBeInstanceOf(BlimberMcpError)
  })

  it('requires XOR between sourceUrl and sourceBase64', async () => {
    await expect(marketingUploadAsset(
      { client: { from: () => ({}) } as any },
      { ...writeConfirm(), dryRun: true },
    )).rejects.toThrow()
  })

  it('execute from mocked URL fetch + storage', async () => {
    const fetchImpl = vi.fn(async () => new Response(PNG_BUFFER, {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }))
    vi.stubGlobal('fetch', fetchImpl)

    const { client, upload, insert } = createUploadClient()
    const result: any = await marketingUploadAsset(
      { client: client as any, actorUserId: ACTOR_ID },
      {
        ...writeConfirm(),
        sourceUrl: 'https://cdn.example.com/hero.png',
        name: 'hero.png',
        dryRun: false,
      },
    )

    expect(result.dryRun).toBe(false)
    expect(result.uploaded).toBe(true)
    expect(result.asset.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    expect(result.asset.previewUrl).toBe('https://signed.example/preview.png')
    expect(result.asset.mimeType).toMatch(/^image\//)
    expect(upload).toHaveBeenCalledOnce()
    expect(insert).toHaveBeenCalledOnce()
  })

  it('execute from base64', async () => {
    const { client, upload } = createUploadClient()
    const result: any = await marketingUploadAsset(
      { client: client as any, actorUserId: ACTOR_ID },
      {
        ...writeConfirm(),
        sourceBase64: `data:image/png;base64,${PNG_BASE64}`,
        name: 'pixel.png',
        dryRun: false,
      },
    )

    expect(result.uploaded).toBe(true)
    expect(result.asset.name).toBe('pixel.png')
    expect(upload).toHaveBeenCalledOnce()
  })

  it('requires actor on execute', async () => {
    const previous = process.env.BLIMBER_MCP_ACTOR_USER_ID
    delete process.env.BLIMBER_MCP_ACTOR_USER_ID
    try {
      await expect(marketingUploadAsset(
        { client: { from: () => ({}) } as any },
        {
          ...writeConfirm(),
          sourceBase64: `data:image/png;base64,${PNG_BASE64}`,
          dryRun: false,
        },
      )).rejects.toMatchObject({ code: 'ACTOR_REQUIRED' })
    }
    finally {
      if (previous)
        process.env.BLIMBER_MCP_ACTOR_USER_ID = previous
    }
  })
})
