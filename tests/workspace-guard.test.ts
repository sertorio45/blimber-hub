import type { NavGroup, NavLink } from '~/types/nav'

import { describe, expect, it } from 'vitest'
import { navMenu, navMenuOrganization } from '~/constants/menus'
import { canEnterWorkspaceRoute, matchesNavAudience } from '~/utils/workspace-guard'

const agencyOwnerScope = {
  capabilities: [
    'organization.read',
    'organization.manage',
    'organization.members.manage',
    'organization.team.manage',
    'organization.roles.read',
    'organization.tenants.read',
    'agency.clients.read',
  ],
  organizationType: 'agency' as const,
}

const directOwnerScope = {
  ...agencyOwnerScope,
  organizationType: 'direct' as const,
}

function findOrgChild(groupTitle: string, link: string): NavLink {
  const group = navMenuOrganization[0]!.items.find(
    (item): item is NavGroup => 'children' in item && item.title === groupTitle,
  )!
  return group.children.find(child => child.link === link)!
}

describe('guarda de rotas por tipo de organização', () => {
  it('cliente direto não acessa páginas exclusivas de agência', () => {
    const agencyOnly = { organizationTypes: ['agency'] as const }

    expect(canEnterWorkspaceRoute(agencyOwnerScope, agencyOnly)).toBe(true)
    expect(canEnterWorkspaceRoute(directOwnerScope, agencyOnly)).toBe(false)
  })

  it('a carteira de clientes fica invisível para cliente direto', () => {
    const clients = findOrgChild('Agência', '/agency/clients')

    const requirements = {
      capability: clients.capability ?? null,
      organizationTypes: clients.organizationTypes ?? null,
    }

    expect(canEnterWorkspaceRoute(agencyOwnerScope, requirements)).toBe(true)
    expect(canEnterWorkspaceRoute(directOwnerScope, requirements)).toBe(false)
  })

  it('a equipe da organização fica visível para agência e cliente direto', () => {
    const team = findOrgChild('Organização', '/organization/team')

    const requirements = {
      capability: team.capability ?? null,
      organizationTypes: team.organizationTypes ?? null,
    }

    expect(canEnterWorkspaceRoute(agencyOwnerScope, requirements)).toBe(true)
    expect(canEnterWorkspaceRoute(directOwnerScope, requirements)).toBe(true)
  })

  it('menu da agência não duplica rotas de marketing', () => {
    const agency = navMenuOrganization[0]!.items.find(
      (item): item is NavGroup => 'children' in item && item.title === 'Agência',
    )!
    const links = agency.children.map(child => child.link)
    expect(links.some(link => link.startsWith('/marketing'))).toBe(false)
    expect(links).toContain('/agency/clients')
    expect(links).toContain('/agency')
    expect(links).toContain('/agency/production')
  })

  it('capability ausente bloqueia a rota', () => {
    const collaboratorScope = {
      capabilities: ['organization.read', 'organization.tenants.read'],
      organizationType: 'agency' as const,
    }

    expect(canEnterWorkspaceRoute(collaboratorScope, {
      capability: 'organization.members.manage',
    })).toBe(false)
  })

  it('sem organização resolvida nenhuma rota tipada é liberada', () => {
    expect(canEnterWorkspaceRoute(
      { capabilities: ['organization.read'], organizationType: null },
      { organizationTypes: ['agency'] },
    )).toBe(false)
  })

  it('audience agency esconde itens do portal do cliente', () => {
    const clientScope = {
      capabilities: ['marketing.social.read'],
      organizationType: 'direct' as const,
      isClientExperience: true,
    }
    const agencyScope = {
      capabilities: ['marketing.social.read', 'agency.clients.read'],
      organizationType: 'agency' as const,
      isClientExperience: false,
    }

    expect(canEnterWorkspaceRoute(clientScope, { audience: 'agency' })).toBe(false)
    expect(canEnterWorkspaceRoute(agencyScope, { audience: 'agency' })).toBe(true)
    expect(canEnterWorkspaceRoute(clientScope, { audience: 'both' })).toBe(true)
  })

  it('menu marketing MVP esconde pacotes e marca ops de agência', () => {
    const marketing = navMenu
      .flatMap(section => section.items)
      .find((item): item is NavGroup => 'children' in item && item.title === 'Marketing')!

    function flattenLeaves(children: NavLink[]): NavLink[] {
      return children.flatMap(child =>
        child.children?.length ? flattenLeaves(child.children) : [child],
      )
    }

    const leaves = flattenLeaves(marketing.children)
    const packages = leaves.find(child => child.link === '/marketing/packages')
    const calendar = leaves.find(child => child.link === '/marketing/calendar')!
    const approvals = leaves.find(child => child.link === '/marketing/approvals')!
    const production = leaves.find(child => child.link === '/marketing/production')!
    const content = leaves.find(child => child.link === '/marketing/content')!
    const publishing = leaves.find(child => child.link === '/marketing/publishing')!
    const brand = leaves.find(child => child.link === '/marketing/brand')!
    const reportsGroup = marketing.children.find(child => child.title === 'Relatórios')
    const reportsAds = leaves.find(child => child.link === '/marketing/reports/ads')!
    const reportsAnalytics = leaves.find(child => child.link === '/marketing/reports/analytics')!
    const reportsSocial = leaves.find(child => child.link === '/marketing/reports/social')!
    const editorialCampaigns = leaves.find(child => child.link === '/marketing/campaigns')!
    const settings = marketing.children.find(child => child.title === 'Configurações')
    const socialAccounts = leaves.find(child => child.link === '/settings/integrations')
    const adAccounts = leaves.find(child => child.link === '/marketing/settings/ad-accounts')
    const marketingIntegrations = leaves.find(child => child.link === '/marketing/settings/integrations')
    const topTitles = marketing.children.map(child => child.title)

    expect(packages).toBeUndefined()
    expect(approvals.audience).toBe('agency')
    expect(production.audience).toBe('agency')
    expect(publishing.audience).toBe('agency')
    expect(brand.audience).toBe('agency')
    expect(brand.title).toBe('Marca')
    expect(content.clientTitle).toBe('Publicações')
    expect(content.title).toBe('Conteúdos')
    expect(publishing.title).toBe('Publicações')
    expect(calendar.title).toBe('Calendário')
    expect(editorialCampaigns.title).toBe('Campanhas editoriais')
    expect(reportsGroup?.keepGroup).toBe(true)
    expect(reportsGroup?.defaultExpanded).toBe(false)
    expect(reportsGroup?.link).toBe('/marketing/reports')
    expect(reportsGroup?.children?.map(child => child.title)).toEqual([
      'Anúncios',
      'Google Analytics',
      'Redes sociais',
    ])
    expect(reportsAds.title).toBe('Anúncios')
    expect(reportsAnalytics.title).toBe('Google Analytics')
    expect(reportsSocial.title).toBe('Redes sociais')
    expect(settings?.keepGroup).toBe(true)
    expect(settings?.defaultExpanded).toBe(false)
    expect(settings?.link).toBe('/marketing/settings')
    expect(settings?.children?.map(child => child.title)).toEqual(['Marca'])
    expect(socialAccounts).toBeUndefined()
    expect(adAccounts).toBeUndefined()
    expect(marketingIntegrations).toBeUndefined()
    expect(topTitles).toEqual([
      'Visão Geral',
      'Planejamento',
      'Conteúdos',
      'Produção',
      'Aprovações',
      'Biblioteca',
      'Publicações',
      'Relatórios',
      'Ads',
      'Configurações',
    ])

    const adsSubmenu = marketing.children.find(child => child.title === 'Ads')
    expect(adsSubmenu?.link).toBe('/marketing/ads')
    expect(adsSubmenu?.keepGroup).toBe(true)
    expect(adsSubmenu?.defaultExpanded).toBe(false)
    expect(adsSubmenu?.children?.map(child => child.title)).toEqual([
      'Visão Geral',
      'Campanhas',
      'Criativos',
    ])
    expect(adsSubmenu?.children?.map(child => child.link)).toEqual([
      '/marketing/ads',
      '/marketing/ads/campaigns',
      '/marketing/ads/creatives',
    ])
    expect(leaves.find(leaf => leaf.link === '/marketing/ads/creatives')?.badge).toBe('Em evolução')

    expect(leaves.filter(leaf => leaf.link?.startsWith('/marketing/ads')).map(leaf => leaf.link)).toEqual([
      '/marketing/ads',
      '/marketing/ads/campaigns',
      '/marketing/ads/creatives',
    ])
    expect(leaves.filter(leaf => leaf.link?.startsWith('/marketing/reports')).map(leaf => leaf.link)).toEqual([
      '/marketing/reports/ads',
      '/marketing/reports/analytics',
      '/marketing/reports/social',
    ])
    expect(leaves.some(leaf => leaf.link?.startsWith('/ads'))).toBe(false)
    expect(leaves.some(leaf => leaf.link === '/ads/meta' || leaf.link === '/ads/google')).toBe(false)

    const adsProduct = navMenu
      .flatMap(section => section.items)
      .find((item): item is NavGroup => 'children' in item && item.title === 'Ads' && item.link !== '/marketing/ads')
    expect(adsProduct).toBeUndefined()
  })
})

