import type { MediaAccessContext } from '~/server/utils/media/service'

import { Buffer } from 'node:buffer'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireCmsMediaContext } from '~/server/utils/media/cms-adapter'
import {
  MARKETING_MEDIA_CAPABILITIES,
  requireMarketingMediaContext,
} from '~/server/utils/media/marketing-adapter'
import {
  deleteAsset,
  getAsset,
  listAssets,

  previewAssetDeletion,
  uploadAsset,
} from '~/server/utils/media/service'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'

const workspace = vi.hoisted(() => ({
  userId: '99999999-9999-4999-8999-999999999999',
  modules: [] as string[],
  capabilities: [] as string[],
  tenantId: '',
  client: null as unknown,
}))

vi.mock('~/server/utils/workspace-context', async () => {
  const { createError } = await import('h3')
  return {
    requireWorkspaceContext: vi.fn(async (_event: unknown, options: { module?: string, capability?: string }) => {
      if (options.module && !workspace.modules.includes(options.module))
        throw createError({ statusCode: 403, statusMessage: 'Módulo não contratado por esta empresa' })
      if (options.capability && !workspace.capabilities.includes(options.capability))
        throw createError({ statusCode: 403, statusMessage: 'Sem permissão para esta ação' })
      return {
        client: workspace.client,
        user: { id: workspace.userId },
        userId: workspace.userId,
        tenantId: workspace.tenantId,
        effectiveRole: 'cliente',
        isPlatformStaff: false,
        modules: workspace.modules,
        has: (capability: string) => workspace.capabilities.includes(capability),
      }
    }),
  }
})

vi.mock('~/server/utils/social-audit', () => ({
  recordSocialAudit: vi.fn(async () => {}),
}))

vi.mock('~/server/utils/media-upload-image', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/server/utils/media-upload-image')>()
  return {
    ...original,
    compressImageForUpload: vi.fn(async (buffer: Buffer, input: { inputMime: string }) => ({
      data: buffer,
      mimeType: input.inputMime,
      width: 1,
      height: 1,
      format: 'original' as const,
      compressed: false,
    })),
  }
})

const USER_ID = workspace.userId
const TENANT_A = '11111111-1111-4111-8111-111111111111'
const TENANT_B = '22222222-2222-4222-8222-222222222222'
const ASSET_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOCUMENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OBJECT_PATH = `${TENANT_A}/${ASSET_A}/original.png`

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

type Row = Record<string, unknown>

interface FakeTable {
  rows: Row[]
  error?: { code: string, message: string } | null
}

interface RecordedQuery {
  table: string
  op: 'select' | 'insert' | 'delete'
  calls: Array<{ method: string, args: unknown[] }>
}

/** Minimal PostgREST double: evaluates eq/neq/in and records every builder call. */
function createFakeClient(tables: Record<string, FakeTable>) {
  const queries: RecordedQuery[] = []
  const remove = vi.fn(async () => ({ data: [], error: null }))
  const upload = vi.fn(async () => ({ data: {}, error: null }))

  const matches = (row: Row, call: { method: string, args: unknown[] }) => {
    const [column, value] = call.args as [string, unknown]
    if (call.method === 'eq')
      return row[column] === value
    if (call.method === 'neq')
      return row[column] !== value
    if (call.method === 'in')
      return (value as unknown[]).includes(row[column])
    return true
  }

  function from(table: string) {
    const query: RecordedQuery = { table, op: 'select', calls: [] }
    queries.push(query)
    let payload: Row = {}

    const resolve = () => {
      const target = tables[table] ?? (tables[table] = { rows: [] })
      if (target.error)
        return { data: null, error: target.error, count: null }

      if (query.op === 'insert') {
        const row = { id: `new-${target.rows.length + 1}`, created_at: '2026-10-19T10:00:00Z', ...payload }
        target.rows.push(row)
        return { data: row, error: null, count: null }
      }

      const filtered = target.rows.filter(row => query.calls.every(call => matches(row, call)))
      if (query.op === 'delete') {
        target.rows = target.rows.filter(row => !filtered.includes(row))
        return { data: null, error: null, count: null }
      }

      const limit = query.calls.find(call => call.method === 'limit')?.args[0] as number | undefined
      return {
        data: typeof limit === 'number' ? filtered.slice(0, limit) : filtered,
        error: null,
        count: filtered.length,
      }
    }

    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'neq', 'in', 'like', 'ilike', 'order', 'limit', 'or']) {
      builder[method] = (...args: unknown[]) => {
        query.calls.push({ method, args })
        return builder
      }
    }
    builder.insert = (value: Row) => {
      query.op = 'insert'
      payload = value
      return builder
    }
    builder.delete = () => {
      query.op = 'delete'
      return builder
    }
    builder.maybeSingle = async () => {
      const result = resolve()
      return { data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error }
    }
    builder.single = builder.maybeSingle
    builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected)

    return builder
  }

  const bucket = {
    createSignedUrls: async (paths: string[]) => ({
      data: paths.map(path => ({ path, signedUrl: `https://cdn.test/${path}` })),
      error: null,
    }),
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://cdn.test/${path}` }, error: null }),
    upload,
    remove,
  }

  return {
    client: { from, storage: { from: vi.fn(() => bucket) } },
    queries,
    remove,
    upload,
  }
}

