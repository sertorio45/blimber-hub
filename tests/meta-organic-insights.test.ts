import { describe, expect, it } from 'vitest'

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

  it('previousOrganicWindow shifts back by equal span', () => {
    const current = resolveOrganicDateWindow('last_7d', '', '', 'day')
    const prev = previousOrganicWindow(current)
    expect(prev.until < current.since).toBe(true)
  })

  it('mapGraphInsightsToSeries merges metrics by end date', () => {
    const series = mapGraphInsightsToSeries([
      {
        name: 'impressions',
        values: [
          { value: 10, end_time: '2026-08-11T07:00:00+0000' },
          { value: 20, end_time: '2026-08-12T07:00:00+0000' },
        ],
      },
      {
        name: 'reach',
        values: [
          { value: 5, end_time: '2026-08-11T07:00:00+0000' },
          { value: 8, end_time: '2026-08-12T07:00:00+0000' },
        ],
      },
    ], ['impressions', 'reach'])

    expect(series).toHaveLength(2)
    expect(series[0]).toMatchObject({ date: '2026-08-11', impressions: 10, reach: 5 })
    expect(series[1]).toMatchObject({ date: '2026-08-12', impressions: 20, reach: 8 })
  })

  it('aggregateOrganicMetrics sums flow metrics and snapshots follower counts', () => {
    const series = [
      { date: '2026-08-11', impressions: 10, reach: 5, follower_count: 100 },
      { date: '2026-08-12', impressions: 15, reach: 7, follower_count: 110 },
    ]
    const metrics = aggregateOrganicMetrics(series, 'instagram')
    expect(metrics.impressions).toBe(25)
    expect(metrics.reach).toBe(12)
    expect(metrics.follower_count).toBe(110)
  })

  it('computeOrganicMetricDeltas returns percent change', () => {
    const deltas = computeOrganicMetricDeltas(
      { impressions: 200, reach: 50, profile_views: 0, follower_count: 120, email_contacts: 0, website_clicks: 0 },
      { impressions: 100, reach: 50, profile_views: 0, follower_count: 100, email_contacts: 0, website_clicks: 0 },
      'instagram',
    )
    expect(deltas?.impressions).toBe(100)
    expect(deltas?.reach).toBe(0)
    expect(deltas?.follower_count).toBe(20)
  })
})