describe('matchesNavAudience', () => {
  it('defaults to both when audience is omitted', () => {
    expect(matchesNavAudience(undefined, true)).toBe(true)
    expect(matchesNavAudience(null, false)).toBe(true)
  })

  it('client audience only for client experience', () => {
    expect(matchesNavAudience('client', true)).toBe(true)
    expect(matchesNavAudience('client', false)).toBe(false)
  })

  it('client portal marketing whitelist is exactly the basic surface', async () => {
    const { CLIENT_PORTAL_MARKETING_LINKS, isClientPortalMarketingLink } = await import('~/constants/marketing-audience')
    expect([...CLIENT_PORTAL_MARKETING_LINKS]).toEqual([
      '/marketing',
      '/marketing/calendar',
      '/marketing/campaigns',
      '/marketing/content',
      '/marketing/media',
      '/marketing/reports',
      '/marketing/ads',
      '/marketing/settings',
      '/settings/integrations',
      '/marketing/posts',
      '/marketing/library',
    ])
    expect(isClientPortalMarketingLink('/marketing/packages')).toBe(false)
    expect(isClientPortalMarketingLink('/marketing/content')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/content/new')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/posts')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/posts/new')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/production')).toBe(false)
    expect(isClientPortalMarketingLink('/marketing/production/tasks')).toBe(false)
    expect(isClientPortalMarketingLink('/marketing/publishing')).toBe(false)
    expect(isClientPortalMarketingLink('/marketing/brand')).toBe(false)
    expect(isClientPortalMarketingLink('/marketing/brand-guide')).toBe(false)
    expect(isClientPortalMarketingLink('/marketing/calendar')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/ads')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/ads/campaigns')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/ads/creatives')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/ads/reports')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/reports/ads')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/reports/analytics')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/reports/social')).toBe(true)
    expect(isClientPortalMarketingLink('/settings/integrations')).toBe(true)
    expect(isClientPortalMarketingLink('/settings/integrations/meta-capi')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/settings/ad-accounts')).toBe(true)
    expect(isClientPortalMarketingLink('/marketing/settings/integrations')).toBe(true)
  })

  it('client portal Ads whitelist allows the product shell', async () => {
    const { CLIENT_PORTAL_ADS_LINKS, isClientPortalAdsLink } = await import('~/constants/marketing-audience')
    expect([...CLIENT_PORTAL_ADS_LINKS]).toEqual([
      '/ads',
      '/ads/meta',
      '/ads/google',
      '/ads/analytics',
      '/ads/campaigns',
      '/ads/creatives',
      '/ads/reports',
      '/ads/integrations',
      '/ads/settings',
    ])
    expect(isClientPortalAdsLink('/ads')).toBe(true)
    expect(isClientPortalAdsLink('/ads/')).toBe(true)
    expect(isClientPortalAdsLink('/ads/meta')).toBe(true)
    expect(isClientPortalAdsLink('/ads/creatives')).toBe(true)
    expect(isClientPortalAdsLink('/ads/reports')).toBe(true)
    expect(isClientPortalAdsLink('/ads/settings')).toBe(true)
    expect(isClientPortalAdsLink('/marketing/reports')).toBe(false)
  })
})