function assetRow(overrides: Row = {}): Row {
  return {
    id: ASSET_A,
    tenant_id: TENANT_A,
    name: 'banner.png',
    object_path: OBJECT_PATH,
    mime_type: 'image/png',
    purpose: 'reference',
    status: 'ready',
    lifecycle: 'active',
    created_at: '2026-10-01T10:00:00Z',
    ...overrides,
  }
}

function baseTables(extra: Record<string, FakeTable> = {}): Record<string, FakeTable> {
  return {
    media_assets: { rows: [assetRow()] },
    social_post_assets: { rows: [] },
    cms_asset_usages: { rows: [] },
    media_asset_derivatives: { rows: [] },
    ...extra,
  }
}

function contextFor(client: unknown, tenantId: string, module: 'marketing' | 'cms' = 'cms'): MediaAccessContext {
  return {
    event: {} as MediaAccessContext['event'],
    client,
    tenantId,
    userId: USER_ID,
    module,
    can: { read: true, upload: true, delete: true },
  }
}

function tenantFiltered(queries: RecordedQuery[], table: string, tenantId: string): boolean {
  const relevant = queries.filter(query => query.table === table)
  return relevant.length > 0 && relevant.every(query =>
    query.op === 'insert'
    || query.calls.some(call => call.method === 'eq' && call.args[0] === 'tenant_id' && call.args[1] === tenantId),
  )
}

const fakeEvent = (params: Record<string, string> = {}) => ({ context: { params } }) as unknown as MediaAccessContext['event']

beforeEach(() => {
  vi.mocked(requireWorkspaceContext).mockClear()
  workspace.modules = []
  workspace.capabilities = []
  workspace.tenantId = TENANT_A
  workspace.client = null
})

