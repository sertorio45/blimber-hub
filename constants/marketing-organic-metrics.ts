import type { OrganicMetricDef } from '~/types/marketing-organic-reports'

/**
 * Default organic metrics bundle — aligned with Meta Graph API Page / Instagram Insights.
 * @see https://developers.facebook.com/docs/graph-api/reference/page/insights
 * @see https://developers.facebook.com/docs/instagram-api/reference/ig-user/insights
 */
export const FACEBOOK_PAGE_ORGANIC_METRICS: OrganicMetricDef[] = [
  {
    key: 'page_media_view',
    label: 'Visualizações de mídia',
    format: 'integer',
    primary: true,
    description: 'Total de vezes que mídia da Página foi exibida (substitui page_impressions).',
  },
  {
    key: 'page_total_media_view_unique',
    label: 'Alcance',
    format: 'integer',
    primary: true,
    description: 'Pessoas únicas que viram mídia da Página.',
  },
  {
    key: 'page_post_engagements',
    label: 'Engajamentos em publicações',
    format: 'integer',
    primary: true,
    description: 'Interações com publicações da Página no período.',
  },
  {
    key: 'page_follows',
    label: 'Seguidores',
    format: 'integer',
    snapshot: true,
    description: 'Total de seguidores da Página (valor no fim do período).',
  },
  {
    key: 'page_views_total',
    label: 'Visualizações da Página',
    format: 'integer',
    description: 'Visualizações do perfil e abas da Página.',
  },
]

export const INSTAGRAM_ORGANIC_METRICS: OrganicMetricDef[] = [
  {
    key: 'reach',
    label: 'Alcance',
    format: 'integer',
    primary: true,
    description: 'Contas únicas que viram mídia ou stories.',
  },
  {
    key: 'views',
    label: 'Visualizações',
    format: 'integer',
    primary: true,
    graphMetricType: 'total_value',
    description: 'Reproduções ou exibições de reels, posts e stories.',
  },
  {
    key: 'profile_views',
    label: 'Visualizações do perfil',
    format: 'integer',
    primary: true,
    graphMetricType: 'total_value',
    description: 'Usuários que visitaram o perfil comercial.',
  },
  {
    key: 'follower_count',
    label: 'Seguidores',
    format: 'integer',
    snapshot: true,
    description: 'Total de seguidores (valor no fim do período).',
  },
  {
    key: 'website_clicks',
    label: 'Cliques no site',
    format: 'integer',
    graphMetricType: 'total_value',
    description: 'Toques no link do site no perfil.',
  },
  {
    key: 'accounts_engaged',
    label: 'Contas engajadas',
    format: 'integer',
    graphMetricType: 'total_value',
    description: 'Contas que interagiram com o conteúdo no período.',
  },
]

export function organicMetricsForPlatform(platform: 'facebook' | 'instagram'): OrganicMetricDef[] {
  return platform === 'facebook' ? FACEBOOK_PAGE_ORGANIC_METRICS : INSTAGRAM_ORGANIC_METRICS
}

export function organicMetricApiNames(platform: 'facebook' | 'instagram'): string[] {
  return organicMetricsForPlatform(platform).map(m => m.key)
}

export function primaryOrganicMetrics(platform: 'facebook' | 'instagram'): OrganicMetricDef[] {
  return organicMetricsForPlatform(platform).filter(m => m.primary)
}

export function detailOrganicMetrics(platform: 'facebook' | 'instagram'): OrganicMetricDef[] {
  return organicMetricsForPlatform(platform).filter(m => !m.primary)
}

export interface OrganicMetricFetchGroup {
  metrics: string[]
  graphMetricType?: 'time_series' | 'total_value'
}

/** Graph API batching — Instagram mixes time-series and total_value metrics. */
export function organicMetricFetchGroups(platform: 'facebook' | 'instagram'): OrganicMetricFetchGroup[] {
  const defs = organicMetricsForPlatform(platform)
  if (platform === 'facebook') {
    return [{ metrics: defs.map(m => m.key), graphMetricType: 'time_series' }]
  }

  const timeSeries = defs.filter(m => m.graphMetricType !== 'total_value').map(m => m.key)
  const totalValue = defs.filter(m => m.graphMetricType === 'total_value').map(m => m.key)
  const groups: OrganicMetricFetchGroup[] = []
  if (timeSeries.length)
    groups.push({ metrics: timeSeries, graphMetricType: 'time_series' })
  if (totalValue.length)
    groups.push({ metrics: totalValue, graphMetricType: 'total_value' })
  return groups
}
