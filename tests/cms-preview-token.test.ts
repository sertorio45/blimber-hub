import type { CmsFakeRow, CmsTestEvent } from './helpers/cms-fake-supabase'

import type { WorkspaceContext } from '~/server/utils/workspace-context'

import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CMS_LIMITS } from '~/lib/cms/contracts'
import previewToken from '~/server/api/cms/documents/[id]/preview-token.post'
import previewPublic from '~/server/api/public/cms/v1/preview.get'
import { CMS_ROBOTS_NOINDEX } from '~/server/utils/cms/http'
import { signCmsPreviewToken, verifyCmsPreviewToken } from '~/server/utils/cms/preview-token'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'
import { CmsFakeSupabase, createCmsEvent } from './helpers/cms-fake-supabase'

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return { ...actual, readBody: vi.fn(async (event: CmsTestEvent) => event.__body) }
})

vi.mock('~/server/utils/workspace-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/server/utils/workspace-context')>()
  return { ...actual, requireWorkspaceContext: vi.fn() }
})

const SECRET = 'preview-test-secret'
const USER_ID = '99999999-9999-4999-8999-999999999999'
const TENANT_A = '11111111-1111-4111-8111-111111111111'
const SITE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const DOC_A = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
const REV_OLD = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
const REV_NEW = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
const NOW = Date.parse('2026-10-19T12:00:00.000Z')

const workspace = {
  tenantId: TENANT_A,
  modules: ['cms'] as string[],
  capabilities: ['cms.read'] as string[],
}

let fake: CmsFakeSupabase
let previousSecret: string | undefined

function claims(revisionId = REV_NEW) {
  return { tid: TENANT_A, sid: SITE_A, did: DOC_A, rid: revisionId }
}

function createDatabase() {
  return {
    cms_sites: [{
      id: SITE_A,
      tenant_id: TENANT_A,
      site_key: 'empresa-a',
      name: 'Empresa A',
      default_locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      status: 'active',
      settings: {
        theme: { colorPrimary: '#112233', webhookUrl: 'https://hooks.example/secret' },
        webhooks: { url: 'https://hooks.example/secret-out' },
      },
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    }],
    cms_documents: [{
      id: DOC_A,
      tenant_id: TENANT_A,
      site_id: SITE_A,
      kind: 'page',
      publication_type: null,
      locale: 'pt-BR',
      title: 'Rascunho secreto',
      slug: 'sobre',
      parent_id: null,
      is_home: false,
      workflow_status: 'draft',
      public_status: 'unpublished',
      draft_payload: { title: 'Rascunho secreto', slug: 'sobre', body: 'não publicar' },
      edit_version: 2,
      published_revision_id: null,
      published_at: null,
      has_unpublished_changes: true,
      created_by: USER_ID,
      updated_by: USER_ID,
      deleted_at: null,
      created_at: '2026-10-19T10:00:00.000Z',
      updated_at: '2026-10-19T11:00:00.000Z',
    }],
    cms_revisions: [
      {
        id: REV_OLD,
        tenant_id: TENANT_A,
        site_id: SITE_A,
        document_id: DOC_A,
        revision_number: 1,
        reason: 'checkpoint',
        snapshot: { title: 'Versão antiga', slug: 'sobre', body: 'corpo antigo' },
        created_by: USER_ID,
        created_at: '2026-10-19T10:30:00.000Z',
        updated_at: '2026-10-19T10:30:00.000Z',
      },
      {
        id: REV_NEW,
        tenant_id: TENANT_A,
        site_id: SITE_A,
        document_id: DOC_A,
        revision_number: 2,
        reason: 'checkpoint',
        snapshot: { title: 'Versão nova', slug: 'sobre', body: 'corpo publicado' },
        created_by: USER_ID,
        created_at: '2026-10-19T11:30:00.000Z',
        updated_at: '2026-10-19T11:30:00.000Z',
      },
    ] as CmsFakeRow[],
    cms_routes: [{
      tenant_id: TENANT_A,
      site_id: SITE_A,
      locale: 'pt-BR',
      path: '/sobre',
      document_id: DOC_A,
      revision_id: null,
      route_kind: 'document',
      created_at: '2026-10-19T11:30:00.000Z',
      updated_at: '2026-10-19T11:30:00.000Z',
    }],
    cms_audit_events: [] as CmsFakeRow[],
  }
}