describe('cms adapter', () => {
  it('lists and uploads for a tenant that only contracts CMS', async () => {
    const fake = createFakeClient(baseTables())
    workspace.client = fake.client
    workspace.modules = ['cms']
    workspace.capabilities = ['cms.media.read', 'cms.media.upload']

    const readCtx = await requireCmsMediaContext(fakeEvent(), 'read')
    expect(requireWorkspaceContext).toHaveBeenCalledWith(expect.anything(), {
      module: 'cms',
      requireTenant: true,
      capability: 'cms.media.read',
    })
    expect(readCtx).toMatchObject({ module: 'cms', tenantId: TENANT_A, can: { read: true, upload: true, delete: false } })

    const listed = await listAssets(readCtx, { limit: 25, paginate: true })
    expect(listed.data.map(row => row.id)).toEqual([ASSET_A])
    expect(listed.data[0]?.previewUrl).toBe(`https://cdn.test/${OBJECT_PATH}`)
    expect(listed.nextCursor).toBeNull()

    const uploadCtx = await requireCmsMediaContext(fakeEvent(), 'upload')
    const uploaded = await uploadAsset(uploadCtx, { filename: 'hero.png', data: PNG_1X1, type: 'image/png' })

    expect(uploaded.asset).toMatchObject({ tenant_id: TENANT_A, mime_type: 'image/png', created_by: USER_ID })
    expect(String(uploaded.asset.object_path).startsWith(`${TENANT_A}/`)).toBe(true)
    expect(uploaded.asset.metadata).toMatchObject({ source: 'cms' })
    expect(fake.upload).toHaveBeenCalledOnce()

    // The same tenant cannot reach the Marketing library.
    await expect(requireMarketingMediaContext(fakeEvent(), 'read')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects SVG and spoofed files on CMS uploads', async () => {
    const fake = createFakeClient(baseTables())
    const ctx = contextFor(fake.client, TENANT_A)

    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    await expect(uploadAsset(ctx, { filename: 'logo.svg', data: svg, type: 'image/svg+xml' }))
      .rejects
      .toMatchObject({ statusCode: 400 })
    await expect(uploadAsset(ctx, { filename: 'logo.png', data: svg, type: 'image/png' }))
      .rejects
      .toMatchObject({ statusCode: 400 })
    await expect(uploadAsset(ctx, { filename: 'photo.jpg', data: PNG_1X1, type: 'image/jpeg' }))
      .rejects
      .toMatchObject({ statusCode: 400, statusMessage: 'A extensão do arquivo não corresponde ao conteúdo.' })

    expect(fake.upload).not.toHaveBeenCalled()
  })

  it('wraps the module gate in the CMS error envelope', async () => {
    workspace.modules = ['marketing']
    workspace.capabilities = ['cms.media.read']
    const { toCmsError } = await import('~/server/utils/media/cms-adapter')

    const error = await requireCmsMediaContext(fakeEvent(), 'read').catch(toCmsError)
    expect(error).toMatchObject({
      statusCode: 403,
      data: { error: { code: 'module_disabled' } },
    })
  })
})

describe('tenant isolation', () => {
  it('filters every media_assets query by the context tenant', async () => {
    const fake = createFakeClient(baseTables())
    const ctx = contextFor(fake.client, TENANT_A)

    await listAssets(ctx, { limit: 10 })
    await getAsset(ctx, ASSET_A)
    await previewAssetDeletion(ctx, [ASSET_A])
    await deleteAsset(ctx, ASSET_A)

    expect(tenantFiltered(fake.queries, 'media_assets', TENANT_A)).toBe(true)
    expect(tenantFiltered(fake.queries, 'social_post_assets', TENANT_A)).toBe(true)
    expect(tenantFiltered(fake.queries, 'cms_asset_usages', TENANT_A)).toBe(true)
  })

  it('returns 404 when tenant B asks for a tenant A asset', async () => {
    const fake = createFakeClient(baseTables())
    const ctx = contextFor(fake.client, TENANT_B)

    await expect(getAsset(ctx, ASSET_A)).rejects.toMatchObject({ statusCode: 404 })
    await expect(deleteAsset(ctx, ASSET_A)).rejects.toMatchObject({ statusCode: 404 })
    expect(fake.remove).not.toHaveBeenCalled()
  })

  it('refuses actions the context does not grant', async () => {
    const fake = createFakeClient(baseTables())
    const ctx = { ...contextFor(fake.client, TENANT_A), can: { read: true, upload: false, delete: false } }

    await expect(deleteAsset(ctx, ASSET_A)).rejects.toMatchObject({ statusCode: 403 })
    await expect(uploadAsset(ctx, { filename: 'a.png', data: PNG_1X1 })).rejects.toMatchObject({ statusCode: 403 })
    expect(fake.queries).toHaveLength(0)
  })
})

describe('deletion usages', () => {
  const cmsUsage = {
    tenant_id: TENANT_A,
    asset_id: ASSET_A,
    document_id: DOCUMENT_ID,
    revision_id: null,
    usage_kind: 'draft',
    field_path: 'cover',
  }

  it('blocks deletion when cms_asset_usages has a row', async () => {
    const fake = createFakeClient(baseTables({ cms_asset_usages: { rows: [cmsUsage] } }))
    const ctx = contextFor(fake.client, TENANT_A)

    const error = await deleteAsset(ctx, ASSET_A).catch((reason: unknown) => reason)
    expect(error).toMatchObject({
      statusCode: 409,
      statusMessage: 'Este arquivo está em uso no site. Remova-o das páginas antes de excluir.',
      data: {
        blocked: [{
          id: ASSET_A,
          linkedPostCount: 0,
          cmsUsageCount: 1,
          usages: {
            socialPosts: [],
            cmsDocuments: [{ documentId: DOCUMENT_ID, revisionId: null, usageKind: 'draft', fieldPath: 'cover' }],
          },
        }],
      },
    })
    expect(fake.remove).not.toHaveBeenCalled()
    expect(fake.queries.some(query => query.table === 'media_assets' && query.op === 'delete')).toBe(false)
  })

  it('maps the CMS delete endpoint conflict to 409 with usages', async () => {
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    const fake = createFakeClient(baseTables({ cms_asset_usages: { rows: [{ ...cmsUsage, usage_kind: 'global', document_id: null }] } }))
    workspace.client = fake.client
    workspace.modules = ['cms']
    workspace.capabilities = ['cms.media.read', 'cms.media.delete']

    const { default: handler } = await import('~/server/api/cms/media/[id].delete')
    const error = await (handler as (event: unknown) => Promise<unknown>)(fakeEvent({ id: ASSET_A }))
      .catch((reason: unknown) => reason)

    expect(error).toMatchObject({
      statusCode: 409,
      data: {
        error: {
          code: 'asset_in_use',
          details: {
            usages: { cmsDocuments: [{ documentId: null, usageKind: 'global', fieldPath: 'cover' }] },
          },
        },
      },
    })
    expect(requireWorkspaceContext).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      module: 'cms',
      capability: 'cms.media.delete',
    }))
    vi.unstubAllGlobals()
  })

  it('treats a missing cms_asset_usages table (42P01) as no usages for marketing', async () => {
    const fake = createFakeClient(baseTables({
      cms_asset_usages: { rows: [], error: { code: '42P01', message: 'relation "cms_asset_usages" does not exist' } },
    }))
    const ctx = contextFor(fake.client, TENANT_A, 'marketing')

    await expect(deleteAsset(ctx, ASSET_A)).resolves.toEqual({ assetId: ASSET_A, name: 'banner.png' })
    expect(fake.remove).toHaveBeenCalledWith([OBJECT_PATH])
  })

  it('does not hide other cms_asset_usages failures', async () => {
    const fake = createFakeClient(baseTables({
      cms_asset_usages: { rows: [], error: { code: '42501', message: 'permission denied' } },
    }))
    const ctx = contextFor(fake.client, TENANT_A, 'marketing')

    await expect(deleteAsset(ctx, ASSET_A)).rejects.toMatchObject({ statusCode: 400, statusMessage: 'permission denied' })
    expect(fake.remove).not.toHaveBeenCalled()
  })
})

