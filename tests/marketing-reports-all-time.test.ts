import { describe, expect, it } from 'vitest'
import {
  MARKETING_REPORTS_SOCIAL_PATH,
  clampMarketingReportRangeForTab,
  metaAdsAllTimeSince,
  withReportsRangeQuery,
} from '~/lib/marketing/reports-hub'
import {
  buildGa4DateRange,
  buildGoogleDateWhere,
  buildGooglePreviousDateWhere,
  resolveAbsoluteDateRange,
} from '~/server/utils/marketing-reports'

describe('marketing report all-time date helpers', () => {
  it('buildGoogleDateWhere uses ALL_TIME for aggregates without date segment', () => {
    expect(buildGoogleDateWhere('all', '', '')).toBe('segments.date DURING ALL_TIME')
  })

  it('buildGoogleDateWhere uses finite BETWEEN when selecting segments.date', () => {
    const clause = buildGoogleDateWhere('all', '', '', { selectDateSegment: true })
    expect(clause).toMatch(/^segments\.date BETWEEN '\d{4}-\d{2}-\d{2}' AND '\d{4}-\d{2}-\d{2}'$/)
    expect(clause).not.toContain('ALL_TIME')
  })

  it('buildGooglePreviousDateWhere returns null for all', () => {
    expect(buildGooglePreviousDateWhere('all', '', '')).toBeNull()
  })

  it('buildGa4DateRange starts at 2004-01-01 for all', () => {
    expect(buildGa4DateRange('all', '', '')).toEqual({
      startDate: '2004-01-01',
      endDate: 'today',
    })
  })

  it('resolveAbsoluteDateRange materializes all through today', () => {
    const abs = resolveAbsoluteDateRange('all', '', '')
    expect(abs.start).toBe('2004-01-01')
    expect(abs.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('metaAdsAllTimeSince is ~37 months before today', () => {
    expect(metaAdsAllTimeSince('2026-08-17')).toBe('2023-07-18')
  })

  it('clamps all → last_90d on social tab navigation', () => {
    expect(clampMarketingReportRangeForTab('social', 'all')).toBe('last_90d')
    expect(clampMarketingReportRangeForTab('ads', 'all')).toBe('all')
    const next = withReportsRangeQuery(MARKETING_REPORTS_SOCIAL_PATH, { range: 'all' })
    expect(next.query).toEqual({ range: 'last_90d' })
  })
})
