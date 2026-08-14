import type { NavLink } from '~/types/nav'
import { describe, expect, it } from 'vitest'
import { flattenModuleNavItems } from '~/utils/nav-flatten'

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
          { title: 'Contas sociais', link: '/settings/integrations' },
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
