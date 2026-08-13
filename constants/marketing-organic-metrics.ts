import type { OrganicMetricDef } from '~/types/marketing-organic-reports'

/**
 * Default organic metrics bundle — aligned with Meta Graph API Page / Instagram Insights.
 * @see https://developers.facebook.com/docs/graph-api/reference/page/insights
 * @see https://developers.facebook.com/docs/instagram-api/reference/ig-user/insights
 */
export const FACEBOOK_PAGE_ORGANIC_METRICS: OrganicMetricDef[] = [
  {
    key: 'page_impressions',
    label: 'Impressões',
    format: 'integer',
    primary: true,
    description: 'Total de vezes que o conteúdo da Página foi exibido.',
  },
  {
    key: 'page_impressions_unique',
    label: 'Alcance',
    format: 'integer',
    primary: true,
    description: 'Pessoas únicas que viram qualquer conteúdo da Página.',
  },
  {
    key: 'page_engaged_users',
    label: 'Usuários engajados',
    format: 'integer',
    primary: true,
    description: 'Pessoas que interagiram com a Página (curtidas, comentários, compartilhamentos etc.).',
  },
  {
    key: 'page_post_engagements',
    label: 'Engajamentos em publicações',
    format: 'integer',
    description: 'Interações com publicações da Página no período.',
  },
  {
    key: 'page_fans',
    label: 'Seguidores',
    format: 'integer',
    snapshot: true,
    description: 'Total de fãs/seguidores da Página (valor no fim do período).',
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
    key: 'impressions',
    label: 'Impressões',
    format: 'integer',
    primary: true,
    description: 'Total de vezes que mídia ou stories foram exibidos.',
  },
  {
    key: 'reach',
    label: 'Alcance',
    format: 'integer',
    primary: true,
    description: 'Contas únicas que viram mídia ou stories.',
  },
  {
    key: 'profile_views',
    label: 'Visualizações do perfil',
    format: 'integer',
    primary: true,
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
    key: 'email_contacts',
    label: 'Contatos por e-mail',
    format: 'integer',
    description: 'Toques no botão de e-mail do perfil.',
  },
  {
    key: 'website_clicks',
    label: 'Cliques no site',
    format: 'integer',
    description: 'Toques no link do site no perfil.',
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
