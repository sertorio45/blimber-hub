import type { NavLink } from '~/types/nav'
import { describe, expect, it } from 'vitest'
import {
  flattenModuleNavItems,
  isNavGroupActive,
  resolveNavGroupOpen,
} from '~/utils/nav-flatten'

describe('flattenModuleNavItems', () => {
  it('flattens Planejamento and keeps Ads as a group', () => {
    const tree: NavLink[] = [
      { title: 'Visão Geral', link: '/marketing' },
      {
        title: 'Planejamento',
        link: '/marketing/calendar',
        children: [
          { title: 'Calendário', link: '/marketing/calendar' },
          { title: 'Campanhas editoriais', link: '/marketing/campaigns' },
        ],
      },
      { title: 'Relatórios orgânicos', link: '/marketing/reports' },
      {
        title: 'Ads',
        link: '/marketing/ads',
        keepGroup: true,
        children: [
          { title: 'Visão Geral', link: '/marketing/ads' },
          { title: 'Campanhas', link: '/marketing/ads/campaigns' },
          { title: 'Relatórios', link: '/marketing/ads/reports' },
        ],
      },
      {
        title: 'Configurações',
        link: '/marketing/settings',
        keepGroup: true,
        children: [
          { title: 'Marca', link: '/marketing/brand' },
        ],
      },
    ]

    const items = flattenModuleNavItems(tree)
    expect(items.map(item => item.title)).toEqual([
      'Visão Geral',
      'Calendário',
      'Campanhas editoriais',
      'Relatórios orgânicos',
      'Ads',
      'Configurações',
    ])
    expect(items.find(item => item.title === 'Ads')?.children?.map(child => child.title)).toEqual([
      'Visão Geral',
      'Campanhas',
      'Relatórios',
    ])
    expect(items.filter(item => item.title === 'Campanhas').length).toBe(0)
    expect(items.filter(item => item.title === 'Relatórios').length).toBe(0)
  })
})

describe('resolveNavGroupOpen', () => {
  const ads = {
    title: 'Ads',
    link: '/marketing/ads',
    defaultExpanded: false,
    children: [
      { title: 'Visão Geral', link: '/marketing/ads' },
      { title: 'Campanhas', link: '/marketing/ads/campaigns' },
    ],
  }

  const settings = {
    title: 'Configurações',
    link: '/marketing/settings',
    defaultExpanded: false,
    children: [
      { title: 'Marca', link: '/marketing/brand' },
    ],
  }

  it('keeps Ads and Configurações collapsed off their routes', () => {
    expect(resolveNavGroupOpen(ads, '/marketing')).toBe(false)
    expect(resolveNavGroupOpen(ads, '/marketing/campaigns')).toBe(false)
    expect(resolveNavGroupOpen(settings, '/marketing')).toBe(false)
    expect(resolveNavGroupOpen(settings, '/marketing/ads/campaigns')).toBe(false)
  })

  it('expands Ads only on /marketing/ads*', () => {
    expect(resolveNavGroupOpen(ads, '/marketing/ads')).toBe(true)
    expect(resolveNavGroupOpen(ads, '/marketing/ads/campaigns')).toBe(true)
    expect(isNavGroupActive(settings, '/marketing/ads')).toBe(false)
  })

  it('expands Configurações on Brand Center, not on global Integrações', () => {
    expect(resolveNavGroupOpen(settings, '/marketing/settings')).toBe(true)
    expect(resolveNavGroupOpen(settings, '/marketing/brand')).toBe(true)
    expect(resolveNavGroupOpen(settings, '/settings/integrations')).toBe(false)
    expect(resolveNavGroupOpen(settings, '/marketing/settings/ad-accounts')).toBe(true)
  })

  it('does not change CRM/WhatsApp small-group heuristic', () => {
    const crm = {
      title: 'CRM',
      children: [
        { title: 'Painel', link: '/crm/dashboard' },
        { title: 'Funil', link: '/crm/funnel' },
        { title: 'Empresas', link: '/crm/company' },
        { title: 'Contatos', link: '/crm/contacts' },
        { title: 'Reuniões', link: '/crm/meetings' },
        { title: 'Produtos', link: '/crm/products' },
        { title: 'Config', link: '/crm/config' },
      ],
    }
    const articles = {
      title: 'Articles',
      children: [
        { title: 'View', link: '/articles' },
        { title: 'Create', link: '/articles/new' },
        { title: 'Categories', link: '/articles/category' },
        { title: 'Tags', link: '/articles/tag' },
      ],
    }

    expect(resolveNavGroupOpen(crm, '/')).toBe(false)
    expect(resolveNavGroupOpen(crm, '/crm/contacts')).toBe(true)
    expect(resolveNavGroupOpen(articles, '/')).toBe(true)
    expect(resolveNavGroupOpen(articles, '/whatsapp/dashboard')).toBe(true)
  })
})
