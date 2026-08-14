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

  it('resolves page keys on canonical Marketing Ads routes', () => {
    expect(resolveAdsShellPage('/marketing/ads')).toBe('overview')
    expect(resolveAdsShellPage('/marketing/ads/campaigns')).toBe('campaigns')
    expect(resolveAdsShellPage('/marketing/ads/creatives')).toBe('creatives')
    expect(resolveAdsShellPage('/marketing/ads/reports')).toBe('reports')
    expect(resolveAdsShellPage('/marketing/ads/meta')).toBe('meta')
    expect(resolveAdsShellPage('/marketing/ads/google')).toBe('google')
    expect(resolveAdsShellPage('/marketing/ads/analytics')).toBe('analytics')
  })

  it('builds Marketing breadcrumb and skips leftover /ads paths', () => {
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
    expect(buildMarketingAdsTrail('/marketing/ads/meta')).toEqual([
      { title: 'Marketing', href: '/marketing' },
      { title: 'Ads', href: '/marketing/ads' },
      { title: 'Meta Ads', href: '/marketing/ads/meta' },
    ])
    expect(adsShellPageTitle('campaigns')).toBe('Campanhas pagas')
  })
})
