import { describe, expect, it } from 'vitest'

import { cmsDocumentPayloadSchema } from '~/lib/cms/contracts'
import {
  allocateUniqueSlug,
  buildLegacyArticlePayload,
  disambiguateSiteKey,
  isLegacyPublished,
  legacyArticlePath,
  legacyArticleSlugBase,
  legacyArticleTitle,
  legacySiteKey,
  legacyTermSlugBase,
  parseLegacyMigrationReport,
  resolveLegacyMigrationScope,
} from '~/server/utils/cms/legacy-migration'

const TENANT = '00000000-0000-4000-8000-0000000000ab'

describe('legacy article mapping', () => {
  it('builds a site key from the tenant slug, then the name', () => {
    expect(legacySiteKey('Minha Empresa', 'Ignorado')).toBe('minha-empresa')
    expect(legacySiteKey('', 'São Paulo')).toBe('sao-paulo')
    expect(legacySiteKey('ab', '')).toBe('ab-site')
    expect(legacySiteKey('   ', '  ')).toBe('site')
    expect(legacySiteKey('Cliente_A', 'Nome')).toBe('cliente-a')
  })

  it('suffixes a taken site key with the tenant id', () => {
    const base = 'cliente-a'
    expect(disambiguateSiteKey(base, TENANT, new Set())).toBe(base)
    expect(disambiguateSiteKey(base, TENANT, new Set([base]))).toBe('cliente-a-00000000')
    expect(disambiguateSiteKey(base, TENANT, new Set([base, 'cliente-a-00000000'])))
      .toBe(`cliente-a-${TENANT.replace(/-/g, '')}`)
  })

  it('publishes only the stored status published', () => {
    expect(isLegacyPublished('published')).toBe(true)
    for (const status of ['draft', 'scheduled', 'arquived', null, undefined, ''])
      expect(isLegacyPublished(status)).toBe(false)
  })

  it('keeps HTML in body and does not invent a cover asset', () => {
    const html = '<p>Olá <strong>mundo</strong></p><script>keep</script>'
    const payload = buildLegacyArticlePayload({
      id: 12,
      title: '  Guia de uso  ',
      slug: 'guia-de-uso',
      content: html,
      metaDescription: '  Resumo do guia  ',
      termIds: ['00000000-0000-4000-8000-0000000000c1'],
      thumbUrl: 'https://cdn.example.com/capa.jpg',
    })

    expect(payload.body).toBe(html)
    expect(payload.blocks).toEqual([])
    expect(payload.cover).toBeNull()
    expect(payload.title).toBe('Guia de uso')
    expect(payload.excerpt).toBe('Resumo do guia')
    expect(payload.seo).toEqual({ title: 'Guia de uso', description: 'Resumo do guia' })
    expect(payload.termIds).toEqual(['00000000-0000-4000-8000-0000000000c1'])
    expect(cmsDocumentPayloadSchema.safeParse(payload).success).toBe(true)
    expect(payload).not.toHaveProperty('thumbUrl')
  })

  it('falls back when title and slug are empty and clips meta', () => {
    expect(legacyArticleTitle('   ', 7)).toBe('Artigo 7')
    expect(legacyArticleSlugBase('!!!', 'Ação rápida', 7)).toBe('acao-rapida')
    expect(legacyArticleSlugBase('', '', 7)).toBe('artigo-7')
    expect(legacyTermSlugBase(null, null, 4, 'category')).toBe('categoria-4')
    expect(legacyTermSlugBase(null, null, 4, 'tag')).toBe('tag-4')

    const payload = buildLegacyArticlePayload({
      id: 7,
      title: null,
      slug: 'artigo-7',
      content: null,
      metaDescription: 'x'.repeat(700),
    })
    expect(payload.title).toBe('Artigo 7')
    expect(payload.body).toBe('')
    expect(payload.excerpt).toHaveLength(600)
    expect(payload.seo.description).toHaveLength(320)
    expect(payload.cover).toBeNull()
  })

  it('disambiguates slugs with the legacy id and builds the article path', () => {
    const taken = new Set(['guia'])
    expect(allocateUniqueSlug('guia', 15, taken)).toBe('guia-15')
    taken.add('guia-15')
    expect(allocateUniqueSlug('guia', 15, taken)).toBe('guia-15-2')
    expect(allocateUniqueSlug('livre', 15, taken)).toBe('livre')
    expect(legacyArticlePath('guia-15')).toBe('/artigos/guia-15')
  })

  it('limits a non-staff caller to the selected company', () => {
    expect(resolveLegacyMigrationScope({
      isPlatformStaff: false,
      contextTenantId: TENANT,
      requestedTenantId: undefined,
    })).toEqual({ ok: true, tenantId: TENANT })

    expect(resolveLegacyMigrationScope({
      isPlatformStaff: false,
      contextTenantId: TENANT,
      requestedTenantId: null,
    }).ok).toBe(false)

    expect(resolveLegacyMigrationScope({
      isPlatformStaff: false,
      contextTenantId: null,
      requestedTenantId: undefined,
    })).toMatchObject({ ok: false, status: 400 })

    expect(resolveLegacyMigrationScope({
      isPlatformStaff: true,
      contextTenantId: TENANT,
      requestedTenantId: null,
    })).toEqual({ ok: true, tenantId: null })

    expect(resolveLegacyMigrationScope({
      isPlatformStaff: true,
      contextTenantId: null,
      requestedTenantId: undefined,
    })).toEqual({ ok: true, tenantId: null })
  })

  it('reads the snake_case report from the SQL function', () => {
    expect(parseLegacyMigrationReport({
      tenants: 2,
      sites_created: 1,
      sites_reused: 1,
      articles_published: 4,
      articles_drafted: 3,
    })).toMatchObject({
      tenants: 2,
      sitesCreated: 1,
      sitesReused: 1,
      articlesPublished: 4,
      articlesDrafted: 3,
      articlesSkippedNoTenant: 0,
    })
  })
})
