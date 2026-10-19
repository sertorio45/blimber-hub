import type { CmsFakeCall, CmsFakeRow, CmsTestEvent } from './helpers/cms-fake-supabase'

import { beforeEach, describe, expect, it } from 'vitest'
import listPublications from '~/server/api/public/cms/v1/sites/[siteKey]/publications.get'
import resolvePublic from '~/server/api/public/cms/v1/sites/[siteKey]/resolve.get'
import { CMS_PUBLIC_CACHE_CONTROL } from '~/server/utils/cms/http'
import { CmsFakeSupabase, createCmsEvent } from './helpers/cms-fake-supabase'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const TENANT_B = '22222222-2222-4222-8222-222222222222'
const SITE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const SITE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const SITE_SUSPENDED = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'

const DOC_PUBLISHED = 'd1000000-0000-4000-8000-000000000001'
const DOC_DRAFT = 'd1000000-0000-4000-8000-000000000002'
const DOC_DELETED = 'd1000000-0000-4000-8000-000000000003'
const DOC_WITHDRAWN = 'd1000000-0000-4000-8000-000000000004'
const DOC_NEWS = 'd1000000-0000-4000-8000-000000000005'
const DOC_PAGE = 'd1000000-0000-4000-8000-000000000006'
const DOC_OTHER = 'd1000000-0000-4000-8000-000000000007'
const DOC_POISON = 'd1000000-0000-4000-8000-000000000008'
const DOC_EN = 'd1000000-0000-4000-8000-000000000009'

const REV_PUBLISHED = 'e1000000-0000-4000-8000-000000000001'
const REV_DRAFT = 'e1000000-0000-4000-8000-000000000002'
const REV_DELETED = 'e1000000-0000-4000-8000-000000000003'
const REV_WITHDRAWN = 'e1000000-0000-4000-8000-000000000004'
const REV_NEWS = 'e1000000-0000-4000-8000-000000000005'
const REV_PAGE = 'e1000000-0000-4000-8000-000000000006'
const REV_OTHER = 'e1000000-0000-4000-8000-000000000007'
const REV_POISON = 'e1000000-0000-4000-8000-000000000008'
const REV_EN = 'e1000000-0000-4000-8000-000000000009'

let fake: CmsFakeSupabase

