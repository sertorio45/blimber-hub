import type { NavGroup, NavLink } from '~/types/nav'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it, vi } from 'vitest'

import { navMenu } from '~/constants/menus'
import {
  ASSIGNABLE_MODULE_SLUGS,
  COMMERCIAL_MODULE_SLUGS,
  expandModuleAliases,
  expandTenantModuleRows,
  hasModuleEntitlement,
  MODULE_META,
  normalizeCommercialModuleSlug,
  resolveModuleSlugFromPath,
  resolveTenantModuleSlugs,
} from '~/constants/modules'
import {
  AGENCY_ROLE_CAPABILITIES,
  CMS_LEGACY_ROLE_DEFAULTS,
  CMS_ROLE_PRESETS,
  DIRECT_ROLE_CAPABILITIES,
} from '~/constants/organization-role-matrix'
import { CMS_CAPABILITIES } from '~/constants/workspace'
import { resolveEffectiveCapabilities } from '~/server/utils/resolve-capabilities'
import { parseTenantModuleNames } from '~/server/utils/tenant-modules'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'
import { createFakeSupabaseClient } from './helpers/fake-supabase'
import { createFakeEvent, createWorkspaceDatabase, ids } from './helpers/workspace-fixture'

const ROLE_ID = '00000000-0000-4000-8000-00000000c001'

function databaseWithRole(capabilities: string[]) {
  const db = createWorkspaceDatabase()
  db.organization_roles = [{ id: ROLE_ID, organization_id: ids.orgAgencyA, slug: 'owner' }]
  db.organization_role_capabilities = capabilities.map(capability => ({
    role_id: ROLE_ID,
    capability,
    allowed: true,
  }))
  return db
}

async function resolveWithModules(modules: string[]) {
  return resolveEffectiveCapabilities({
    client: createFakeSupabaseClient(databaseWithRole([
      'organization.read',
      'marketing.social.read',
      ...CMS_CAPABILITIES,
    ])),
    userId: ids.agencyOwner,
    organizationId: ids.orgAgencyA,
    tenantId: ids.tenantClientA1,
    organizationRoleId: ROLE_ID,
    modules: modules as Parameters<typeof resolveEffectiveCapabilities>[0]['modules'],
    enforceModules: true,
  })
}

function withOnlyModule(moduleName: string) {
  const db = createWorkspaceDatabase()
  db.tenant_modules = db.tenant_modules!.filter(row => row.tenant_id !== ids.tenantClientA1)
  db.tenant_modules.push({ tenant_id: ids.tenantClientA1, module_name: moduleName, is_active: true })
  db.role_capabilities!.push(
    ...CMS_LEGACY_ROLE_DEFAULTS.cliente.map(capability => ({ role: 'cliente', capability, tenant_id: null })),
  )
  return db
}

describe('registro do módulo comercial cms', () => {
  it('cms é comercial e atribuível; article fica como alias técnico', () => {
    expect(MODULE_META.cms).toMatchObject({ slug: 'cms', title: 'CMS', basePath: '/cms' })
    expect(COMMERCIAL_MODULE_SLUGS).toContain('cms')
    expect(COMMERCIAL_MODULE_SLUGS).not.toContain('article')
    expect(ASSIGNABLE_MODULE_SLUGS).toContain('cms')
    expect(ASSIGNABLE_MODULE_SLUGS).not.toContain('article')
  })

  it('article e cms se equivalem para acesso', () => {
    expect(normalizeCommercialModuleSlug('article')).toBe('cms')
    expect(expandModuleAliases(['article'])).toEqual(expect.arrayContaining(['article', 'cms']))
    expect(expandModuleAliases(['cms'])).toEqual(expect.arrayContaining(['article', 'cms']))
    expect(hasModuleEntitlement(['article'], 'cms')).toBe(true)
    expect(hasModuleEntitlement(['cms'], 'article')).toBe(true)
    expect(hasModuleEntitlement(['all'], 'cms')).toBe(true)
    expect(hasModuleEntitlement(['crm'], 'cms')).toBe(false)
    expect(resolveTenantModuleSlugs(['article'])).toEqual(['cms'])
    expect(resolveTenantModuleSlugs(['article', 'cms'])).toEqual(['cms'])
    expect(expandTenantModuleRows([{ id: 'r1', module_name: 'article', is_active: true }]))
      .toEqual([{ id: 'derived-cms', module_name: 'cms', is_active: true }])
  })

  it('rotas legadas /articles abrem o shell do CMS', () => {
    expect(resolveModuleSlugFromPath('/cms/pages')).toBe('cms')
    expect(resolveModuleSlugFromPath('/articles')).toBe('cms')
    expect(resolveModuleSlugFromPath('/articles/new')).toBe('cms')
  })

  it('payloads legados com article são normalizados para cms', () => {
    expect(parseTenantModuleNames(['article', 'crm'])).toEqual(['cms', 'crm'])
    expect(parseTenantModuleNames(['article', 'cms'])).toEqual(['cms'])
  })
})

