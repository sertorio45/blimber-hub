import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export const MARKETING_REPORTS_HUB_PATH = '/marketing/reports' as const
export const MARKETING_REPORTS_ADS_PATH = '/marketing/reports/ads' as const
export const MARKETING_REPORTS_ANALYTICS_PATH = '/marketing/reports/analytics' as const
export const MARKETING_REPORTS_SOCIAL_PATH = '/marketing/reports/social' as const

export const MARKETING_REPORT_RANGE_PRESETS = [
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_30d',
  'last_90d',
  'all',
  'custom',
] as const

export type MarketingReportRangePreset = typeof MARKETING_REPORT_RANGE_PRESETS[number]

export const DEFAULT_MARKETING_REPORT_RANGE: MarketingReportRangePreset = 'last_7d'

/**
 * GA4 “Todo período” floor (Data API has no ALL_TIME).
 * Meta Ads uses a separate 37-month clamp (Graph error 3018 / date_preset=maximum).
 */
export const MARKETING_REPORT_ALL_TIME_SINCE = '2004-01-01'

/** Meta Ads Insights max lookback (`date_preset=maximum` / error 3018). */
export const META_INSIGHTS_MAX_LOOKBACK_MONTHS = 37

function addUtcCalendarMonths(ymd: string, months: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const utc = new Date(Date.UTC(year, (month || 1) - 1 + months, day || 1))
  return utc.toISOString().slice(0, 10)
}

function addUtcCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const utc = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days))
  return utc.toISOString().slice(0, 10)
}

/**
 * Earliest Insights `since` for Meta Ads “Todo período”.
 * One day after −37 months to stay inside Graph error 3018.
 */
export function metaAdsAllTimeSince(
  todayYmd: string,
  maxMonths: number = META_INSIGHTS_MAX_LOOKBACK_MONTHS,
): string {
  return addUtcCalendarDays(addUtcCalendarMonths(todayYmd, -maxMonths), 1)
}

/** Presets shown on Redes sociais (Page/IG Insights — no lifetime / all). */
export const MARKETING_SOCIAL_REPORT_RANGE_PRESETS = [
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_30d',
  'last_90d',
  'custom',
] as const satisfies readonly MarketingReportRangePreset[]

export function isMarketingSocialReportRangePreset(
  value: string,
): value is typeof MARKETING_SOCIAL_REPORT_RANGE_PRESETS[number] {
  return (MARKETING_SOCIAL_REPORT_RANGE_PRESETS as readonly string[]).includes(value)
}

export const PAID_ADS_REPORT_SOURCES = ['meta', 'google_ads'] as const
export type PaidAdsReportSource = typeof PAID_ADS_REPORT_SOURCES[number]

export interface MarketingReportTab {
  id: 'ads' | 'analytics' | 'social'
  title: string
  path: string
  description: string
}

/** Clamp hub range when entering the social tab (organic APIs reject all-time). */
export function clampMarketingReportRangeForTab(
  tabId: MarketingReportTab['id'],
  range: MarketingReportRangePreset,
): MarketingReportRangePreset {
  if (tabId === 'social' && range === 'all')
    return 'last_90d'
  return range
}

export const MARKETING_REPORT_TABS: MarketingReportTab[] = [
  {
    id: 'ads',
    title: 'Anúncios',
    path: MARKETING_REPORTS_ADS_PATH,
    description: 'Performance de mídia paga — Meta Ads e Google Ads.',
  },
  {
    id: 'analytics',
    title: 'Google Analytics',
    path: MARKETING_REPORTS_ANALYTICS_PATH,
    description: 'Comportamento e conversão no Google Analytics.',
  },
  {
    id: 'social',
    title: 'Redes sociais',
    path: MARKETING_REPORTS_SOCIAL_PATH,
    description: 'Métricas orgânicas das redes conectadas — não inclui campanhas pagas.',
  },
]

export function isMarketingReportRangePreset(value: string): value is MarketingReportRangePreset {
  return (MARKETING_REPORT_RANGE_PRESETS as readonly string[]).includes(value)
}

export function parseMarketingReportRange(value: unknown): MarketingReportRangePreset {
  const raw = typeof value === 'string' ? value : ''
  return isMarketingReportRangePreset(raw) ? raw : DEFAULT_MARKETING_REPORT_RANGE
}

export function defaultCustomDateRange(): { dateStart: string, dateEnd: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 30)
  return {
    dateStart: start.toISOString().slice(0, 10),
    dateEnd: end.toISOString().slice(0, 10),
  }
}

export function resolveMarketingReportTab(path: string): MarketingReportTab {
  const match = MARKETING_REPORT_TABS.find(tab => path === tab.path || path.startsWith(`${tab.path}/`))
  if (match)
    return match
  return MARKETING_REPORT_TABS[0]!
}

function queryString(query: LocationQuery | LocationQueryRaw, key: string): string {
  const value = query[key]
  if (Array.isArray(value))
    return String(value[0] || '')
  return value == null ? '' : String(value)
}

/** Keep `range` (and custom dates) when switching Relatórios tabs. */
export function withReportsRangeQuery(
  path: string,
  query: LocationQuery | LocationQueryRaw,
): { path: string, query: LocationQueryRaw } {
  const tab = resolveMarketingReportTab(path)
  const range = clampMarketingReportRangeForTab(
    tab.id,
    parseMarketingReportRange(queryString(query, 'range')),
  )
  const next: LocationQueryRaw = { range }

  if (range === 'custom') {
    const fallback = defaultCustomDateRange()
    next.date_start = queryString(query, 'date_start') || fallback.dateStart
    next.date_end = queryString(query, 'date_end') || fallback.dateEnd
  }

  return { path, query: next }
}
