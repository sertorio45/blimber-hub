import { describe, expect, it } from 'vitest'
import {
  aggregateGoogleAdsSeriesByDate,
  buildGoogleAdsSeriesMaps,
  googleAdsConversionEmptyMessage,
  parseGoogleAdsConversionActionId,
  pickGoogleAdsConversionActionsForScope,
  pickGoogleAdsSeriesForScope,
} from '~/lib/marketing/google-ads-report-scope'
import type { GoogleAdsConversionActionRow } from '~/types/marketing-reports'

describe('google ads report scope — series', () => {
  it('aggregates points that share the same date', () => {
    const series = aggregateGoogleAdsSeriesByDate([
      { date: '2026-08-02', impressions: 10, clicks: 1, cost: 2, conversions: 0.5, conversions_value: 20 },
      { date: '2026-08-01', impressions: 5, clicks: 1, cost: 1, conversions: 0, conversions_value: 0 },
      { date: '2026-08-02', impressions: 20, clicks: 3, cost: 4, conversions: 1.5, conversions_value: 30 },
    ])
    expect(series).toEqual([
      { date: '2026-08-01', impressions: 5, clicks: 1, cost: 1, conversions: 0, conversions_value: 0 },
      { date: '2026-08-02', impressions: 30, clicks: 4, cost: 6, conversions: 2, conversions_value: 50 },
    ])
  })

  it('builds per-campaign maps and account series only for allowed campaigns', () => {
    const { series, series_by_campaign } = buildGoogleAdsSeriesMaps(
      [
        { campaign_id: '1', date: '2026-08-01', impressions: 10, clicks: 2, cost: 5, conversions: 1, conversions_value: 10 },
        { campaign_id: '2', date: '2026-08-01', impressions: 30, clicks: 4, cost: 8, conversions: 2, conversions_value: 40 },
        { campaign_id: '99', date: '2026-08-01', impressions: 100, clicks: 9, cost: 50, conversions: 9, conversions_value: 90 },
      ],
      ['1', '2'],
    )

    expect(series_by_campaign['99']).toBeUndefined()
    expect(series_by_campaign['1']?.[0]?.conversions).toBe(1)
    expect(series).toEqual([
      { date: '2026-08-01', impressions: 40, clicks: 6, cost: 13, conversions: 3, conversions_value: 50 },
    ])
  })

  it('returns empty series when no campaigns are in template scope', () => {
    const { series, series_by_campaign } = buildGoogleAdsSeriesMaps(
      [
        { campaign_id: '1', date: '2026-08-01', impressions: 10, clicks: 2, cost: 5, conversions: 1, conversions_value: 10 },
      ],
      [],
    )
    expect(series).toEqual([])
    expect(series_by_campaign).toEqual({})
  })

  it('picks campaign series when a campaign is selected', () => {
    const picked = pickGoogleAdsSeriesForScope({
      series: [{ date: '2026-08-01', impressions: 40, clicks: 6, cost: 13, conversions: 3, conversions_value: 50 }],
      seriesByCampaign: {
        '1': [{ date: '2026-08-01', impressions: 10, clicks: 2, cost: 5, conversions: 1, conversions_value: 10 }],
      },
      campaignId: '1',
    })
    expect(picked[0]?.conversions).toBe(1)

    const account = pickGoogleAdsSeriesForScope({
      series: [{ date: '2026-08-01', impressions: 40, clicks: 6, cost: 13, conversions: 3, conversions_value: 50 }],
      seriesByCampaign: {
        '1': [{ date: '2026-08-01', impressions: 10, clicks: 2, cost: 5, conversions: 1, conversions_value: 10 }],
      },
      campaignId: 'all',
    })
    expect(account[0]?.conversions).toBe(3)
  })
})

describe('google ads report scope — conversion actions', () => {
  const rows: GoogleAdsConversionActionRow[] = [
    {
      id: '10',
      name: 'Compra',
      campaign_id: '1',
      conversions: 2,
      conversions_value: 200,
      all_conversions: 3,
      all_conversions_value: 250,
    },
    {
      id: '10',
      name: 'Compra',
      campaign_id: '2',
      conversions: 1,
      conversions_value: 80,
      all_conversions: 1,
      all_conversions_value: 80,
    },
    {
      id: '20',
      name: 'Lead',
      campaign_id: '99',
      conversions: 50,
      conversions_value: 0,
      all_conversions: 50,
      all_conversions_value: 0,
    },
  ]

  it('parses conversion action resource names', () => {
    expect(parseGoogleAdsConversionActionId('customers/123/conversionActions/456')).toBe('456')
    expect(parseGoogleAdsConversionActionId('789')).toBe('789')
    expect(parseGoogleAdsConversionActionId('')).toBeNull()
  })

  it('aggregates actions for account scope within allowed campaigns', () => {
    const aggregated = pickGoogleAdsConversionActionsForScope({
      actions: rows,
      campaignId: 'all',
      allowedCampaignIds: ['1', '2'],
    })
    expect(aggregated).toHaveLength(1)
    expect(aggregated[0]).toMatchObject({
      id: '10',
      name: 'Compra',
      conversions: 3,
      conversions_value: 280,
      all_conversions: 4,
      all_conversions_value: 330,
    })
  })

  it('filters actions to the selected campaign only', () => {
    const aggregated = pickGoogleAdsConversionActionsForScope({
      actions: rows,
      campaignId: '1',
    })
    expect(aggregated).toHaveLength(1)
    expect(aggregated[0]?.conversions).toBe(2)
  })

  it('returns clear empty-state copy', () => {
    expect(googleAdsConversionEmptyMessage({
      campaignId: '1',
      configuredCount: 0,
      conversionsTotal: 0,
    })).toBe('Campanha sem ações de conversão configuradas')

    expect(googleAdsConversionEmptyMessage({
      campaignId: 'all',
      configuredCount: 0,
      conversionsTotal: 0,
    })).toBe('Nenhuma ação de conversão configurada na conta')

    expect(googleAdsConversionEmptyMessage({
      campaignId: '1',
      configuredCount: 2,
      conversionsTotal: 0,
    })).toBe('Nenhuma conversão no período')
  })
})
