import { describe, expect, it } from 'vitest'

import {
  organicMetricFetchGroups,
  organicMetricsForPlatform,
} from '~/constants/marketing-organic-metrics'
import {
  aggregateOrganicMetrics,
  computeOrganicMetricDeltas,
  mapGraphInsightsToSeries,
  previousOrganicWindow,
  resolveOrganicDateWindow,
} from '~/server/utils/meta-organic-insights'

describe('meta-organic-insights', () => {
  it('resolveOrganicDateWindow maps last_7d to inclusive range', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const window = resolveOrganicDateWindow('last_7d', '', '', 'day')
    expect(window.until).toBe(today.toISOString().slice(0, 10))
    expect(window.metaPeriod).toBe('day')
  })

  it('resolveOrganicDateWindow remaps all to last_90d (IG/Page Insights limit)', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const window = resolveOrganicDateWindow('all', '', '', 'day')
    const expected = resolveOrganicDateWindow('last_90d', '', '', 'day')
    expect(window).toEqual(expected)
    expect(window.preset).toBe('last_90d')
  })

  it('previousOrganicWindow shifts back by equal span', () => {
    const current = resolveOrganicDateWindow('last_7d', '', '', 'day')
    const prev = previousOrganicWindow(current)
    expect(prev.until < current.since).toBe(true)
  })

  it('mapGraphInsightsToSeries merges metrics by end date', () => {
    const series = mapGraphInsightsToSeries([
      {
        name: 'page_media_view',
        values: [
          { value: 10, end_time: '2026-08-11T07:00:00+0000' },
          { value: 20, end_time: '2026-08-12T07:00:00+0000' },
        ],
      },
      {
        name: 'page_total_media_view_unique',
        values: [
          { value: 5, end_time: '2026-08-11T07:00:00+0000' },
          { value: 8, end_time: '2026-08-12T07:00:00+0000' },
        ],
      },
    ], ['page_media_view', 'page_total_media_view_unique'])

    expect(series).toHaveLength(2)
    expect(series[0]).toMatchObject({ date: '2026-08-11', page_media_view: 10, page_total_media_view_unique: 5 })
    expect(series[1]).toMatchObject({ date: '2026-08-12', page_media_view: 20, page_total_media_view_unique: 8 })
  })

  it('mapGraphInsightsToSeries maps total_value metrics to anchor date', () => {
    const series = mapGraphInsightsToSeries([
      {
        name: 'views',
        total_value: { value: 42 },
      },
    ], ['views'], '2026-08-12')

    expect(series).toEqual([{ date: '2026-08-12', views: 42 }])
  })

  it('aggregateOrganicMetrics sums flow metrics and snapshots follower counts', () => {
    const series = [
      { date: '2026-08-11', views: 10, reach: 5, follower_count: 100 },
      { date: '2026-08-12', views: 15, reach: 7, follower_count: 110 },
    ]
    const metrics = aggregateOrganicMetrics(series, 'instagram')
    expect(metrics.views).toBe(25)
    expect(metrics.reach).toBe(12)
    expect(metrics.follower_count).toBe(110)
  })

  it('computeOrganicMetricDeltas returns percent change', () => {
    const deltas = computeOrganicMetricDeltas(
      { views: 200, reach: 50, profile_views: 0, follower_count: 120, website_clicks: 0, accounts_engaged: 0 },
      { views: 100, reach: 50, profile_views: 0, follower_count: 100, website_clicks: 0, accounts_engaged: 0 },
      'instagram',
    )
    expect(deltas?.views).toBe(100)
    expect(deltas?.reach).toBe(0)
    expect(deltas?.follower_count).toBe(20)
  })

  it('organicMetricFetchGroups splits instagram total_value metrics', () => {
    const groups = organicMetricFetchGroups('instagram')
    expect(groups).toHaveLength(2)
    expect(groups[0]?.graphMetricType).toBe('time_series')
    expect(groups[0]?.metrics).toEqual(['reach', 'follower_count'])
    expect(groups[1]?.graphMetricType).toBe('total_value')
    expect(groups[1]?.metrics).toEqual(['views', 'profile_views', 'website_clicks', 'accounts_engaged'])
  })

  it('facebook metrics use current Graph API names', () => {
    const keys = organicMetricsForPlatform('facebook').map(m => m.key)
    expect(keys).toContain('page_media_view')
    expect(keys).not.toContain('page_impressions')
    expect(keys).not.toContain('page_fans')
  })
})
