import type { CmsFakeRow, CmsTestEvent } from './helpers/cms-fake-supabase'

import type { WorkspaceContext } from '~/server/utils/workspace-context'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CMS_LIMITS, CMS_RPC } from '~/lib/cms/contracts'
import deleteDocument from '~/server/api/cms/documents/[id].delete'
import getDocument from '~/server/api/cms/documents/[id].get'
import saveDraft from '~/server/api/cms/documents/[id]/draft.put'
import publishDocument from '~/server/api/cms/documents/[id]/publish.post'
import restoreRevision from '~/server/api/cms/documents/[id]/revisions/[revisionId]/restore.post'
import createDocument from '~/server/api/cms/documents/index.post'
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

const USER_ID = '99999999-9999-4999-8999-999999999999'
const OTHER_USER = '88888888-8888-4888-8888-888888888888'
const TENANT_A = '11111111-1111-4111-8111-111111111111'
const TENANT_B = '22222222-2222-4222-8222-222222222222'
const SITE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const SITE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const DOC_A = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
const DOC_B = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'
const REV_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'

const EDITOR = [
  'cms.read',
  'cms.pages.create',
  'cms.pages.update',
  'cms.pages.delete',
  'cms.publications.create',
  'cms.publications.update',
  'cms.publications.delete',
  'cms.publish',
]

interface Failure {
  status: number
  code: string | null
  details: unknown
}

const workspace = {
  tenantId: TENANT_A,
  modules: ['cms'] as string[],
  capabilities: [...EDITOR],
}

let fake: CmsFakeSupabase

