import type { CmsFakeRow, CmsTestEvent } from './helpers/cms-fake-supabase'
import type { WorkspaceContext } from '~/server/utils/workspace-context'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import deleteAuthor from '~/server/api/cms/authors/[id].delete'
import getAuthor from '~/server/api/cms/authors/[id].get'
import createAuthor from '~/server/api/cms/authors/index.post'
import saveDraft from '~/server/api/cms/documents/[id]/draft.put'
import deleteTaxonomy from '~/server/api/cms/taxonomies/[id].delete'
import getTaxonomy from '~/server/api/cms/taxonomies/[id].get'
import createTaxonomy from '~/server/api/cms/taxonomies/index.post'
import deleteTerm from '~/server/api/cms/terms/[id].delete'
import getTerm from '~/server/api/cms/terms/[id].get'
import updateTerm from '~/server/api/cms/terms/[id].patch'
import listTerms from '~/server/api/cms/terms/index.get'
import createTerm from '~/server/api/cms/terms/index.post'
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
const TENANT_A = '11111111-1111-4111-8111-111111111111'
const TENANT_B = '22222222-2222-4222-8222-222222222222'
const SITE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const SITE_A2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
const SITE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const DOC_A = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
const TAX_A = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
const TAX_A2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
const TAX_B = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'
const TAG_A = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4'
const TERM_A = 'abababab-abab-4aba-8aba-abababababa1'
const TERM_A2 = 'abababab-abab-4aba-8aba-abababababa3'
const TERM_B = 'abababab-abab-4aba-8aba-abababababa2'
const TERM_TAG = 'abababab-abab-4aba-8aba-abababababa4'
const AUTHOR_A = 'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdc1'
const AUTHOR_B = 'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdc2'
const ASSET_A = '12121212-1212-4121-8121-121212121212'
const ASSET_B = '34343434-3434-4343-8343-343434343434'

const EDITOR = ['cms.read', 'cms.publications.create', 'cms.publications.update']

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

