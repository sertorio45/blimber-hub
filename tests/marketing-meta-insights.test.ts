import { describe, expect, it } from 'vitest'

import {
  addCalendarDays,
  buildMetaInsightsDateQuery,
  mapDailyInsightRow,
  overlayAccountMetricsWithDailySum,
  parseMetaActionsResults,
  pickPrimaryResultActionTypeFromRows,
  resolveMetaInsightsWindow,
  ymdInTimeZone,
} from '~/server/utils/marketing-meta-insights'

function actions(...pairs: Array<[string, number]>) {
  return pairs.map(([action_type, value]) => ({ action_type, value }))
}

describe('resolveMetaInsightsWindow (America/Sao_Paulo)', () => {
  it('maps last_7d to 7 inclusive BRT days including today', () => {
    const now = new Date('2026-08-17T15:00:00.000Z')
    const window = resolveMetaInsightsWindow('last_7d', '', '', now)
    expect(ymdInTimeZone(now)).toBe('2026-08-17')
    expect(window).toEqual({
      preset: 'last_7d',
      since: '2026-08-11',
      until: '2026-08-17',
    })
    expect(addCalendarDays(window.until, -6)).toBe(window.since)
  })

  it('uses BRT civil date when UTC has already rolled to the next day', () => {
    const now = new Date('2026-08-17T02:30:00.000Z')
    expect(now.toISOString().slice(0, 10)).toBe('2026-08-17')
    expect(ymdInTimeZone(now)).toBe('2026-08-16')

    const today = resolveMetaInsightsWindow('today', '', '', now)
    expect(today).toEqual({ preset: 'today', since: '2026-08-16', until: '2026-08-16' })

    const last7 = resolveMetaInsightsWindow('last_7d', '', '', now)
    expect(last7.until).toBe('2026-08-16')
    expect(last7.since).toBe('2026-08-10')
  })

  it('keeps yesterday as the previous BRT calendar day', () => {
    const now = new Date('2026-08-17T15:00:00.000Z')
    expect(resolveMetaInsightsWindow('yesterday', '', '', now)).toEqual({
      preset: 'yesterday',
      since: '2026-08-16',
      until: '2026-08-16',
    })
  })

  it('sends Graph time_range instead of date_preset last_7d (which excludes today)', () => {
    const window = resolveMetaInsightsWindow('last_7d', '', '', new Date('2026-08-17T15:00:00.000Z'))
    expect(buildMetaInsightsDateQuery(window)).toEqual({
      time_range: JSON.stringify({ since: '2026-08-11', until: '2026-08-17' }),
    })
    expect(JSON.stringify(buildMetaInsightsDateQuery(window))).not.toContain('date_preset')
  })
})

describe('meta insights daily lead aggregation', () => {
  const todayRow = {
    date_start: '2026-08-17',
    impressions: 100,
    clicks: 10,
    spend: 20,
    reach: 80,
    actions: actions(
      ['lead', 2],
      ['onsite_conversion.messaging_conversation_started_7d', 0],
    ),
  }
  const yesterdayRow = {
    date_start: '2026-08-16',
    impressions: 200,
    clicks: 20,
    spend: 40,
    reach: 150,
    actions: actions(['lead', 5]),
  }
  const quietRow = {
    date_start: '2026-08-15',
    impressions: 50,
    clicks: 4,
    spend: 8,
    reach: 40,
    actions: actions(['link_click', 4]),
  }

  it('picks additive lead from daily rows, not account-level unique messaging/grouped', () => {
    const type = pickPrimaryResultActionTypeFromRows(
      [todayRow, yesterdayRow, quietRow],
      'overview',
    )
    expect(type).toBe('lead')
  })

  it('sums the same lead metric across days: 2 today + 5 yesterday = 7', () => {
    const type = pickPrimaryResultActionTypeFromRows([todayRow, yesterdayRow, quietRow], 'overview')
    const series = [todayRow, yesterdayRow, quietRow].map(row => mapDailyInsightRow(row, type))
    expect(series.map(p => p.results)).toEqual([2, 5, 0])

    const kpi = overlayAccountMetricsWithDailySum(
      {
        impressions: 999,
        clicks: 999,
        spend: 999,
        reach: 180,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        results: 3,
        roas: null,
        cost_per_result: 0,
      },
      series,
    )

    expect(kpi.results).toBe(7)
    expect(kpi.results).toBe(series.reduce((sum, p) => sum + p.results, 0))
    expect(kpi.spend).toBe(68)
    expect(kpi.reach).toBe(180)
  })

  it('does not invent leads when the forced type is missing on a day', () => {
    const row = {
      date_start: '2026-08-17',
      actions: actions(
        ['onsite_conversion.messaging_conversation_started_7d', 4],
        ['onsite_conversion.lead_grouped', 9],
        ['link_click', 12],
      ),
    }
    expect(parseMetaActionsResults(row.actions, 'lead')).toBe(0)
    expect(mapDailyInsightRow(row, 'lead').results).toBe(0)
  })

  it('does not treat lead_grouped as additive lead', () => {
    const type = pickPrimaryResultActionTypeFromRows([
      { actions: actions(['lead', 2], ['onsite_conversion.lead_grouped', 2]) },
      { actions: actions(['lead', 5], ['onsite_conversion.lead_grouped', 5]) },
    ], 'leads')
    expect(type).toBe('lead')
    expect(parseMetaActionsResults(actions(['onsite_conversion.lead_grouped', 9]), 'lead')).toBe(0)
  })

  it('keeps account totals when daily series is empty (no invented zeros)', () => {
    const account = {
      impressions: 10,
      clicks: 2,
      spend: 5,
      reach: 8,
      ctr: 20,
      cpc: 2.5,
      cpm: 500,
      results: 2,
      roas: null,
      cost_per_result: 2.5,
    }
    expect(overlayAccountMetricsWithDailySum(account, [])).toEqual(account)
  })
})