function run<T>(handler: (event: any) => Promise<T>, event: CmsTestEvent) {
  return handler(event)
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise
  }
  catch (error: unknown) {
    const thrown = error as { statusCode?: number, data?: { error?: { code?: string, message?: string } } }
    return {
      status: Number(thrown.statusCode ?? 500),
      code: thrown.data?.error?.code ?? null,
      message: thrown.data?.error?.message ?? '',
    }
  }
  throw new Error('a chamada deveria ter falhado')
}

function assertNoDraftPayload() {
  expect(fake.calls.length).toBeGreaterThan(0)
  for (const call of fake.calls) {
    const columns = call.columns ?? '*'
    expect(columns).not.toContain('draft_payload')
    expect(columns).not.toBe('*')
  }
}

beforeEach(() => {
  previousSecret = process.env.CMS_PREVIEW_SECRET
  process.env.CMS_PREVIEW_SECRET = SECRET
  fake = new CmsFakeSupabase(createDatabase())
  workspace.capabilities = ['cms.read']
  vi.mocked(requireWorkspaceContext).mockImplementation(async (_event, options = {}) => {
    const required = options.capability
      ? (Array.isArray(options.capability) ? options.capability : [options.capability])
      : []
    if (required.some(capability => !workspace.capabilities.includes(capability))) {
      const { createError } = await import('h3')
      throw createError({ statusCode: 403, statusMessage: 'Sem permissão para esta ação' })
    }
    return {
      client: fake,
      user: { id: USER_ID },
      userId: USER_ID,
      tenantId: TENANT_A,
      tenant: { id: TENANT_A, name: 'Empresa A', slug: 'empresa-a', isActive: true },
      modules: workspace.modules,
      capabilities: workspace.capabilities,
      isPlatformStaff: false,
      effectiveRole: 'cliente',
      has: (capability: string) => workspace.capabilities.includes(capability),
    } as WorkspaceContext
  })
})

afterEach(() => {
  if (previousSecret === undefined)
    delete process.env.CMS_PREVIEW_SECRET
  else
    process.env.CMS_PREVIEW_SECRET = previousSecret
})

