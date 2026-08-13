import { describe, expect, it } from 'vitest'
import {
  assertSafeMediaUrl,
  buildCreateExperimentGraphBody,
  buildDegreesOfFreedomSpec,
  getMetaCapabilities,
  MetaAdsToolError,
} from '~/lib/meta-ads'

describe('meta capabilities + media SSRF + experiments builders', () => {
  it('reports Flexible Ad Format unsupported on v20 while pac_relaxation is supported', () => {
    const caps = getMetaCapabilities('v20.0')
    expect(caps.graphVersion).toBe('v20.0')
    expect(caps.creativeTypes.FLEXIBLE_AD_FORMAT.supported).toBe(false)
    expect(caps.creativeTypes.FLEXIBLE_MEDIA_PAC_RELAXATION.supported).toBe(true)
    expect(caps.creativeTypes.COLLECTION.supported).toBe(false)
    expect(caps.catalog.listProductSets.supported).toBe(true)
    expect(caps.experiments.levels.length).toBeGreaterThan(0)
    expect(caps.creativeTypes.FLEXIBLE_AD_FORMAT.reason).toMatch(/META_GRAPH_VERSION|não implementado/i)
  })

  it('keeps Flexible Ad Format false even if graph version string is higher', () => {
    const caps = getMetaCapabilities('v25.0')
    expect(caps.graphVersion).toBe('v25.0')
    expect(caps.creativeTypes.FLEXIBLE_AD_FORMAT.supported).toBe(false)
  })

  it('blocks private media URLs (SSRF)', async () => {
    await expect(assertSafeMediaUrl('http://example.com/a.png')).rejects.toThrow(/https/i)
    await expect(assertSafeMediaUrl('https://127.0.0.1/a.png')).rejects.toThrow(/SSRF|privado/i)
    await expect(assertSafeMediaUrl('https://localhost/a.png')).rejects.toThrow(/SSRF|bloqueado/i)
  })

  it('builds closed degrees_of_freedom_spec', () => {
    expect(buildDegreesOfFreedomSpec({
      creativeFeaturesSpec: { pac_relaxation: { enrollStatus: 'OPT_IN' } },
    })).toEqual({
      creative_features_spec: { pac_relaxation: { enroll_status: 'OPT_IN' } },
    })
    expect(() => buildDegreesOfFreedomSpec({
      creativeFeaturesSpec: { not_a_feature: { enrollStatus: 'OPT_IN' } } as any,
    })).toThrow(MetaAdsToolError)
  })

  it('builds SPLIT_TEST_V2 experiment body', () => {
    const body = buildCreateExperimentGraphBody({
      name: 'Teste criativo',
      type: 'SPLIT_TEST_V2',
      cells: [
        { name: 'A', treatmentPercentage: 50, adId: 'ad_1' },
        { name: 'B', treatmentPercentage: 50, adId: 'ad_2' },
      ],
      startTime: 1700000000,
      endTime: 1700600000,
      creativeTestDailyBudget: 15000,
    })
    expect(body).toMatchObject({
      type: 'SPLIT_TEST_V2',
      creative_test_config: { daily_budget: 15000 },
      cooldown_start_time: 1700000000,
      observation_end_time: 1700600000,
    })
    expect(body.cells).toEqual([
      { name: 'A', treatment_percentage: 50, ads: ['ad_1'] },
      { name: 'B', treatment_percentage: 50, ads: ['ad_2'] },
    ])
  })
})
