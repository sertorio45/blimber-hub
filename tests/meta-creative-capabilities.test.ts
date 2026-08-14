import { describe, expect, it, vi } from 'vitest'
import {
  assertSafeMediaUrl,
  buildCopyAdGraphBody,
  buildCreateExperimentGraphBody,
  buildDegreesOfFreedomSpec,
  deleteCopiedAdsForFailedStudy,
  evenTreatmentPercentages,
  extractBusinessIdFromAdAccountNode,
  getMetaCapabilities,
  MetaAdsToolError,
  mergeVariationCreativeParameters,
} from '~/lib/meta-ads'

describe('meta capabilities + media SSRF + experiments builders', () => {
  it('reports Flexible Ad Format unsupported on v20 while pac_relaxation is supported', () => {
    const caps = getMetaCapabilities('v20.0')
    expect(caps.graphVersion).toBe('v20.0')
    expect(caps.studiesGraphVersion).toBe('v26.0')
    expect(caps.creativeTypes.FLEXIBLE_AD_FORMAT.supported).toBe(false)
    expect(caps.creativeTypes.FLEXIBLE_MEDIA_PAC_RELAXATION.supported).toBe(true)
    expect(caps.creativeTypes.COLLECTION.supported).toBe(false)
    expect(caps.catalog.listProductSets.supported).toBe(true)
    expect(caps.tracking.adTrackingSpecs.supported).toBe(true)
    expect(caps.tracking.websitePixel.supported).toBe(true)
    expect(caps.tracking.offlineDataset.supported).toBe(true)
    expect(caps.tracking.crmLeadgenQuality.supported).toBe(true)
    expect(caps.experiments.levels.length).toBeGreaterThan(0)
    expect(caps.creativeTypes.FLEXIBLE_AD_FORMAT.reason).toMatch(/META_ADS_GRAPH_VERSION|META_GRAPH_VERSION|não implementado/i)
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

  it('rejects Creative Test outside 2–5 cells (not 2–7)', () => {
    expect(() => buildCreateExperimentGraphBody({
      name: 'Too many',
      type: 'SPLIT_TEST_V2',
      cells: [
        { name: 'A', treatmentPercentage: 20, adId: '1' },
        { name: 'B', treatmentPercentage: 20, adId: '2' },
        { name: 'C', treatmentPercentage: 20, adId: '3' },
        { name: 'D', treatmentPercentage: 20, adId: '4' },
        { name: 'E', treatmentPercentage: 10, adId: '5' },
        { name: 'F', treatmentPercentage: 10, adId: '6' },
      ],
      startTime: 1,
      endTime: 2,
      creativeTestDailyBudget: 1000,
    })).toThrow(MetaAdsToolError)

    expect(() => buildCreateExperimentGraphBody({
      name: 'One cell',
      type: 'SPLIT_TEST_V2',
      cells: [{ name: 'A', treatmentPercentage: 100, adId: '1' }],
      startTime: 1,
      endTime: 2,
      creativeTestDailyBudget: 1000,
    })).toThrow(/2–5/)
  })

  it('extracts business id from official Ad Account `business` field', () => {
    expect(extractBusinessIdFromAdAccountNode({
      id: 'act_555',
      business: { id: '9988776655', name: 'BM' },
    })).toBe('9988776655')
    expect(extractBusinessIdFromAdAccountNode({ business: 'me' })).toBeNull()
    expect(extractBusinessIdFromAdAccountNode({})).toBeNull()
  })

  it('deleteCopiedAdsForFailedStudy never deletes the base ad', async () => {
    const graph = vi.fn(async () => ({ success: true }))
    const result = await deleteCopiedAdsForFailedStudy(
      { apiVersion: 'v25.0', accessToken: 'tok', graph },
      ['copy_1', 'ad_base', 'copy_1'],
      { protectAdIds: ['ad_base'] },
    )
    expect(result.deleted).toEqual(['copy_1'])
    expect(result.skippedProtected).toEqual(['ad_base'])
    expect(graph.mock.calls).toHaveLength(1)
    expect(String(graph.mock.calls[0]![0])).toContain('/copy_1')
    expect(graph.mock.calls[0]![1]?.body).toEqual({ status: 'DELETED' })
  })

  it('evenTreatmentPercentages always sums to 100', () => {
    expect(evenTreatmentPercentages(2)).toEqual([50, 50])
    expect(evenTreatmentPercentages(3)).toEqual([34, 33, 33])
    expect(evenTreatmentPercentages(5).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('merges variation copy onto link_data and builds /copies body', () => {
    const creative = mergeVariationCreativeParameters({
      page_id: 'p1',
      link_data: { message: 'old', name: 'h', link: 'https://ex.com' },
    }, { message: 'novo', headline: 'H2' })
    expect(creative).toMatchObject({
      object_story_spec: {
        page_id: 'p1',
        link_data: { message: 'novo', name: 'H2', link: 'https://ex.com' },
      },
    })
    const copyBody = buildCopyAdGraphBody({
      variation: { name: 'Vídeo A', message: 'novo' },
      index: 0,
      objectStorySpec: { page_id: 'p1', link_data: { message: 'old', link: 'https://ex.com' } },
    })
    expect(copyBody.status_option).toBe('PAUSED')
    expect(copyBody.rename_options).toMatchObject({ rename_suffix: ' - Vídeo A' })
    expect(copyBody.creative_parameters).toBeDefined()
  })
})