describe('token de pré-visualização', () => {
  it('expira no prazo e rejeita assinatura ou sessão embutida', () => {
    const issued = signCmsPreviewToken(claims(), SECRET, NOW)
    const live = NOW + (CMS_LIMITS.previewTokenTtlSeconds * 1000) - 1000
    const expiredAt = NOW + (CMS_LIMITS.previewTokenTtlSeconds * 1000)

    expect(verifyCmsPreviewToken(issued.token, SECRET, live).ok).toBe(true)
    expect(verifyCmsPreviewToken(issued.token, SECRET, expiredAt)).toEqual({ ok: false, reason: 'expired' })
    expect(verifyCmsPreviewToken(`${issued.token}x`, SECRET, live)).toEqual({ ok: false, reason: 'invalid' })

    const payload = JSON.parse(Buffer.from(issued.token.split('.')[0]!, 'base64url').toString('utf8')) as Record<string, unknown>
    expect(payload).toEqual({ v: 1, ...claims(), exp: Math.floor(NOW / 1000) + CMS_LIMITS.previewTokenTtlSeconds })
    expect(JSON.stringify(payload)).not.toContain(USER_ID)

    const extra = { ...payload, uid: USER_ID }
    const encoded = Buffer.from(JSON.stringify(extra), 'utf8').toString('base64url')
    const signature = createHmac('sha256', SECRET).update(encoded).digest('base64url')
    expect(verifyCmsPreviewToken(`${encoded}.${signature}`, SECRET, live)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('cms.read emite token da última revisão sem selecionar draft_payload', async () => {
    const event = createCmsEvent({
      path: `/api/cms/documents/${DOC_A}/preview-token`,
      params: { id: DOC_A },
      body: {},
      client: fake,
    })
    const response = await run(previewToken, event)

    expect(response.data.revisionId).toBe(REV_NEW)
    expect(response.data.previewPath).toBe(`/api/public/cms/v1/preview?token=${encodeURIComponent(response.data.token)}`)
    expect(response.data.previewPath).not.toContain(USER_ID)
    expect(response.data.token).not.toContain('não publicar')
    expect(fake.callsTo('cms_revisions', 'select')[0]?.columns).not.toContain('snapshot')
    expect(fake.callsTo('cms_revisions', 'select')[0]?.columns).not.toContain('draft_payload')

    const audit = fake.db.cms_audit_events?.[0]
    expect(audit).toMatchObject({ action: 'preview.token', revision_id: REV_NEW })
    expect(JSON.stringify(audit)).not.toContain(response.data.token)

    fake.calls = []
    const pinned = await run(previewToken, createCmsEvent({
      path: `/api/cms/documents/${DOC_A}/preview-token`,
      params: { id: DOC_A },
      body: { revisionId: REV_OLD },
      client: fake,
    }))
    expect(pinned.data.revisionId).toBe(REV_OLD)
  })

  it('sem cms.read não emite token', async () => {
    workspace.capabilities = []
    const failure = await failureOf(run(previewToken, createCmsEvent({
      path: `/api/cms/documents/${DOC_A}/preview-token`,
      params: { id: DOC_A },
      body: {},
      client: fake,
    })))
    expect(failure).toMatchObject({ status: 403, code: 'forbidden' })
    expect(fake.callsTo('cms_documents')).toHaveLength(0)
    expect(fake.callsTo('cms_revisions')).toHaveLength(0)
  })

  it('o preview público lê a revisão pedida, nunca o rascunho', async () => {
    const { token } = signCmsPreviewToken(claims(REV_OLD), SECRET, Date.now())
    const event = createCmsEvent({
      path: '/api/public/cms/v1/preview',
      query: { token },
      client: fake,
    })
    const response = await run(previewPublic, event)
    const serialized = JSON.stringify(response)

    expect(response.data).toMatchObject({
      id: DOC_A,
      revisionId: REV_OLD,
      path: '/sobre',
      preview: true,
      content: { title: 'Versão antiga', body: 'corpo antigo' },
      seo: { noindex: true },
      site: { siteKey: 'empresa-a', theme: { colorPrimary: '#112233' } },
    })
    expect(serialized).not.toContain('Rascunho secreto')
    expect(serialized).not.toContain('não publicar')
    expect(serialized).not.toContain('hooks.example')
    expect(serialized).not.toContain(USER_ID)
    assertNoDraftPayload()
    expect(fake.callsTo('cms_revisions', 'select')[0]?.columns).toContain('snapshot')
    expect(event.node.res.getHeader('cache-control')).toBe('no-store')
    expect(event.node.res.getHeader('x-robots-tag')).toBe(CMS_ROBOTS_NOINDEX)
    expect(event.node.res.getHeader('access-control-allow-origin')).toBe('*')
    expect(event.node.res.getHeader('vary')).toBe('Accept-Encoding')
  })

  it('token expirado responde 401 sem consultar o banco', async () => {
    const { token } = signCmsPreviewToken({
      ...claims(),
      exp: Math.floor(NOW / 1000) - 5,
    }, SECRET, NOW)
    const event = createCmsEvent({
      path: '/api/public/cms/v1/preview',
      query: { token },
      client: fake,
    })
    const failure = await failureOf(run(previewPublic, event))

    expect(failure).toMatchObject({
      status: 401,
      code: 'unauthenticated',
      message: 'O link de pré-visualização expirou',
    })
    expect(fake.calls).toHaveLength(0)
    expect(event.node.res.getHeader('cache-control')).toBe('no-store')
    expect(event.node.res.getHeader('x-robots-tag')).toBe(CMS_ROBOTS_NOINDEX)
  })
})
