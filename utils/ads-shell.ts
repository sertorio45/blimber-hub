export type AdsShellPage =
  | 'overview'
  | 'campaigns'
  | 'creatives'
  | 'reports'
  | 'meta'
  | 'google'
  | 'analytics'

export interface AdsTrailLink {
  title: string
  href: string
}

export const MARKETING_ADS_BASE_PATH = '/marketing/ads' as const

export function isMarketingAdsPath(path: string): boolean {
  return path === MARKETING_ADS_BASE_PATH || path.startsWith(`${MARKETING_ADS_BASE_PATH}/`)
}

export function resolveAdsShellPage(path: string): AdsShellPage {
  if (path.endsWith('/creatives'))
    return 'creatives'
  if (path.endsWith('/campaigns'))
    return 'campaigns'
  if (path.endsWith('/reports'))
    return 'reports'
  if (path.endsWith('/meta'))
    return 'meta'
  if (path.endsWith('/google'))
    return 'google'
  if (path.endsWith('/analytics'))
    return 'analytics'
  return 'overview'
}

export function adsShellPageTitle(page: AdsShellPage): string {
  if (page === 'campaigns')
    return 'Campanhas pagas'
  if (page === 'creatives')
    return 'Criativos'
  if (page === 'reports')
    return 'Relatórios pagos'
  if (page === 'meta')
    return 'Meta Ads'
  if (page === 'google')
    return 'Google Ads'
  if (page === 'analytics')
    return 'Analytics'
  return 'Ads'
}

/** Breadcrumb for Ads under Marketing. Legacy `/ads*` is redirected (ETAPA 7). */
export function buildMarketingAdsTrail(path: string): AdsTrailLink[] {
  if (!isMarketingAdsPath(path))
    return []

  const page = resolveAdsShellPage(path)
  const trail: AdsTrailLink[] = [
    { title: 'Marketing', href: '/marketing' },
    { title: 'Ads', href: MARKETING_ADS_BASE_PATH },
  ]

  if (page !== 'overview') {
    trail.push({
      title: adsShellPageTitle(page),
      href: path,
    })
  }

  return trail
}