function siteRow(overrides: CmsFakeRow = {}): CmsFakeRow {
  return {
    id: SITE_A,
    tenant_id: TENANT_A,
    site_key: 'empresa-a',
    name: 'Empresa A',
    default_locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    status: 'active',
    settings: {},
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function documentRow(overrides: CmsFakeRow = {}): CmsFakeRow {
  return {
    id: DOC_A,
    tenant_id: TENANT_A,
    site_id: SITE_A,
    kind: 'page',
    publication_type: null,
    locale: 'pt-BR',
    title: 'Página A',
    slug: 'pagina-a',
    parent_id: null,
    is_home: false,
    workflow_status: 'draft',
    public_status: 'unpublished',
    draft_payload: { title: 'Página A', slug: 'pagina-a' },
    edit_version: 1,
    published_revision_id: null,
    published_at: null,
    has_unpublished_changes: false,
    created_by: USER_ID,
    updated_by: USER_ID,
    deleted_at: null,
    created_at: '2026-10-19T10:00:00.000Z',
    updated_at: '2026-10-19T11:00:00.000Z',
    ...overrides,
  }
}

function createDatabase() {
  return {
    cms_sites: [
      siteRow(),
      siteRow({ id: SITE_B, tenant_id: TENANT_B, site_key: 'empresa-b', name: 'Empresa B' }),
    ],
    cms_documents: [
      documentRow(),
      documentRow({
        id: DOC_B,
        tenant_id: TENANT_B,
        site_id: SITE_B,
        title: 'Página B',
        slug: 'pagina-b',
        draft_payload: { title: 'Página B', slug: 'pagina-b' },
      }),
    ],
    cms_revisions: [] as CmsFakeRow[],
    cms_routes: [] as CmsFakeRow[],
    cms_audit_events: [] as CmsFakeRow[],
  }
}

function document(id = DOC_A): CmsFakeRow {
  const row = fake.db.cms_documents!.find(item => item.id === id)
  if (!row)
    throw new Error(`documento ${id} ausente da fixture`)
  return row
}

function run<T>(handler: (event: any) => Promise<T>, event: CmsTestEvent) {
  return handler(event)
}

async function failureOf(promise: Promise<unknown>): Promise<Failure> {
  try {
    await promise
  }
  catch (error: unknown) {
    const thrown = error as { statusCode?: number, data?: { error?: { code?: string, details?: unknown } } }
    return {
      status: Number(thrown.statusCode ?? 500),
      code: thrown.data?.error?.code ?? null,
      details: thrown.data?.error?.details,
    }
  }
  throw new Error('a chamada deveria ter falhado')
}

function expectTenantFilter(table: string, tenantId: string) {
  const calls = fake.callsTo(table).filter(call => call.action !== 'insert')
  expect(calls.length).toBeGreaterThan(0)
  for (const call of calls)
    expect(call.filters).toContainEqual({ op: 'eq', column: 'tenant_id', value: tenantId })
}

beforeEach(() => {
  fake = new CmsFakeSupabase(createDatabase())
  workspace.tenantId = TENANT_A
  workspace.modules = ['cms']
  workspace.capabilities = [...EDITOR]
  vi.mocked(requireWorkspaceContext).mockImplementation(async (_event, options = {}) => {
    if (options.module && !workspace.modules.includes(options.module)) {
      const { createError } = await import('h3')
      throw createError({ statusCode: 403, statusMessage: 'Módulo não contratado por esta empresa' })
    }
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
      tenantId: workspace.tenantId,
      tenant: { id: workspace.tenantId, name: 'Empresa A', slug: 'empresa-a', isActive: true },
      modules: workspace.modules,
      capabilities: workspace.capabilities,
      isPlatformStaff: false,
      effectiveRole: 'cliente',
      has: (capability: string) => workspace.capabilities.includes(capability),
    } as WorkspaceContext
  })
})

describe('documentos CMS — autenticação e isolamento', () => {
  it('sem sessão retorna 401', async () => {
    const actual = await vi.importActual<typeof import('~/server/utils/workspace-context')>(
      '~/server/utils/workspace-context',
    )
    vi.mocked(requireWorkspaceContext).mockImplementation(actual.requireWorkspaceContext)

    const event = createCmsEvent({ params: { id: DOC_A } })
    expect(await failureOf(run(getDocument, event))).toEqual({ status: 401, code: 'unauthenticated', details: undefined })
    expect(event.node.res.getHeader('cache-control')).toBe('no-store')
  })

  it('empresa A não lê documento da empresa B', async () => {
    const event = createCmsEvent({ params: { id: DOC_B } })
    expect(await failureOf(run(getDocument, event))).toMatchObject({ status: 404, code: 'not_found' })
    expectTenantFilter('cms_documents', TENANT_A)
    expect(fake.callsTo('cms_documents', 'select')[0]?.filters).toContainEqual({
      op: 'eq',
      column: 'id',
      value: DOC_B,
    })
    expect(fake.callsTo('cms_documents', 'update')).toHaveLength(0)
    expect(document(DOC_B).title).toBe('Página B')
    expect(event.node.res.getHeader('cache-control')).toBe('no-store')
  })

  it('documento na lixeira responde 404', async () => {
    document().deleted_at = '2026-10-01T00:00:00.000Z'
    expect(await failureOf(run(getDocument, createCmsEvent({ params: { id: DOC_A } }))))
      .toMatchObject({ status: 404, code: 'not_found' })
    expect(fake.callsTo('cms_documents', 'select')[0]?.filters).toContainEqual({
      op: 'is',
      column: 'deleted_at',
      value: null,
    })
  })

  it('ignora tenant_id do corpo e grava a empresa do contexto', async () => {
    const event = createCmsEvent({
      body: {
        siteId: SITE_A,
        kind: 'page',
        title: 'Página nova',
        tenant_id: TENANT_B,
        tenantId: TENANT_B,
      },
    })

    const response = await run(createDocument, event)
    const created = fake.db.cms_documents!.find(row => row.title === 'Página nova')

    expect(event.node.res.statusCode).toBe(201)
    expect(response.data.tenantId).toBe(TENANT_A)
    expect(created).toMatchObject({ tenant_id: TENANT_A, site_id: SITE_A, kind: 'page' })
    expect(fake.callsTo('cms_documents', 'insert')[0]?.payload).toMatchObject({ tenant_id: TENANT_A })
    expect(fake.callsTo('cms_documents', 'insert')[0]?.payload).not.toHaveProperty('tenant_id', TENANT_B)
  })
})

describe('documentos CMS — rascunho', () => {
  it('versão defasada retorna 409 sem gravar', async () => {
    document().edit_version = 7
    document().updated_by = USER_ID

    const failure = await failureOf(run(saveDraft, createCmsEvent({
      params: { id: DOC_A },
      body: {
        expectedVersion: 6,
        payload: { title: 'Invasão', slug: 'invasao' },
        tenant_id: TENANT_B,
      },
    })))

    expect(failure).toEqual({
      status: 409,
      code: 'version_conflict',
      details: {
        currentVersion: 7,
        updatedAt: '2026-10-19T11:00:00.000Z',
        updatedBy: USER_ID,
      },
    })
    expect(fake.callsTo('cms_documents', 'update')).toHaveLength(0)
    expect(document()).toMatchObject({ title: 'Página A', edit_version: 7, tenant_id: TENANT_A })
  })

  it('update com zero linhas retorna 409 com a versão atual', async () => {
    document().edit_version = 7
    let armed = true
    fake.beforeExecute = (call) => {
      if (!armed || call.table !== 'cms_documents' || call.action !== 'update')
        return
      armed = false
      document().edit_version = 8
      document().updated_at = '2026-10-19T18:00:00.000Z'
      document().updated_by = OTHER_USER
    }

    const failure = await failureOf(run(saveDraft, createCmsEvent({
      params: { id: DOC_A },
      body: { expectedVersion: 7, payload: { title: 'Atrasado', slug: 'atrasado' } },
    })))

    expect(failure).toEqual({
      status: 409,
      code: 'version_conflict',
      details: {
        currentVersion: 8,
        updatedAt: '2026-10-19T18:00:00.000Z',
        updatedBy: OTHER_USER,
      },
    })
    expect(document()).toMatchObject({ title: 'Página A', edit_version: 8, tenant_id: TENANT_A })
    expectTenantFilter('cms_documents', TENANT_A)
  })

  it('payload acima do limite retorna 413', async () => {
    const failure = await failureOf(run(saveDraft, createCmsEvent({
      params: { id: DOC_A },
      body: {
        expectedVersion: 1,
        payload: { title: 'Grande', body: 'a'.repeat(CMS_LIMITS.maxPayloadBytes) },
      },
    })))

    expect(failure).toMatchObject({ status: 413, code: 'payload_too_large' })
    expect(fake.callsTo('cms_documents', 'update')).toHaveLength(0)
    expect(document().title).toBe('Página A')
  })

  it('não altera o slug de um documento já publicado', async () => {
    Object.assign(document(), {
      public_status: 'published',
      published_at: '2026-10-19T12:00:00.000Z',
      published_revision_id: REV_A,
      slug: 'ao-vivo',
      edit_version: 5,
      draft_payload: { title: 'Ao vivo', slug: 'ao-vivo' },
    })

    const response = await run(saveDraft, createCmsEvent({
      params: { id: DOC_A },
      body: {
        expectedVersion: 5,
        tenant_id: TENANT_B,
        payload: { title: 'Título novo', slug: 'novo-endereco' },
      },
    }))

    expect(response.data).toMatchObject({
      slug: 'ao-vivo',
      title: 'Título novo',
      editVersion: 6,
      tenantId: TENANT_A,
      hasUnpublishedChanges: true,
    })
    expect(document()).toMatchObject({ slug: 'ao-vivo', tenant_id: TENANT_A, edit_version: 6 })
    expect(document().draft_payload).toMatchObject({ slug: 'novo-endereco', title: 'Título novo' })
    const update = fake.callsTo('cms_documents', 'update')[0]
    expect(update?.payload).toMatchObject({ slug: 'ao-vivo' })
    expect(update?.payload).not.toHaveProperty('tenant_id')
    expect(update?.filters).toContainEqual({ op: 'eq', column: 'tenant_id', value: TENANT_A })
    expect(update?.filters).toContainEqual({ op: 'eq', column: 'edit_version', value: 5 })
  })
})

describe('documentos CMS — publicação, lixeira e restauração', () => {
  it('sem cms.publish, publicar responde 403 e não chama o RPC', async () => {
    workspace.capabilities = EDITOR.filter(capability => capability !== 'cms.publish')
    Object.assign(document(), {
      edit_version: 2,
      draft_payload: { title: 'Sobre', slug: 'sobre' },
    })

    const failure = await failureOf(run(publishDocument, createCmsEvent({
      params: { id: DOC_A },
      body: { expectedVersion: 2 },
    })))

    expect(failure).toMatchObject({ status: 403, code: 'forbidden' })
    expect(fake.rpcCalls).toHaveLength(0)
    expect(document().public_status).toBe('unpublished')
  })

  it('título vazio retorna 422 antes do RPC', async () => {
    Object.assign(document(), {
      edit_version: 2,
      title: '',
      draft_payload: { title: '', slug: 'sobre' },
    })

    const failure = await failureOf(run(publishDocument, createCmsEvent({
      params: { id: DOC_A },
      body: { expectedVersion: 2 },
    })))

    expect(failure).toMatchObject({ status: 422, code: 'validation_failed' })
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it('mapeia P0410 para 409 route_conflict e P0422 para 422', async () => {
    Object.assign(document(), {
      edit_version: 2,
      title: 'Sobre',
      slug: 'sobre',
      draft_payload: { title: 'Sobre', slug: 'sobre' },
    })
    const event = () => createCmsEvent({
      params: { id: DOC_A },
      body: { expectedVersion: 2 },
    })

    fake.rpcHandlers[CMS_RPC.publishRevision] = () => ({
      error: { code: 'P0410', message: 'route_conflict', details: '{"path":"/sobre"}' },
    })
    const conflict = await failureOf(run(publishDocument, event()))
    expect(conflict).toMatchObject({
      status: 409,
      code: 'route_conflict',
      details: { path: '/sobre' },
    })
    expect(fake.rpcCalls.map(call => call.name)).toEqual([CMS_RPC.publishRevision])

    fake.rpcCalls = []
    fake.rpcHandlers[CMS_RPC.publishRevision] = () => ({
      error: { code: 'P0422', message: 'validation_failed', details: '{"field":"parentId","reason":"parent_not_published"}' },
    })
    const invalid = await failureOf(run(publishDocument, event()))
    expect(invalid).toMatchObject({
      status: 422,
      code: 'validation_failed',
      details: { field: 'parentId', reason: 'parent_not_published' },
    })
    expect(fake.rpcCalls).toHaveLength(1)
    expect(document().public_status).toBe('unpublished')
  })

  it('excluir publicado despublica antes e só então marca deleted_at', async () => {
    Object.assign(document(), {
      public_status: 'published',
      published_at: '2026-10-19T12:00:00.000Z',
      published_revision_id: REV_A,
      slug: 'ao-vivo',
    })
    fake.rpcHandlers[CMS_RPC.unpublishDocument] = () => ({ data: { public_status: 'withdrawn' } })

    const response = await run(deleteDocument, createCmsEvent({ params: { id: DOC_A } }))

    expect(response.data.id).toBe(DOC_A)
    expect(response.data.deletedAt).toEqual(expect.any(String))
    expect(fake.rpcCalls.map(call => call.name)).toEqual([CMS_RPC.unpublishDocument])
    expect(fake.rpcCalls[0]?.args).toMatchObject({ p_document_id: DOC_A, p_actor: USER_ID })
    expect(fake.callsTo('cms_routes', 'delete')).toHaveLength(0)
    expect(document().deleted_at).toEqual(expect.any(String))
    expect(fake.db.cms_documents).toHaveLength(2)
  })

  it('excluir publicado sem cms.publish responde 403 e mantém o documento', async () => {
    workspace.capabilities = EDITOR.filter(capability => capability !== 'cms.publish')
    Object.assign(document(), {
      public_status: 'published',
      published_at: '2026-10-19T12:00:00.000Z',
      published_revision_id: REV_A,
    })

    expect(await failureOf(run(deleteDocument, createCmsEvent({ params: { id: DOC_A } }))))
      .toMatchObject({ status: 403, code: 'forbidden' })
    expect(fake.rpcCalls).toHaveLength(0)
    expect(document().deleted_at).toBeNull()
  })

  it('restaurar copia o snapshot para o rascunho e não publica', async () => {
    document().edit_version = 4
    fake.db.cms_revisions!.push({
      id: REV_A,
      tenant_id: TENANT_A,
      site_id: SITE_A,
      document_id: DOC_A,
      revision_number: 2,
      snapshot: { title: 'Versão antiga', slug: 'versao-antiga' },
      reason: 'publish',
      created_by: USER_ID,
      created_at: '2026-10-18T12:00:00.000Z',
      updated_at: '2026-10-18T12:00:00.000Z',
    })

    const response = await run(restoreRevision, createCmsEvent({
      params: { id: DOC_A, revisionId: REV_A },
      body: { expectedVersion: 4 },
    }))

    expect(response.data).toMatchObject({
      title: 'Versão antiga',
      publicStatus: 'unpublished',
      publishedRevisionId: null,
      editVersion: 5,
    })
    expect(response.data.draftPayload).toMatchObject({ title: 'Versão antiga', slug: 'versao-antiga' })
    expect(fake.rpcCalls.map(call => call.name)).not.toContain(CMS_RPC.publishRevision)
    expect(fake.rpcCalls.map(call => call.name)).not.toContain(CMS_RPC.unpublishDocument)
    expect(fake.callsTo('cms_revisions', 'insert')[0]?.payload).toMatchObject({
      reason: 'restore',
      document_id: DOC_A,
      tenant_id: TENANT_A,
      revision_number: 3,
    })
    expectTenantFilter('cms_revisions', TENANT_A)
  })
})
