import type {
  AnalyticsReportTemplateId,
  GoogleAdsReportTemplateId,
  MarketingReportPlatform,
  MetaReportTemplateId,
  ReportMetricDef,
  ReportTemplateDef,
} from '~/types/marketing-reports'

const META_CORE: ReportMetricDef[] = [
  { key: 'spend', label: 'Investimento', format: 'currency', primary: true },
  { key: 'results', label: 'Resultados', format: 'decimal', primary: true },
  { key: 'cost_per_result', label: 'Custo / resultado', format: 'currency', primary: true, muted: true },
]

const META_REACH_DETAIL: ReportMetricDef[] = [
  { key: 'reach', label: 'Alcance', format: 'integer' },
  { key: 'impressions', label: 'Impressões', format: 'integer' },
  { key: 'clicks', label: 'Cliques', format: 'integer' },
  { key: 'ctr', label: 'CTR', format: 'percent' },
  { key: 'cpc', label: 'CPC', format: 'currency', muted: true },
  { key: 'cpm', label: 'CPM', format: 'currency', muted: true },
]

export const META_REPORT_TEMPLATES: ReportTemplateDef[] = [
  {
    id: 'overview',
    platform: 'meta',
    label: 'Visão geral',
    description: 'KPIs consolidados da conta de anúncios (Insights API).',
    metrics: [
      ...META_CORE,
      ...META_REACH_DETAIL,
      { key: 'roas', label: 'ROAS', format: 'roas', muted: true },
    ],
    meta: {
      resultActionGroups: ['messaging', 'whatsapp', 'lead', 'purchase', 'complete_registration'],
    },
  },
  {
    id: 'whatsapp',
    platform: 'meta',
    label: 'WhatsApp / Mensagens',
    description:
      'Campanhas Click-to-WhatsApp e mensagens (OUTCOME_ENGAGEMENT / conversas). Métricas via actions de messaging.',
    metrics: [
      { key: 'results', label: 'Conversas iniciadas', format: 'decimal', primary: true },
      { key: 'cost_per_result', label: 'Custo / conversa', format: 'currency', primary: true, muted: true },
      { key: 'spend', label: 'Investimento', format: 'currency', primary: true },
      { key: 'reach', label: 'Alcance', format: 'integer' },
      { key: 'impressions', label: 'Impressões', format: 'integer' },
      { key: 'clicks', label: 'Cliques', format: 'integer' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
      { key: 'cpc', label: 'CPC', format: 'currency', muted: true },
    ],
    meta: {
      resultActionGroups: ['messaging', 'whatsapp'],
      objectives: [
        'OUTCOME_ENGAGEMENT',
        'OUTCOME_TRAFFIC',
        'OUTCOME_LEADS',
        'OUTCOME_SALES',
        'MESSAGES',
        'CONVERSIONS',
      ],
    },
  },
  {
    id: 'ecommerce',
    platform: 'meta',
    label: 'Ecommerce / Vendas',
    description: 'Objetivo de vendas (OUTCOME_SALES). Prioriza compras, valor e ROAS (purchase_roas).',
    metrics: [
      { key: 'roas', label: 'ROAS', format: 'roas', primary: true },
      { key: 'results', label: 'Compras', format: 'decimal', primary: true },
      { key: 'spend', label: 'Investimento', format: 'currency', primary: true },
      { key: 'cost_per_result', label: 'Custo / compra', format: 'currency', muted: true },
      { key: 'impressions', label: 'Impressões', format: 'integer' },
      { key: 'clicks', label: 'Cliques', format: 'integer' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
      { key: 'cpc', label: 'CPC', format: 'currency', muted: true },
      { key: 'cpm', label: 'CPM', format: 'currency', muted: true },
    ],
    meta: {
      resultActionGroups: ['purchase'],
      objectives: ['OUTCOME_SALES', 'PRODUCT_CATALOG_SALES', 'CONVERSIONS'],
    },
  },
  {
    id: 'engagement',
    platform: 'meta',
    label: 'Engajamento',
    description: 'Engajamento de publicação/página (OUTCOME_ENGAGEMENT) via actions de engajamento.',
    metrics: [
      { key: 'results', label: 'Engajamentos', format: 'decimal', primary: true },
      { key: 'cost_per_result', label: 'Custo / engajamento', format: 'currency', primary: true, muted: true },
      { key: 'spend', label: 'Investimento', format: 'currency', primary: true },
      { key: 'reach', label: 'Alcance', format: 'integer' },
      { key: 'impressions', label: 'Impressões', format: 'integer' },
      { key: 'cpm', label: 'CPM', format: 'currency', muted: true },
      { key: 'ctr', label: 'CTR', format: 'percent' },
    ],
    meta: {
      resultActionGroups: ['post_engagement', 'page_engagement', 'video_view', 'like', 'comment', 'post'],
      objectives: ['OUTCOME_ENGAGEMENT', 'POST_ENGAGEMENT', 'VIDEO_VIEWS'],
    },
  },
  {
    id: 'traffic',
    platform: 'meta',
    label: 'Tráfego',
    description: 'Visitas e cliques no link (OUTCOME_TRAFFIC / landing_page_view).',
    metrics: [
      { key: 'results', label: 'Visualizações de destino', format: 'decimal', primary: true },
      { key: 'clicks', label: 'Cliques', format: 'integer', primary: true },
      { key: 'cost_per_result', label: 'Custo / resultado', format: 'currency', primary: true, muted: true },
      { key: 'spend', label: 'Investimento', format: 'currency' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
      { key: 'cpc', label: 'CPC', format: 'currency', muted: true },
      { key: 'impressions', label: 'Impressões', format: 'integer' },
      { key: 'reach', label: 'Alcance', format: 'integer' },
    ],
    meta: {
      resultActionGroups: ['landing_page_view', 'link_click'],
      objectives: ['OUTCOME_TRAFFIC', 'LINK_CLICKS', 'TRAFFIC'],
    },
  },
  {
    id: 'leads',
    platform: 'meta',
    label: 'Leads',
    description: 'Geração de leads (OUTCOME_LEADS) e eventos lead da Pixel/CAPI.',
    metrics: [
      { key: 'results', label: 'Leads', format: 'decimal', primary: true },
      { key: 'cost_per_result', label: 'Custo / lead', format: 'currency', primary: true, muted: true },
      { key: 'spend', label: 'Investimento', format: 'currency', primary: true },
      { key: 'clicks', label: 'Cliques', format: 'integer' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
      { key: 'cpc', label: 'CPC', format: 'currency', muted: true },
      { key: 'impressions', label: 'Impressões', format: 'integer' },
      { key: 'reach', label: 'Alcance', format: 'integer' },
    ],
    meta: {
      resultActionGroups: ['lead', 'complete_registration', 'submit_application'],
      objectives: ['OUTCOME_LEADS', 'LEAD_GENERATION'],
    },
  },
  {
    id: 'awareness',
    platform: 'meta',
    label: 'Reconhecimento',
    description: 'Alcance e impressões (OUTCOME_AWARENESS) — foco em cobertura, não em conversão.',
    metrics: [
      { key: 'reach', label: 'Alcance', format: 'integer', primary: true },
      { key: 'impressions', label: 'Impressões', format: 'integer', primary: true },
      { key: 'cpm', label: 'CPM', format: 'currency', primary: true, muted: true },
      { key: 'spend', label: 'Investimento', format: 'currency' },
      { key: 'clicks', label: 'Cliques', format: 'integer' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
      { key: 'results', label: 'Resultados', format: 'decimal' },
    ],
    meta: {
      resultActionGroups: ['reach', 'video_view'],
      objectives: ['OUTCOME_AWARENESS', 'BRAND_AWARENESS', 'REACH'],
    },
  },
]

export const GOOGLE_ADS_REPORT_TEMPLATES: ReportTemplateDef[] = [
  {
    id: 'overview',
    platform: 'google_ads',
    label: 'Visão geral',
    description: 'Todas as campanhas da conta Google Ads no período.',
    metrics: [
      { key: 'cost', label: 'Custo', format: 'currency', primary: true },
      { key: 'conversions', label: 'Conversões', format: 'decimal', primary: true },
      { key: 'cost_per_conversion', label: 'Custo / conversão', format: 'currency', primary: true, muted: true },
      { key: 'impressions', label: 'Impressões', format: 'integer' },
      { key: 'clicks', label: 'Cliques', format: 'integer' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
      { key: 'cpc', label: 'CPC médio', format: 'currency', muted: true },
      { key: 'conversions_value', label: 'Valor das conversões', format: 'currency' },
      { key: 'roas', label: 'ROAS', format: 'roas', muted: true },
    ],
    googleAds: { channelTypes: [] },
  },
  {
    id: 'search',
    platform: 'google_ads',
    label: 'Pesquisa (Search)',
    description: 'Campanhas SEARCH — intenção alta, foco em cliques e conversões.',
    metrics: [
      { key: 'clicks', label: 'Cliques', format: 'integer', primary: true },
      { key: 'conversions', label: 'Conversões', format: 'decimal', primary: true },
      { key: 'cost_per_conversion', label: 'Custo / conversão', format: 'currency', primary: true, muted: true },
      { key: 'cost', label: 'Custo', format: 'currency' },
      { key: 'impressions', label: 'Impressões', format: 'integer' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
      { key: 'cpc', label: 'CPC médio', format: 'currency', muted: true },
      { key: 'conversions_value', label: 'Valor das conversões', format: 'currency' },
    ],
    googleAds: { channelTypes: ['SEARCH'] },
  },
  {
    id: 'performance_max',
    platform: 'google_ads',
    label: 'Performance Max',
    description: 'Campanhas PERFORMANCE_MAX — conversões e valor em redes misturadas.',
    metrics: [
      { key: 'conversions', label: 'Conversões', format: 'decimal', primary: true },
      { key: 'conversions_value', label: 'Valor das conversões', format: 'currency', primary: true },
      { key: 'roas', label: 'ROAS', format: 'roas', primary: true },
      { key: 'cost', label: 'Custo', format: 'currency' },
      { key: 'cost_per_conversion', label: 'Custo / conversão', format: 'currency', muted: true },
      { key: 'impressions', label: 'Impressões', format: 'integer' },
      { key: 'clicks', label: 'Cliques', format: 'integer' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
    ],
    googleAds: { channelTypes: ['PERFORMANCE_MAX'] },
  },
  {
    id: 'shopping',
    platform: 'google_ads',
    label: 'Shopping / Ecommerce',
    description: 'Campanhas SHOPPING — produtos e conversões de venda.',
    metrics: [
      { key: 'conversions', label: 'Conversões', format: 'decimal', primary: true },
      { key: 'conversions_value', label: 'Valor das conversões', format: 'currency', primary: true },
      { key: 'roas', label: 'ROAS', format: 'roas', primary: true },
      { key: 'cost', label: 'Custo', format: 'currency' },
      { key: 'clicks', label: 'Cliques', format: 'integer' },
      { key: 'impressions', label: 'Impressões', format: 'integer' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
      { key: 'cpc', label: 'CPC médio', format: 'currency', muted: true },
    ],
    googleAds: { channelTypes: ['SHOPPING'] },
  },
  {
    id: 'demand_gen',
    platform: 'google_ads',
    label: 'Demand Gen',
    description: 'Campanhas DEMAND_GEN (YouTube, Discover, Gmail).',
    metrics: [
      { key: 'impressions', label: 'Impressões', format: 'integer', primary: true },
      { key: 'conversions', label: 'Conversões', format: 'decimal', primary: true },
      { key: 'cost', label: 'Custo', format: 'currency', primary: true },
      { key: 'clicks', label: 'Cliques', format: 'integer' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
      { key: 'cpc', label: 'CPC médio', format: 'currency', muted: true },
      { key: 'cost_per_conversion', label: 'Custo / conversão', format: 'currency', muted: true },
      { key: 'conversions_value', label: 'Valor das conversões', format: 'currency' },
    ],
    googleAds: { channelTypes: ['DEMAND_GEN'] },
  },
  {
    id: 'display',
    platform: 'google_ads',
    label: 'Display',
    description: 'Campanhas DISPLAY — alcance e remarketing na rede de display.',
    metrics: [
      { key: 'impressions', label: 'Impressões', format: 'integer', primary: true },
      { key: 'clicks', label: 'Cliques', format: 'integer', primary: true },
      { key: 'cost', label: 'Custo', format: 'currency', primary: true },
      { key: 'ctr', label: 'CTR', format: 'percent' },
      { key: 'cpc', label: 'CPC médio', format: 'currency', muted: true },
      { key: 'conversions', label: 'Conversões', format: 'decimal' },
      { key: 'cost_per_conversion', label: 'Custo / conversão', format: 'currency', muted: true },
    ],
    googleAds: { channelTypes: ['DISPLAY'] },
  },
  {
    id: 'local',
    platform: 'google_ads',
    label: 'Local',
    description: 'Campanhas LOCAL / LOCAL_SERVICES para negócios físicos.',
    metrics: [
      { key: 'clicks', label: 'Cliques', format: 'integer', primary: true },
      { key: 'conversions', label: 'Conversões', format: 'decimal', primary: true },
      { key: 'cost', label: 'Custo', format: 'currency', primary: true },
      { key: 'impressions', label: 'Impressões', format: 'integer' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
      { key: 'cpc', label: 'CPC médio', format: 'currency', muted: true },
      { key: 'cost_per_conversion', label: 'Custo / conversão', format: 'currency', muted: true },
    ],
    googleAds: { channelTypes: ['LOCAL', 'LOCAL_SERVICES'] },
  },
]

export const ANALYTICS_REPORT_TEMPLATES: ReportTemplateDef[] = [
  {
    id: 'overview',
    platform: 'google_analytics',
    label: 'Visão geral',
    description: 'KPIs principais da propriedade GA4 (Data API).',
    metrics: [
      { key: 'sessions', label: 'Sessões', format: 'integer', primary: true },
      { key: 'totalUsers', label: 'Usuários', format: 'integer', primary: true },
      { key: 'engagementRate', label: 'Taxa de engajamento', format: 'percent', primary: true },
      { key: 'screenPageViews', label: 'Visualizações', format: 'integer' },
      { key: 'newUsers', label: 'Novos usuários', format: 'integer' },
      { key: 'bounceRate', label: 'Taxa de rejeição', format: 'percent', muted: true },
      { key: 'conversions', label: 'Eventos-chave', format: 'decimal' },
      { key: 'purchaseRevenue', label: 'Receita', format: 'currency' },
    ],
    analytics: {
      metricNames: [
        'sessions',
        'totalUsers',
        'newUsers',
        'screenPageViews',
        'engagedSessions',
        'engagementRate',
        'averageSessionDuration',
        'bounceRate',
        'eventCount',
        'conversions',
        'ecommercePurchases',
        'purchaseRevenue',
      ],
    },
  },
  {
    id: 'website_visits',
    platform: 'google_analytics',
    label: 'Visitas no site',
    description: 'Tráfego e volume de sessões/página.',
    metrics: [
      { key: 'sessions', label: 'Sessões', format: 'integer', primary: true },
      { key: 'totalUsers', label: 'Usuários', format: 'integer', primary: true },
      { key: 'screenPageViews', label: 'Visualizações', format: 'integer', primary: true },
      { key: 'newUsers', label: 'Novos usuários', format: 'integer' },
      { key: 'bounceRate', label: 'Taxa de rejeição', format: 'percent', muted: true },
      { key: 'averageSessionDuration', label: 'Duração média (s)', format: 'decimal' },
    ],
    analytics: {
      metricNames: [
        'sessions',
        'totalUsers',
        'newUsers',
        'screenPageViews',
        'bounceRate',
        'averageSessionDuration',
        'engagedSessions',
        'engagementRate',
      ],
      dimensionNames: ['sessionDefaultChannelGroup'],
    },
  },
  {
    id: 'ecommerce',
    platform: 'google_analytics',
    label: 'Ecommerce',
    description: 'Compras e receita (requer ecommerce aprimorado no GA4).',
    metrics: [
      { key: 'ecommercePurchases', label: 'Compras', format: 'integer', primary: true },
      { key: 'purchaseRevenue', label: 'Receita', format: 'currency', primary: true },
      { key: 'conversions', label: 'Eventos-chave', format: 'decimal', primary: true },
      { key: 'sessions', label: 'Sessões', format: 'integer' },
      { key: 'totalUsers', label: 'Usuários', format: 'integer' },
      { key: 'engagementRate', label: 'Taxa de engajamento', format: 'percent' },
    ],
    analytics: {
      metricNames: [
        'ecommercePurchases',
        'purchaseRevenue',
        'conversions',
        'sessions',
        'totalUsers',
        'engagementRate',
        'screenPageViews',
      ],
    },
  },
  {
    id: 'engagement',
    platform: 'google_analytics',
    label: 'Engajamento',
    description: 'Qualidade de sessão: engajamento, duração e eventos.',
    metrics: [
      { key: 'engagementRate', label: 'Taxa de engajamento', format: 'percent', primary: true },
      { key: 'engagedSessions', label: 'Sessões engajadas', format: 'integer', primary: true },
      { key: 'averageSessionDuration', label: 'Duração média (s)', format: 'decimal', primary: true },
      { key: 'eventCount', label: 'Eventos', format: 'integer' },
      { key: 'sessions', label: 'Sessões', format: 'integer' },
      { key: 'bounceRate', label: 'Taxa de rejeição', format: 'percent', muted: true },
    ],
    analytics: {
      metricNames: [
        'engagementRate',
        'engagedSessions',
        'averageSessionDuration',
        'eventCount',
        'sessions',
        'bounceRate',
        'totalUsers',
      ],
    },
  },
  {
    id: 'acquisition',
    platform: 'google_analytics',
    label: 'Aquisição',
    description: 'Canais de aquisição (sessionDefaultChannelGroup) e volume.',
    metrics: [
      { key: 'sessions', label: 'Sessões', format: 'integer', primary: true },
      { key: 'newUsers', label: 'Novos usuários', format: 'integer', primary: true },
      { key: 'conversions', label: 'Eventos-chave', format: 'decimal', primary: true },
      { key: 'totalUsers', label: 'Usuários', format: 'integer' },
      { key: 'engagementRate', label: 'Taxa de engajamento', format: 'percent' },
      { key: 'purchaseRevenue', label: 'Receita', format: 'currency' },
    ],
    analytics: {
      metricNames: [
        'sessions',
        'newUsers',
        'totalUsers',
        'conversions',
        'engagementRate',
        'purchaseRevenue',
      ],
      dimensionNames: ['sessionDefaultChannelGroup'],
    },
  },
]

export function templatesForPlatform(platform: MarketingReportPlatform): ReportTemplateDef[] {
  if (platform === 'meta')
    return META_REPORT_TEMPLATES
  if (platform === 'google_ads')
    return GOOGLE_ADS_REPORT_TEMPLATES
  return ANALYTICS_REPORT_TEMPLATES
}

export function getReportTemplate(
  platform: MarketingReportPlatform,
  id: string,
): ReportTemplateDef {
  const list = templatesForPlatform(platform)
  return list.find(t => t.id === id) || list[0]!
}

export function normalizeMetaTemplateId(value: string | undefined | null): MetaReportTemplateId {
  const allowed: MetaReportTemplateId[] = [
    'overview',
    'whatsapp',
    'ecommerce',
    'engagement',
    'traffic',
    'leads',
    'awareness',
  ]
  if (value && (allowed as string[]).includes(value))
    return value as MetaReportTemplateId
  return 'overview'
}

export function normalizeGoogleAdsTemplateId(value: string | undefined | null): GoogleAdsReportTemplateId {
  // Legacy report query values
  if (value === 'standard')
    return 'overview'
  if (value === 'local_business')
    return 'local'
  if (value === 'website_visits')
    return 'search'

  const allowed: GoogleAdsReportTemplateId[] = [
    'overview',
    'search',
    'performance_max',
    'shopping',
    'demand_gen',
    'display',
    'local',
  ]
  if (value && (allowed as string[]).includes(value))
    return value as GoogleAdsReportTemplateId
  return 'overview'
}

export function normalizeAnalyticsTemplateId(value: string | undefined | null): AnalyticsReportTemplateId {
  const allowed: AnalyticsReportTemplateId[] = [
    'overview',
    'website_visits',
    'ecommerce',
    'engagement',
    'acquisition',
  ]
  if (value && (allowed as string[]).includes(value))
    return value as AnalyticsReportTemplateId
  return 'overview'
}

export function primaryMetricsOf(template: ReportTemplateDef): ReportMetricDef[] {
  const primaries = template.metrics.filter(m => m.primary)
  return primaries.length ? primaries.slice(0, 3) : template.metrics.slice(0, 3)
}

export function detailMetricsOf(template: ReportTemplateDef): ReportMetricDef[] {
  const primaries = new Set(primaryMetricsOf(template).map(m => m.key))
  return template.metrics.filter(m => !primaries.has(m.key))
}
