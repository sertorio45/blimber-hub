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
    const reports = leaves.find(child => child.link === '/marketing/reports')!
    const settings = leaves.find(child => child.link === '/marketing/settings')!
    const socialAccounts = leaves.find(child => child.link === '/settings/integrations')
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
    expect(reports.title).toBe('Relatórios')
    expect(settings.title).toBe('Configurações')
    // Contas sociais moved out of Marketing top-level → Configurações hub.
    expect(socialAccounts).toBeUndefined()
    expect(topTitles).toEqual([
      'Visão Geral',
      'Planejamento',
      'Conteúdos',
      'Produção',
      'Aprovações',
      'Biblioteca',
      'Marca',
      'Publicações',
      'Relatórios',
      'Configurações',
    ])
    // Paid Ads boards must not appear under Marketing.
    expect(leaves.some(leaf => leaf.link?.startsWith('/ads'))).toBe(false)
    expect(leaves.some(leaf => leaf.link === '/ads/meta' || leaf.link === '/ads/google')).toBe(false)
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
    expect(isClientPortalMarketingLink('/settings/integrations')).toBe(true)
    expect(isClientPortalMarketingLink('/settings/integrations/meta-capi')).toBe(true)
  })

  it('client portal Ads whitelist allows the product shell', async () => {
    const { CLIENT_PORTAL_ADS_LINKS, isClientPortalAdsLink } = await import('~/constants/marketing-audience')
    expect([...CLIENT_PORTAL_ADS_LINKS]).toEqual([
      '/ads',
      '/ads/meta',
      '/ads/google',
      '/ads/analytics',
      '/ads/campaigns',
      '/ads/reports',
      '/ads/integrations',
    ])
    expect(isClientPortalAdsLink('/ads')).toBe(true)
    expect(isClientPortalAdsLink('/ads/')).toBe(true)
    expect(isClientPortalAdsLink('/ads/meta')).toBe(true)
    expect(isClientPortalAdsLink('/ads/reports')).toBe(true)
    expect(isClientPortalAdsLink('/marketing/reports')).toBe(false)
  })
})
