import { describe, expect, it } from 'vitest'
import {
  filterSavedAudiencesByName,
  mapSavedAudienceRow,
  refineTargetingSourceXor,
} from '../lib/meta-ads/saved-audiences'
import { z } from 'zod'

describe('saved audiences helpers', () => {
  it('maps Graph rows and filters by exact / contains name', () => {
    const rows = [
      mapSavedAudienceRow({
        id: '1',
        name: 'CIDADE PIN 2',
        targeting: { geo_locations: { countries: ['BR'] } },
      }),
      mapSavedAudienceRow({
        id: '2',
        name: 'CIDADE PIN 1',
        targeting: { geo_locations: { countries: ['BR'] } },
      }),
    ]

    expect(filterSavedAudiencesByName(rows, { name: 'cidade pin 2' })).toHaveLength(1)
    expect(filterSavedAudiencesByName(rows, { name: 'cidade pin 2' })[0]!.id).toBe('1')
    expect(filterSavedAudiencesByName(rows, { nameContains: 'pin' })).toHaveLength(2)
    expect(filterSavedAudiencesByName(rows, { nameContains: 'pin 2' })).toHaveLength(1)
  })

  it('refineTargetingSourceXor requires exactly one source', () => {
    const schema = z.object({
      targetingTemplate: z.string().optional(),
      targeting: z.record(z.unknown()).optional(),
      savedAudienceId: z.string().optional(),
    }).superRefine(refineTargetingSourceXor)

    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ targetingTemplate: 'BR_18_65', savedAudienceId: 'SA' }).success).toBe(false)
    expect(schema.safeParse({ savedAudienceId: 'SA_1' }).success).toBe(true)
  })
})
