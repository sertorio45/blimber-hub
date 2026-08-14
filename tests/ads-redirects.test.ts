import { describe, expect, it } from 'vitest'

import { ADS_LEGACY_REDIRECTS, MARKETING_REPORTS_REDIRECTS, MARKETING_SETTINGS_REDIRECTS } from '~/constants/ads-domain'

describe('ads legacy redirects', () => {
  it('sends the Ads product bookmarks into Marketing without loops', () => {
    expect(ADS_LEGACY_REDIRECTS['/ads']).toBe('/marketing/ads')
    expect(ADS_LEGACY_REDIRECTS['/ads/campaigns']).toBe('/marketing/ads/campaigns')
    expect(ADS_LEGACY_REDIRECTS['/ads/creatives']).toBe('/marketing/ads/creatives')
    expect(ADS_LEGACY_REDIRECTS['/ads/reports']).toBe('/marketing/reports/ads')
    expect(ADS_LEGACY_REDIRECTS['/ads/meta']).toBe('/marketing/ads/meta')
    expect(ADS_LEGACY_REDIRECTS['/ads/google']).toBe('/marketing/ads/google')
    expect(ADS_LEGACY_REDIRECTS['/ads/analytics']).toBe('/marketing/reports/analytics')
    expect(ADS_LEGACY_REDIRECTS['/ads/integrations']).toBe('/settings/integrations')
    expect(ADS_LEGACY_REDIRECTS['/ads/settings']).toBe('/marketing/settings')

    for (const [from, to] of Object.entries(ADS_LEGACY_REDIRECTS)) {
      expect(to).not.toBe(from)
      expect(to.startsWith('/ads')).toBe(false)
    }
  })

  it('sends Etapa 5 dummy settings URLs to the canonical OAuth panel', () => {
    expect(MARKETING_SETTINGS_REDIRECTS['/marketing/settings/ad-accounts']).toBe('/settings/integrations')
    expect(MARKETING_SETTINGS_REDIRECTS['/marketing/settings/integrations']).toBe('/settings/integrations')
  })

  it('sends Ads report bookmarks into the unified reports hub', () => {
    expect(MARKETING_REPORTS_REDIRECTS['/marketing/ads/reports']).toBe('/marketing/reports/ads')
    expect(MARKETING_REPORTS_REDIRECTS['/marketing/ads/analytics']).toBe('/marketing/reports/analytics')
  })
})