describe('gate de capabilities por módulo', () => {
  it('tenant só com cms mantém cms.* e perde marketing.social.*', async () => {
    const resolved = await resolveWithModules(['cms'])
    expect(resolved.capabilities).toEqual(expect.arrayContaining([...CMS_CAPABILITIES]))
    expect(resolved.capabilities).not.toContain('marketing.social.read')
    expect(resolved.capabilities).toContain('organization.read')
  })

  it('tenant só com article recebe cms.*', async () => {
    const resolved = await resolveWithModules(['article'])
    expect(resolved.capabilities).toContain('cms.read')
    expect(resolved.capabilities).toContain('cms.publish')
  })

  it('tenant sem cms nem article perde cms.*', async () => {
    const resolved = await resolveWithModules(['crm', 'marketing'])
    expect(resolved.capabilities.some(capability => capability.startsWith('cms.'))).toBe(false)
    expect(resolved.capabilities).toContain('marketing.social.read')
  })

  it('pacote all mantém tudo', async () => {
    const resolved = await resolveWithModules(['all'])
    expect(resolved.capabilities).toEqual(expect.arrayContaining([
      'organization.read',
      'marketing.social.read',
      ...CMS_CAPABILITIES,
    ]))
  })

  it('contexto de tenant com article libera o módulo cms e vice-versa', async () => {
    const articleEvent = createFakeEvent({ userId: ids.agencyOwner, role: 'cliente', db: withOnlyModule('article') })
    const articleContext = await requireWorkspaceContext(articleEvent, {
      organizationId: ids.orgAgencyA,
      tenantId: ids.tenantClientA1,
      module: 'cms',
    })
    expect(articleContext.modules).toEqual(expect.arrayContaining(['article', 'cms']))
    expect(articleContext.has('cms.read')).toBe(true)

    const cmsEvent = createFakeEvent({ userId: ids.agencyOwner, role: 'cliente', db: withOnlyModule('cms') })
    const cmsContext = await requireWorkspaceContext(cmsEvent, {
      organizationId: ids.orgAgencyA,
      tenantId: ids.tenantClientA1,
      module: 'article',
    })
    expect(cmsContext.modules).toContain('article')
  })
})

describe('module-access middleware', () => {
  let resolveApiPathModule: (path: string) => string | null

  beforeAll(async () => {
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    const middleware = await import('~/server/middleware/module-access')
    resolveApiPathModule = middleware.resolveApiPathModule
  })

  it('mapeia /api/cms e /api/articles para o módulo cms', () => {
    expect(resolveApiPathModule('/api/cms')).toBe('cms')
    expect(resolveApiPathModule('/api/cms/pages/1')).toBe('cms')
    expect(resolveApiPathModule('/api/articles')).toBe('cms')
    expect(resolveApiPathModule('/api/articles/42')).toBe('cms')
  })

  it('entrega pública e prefixos parecidos não passam pela checagem de módulo', () => {
    expect(resolveApiPathModule('/api/public/cms/pages/home')).toBeNull()
    expect(resolveApiPathModule('/api/public/cms')).toBeNull()
    expect(resolveApiPathModule('/api/cms-preview')).toBeNull()
  })

  it('mantém os demais módulos', () => {
    expect(resolveApiPathModule('/api/crm/leads')).toBe('crm')
    expect(resolveApiPathModule('/api/marketing/social')).toBe('marketing')
    expect(resolveApiPathModule('/api/whatsapp/conversations')).toBe('whatsapp')
  })
})

