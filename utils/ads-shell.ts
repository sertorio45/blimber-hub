export type AdsShellPage = 'overview' | 'campaigns' | 'creatives' | 'reports'

export interface AdsTrailLink {
  title: string
  href: string
}

export function isMarketingAdsPath(path: string): boolean {
  return path === '/marketing/ads' || path.startsWith('/marketing/ads/')
}

export function resolveAdsShellPage(path: string): AdsShellPage {
  if (path.endsWith('/creatives'))
    return 'creatives'
  if (path.endsWith('/campaigns'))
    return 'campaigns'
  if (path.endsWith('/reports'))
    return 'reports'
  return 'overview'
}

export function adsShellPageTitle(page: AdsShellPage): string {
  if (page === 'campaigns')
    return 'Campanhas pagas'
  if (page === 'creatives')
    return 'Criativos'
  if (page === 'reports')
    return 'Relatórios pagos'
  return 'Ads'
}

/** Breadcrumb only for Ads mounted under Marketing (not the sibling Ads product). */
export function buildMarketingAdsTrail(path: string): AdsTrailLink[] {
  if (!isMarketingAdsPath(path))
    return []

  const page = resolveAdsShellPage(path)
  const trail: AdsTrailLink[] = [
    { title: 'Marketing', href: '/marketing' },
    { title: 'Ads', href: '/marketing/ads' },
  ]

  if (page !== 'overview') {
    trail.push({
      title: adsShellPageTitle(page),
      href: path,
    })
  }

  return trail
}
