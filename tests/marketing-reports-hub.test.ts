import { describe, expect, it } from 'vitest'
import { toUserFacingReportError } from '~/lib/marketing/report-user-error'
import {
  MARKETING_REPORTS_ADS_PATH,
  parseMarketingReportRange,
  resolveMarketingReportTab,
  withReportsRangeQuery,
} from '~/lib/marketing/reports-hub'

describe('marketing reports hub', () => {
  it('defaults invalid range to last_7d', () => {
    expect(parseMarketingReportRange(undefined)).toBe('last_7d')
    expect(parseMarketingReportRange('nope')).toBe('last_7d')
    expect(parseMarketingReportRange('last_30d')).toBe('last_30d')
    expect(parseMarketingReportRange('all')).toBe('all')
  })

  it('keeps range when switching tabs', () => {
    const next = withReportsRangeQuery(MARKETING_REPORTS_ADS_PATH, { range: 'last_30d', foo: '1' })
    expect(next.path).toBe('/marketing/reports/ads')
    expect(next.query).toEqual({ range: 'last_30d' })
  })

  it('preserves all-time range across tabs', () => {
    const next = withReportsRangeQuery(MARKETING_REPORTS_ADS_PATH, { range: 'all' })
    expect(next.query).toEqual({ range: 'all' })
  })

  it('resolves tabs and falls back to ads on the hub index', () => {
    expect(resolveMarketingReportTab('/marketing/reports').id).toBe('ads')
    expect(resolveMarketingReportTab('/marketing/reports/social').id).toBe('social')
    expect(resolveMarketingReportTab('/marketing/reports/analytics').title).toBe('Google Analytics')
  })
})

describe('report user-facing errors', () => {
  it('hides Graph-style dumps', () => {
    expect(toUserFacingReportError({
      message: 'OAuthException (#190) error_subcode 463 invalid token',
    })).toMatch(/Integrações/)
    expect(toUserFacingReportError('REQUEST_ERROR PERMISSION_DENIED')).not.toMatch(/PERMISSION_DENIED/)
  })

  it('keeps short Portuguese copy', () => {
    expect(toUserFacingReportError('Não foi possível carregar os relatórios orgânicos.')).toBe(
      'Não foi possível carregar os relatórios orgânicos.',
    )
  })
})