function stamp(overrides: CmsFakeRow = {}): CmsFakeRow {
  return {
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function createDatabase() {
  return {
    cms_sites: [
      stamp({
        id: SITE_A,
        tenant_id: TENANT_A,
        site_key: 'empresa-a',
        name: 'Empresa A',
        default_locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        status: 'active',
        settings: {},
      }),
      stamp({
        id: SITE_A2,
        tenant_id: TENANT_A,
        site_key: 'empresa-a-2',
        name: 'Empresa A 2',
        default_locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        status: 'active',
        settings: {},
      }),
      stamp({
        id: SITE_B,
        tenant_id: TENANT_B,
        site_key: 'empresa-b',
        name: 'Empresa B',
        default_locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        status: 'active',
        settings: {},
      }),
    ],
    cms_taxonomies: [
      stamp({ id: TAX_A, tenant_id: TENANT_A, site_id: SITE_A, kind: 'category', name: 'Assuntos', slug: 'assuntos' }),
      stamp({ id: TAX_A2, tenant_id: TENANT_A, site_id: SITE_A2, kind: 'category', name: 'Outro site', slug: 'outro-site' }),
      stamp({ id: TAX_B, tenant_id: TENANT_B, site_id: SITE_B, kind: 'category', name: 'Segredo', slug: 'segredo' }),
      stamp({ id: TAG_A, tenant_id: TENANT_A, site_id: SITE_A, kind: 'tag', name: 'Tags', slug: 'tags' }),
    ],
    cms_terms: [
      stamp({ id: TERM_A, tenant_id: TENANT_A, site_id: SITE_A, taxonomy_id: TAX_A, name: 'Produto', slug: 'produto', parent_id: null }),
      stamp({ id: TERM_A2, tenant_id: TENANT_A, site_id: SITE_A2, taxonomy_id: TAX_A2, name: 'Vizinha', slug: 'vizinha', parent_id: null }),
      stamp({ id: TERM_B, tenant_id: TENANT_B, site_id: SITE_B, taxonomy_id: TAX_B, name: 'Confidencial', slug: 'confidencial', parent_id: null }),
      stamp({ id: TERM_TAG, tenant_id: TENANT_A, site_id: SITE_A, taxonomy_id: TAG_A, name: 'Lançamento', slug: 'lancamento', parent_id: null }),
    ],
    cms_authors: [
      stamp({
        id: AUTHOR_A,
        tenant_id: TENANT_A,
        site_id: SITE_A,
        name: 'Ana',
        slug: 'ana',
        bio: null,
        avatar_asset_id: null,
        user_id: null,
      }),
      stamp({
        id: AUTHOR_B,
        tenant_id: TENANT_B,
        site_id: SITE_B,
        name: 'Bruno',
        slug: 'bruno',
        bio: null,
        avatar_asset_id: null,
        user_id: null,
      }),
    ],
    cms_documents: [
      stamp({
        id: DOC_A,
        tenant_id: TENANT_A,
        site_id: SITE_A,
        kind: 'publication',
        publication_type: 'article',
        locale: 'pt-BR',
        title: 'Artigo A',
        slug: 'artigo-a',
        parent_id: null,
        is_home: false,
        workflow_status: 'draft',
        public_status: 'unpublished',
        draft_payload: { title: 'Artigo A', slug: 'artigo-a' },
        edit_version: 1,
        published_revision_id: null,
        published_at: null,
        has_unpublished_changes: false,
        created_by: USER_ID,
        updated_by: USER_ID,
        deleted_at: null,
      }),
    ],
    media_assets: [
      { id: ASSET_A, tenant_id: TENANT_A, object_path: 'tenant-a/capa.jpg', name: 'Capa A' },
      { id: ASSET_B, tenant_id: TENANT_B, object_path: 'tenant-b/capa.jpg', name: 'Capa B' },
    ],
    cms_asset_usages: [] as CmsFakeRow[],
    cms_audit_events: [] as CmsFakeRow[],
  }
}

function term(id = TERM_B): CmsFakeRow {
  const row = fake.db.cms_terms!.find(item => item.id === id)
  if (!row)
    throw new Error(`termo ${id} ausente`)
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

describe('taxonomias CMS — isolamento por empresa', () => {
  it('lista só termos do site e da empresa do contexto', async () => {
    const response = await run(listTerms, createCmsEvent({
      query: { siteId: SITE_A },
    }))

    expect(response.data.map(item => item.id).sort()).toEqual([TERM_A, TERM_TAG].sort())
    expect(response.data.find(item => item.id === TERM_TAG)?.kind).toBe('tag')
    expect(response.data.every(item => item.tenantId === TENANT_A && item.siteId === SITE_A)).toBe(true)
    expectTenantFilter('cms_terms', TENANT_A)
    expectTenantFilter('cms_taxonomies', TENANT_A)
    expect(fake.callsTo('cms_terms', 'select').some(call =>
      call.filters.some(filter => filter.column === 'site_id' && filter.value === SITE_A),
    )).toBe(true)
  })

  it('filtra por tipo sem vazar o outro site da mesma empresa', async () => {
    const response = await run(listTerms, createCmsEvent({
      query: { siteId: SITE_A, kind: 'category' },
    }))

    expect(response.data.map(item => item.id)).toEqual([TERM_A])
    expect(response.data[0]).toMatchObject({ name: 'Produto', kind: 'category', tenantId: TENANT_A })
  })

  it('não lê taxonomia nem termo de outra empresa', async () => {
    expect(await failureOf(run(getTaxonomy, createCmsEvent({ params: { id: TAX_B } }))))
      .toMatchObject({ status: 404, code: 'not_found' })
    expect(await failureOf(run(getTerm, createCmsEvent({ params: { id: TERM_B } }))))
      .toMatchObject({ status: 404, code: 'not_found' })
    expectTenantFilter('cms_terms', TENANT_A)
    expect(term().name).toBe('Confidencial')
  })

  it('não altera nem exclui termo de outra empresa', async () => {
    expect(await failureOf(run(updateTerm, createCmsEvent({
      params: { id: TERM_B },
      body: { name: 'Invadido', tenantId: TENANT_B },
    })))).toMatchObject({ status: 404, code: 'not_found' })
    expect(fake.callsTo('cms_terms', 'update')).toHaveLength(0)
    expect(term().name).toBe('Confidencial')

    expect(await failureOf(run(deleteTerm, createCmsEvent({ params: { id: TERM_B } }))))
      .toMatchObject({ status: 404, code: 'not_found' })
    expect(fake.callsTo('cms_terms', 'delete')).toHaveLength(0)
    expect(term().name).toBe('Confidencial')
  })

  it('ignora tenant do corpo e recusa site ou taxonomia de outra empresa', async () => {
    const created = await run(createTerm, createCmsEvent({
      body: {
        siteId: SITE_A,
        kind: 'category',
        name: 'Novidade',
        tenant_id: TENANT_B,
        tenantId: TENANT_B,
      },
    }))
    const row = fake.db.cms_terms!.find(item => item.name === 'Novidade')
    expect(created.data).toMatchObject({ tenantId: TENANT_A, siteId: SITE_A, kind: 'category', name: 'Novidade' })
    expect(row).toMatchObject({ tenant_id: TENANT_A, site_id: SITE_A, taxonomy_id: TAX_A })

    expect(await failureOf(run(createTerm, createCmsEvent({
      body: { siteId: SITE_B, kind: 'category', name: 'Fora' },
    })))).toMatchObject({ status: 404, code: 'not_found' })
    expect(fake.db.cms_terms!.some(item => item.name === 'Fora')).toBe(false)

    expect(await failureOf(run(createTerm, createCmsEvent({
      body: { siteId: SITE_A, taxonomyId: TAX_B, name: 'Cruzado' },
    })))).toMatchObject({ status: 404, code: 'not_found' })
    expect(fake.db.cms_terms!.some(item => item.name === 'Cruzado')).toBe(false)
  })

  it('sem permissão editorial, criar responde 403 e não grava', async () => {
    workspace.capabilities = ['cms.read']
    expect(await failureOf(run(createTaxonomy, createCmsEvent({
      body: { siteId: SITE_A, kind: 'tag', name: 'Formatos' },
    })))).toMatchObject({ status: 403, code: 'forbidden' })
    expect(fake.callsTo('cms_taxonomies', 'insert')).toHaveLength(0)
  })

  it('excluir taxonomia da própria empresa filtra tenant_id', async () => {
    const response = await run(deleteTaxonomy, createCmsEvent({ params: { id: TAX_A } }))
    expect(response.data.id).toBe(TAX_A)
    expect(fake.db.cms_taxonomies!.some(item => item.id === TAX_A)).toBe(false)
    expect(fake.db.cms_taxonomies!.some(item => item.id === TAX_B)).toBe(true)
    expect(fake.callsTo('cms_taxonomies', 'delete')[0]?.filters).toContainEqual({
      op: 'eq',
      column: 'tenant_id',
      value: TENANT_A,
    })
  })
})

describe('autores CMS — isolamento por empresa', () => {
  it('não lê autor de outra empresa e cria no tenant do contexto', async () => {
    expect(await failureOf(run(getAuthor, createCmsEvent({ params: { id: AUTHOR_B } }))))
      .toMatchObject({ status: 404, code: 'not_found' })
    expectTenantFilter('cms_authors', TENANT_A)

    const response = await run(createAuthor, createCmsEvent({
      body: { siteId: SITE_A, name: 'Maria Silva', tenantId: TENANT_B },
    }))
    expect(response.data).toMatchObject({ tenantId: TENANT_A, siteId: SITE_A, name: 'Maria Silva', slug: 'maria-silva' })
    expect(fake.callsTo('cms_authors', 'insert')[0]?.payload).toMatchObject({ tenant_id: TENANT_A })
    expect(fake.callsTo('cms_authors', 'insert')[0]?.payload).not.toMatchObject({ tenant_id: TENANT_B })
  })

  it('não exclui autor de outra empresa', async () => {
    expect(await failureOf(run(deleteAuthor, createCmsEvent({ params: { id: AUTHOR_B } }))))
      .toMatchObject({ status: 404, code: 'not_found' })
    expect(fake.db.cms_authors!.some(item => item.id === AUTHOR_B && item.name === 'Bruno')).toBe(true)
    expect(fake.callsTo('cms_authors', 'delete')).toHaveLength(0)
  })
})

describe('publicação — referências e capa', () => {
  it('rejeita termo e autor de outra empresa antes de gravar o rascunho', async () => {
    const foreignTerm = await failureOf(run(saveDraft, createCmsEvent({
      params: { id: DOC_A },
      body: {
        expectedVersion: 1,
        payload: { title: 'Artigo A', slug: 'artigo-a', termIds: [TERM_B] },
      },
    })))
    expect(foreignTerm).toMatchObject({
      status: 422,
      code: 'validation_failed',
      details: { field: 'termIds', reason: 'unknown_term' },
    })
    expect(fake.callsTo('cms_documents', 'update')).toHaveLength(0)
    expect(fake.callsTo('cms_terms', 'select')[0]?.filters).toContainEqual({
      op: 'eq',
      column: 'tenant_id',
      value: TENANT_A,
    })

    const foreignAuthor = await failureOf(run(saveDraft, createCmsEvent({
      params: { id: DOC_A },
      body: {
        expectedVersion: 1,
        payload: { title: 'Artigo A', slug: 'artigo-a', authorId: AUTHOR_B },
      },
    })))
    expect(foreignAuthor).toMatchObject({
      status: 422,
      code: 'validation_failed',
      details: { field: 'authorId', reason: 'unknown_author' },
    })
    expect(fake.db.cms_documents![0]?.edit_version).toBe(1)
  })

  it('vincula a capa da própria empresa e recusa mídia de outra', async () => {
    const saved = await run(saveDraft, createCmsEvent({
      params: { id: DOC_A },
      body: {
        expectedVersion: 1,
        payload: {
          title: 'Com capa',
          slug: 'com-capa',
          cover: { assetId: ASSET_A, objectPath: 'forjado/capa.jpg', alt: 'Fachada' },
          authorId: AUTHOR_A,
          termIds: [TERM_A, TERM_TAG],
        },
      },
    }))

    expect(saved.data.draftPayload.cover).toEqual({
      assetId: ASSET_A,
      objectPath: 'tenant-a/capa.jpg',
      alt: 'Fachada',
    })
    expect(saved.data.draftPayload.authorId).toBe(AUTHOR_A)
    expect(saved.data.draftPayload.termIds).toEqual([TERM_A, TERM_TAG])
    expect(fake.db.cms_asset_usages).toEqual([
      expect.objectContaining({
        tenant_id: TENANT_A,
        site_id: SITE_A,
        asset_id: ASSET_A,
        document_id: DOC_A,
        revision_id: null,
        usage_kind: 'draft',
        field_path: 'cover',
      }),
    ])
    expect(fake.callsTo('media_assets', 'select')[0]?.filters).toContainEqual({
      op: 'eq',
      column: 'tenant_id',
      value: TENANT_A,
    })

    const foreign = await failureOf(run(saveDraft, createCmsEvent({
      params: { id: DOC_A },
      body: {
        expectedVersion: 2,
        payload: {
          title: 'Com capa',
          slug: 'com-capa',
          cover: { assetId: ASSET_B },
        },
      },
    })))
    expect(foreign).toMatchObject({
      status: 422,
      code: 'validation_failed',
      details: { field: 'cover', reason: 'unknown_asset' },
    })
    expect(fake.db.cms_asset_usages!.every(row => row.asset_id === ASSET_A)).toBe(true)
    expect(fake.db.cms_documents![0]?.edit_version).toBe(2)

    const cleared = await run(saveDraft, createCmsEvent({
      params: { id: DOC_A },
      body: {
        expectedVersion: 2,
        payload: { title: 'Sem capa', slug: 'com-capa', cover: null },
      },
    }))
    expect(cleared.data.draftPayload.cover).toBeNull()
    expect(fake.db.cms_asset_usages).toEqual([])
    expect(fake.callsTo('cms_asset_usages', 'delete').at(-1)?.filters).toEqual(expect.arrayContaining([
      { op: 'eq', column: 'tenant_id', value: TENANT_A },
      { op: 'eq', column: 'usage_kind', value: 'draft' },
      { op: 'eq', column: 'field_path', value: 'cover' },
      { op: 'is', column: 'revision_id', value: null },
    ]))
  })
})
