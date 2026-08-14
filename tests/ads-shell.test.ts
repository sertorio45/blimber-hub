import { describe, expect, it } from 'vitest'
import {
  adsShellPageTitle,
  buildMarketingAdsTrail,
  isMarketingAdsPath,
  resolveAdsShellPage,
} from '~/utils/ads-shell'

describe('ads-shell', () => {
  it('detects Marketing Ads paths only', () => {
    expect(isMarketingAdsPath('/marketing/ads')).toBe(true)
    expect(isMarketingAdsPath('/marketing/ads/campaigns')).toBe(true)
    expect(isMarketingAdsPath('/ads')).toBe(false)
    expect(isMarketingAdsPath('/ads/campaigns')).toBe(false)
    expect(isMarketingAdsPath('/marketing')).toBe(false)
  })

  it('resolves page keys from either dual route', () => {
    expect(resolveAdsShellPage('/marketing/ads')).toBe('overview')
    expect(resolveAdsShellPage('/ads')).toBe('overview')
    expect(resolveAdsShellPage('/marketing/ads/campaigns')).toBe('campaigns')
    expect(resolveAdsShellPage('/ads/creatives')).toBe('creatives')
    expect(resolveAdsShellPage('/marketing/ads/reports')).toBe('reports')
  })

  it('builds Marketing breadcrumb and skips it on the Ads product', () => {
    expect(buildMarketingAdsTrail('/ads/campaigns')).toEqual([])
    expect(buildMarketingAdsTrail('/marketing/ads')).toEqual([
      { title: 'Marketing', href: '/marketing' },
      { title: 'Ads', href: '/marketing/ads' },
    ])
    expect(buildMarketingAdsTrail('/marketing/ads/reports')).toEqual([
      { title: 'Marketing', href: '/marketing' },
      { title: 'Ads', href: '/marketing/ads' },
      { title: 'Relatórios pagos', href: '/marketing/ads/reports' },
    ])
    expect(adsShellPageTitle('campaigns')).toBe('Campanhas pagas')
  })
})