describe('marketing adapter', () => {
  it('keeps the historical capability per action', async () => {
    workspace.modules = ['marketing']
    workspace.capabilities = ['marketing.social.read', 'marketing.social.create', 'marketing.social.update']
    workspace.client = createFakeClient(baseTables()).client

    expect(MARKETING_MEDIA_CAPABILITIES).toEqual({
      read: 'marketing.social.read',
      upload: 'marketing.social.create',
      delete: 'marketing.social.update',
    })

    for (const [action, capability] of Object.entries(MARKETING_MEDIA_CAPABILITIES)) {
      vi.mocked(requireWorkspaceContext).mockClear()
      const ctx = await requireMarketingMediaContext(fakeEvent(), action as keyof typeof MARKETING_MEDIA_CAPABILITIES, TENANT_A)
      expect(requireWorkspaceContext).toHaveBeenCalledWith(expect.anything(), {
        tenantId: TENANT_A,
        requireTenant: true,
        module: 'marketing',
        capability,
      })
      expect(ctx).toMatchObject({ module: 'marketing', tenantId: TENANT_A, userId: USER_ID })
    }

    vi.mocked(requireWorkspaceContext).mockClear()
    await requireMarketingMediaContext(fakeEvent(), 'delete')
    expect(requireWorkspaceContext).toHaveBeenCalledWith(expect.anything(), {
      requireTenant: true,
      module: 'marketing',
      capability: 'marketing.social.update',
    })
  })

  it('reports an only-read member as unable to delete', async () => {
    workspace.modules = ['marketing']
    workspace.capabilities = ['marketing.social.read']

    const ctx = await requireMarketingMediaContext(fakeEvent(), 'read')
    expect(ctx.can).toEqual({ read: true, upload: false, delete: false })
    await expect(requireMarketingMediaContext(fakeEvent(), 'delete')).rejects.toMatchObject({ statusCode: 403 })
  })
})