describe('menu do CMS', () => {
  const cms = navMenu
    .flatMap(section => section.items)
    .find((item): item is NavGroup => 'children' in item && item.title === MODULE_META.cms.title)

  function leaves(children: NavLink[]): NavLink[] {
    return children.flatMap(child => child.children?.length ? leaves(child.children) : [child])
  }

  it('existe um grupo CMS com o mesmo título do módulo', () => {
    expect(cms).toBeDefined()
  })

  it('contém os itens principais com capability cms.*', () => {
    const links = cms!.children.filter(child => !child.children?.length)
    expect(links.map(child => [child.title, child.link])).toEqual([
      ['Visão geral', '/cms'],
      ['Páginas', '/cms/pages'],
      ['Publicações', '/cms/publications'],
      ['Mídia', '/cms/media'],
      ['Configurações', '/cms/settings'],
    ])
    for (const link of links)
      expect(link.capability?.startsWith('cms.')).toBe(true)
  })

  it('mantém os artigos legados acessíveis dentro do CMS', () => {
    const legacy = leaves(cms!.children).filter(child => child.link.startsWith('/articles'))
    expect(legacy.map(child => child.link)).toEqual(['/articles', '/articles/new', '/articles/category', '/articles/tag'])
    const articlesGroup = navMenu
      .flatMap(section => section.items)
      .find(item => 'children' in item && item.title === 'Articles')
    expect(articlesGroup).toBeUndefined()
  })
})

describe('presets e defaults de cargos', () => {
  it('presets seguem a hierarquia Autor ⊂ Editor ⊂ Publicador ⊂ Administrador do site', () => {
    const [author, editor, publisher, siteAdmin] = CMS_ROLE_PRESETS
    expect(CMS_ROLE_PRESETS.map(preset => preset.name))
      .toEqual(['Autor CMS', 'Editor CMS', 'Publicador CMS', 'Administrador do site'])
    expect(editor!.capabilities).toEqual(expect.arrayContaining([...author!.capabilities]))
    expect(publisher!.capabilities).toEqual(expect.arrayContaining([...editor!.capabilities]))
    expect(siteAdmin!.capabilities).toEqual(expect.arrayContaining([...publisher!.capabilities]))
    expect(author!.capabilities).not.toContain('cms.publish')
    expect(editor!.capabilities).not.toContain('cms.publish')
    expect(editor!.capabilities).toContain('cms.navigation.manage')
    expect(publisher!.capabilities).toContain('cms.publish')
    expect([...siteAdmin!.capabilities].sort()).toEqual([...CMS_CAPABILITIES].sort())
  })

  it('atendente redige publicações sem publicar nem configurar', () => {
    const atendente = CMS_LEGACY_ROLE_DEFAULTS.atendente
    expect(atendente).toEqual(expect.arrayContaining([
      'cms.read',
      'cms.publications.create',
      'cms.publications.update',
      'cms.media.read',
      'cms.media.upload',
    ]))
    expect(atendente).not.toContain('cms.publish')
    expect(atendente).not.toContain('cms.settings.manage')
    expect([...CMS_LEGACY_ROLE_DEFAULTS.cliente].sort()).toEqual([...CMS_CAPABILITIES].sort())
  })

  it('proprietários recebem todo o CMS nos cargos de sistema', () => {
    for (const capability of CMS_CAPABILITIES) {
      expect(AGENCY_ROLE_CAPABILITIES.owner).toContain(capability)
      expect(DIRECT_ROLE_CAPABILITIES.owner).toContain(capability)
    }
    expect(AGENCY_ROLE_CAPABILITIES.social_media).not.toContain('cms.publish')
  })

  it('a migração semeia os mesmos presets e o alias no is_tenant_module_active', () => {
    const sql = readFileSync(
      fileURLToPath(new URL('../supabase/migrations/20261019110000_cms_module_entitlement.sql', import.meta.url)),
      'utf8',
    )
    for (const preset of CMS_ROLE_PRESETS) {
      expect(sql).toContain(`'${preset.name}', '${preset.slug}'`)
      expect(sql).toContain(preset.description)
    }
    for (const capability of CMS_CAPABILITIES)
      expect(sql).toContain(`'${capability}'`)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_tenant_module_active/)
    expect(sql).toMatch(/module_name IN \('cms', 'article'\)/)
  })
})