function siteRow(overrides: CmsFakeRow): CmsFakeRow {
  return {
    tenant_id: TENANT_A,
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

function publication(overrides: CmsFakeRow): CmsFakeRow {
  return {
    tenant_id: TENANT_A,
    site_id: SITE_A,
    kind: 'publication',
    publication_type: 'article',
    locale: 'pt-BR',
    title: 'Rascunho secreto',
    slug: 'artigo',
    parent_id: null,
    is_home: false,
    workflow_status: 'draft',
    public_status: 'published',
    draft_payload: { title: 'Rascunho secreto', slug: 'artigo', body: 'não publicar' },
    edit_version: 3,
    has_unpublished_changes: false,
    created_by: null,
    updated_by: null,
    deleted_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function revision(id: string, documentId: string, title: string, extra: CmsFakeRow = {}): CmsFakeRow {
  const slug = typeof extra.slug === 'string' ? extra.slug : 'artigo'
  const row = { ...extra }
  delete row.slug
  return {
    id,
    tenant_id: TENANT_A,
    site_id: SITE_A,
    document_id: documentId,
    revision_number: 1,
    reason: 'publish',
    created_by: null,
    created_at: '2026-10-19T12:00:00.000Z',
    updated_at: '2026-10-19T12:00:00.000Z',
    ...row,
    snapshot: { title, slug, body: `corpo de ${title}` },
  }
}

function route(path: string, documentId: string, extra: CmsFakeRow = {}): CmsFakeRow {
  return {
    tenant_id: TENANT_A,
    site_id: SITE_A,
    locale: 'pt-BR',
    path,
    document_id: documentId,
    revision_id: null,
    route_kind: 'document',
    created_at: '2026-10-19T12:00:00.000Z',
    updated_at: '2026-10-19T12:00:00.000Z',
    ...extra,
  }
}

function createDatabase() {
  return {
    cms_sites: [
      siteRow({ id: SITE_A, tenant_id: TENANT_A, site_key: 'empresa-a' }),
      siteRow({ id: SITE_B, tenant_id: TENANT_B, site_key: 'empresa-b', name: 'Empresa B' }),
      siteRow({ id: SITE_SUSPENDED, tenant_id: TENANT_A, site_key: 'site-suspenso', status: 'suspended' }),
    ],
    cms_documents: [
      publication({
        id: DOC_PUBLISHED,
        slug: 'artigo-publico',
        published_revision_id: REV_PUBLISHED,
        published_at: '2026-10-19T15:00:00.000Z',
        draft_payload: { title: 'Rascunho secreto', slug: 'artigo-publico', body: 'não publicar' },
      }),
      publication({
        id: DOC_DRAFT,
        slug: 'rascunho',
        public_status: 'unpublished',
        published_revision_id: REV_DRAFT,
        published_at: '2026-10-17T00:00:00.000Z',
      }),
      publication({
        id: DOC_DELETED,
        slug: 'apagado',
        published_revision_id: REV_DELETED,
        published_at: '2026-10-19T16:00:00.000Z',
        deleted_at: '2026-10-19T17:00:00.000Z',
      }),
      publication({
        id: DOC_WITHDRAWN,
        slug: 'retirado',
        public_status: 'withdrawn',
        published_revision_id: REV_WITHDRAWN,
        published_at: '2026-10-19T14:00:00.000Z',
      }),
      publication({
        id: DOC_NEWS,
        slug: 'noticia',
        publication_type: 'news',
        published_revision_id: REV_NEWS,
        published_at: '2026-10-18T10:00:00.000Z',
      }),
      publication({
        id: DOC_PAGE,
        kind: 'page',
        publication_type: null,
        slug: 'sobre',
        published_revision_id: REV_PAGE,
        published_at: '2026-10-19T16:30:00.000Z',
      }),
      publication({
        id: DOC_OTHER,
        tenant_id: TENANT_B,
        site_id: SITE_B,
        slug: 'artigo-publico',
        published_revision_id: REV_OTHER,
        published_at: '2026-10-19T15:30:00.000Z',
        draft_payload: { title: 'Rascunho da empresa B', body: 'segredo B' },
      }),
      publication({
        id: DOC_POISON,
        tenant_id: TENANT_B,
        site_id: SITE_A,
        slug: 'envenenado',
        published_revision_id: REV_POISON,
        published_at: '2026-10-19T15:45:00.000Z',
      }),
      publication({
        id: DOC_EN,
        locale: 'en',
        slug: 'english',
        published_revision_id: REV_EN,
        published_at: '2026-10-19T15:50:00.000Z',
      }),
    ],
    cms_revisions: [
      revision(REV_PUBLISHED, DOC_PUBLISHED, 'Artigo publicado', { slug: 'artigo-publico' }),
      revision(REV_DRAFT, DOC_DRAFT, 'Rascunho que não pode vazar', { slug: 'rascunho' }),
      revision(REV_DELETED, DOC_DELETED, 'Apagado', { slug: 'apagado' }),
      revision(REV_WITHDRAWN, DOC_WITHDRAWN, 'Retirado', { slug: 'retirado' }),
      revision(REV_NEWS, DOC_NEWS, 'Notícia publicada', { slug: 'noticia' }),
      revision(REV_PAGE, DOC_PAGE, 'Página publicada', { slug: 'sobre' }),
      revision(REV_OTHER, DOC_OTHER, 'Artigo da empresa B', { tenant_id: TENANT_B, site_id: SITE_B, slug: 'artigo-publico' }),
      revision(REV_POISON, DOC_POISON, 'Documento de outro tenant', { tenant_id: TENANT_B, slug: 'envenenado' }),
      revision(REV_EN, DOC_EN, 'English article', { slug: 'english' }),
    ],
    cms_routes: [
      route('/artigos/artigo-publico', DOC_PUBLISHED, { revision_id: REV_PUBLISHED }),
      route('/artigos/rascunho', DOC_DRAFT, { revision_id: REV_DRAFT }),
      route('/artigos/apagado', DOC_DELETED, { revision_id: REV_DELETED }),
      route('/artigos/retirado', DOC_WITHDRAWN, { revision_id: REV_WITHDRAWN }),
      route('/noticias/noticia', DOC_NEWS, { revision_id: REV_NEWS }),
      route('/sobre', DOC_PAGE, { revision_id: REV_PAGE }),
      route('/artigos/artigo-publico', DOC_OTHER, {
        tenant_id: TENANT_B,
        site_id: SITE_B,
        revision_id: REV_OTHER,
      }),
      route('/artigos/envenenado', DOC_POISON, { revision_id: REV_POISON }),
      route('/artigos/english', DOC_EN, { locale: 'en', revision_id: REV_EN }),
      route('/suspenso', DOC_PUBLISHED, { site_id: SITE_SUSPENDED, tenant_id: TENANT_A }),
    ],
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
    const thrown = error as { statusCode?: number, data?: { error?: { code?: string } } }
    return { status: Number(thrown.statusCode ?? 500), code: thrown.data?.error?.code ?? null }
  }
  throw new Error('a chamada deveria ter falhado')
}

function assertNoDraftPayload(calls: CmsFakeCall[] = fake.calls) {
  expect(calls.length).toBeGreaterThan(0)
  for (const call of calls) {
    const columns = call.columns ?? '*'
    expect(columns).not.toContain('draft_payload')
    expect(columns).not.toBe('*')
  }
}

function resolve(siteKey: string, path: string) {
  return run(resolvePublic, createCmsEvent({
    path: `/api/public/cms/v1/sites/${siteKey}/resolve`,
    params: { siteKey },
    query: { path },
    client: fake,
  }))
}

function list(siteKey: string) {
  return run(listPublications, createCmsEvent({
    path: `/api/public/cms/v1/sites/${siteKey}/publications`,
    params: { siteKey },
    client: fake,
  }))
}

beforeEach(() => {
  fake = new CmsFakeSupabase(createDatabase())
})

describe('entrega pública do CMS', () => {
  it('resolve devolve só a revisão publicada e nunca seleciona draft_payload', async () => {
    const event = createCmsEvent({
      path: '/api/public/cms/v1/sites/empresa-a/resolve',
      params: { siteKey: 'empresa-a' },
      query: { path: '/artigos/artigo-publico' },
      client: fake,
    })
    const response = await run(resolvePublic, event)
    const serialized = JSON.stringify(response)

    expect(response.data).toMatchObject({
      id: DOC_PUBLISHED,
      kind: 'publication',
      path: '/artigos/artigo-publico',
      revisionId: REV_PUBLISHED,
      publishedAt: '2026-10-19T15:00:00.000Z',
      content: { title: 'Artigo publicado', body: 'corpo de Artigo publicado' },
    })
    expect(response.data).not.toHaveProperty('draftPayload')
    expect(serialized).not.toContain('Rascunho secreto')
    expect(serialized).not.toContain('não publicar')
    assertNoDraftPayload()
    expect(fake.callsTo('cms_documents', 'select')[0]?.columns).not.toContain('draft_payload')
    expect(fake.callsTo('cms_revisions', 'select')[0]?.columns).toContain('snapshot')
    expect(event.node.res.getHeader('cache-control')).toBe(CMS_PUBLIC_CACHE_CONTROL)
    expect(event.node.res.getHeader('access-control-allow-origin')).toBe('*')
  })

  it('caminho não publicado, desconhecido ou de outro site responde 404', async () => {
    const draft = createCmsEvent({
      path: '/api/public/cms/v1/sites/empresa-a/resolve',
      params: { siteKey: 'empresa-a' },
      query: { path: '/artigos/rascunho' },
      client: fake,
    })
    expect(await failureOf(run(resolvePublic, draft))).toEqual({ status: 404, code: 'not_found' })
    expect(draft.node.res.getHeader('cache-control')).toBe('no-store')
    assertNoDraftPayload()

    fake.calls = []
    expect(await failureOf(resolve('empresa-a', '/nao-existe'))).toEqual({ status: 404, code: 'not_found' })

    fake.calls = []
    expect(await failureOf(resolve('empresa-a', '/artigos/envenenado'))).toEqual({ status: 404, code: 'not_found' })
    expect(fake.callsTo('cms_documents', 'select').every(call =>
      call.filters.some(filter => filter.column === 'tenant_id' && filter.value === TENANT_A),
    )).toBe(true)
  })

  it('não entrega site inativo, chave desconhecida nem conteúdo de outro site', async () => {
    expect(await failureOf(resolve('site-suspenso', '/suspenso'))).toEqual({ status: 404, code: 'not_found' })
    expect(fake.callsTo('cms_documents')).toHaveLength(0)
    expect(fake.callsTo('cms_sites', 'select')[0]?.filters).toContainEqual({
      op: 'eq',
      column: 'status',
      value: 'active',
    })

    fake.calls = []
    expect(await failureOf(resolve('site-inexistente', '/artigos/artigo-publico'))).toEqual({ status: 404, code: 'not_found' })
    expect(fake.callsTo('cms_documents')).toHaveLength(0)

    const own = await resolve('empresa-a', '/artigos/artigo-publico')
    const other = await resolve('empresa-b', '/artigos/artigo-publico')
    expect(own.data).toMatchObject({ id: DOC_PUBLISHED, content: { title: 'Artigo publicado' } })
    expect(other.data).toMatchObject({ id: DOC_OTHER, content: { title: 'Artigo da empresa B' } })
    expect(JSON.stringify(own)).not.toContain('Artigo da empresa B')
    expect(JSON.stringify(other)).not.toContain('Rascunho secreto')
  })

  it('lista só publicações publicadas do site, sem rascunho nem corpo', async () => {
    const event = createCmsEvent({
      path: '/api/public/cms/v1/sites/empresa-a/publications',
      params: { siteKey: 'empresa-a' },
      client: fake,
    })
    const response = await run(listPublications, event)

    expect(response.data.map(item => item.id)).toEqual([DOC_PUBLISHED, DOC_NEWS])
    expect(response.nextCursor).toBeNull()
    expect(response.data[0]).toMatchObject({
      publicationType: 'article',
      path: '/artigos/artigo-publico',
      content: { title: 'Artigo publicado', slug: 'artigo-publico' },
    })
    expect(response.data[1]).toMatchObject({
      publicationType: 'news',
      content: { title: 'Notícia publicada' },
    })
    for (const item of response.data) {
      expect(item.content).not.toHaveProperty('body')
      expect(item.content).not.toHaveProperty('blocks')
    }
    expect(JSON.stringify(response)).not.toContain('Rascunho')
    expect(JSON.stringify(response)).not.toContain('não publicar')
    expect(JSON.stringify(response)).not.toContain('Retirado')
    expect(JSON.stringify(response)).not.toContain('English')
    assertNoDraftPayload()
    for (const call of fake.callsTo('cms_revisions', 'select'))
      expect(call.columns ?? '').not.toMatch(/(^|,\s*)snapshot(,|$)/)

    const scoped = fake.callsTo('cms_documents', 'select')
    expect(scoped.length).toBeGreaterThan(0)
    for (const call of scoped) {
      expect(call.filters).toEqual(expect.arrayContaining([
        { op: 'eq', column: 'site_id', value: SITE_A },
        { op: 'eq', column: 'tenant_id', value: TENANT_A },
        { op: 'eq', column: 'public_status', value: 'published' },
        { op: 'eq', column: 'kind', value: 'publication' },
        { op: 'is', column: 'deleted_at', value: null },
      ]))
    }

    fake.calls = []
    const other = await list('empresa-b')
    expect(other.data.map(item => item.id)).toEqual([DOC_OTHER])
    expect(JSON.stringify(other)).not.toContain('Artigo publicado')
  })
})
