import { describe, expect, it } from 'vitest'
import {
  buildMetaGraphTargeting,
  metaCustomTargetingSchema,
  resolveAdsetTargeting,
  summarizeMetaGraphTargeting,
} from '../lib/meta-ads/targeting-templates'

describe('meta custom targeting', () => {
  it('rejects targeting without geo', () => {
    const result = metaCustomTargetingSchema.safeParse({
      age_min: 25,
      age_max: 45,
    })
    expect(result.success).toBe(false)
  })

  it('maps interests convenience into flexible_spec', () => {
    const parsed = metaCustomTargetingSchema.parse({
      age_min: 25,
      age_max: 45,
      genders: [2],
      geo_locations: { countries: ['br'] },
      interests: [{ id: '6003139266461', name: 'Cosmetics' }],
    })
    const graph = buildMetaGraphTargeting(parsed)
    expect(graph.geo_locations.countries).toEqual(['BR'])
    expect(graph.genders).toEqual([2])
    expect(graph.flexible_spec).toEqual([
      { interests: [{ id: '6003139266461', name: 'Cosmetics' }] },
    ])
    expect(summarizeMetaGraphTargeting(graph)).toContain('interesses=1')
  })

  it('resolveAdsetTargeting keeps BR_* presets with advantage_audience default 0', () => {
    const resolved = resolveAdsetTargeting({ targetingTemplate: 'BR_18_65' })
    expect(resolved.source).toBe('template')
    expect(resolved.targetingTemplate).toBe('BR_18_65')
    expect(resolved.advantageAudience).toBe(0)
    expect(resolved.targeting).toEqual({
      geo_locations: { countries: ['BR'] },
      age_min: 18,
      age_max: 65,
      targeting_automation: { advantage_audience: 0 },
    })
  })

  it('resolveAdsetTargeting accepts advantageAudience=1', () => {
    const resolved = resolveAdsetTargeting({
      targetingTemplate: 'BR_25_54',
      advantageAudience: 1,
    })
    expect(resolved.advantageAudience).toBe(1)
    expect(resolved.targeting.targeting_automation).toEqual({ advantage_audience: 1 })
  })

  it('custom targeting always includes advantage_audience', () => {
    const resolved = resolveAdsetTargeting({
      targeting: {
        geo_locations: { countries: ['BR'] },
        age_min: 25,
        age_max: 45,
      },
    })
    expect(resolved.source).toBe('custom')
    expect(resolved.targeting.targeting_automation).toEqual({ advantage_audience: 0 })
  })

  it('resolveAdsetTargeting rejects both template and custom', () => {
    expect(() => resolveAdsetTargeting({
      targetingTemplate: 'BR_18_65',
      targeting: { geo_locations: { countries: ['BR'] }, age_min: 18, age_max: 40 },
    })).toThrow(/não ambos/)
  })
})
