import { describe, expect, it } from 'vitest'
import {
  buildDefaultReportLayout,
  normalizeReportLayout,
  resolveBlockMetricDefs,
} from '~/lib/marketing/report-layout'
import {
  presetGoogleAdsTemplateFromChannel,
  presetMetaTemplateFromCampaign,
} from '~/lib/marketing/report-template-preset'

describe('report template auto-preset', () => {
  it('maps Google Ads channel types to template ids', () => {
    expect(presetGoogleAdsTemplateFromChannel('SEARCH')).toBe('search')
    expect(presetGoogleAdsTemplateFromChannel('performance_max')).toBe('performance_max')
    expect(presetGoogleAdsTemplateFromChannel('SHOPPING')).toBe('shopping')
    expect(presetGoogleAdsTemplateFromChannel('DEMAND_GEN')).toBe('demand_gen')
    expect(presetGoogleAdsTemplateFromChannel('DISPLAY')).toBe('display')
    expect(presetGoogleAdsTemplateFromChannel('LOCAL_SERVICES')).toBe('local')
    expect(presetGoogleAdsTemplateFromChannel(null)).toBe('overview')
    expect(presetGoogleAdsTemplateFromChannel('WEIRD')).toBe('overview')
  })

  it('maps Meta objectives and action hints to template ids', () => {
    expect(presetMetaTemplateFromCampaign({ objective: 'OUTCOME_SALES' })).toBe('ecommerce')
    expect(presetMetaTemplateFromCampaign({ objective: 'OUTCOME_LEADS' })).toBe('leads')
    expect(presetMetaTemplateFromCampaign({ objective: 'OUTCOME_TRAFFIC' })).toBe('traffic')
    expect(presetMetaTemplateFromCampaign({ objective: 'OUTCOME_AWARENESS' })).toBe('awareness')
    expect(presetMetaTemplateFromCampaign({ objective: 'OUTCOME_ENGAGEMENT' })).toBe('engagement')
    expect(presetMetaTemplateFromCampaign({
      objective: 'OUTCOME_ENGAGEMENT',
      primaryActionType: 'onsite_conversion.messaging_conversation_started_7d',
    })).toBe('whatsapp')
    expect(presetMetaTemplateFromCampaign({
      objective: null,
      primaryActionType: 'onsite_conversion.messaging_conversation_started_7d',
    })).toBe('whatsapp')
    expect(presetMetaTemplateFromCampaign({
      objective: null,
      primaryActionType: 'purchase',
    })).toBe('ecommerce')
    expect(presetMetaTemplateFromCampaign({})).toBe('overview')
  })
})

describe('report layout builder helpers', () => {
  it('builds a default Google Ads layout with conversion and network blocks', () => {
    const layout = buildDefaultReportLayout('google_ads', 'search')
    expect(layout.version).toBe(1)
    expect(layout.templateBaseId).toBe('search')
    expect(layout.blocks.map(b => b.type)).toEqual([
      'kpi_primary',
      'kpi_detail',
      'trend_chart',
      'conversions_table',
      'networks_table',
      'campaigns_table',
    ])
    const primary = layout.blocks.find(b => b.type === 'kpi_primary')
    expect(primary?.metricKeys?.length).toBeGreaterThan(0)
  })

  it('builds a default Meta layout without Google-only blocks', () => {
    const layout = buildDefaultReportLayout('meta', 'whatsapp')
    expect(layout.templateBaseId).toBe('whatsapp')
    expect(layout.blocks.map(b => b.type)).toEqual([
      'kpi_primary',
      'kpi_detail',
      'trend_chart',
      'campaigns_table',
    ])
  })

  it('normalizes invalid layouts back to default', () => {
    const layout = normalizeReportLayout('meta', 'leads', { version: 1, blocks: [] })
    expect(layout.templateBaseId).toBe('leads')
    expect(layout.blocks.length).toBeGreaterThan(0)
  })

  it('keeps custom block order and filters unknown types', () => {
    const layout = normalizeReportLayout('google_ads', 'overview', {
      version: 1,
      templateBaseId: 'overview',
      blocks: [
        { id: 'a', type: 'campaigns_table' },
        { id: 'b', type: 'not_a_real_block' },
        { id: 'c', type: 'kpi_primary', metricKeys: ['cost', 'clicks'] },
      ],
    })
    expect(layout.blocks.map(b => b.type)).toEqual(['campaigns_table', 'kpi_primary'])
    expect(layout.blocks[1]?.metricKeys).toEqual(['cost', 'clicks'])
  })

  it('resolves metric defs in catalog order for KPI blocks', () => {
    const catalog = [
      { key: 'cost', label: 'Custo', format: 'currency' as const, primary: true },
      { key: 'clicks', label: 'Cliques', format: 'integer' as const },
      { key: 'impressions', label: 'Impressões', format: 'integer' as const },
    ]
    expect(resolveBlockMetricDefs(catalog, ['impressions', 'cost'], 'all').map(m => m.key))
      .toEqual(['impressions', 'cost'])
  })
})
