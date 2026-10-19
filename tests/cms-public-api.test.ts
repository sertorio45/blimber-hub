import type { CmsFakeCall, CmsFakeRow, CmsTestEvent } from './helpers/cms-fake-supabase'

import { beforeEach, describe, expect, it } from 'vitest'
import listPublications from '~/server/api/public/cms/v1/sites/[siteKey]/publications.get'
import resolvePublic from '~/server/api/public/cms/v1/sites/[siteKey]/resolve.get'
import sitemapJson from '~/server/api/public/cms/v1/sites/[siteKey]/sitemap.get'
import sitemapXml from '~/server/api/public/cms/v1/sites/[siteKey]/sitemap.xml.get'
import { CMS_PUBLIC_CACHE_CONTROL, CMS_ROBOTS_INDEX, CMS_ROBOTS_NOINDEX } from '~/server/utils/cms/http'
import { enqueueCmsInvalidation } from '~/server/utils/cms/outbox'
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
    settings: {
      menus: {
        header: [{ label: 'Início', href: '/' }],
        poisoned: [{ label: 'X', href: 'javascript:alert(1)' }],
      },
      theme: { colorPrimary: '#112233', webhookUrl: 'https://hooks.example/secret' },
      seo: { title: 'Empresa A', trackingId: 'UA-SECRET' },
      webhooks: { url: 'https://hooks.example/secret-out' },
    },
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
      route('/quem-somos', DOC_PAGE, { route_kind: 'redirect' }),
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
    expect(event.node.res.getHeader('vary')).toBe('Accept-Encoding')
    expect(event.node.res.getHeader('access-control-allow-origin')).toBe('*')
    expect(event.node.res.getHeader('access-control-allow-methods')).toBe('GET, OPTIONS')
    expect(event.node.res.getHeader('x-robots-tag')).toBe(CMS_ROBOTS_INDEX)
    expect(serialized).not.toContain('hooks.example')
    expect(serialized).not.toContain('UA-SECRET')
    expect(serialized).not.toContain('javascript:')
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
    expect(JSON.stringify(response)).not.toContain('hooks.example')
  })

  it('resolve devolve SEO, menus e tokens de tema sem o restante das settings', async () => {
    const revision = fake.db.cms_revisions!.find(row => row.id === REV_PUBLISHED)
    revision!.snapshot = {
      ...(revision!.snapshot as object),
      seo: { title: 'Título SEO', description: 'Descrição pública', noindex: true },
    }

    const event = createCmsEvent({
      path: '/api/public/cms/v1/sites/empresa-a/resolve',
      params: { siteKey: 'empresa-a' },
      query: { path: '/artigos/artigo-publico' },
      client: fake,
    })
    const response = await run(resolvePublic, event)
    const data = response.data as {
      seo?: { title?: string, noindex?: boolean }
      site?: { menus?: unknown, theme?: Record<string, string>, seo?: { title?: string } }
    }

    expect(data.seo).toEqual({ title: 'Título SEO', description: 'Descrição pública', noindex: true })
    expect(data.site).toMatchObject({
      siteKey: 'empresa-a',
      name: 'Empresa A',
      locale: 'pt-BR',
      menus: [{ key: 'header', items: [{ label: 'Início', href: '/' }] }],
      theme: { colorPrimary: '#112233' },
      seo: { title: 'Empresa A' },
    })
    expect(data.site?.theme).not.toHaveProperty('webhookUrl')
    expect(JSON.stringify(response)).not.toContain('hooks.example')
    expect(JSON.stringify(response)).not.toContain('UA-SECRET')
    expect(event.node.res.getHeader('x-robots-tag')).toBe(CMS_ROBOTS_NOINDEX)
    assertNoDraftPayload()
  })

  it('caminho antigo responde 301 e conteúdo retirado responde 410', async () => {
    const redirect = await resolve('empresa-a', '/quem-somos')
    expect(redirect.data).toMatchObject({
      redirect: { to: '/sobre', status: 301 },
      site: { siteKey: 'empresa-a' },
    })

    fake.calls = []
    const withdrawn = createCmsEvent({
      path: '/api/public/cms/v1/sites/empresa-a/resolve',
      params: { siteKey: 'empresa-a' },
      query: { path: '/artigos/retirado' },
      client: fake,
    })
    expect(await failureOf(run(resolvePublic, withdrawn))).toEqual({ status: 410, code: 'gone' })
    expect(withdrawn.node.res.getHeader('cache-control')).toBe('no-store')
    expect(withdrawn.node.res.getHeader('x-robots-tag')).toBe(CMS_ROBOTS_NOINDEX)
    assertNoDraftPayload()
    expect(fake.callsTo('cms_revisions')).toHaveLength(0)
  })

  it('sitemap lista só caminhos publicados e nunca seleciona draft_payload', async () => {
    const event = createCmsEvent({
      path: '/api/public/cms/v1/sites/empresa-a/sitemap',
      params: { siteKey: 'empresa-a' },
      client: fake,
    })
    const response = await run(sitemapJson, event)

    expect(response.data.map(entry => entry.path)).toEqual([
      '/artigos/artigo-publico',
      '/artigos/english',
      '/noticias/noticia',
      '/sobre',
    ])
    expect(response.data.find(entry => entry.path === '/artigos/english')?.locale).toBe('en')
    expect(JSON.stringify(response)).not.toContain('Rascunho')
    expect(JSON.stringify(response)).not.toContain('Retirado')
    expect(JSON.stringify(response)).not.toContain('hooks.example')
    assertNoDraftPayload()
    expect(event.node.res.getHeader('cache-control')).toBe(CMS_PUBLIC_CACHE_CONTROL)
    expect(event.node.res.getHeader('x-robots-tag')).toBe(CMS_ROBOTS_NOINDEX)

    fake.db.cms_site_domains = [{
      site_id: SITE_A,
      tenant_id: TENANT_A,
      hostname: 'www.empresa-a.test',
      environment: 'production',
      is_primary: true,
      verified_at: '2026-10-01T00:00:00.000Z',
      verification_token: 'token-secreto',
    }]
    fake.calls = []
    const xmlEvent = createCmsEvent({
      path: '/api/public/cms/v1/sites/empresa-a/sitemap.xml',
      params: { siteKey: 'empresa-a' },
      client: fake,
    })
    const xml = await run(sitemapXml, xmlEvent)
    expect(xml).toContain('<loc>https://www.empresa-a.test/sobre</loc>')
    expect(xml).not.toContain('token-secreto')
    expect(xml).not.toContain('/artigos/retirado')
    expect(xmlEvent.node.res.getHeader('content-type')).toBe('application/xml; charset=utf-8')
    expect(fake.callsTo('cms_site_domains', 'select')[0]?.columns).toBe('hostname, verified_at')
    assertNoDraftPayload()
  })

  it('a fila de invalidação não carrega rascunho', async () => {
    await enqueueCmsInvalidation(fake, {
      tenantId: TENANT_A,
      siteId: SITE_A,
      documentId: DOC_PUBLISHED,
      revisionId: REV_PUBLISHED,
      eventType: 'publish',
      payload: { path: '/artigos/artigo-publico' },
    })
    const row = fake.db.cms_event_outbox?.[0]
    expect(row).toMatchObject({
      tenant_id: TENANT_A,
      site_id: SITE_A,
      document_id: DOC_PUBLISHED,
      event_type: 'publish',
    })
    expect(JSON.stringify(row)).not.toContain('draft_payload')
    expect(JSON.stringify(row)).not.toContain('não publicar')
  })
})
