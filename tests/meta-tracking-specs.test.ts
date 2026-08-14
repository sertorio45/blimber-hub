import { describe, expect, it } from 'vitest'
import { MetaAdsToolError } from '~/lib/meta-ads'
import {
  compileAdTracking,
  mergeTrackingSpecs,
  metaTrackingSpecInputSchema,
} from '~/lib/meta-ads/tracking-specs'

describe('meta tracking_specs compile', () => {
  it('maps pixelId + offlineDatasetId to official Graph keys', () => {
    const compiled = compileAdTracking({
      pixelId: '111',
      offlineDatasetId: '222',
      conversionDomain: 'exemplo.com',
    })
    expect(compiled.trackingSpecs).toEqual([
      { 'action.type': 'offsite_conversion', fb_pixel: '111' },
      { 'action.type': 'offline_conversion', dataset: '222' },
    ])
    expect(compiled.conversionDomain).toBe('exemplo.com')
  })

  it('accepts Graph aliases action.type and fb_pixel', () => {
    const item = metaTrackingSpecInputSchema.parse({
      'action.type': 'offsite_conversion',
      fb_pixel: ['333'],
    })
    const compiled = compileAdTracking({ trackingSpecs: [item] })
    expect(compiled.trackingSpecs[0]).toEqual({
      'action.type': 'offsite_conversion',
      fb_pixel: '333',
    })
  })

  it('rejects invented action types', () => {
    const parsed = metaTrackingSpecInputSchema.safeParse({
      actionType: 'link_click',
      fbPixel: '1',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects offsite_conversion + dataset combo', () => {
    const parsed = metaTrackingSpecInputSchema.safeParse({
      actionType: 'offsite_conversion',
      fbPixel: '1',
      dataset: '2',
    })
    expect(parsed.success).toBe(false)
  })

  it('conflicts when pixelId disagrees with trackingSpecs', () => {
    expect(() => compileAdTracking({
      pixelId: '111',
      trackingSpecs: [{ actionType: 'offsite_conversion', fbPixel: '999' }],
    })).toThrow(MetaAdsToolError)
    try {
      compileAdTracking({
        pixelId: '111',
        trackingSpecs: [{ actionType: 'offsite_conversion', fbPixel: '999' }],
      })
    }
    catch (err) {
      expect((err as MetaAdsToolError).code).toBe('TRACKING_SPEC_CONFLICT')
    }
  })

  it('merges new pixel onto existing post_engagement snapshot', () => {
    const merged = mergeTrackingSpecs({
      existing: [
        { 'action.type': ['post_engagement'], page: ['1'] },
        { 'action.type': ['offsite_conversion'], fb_pixel: ['111'] },
      ],
      incoming: [
        { 'action.type': 'offsite_conversion', fb_pixel: '111' },
        { 'action.type': 'offline_conversion', dataset: '222' },
      ],
      replace: false,
    })
    expect(merged).toHaveLength(3)
    expect(merged[2]).toMatchObject({ 'action.type': 'offline_conversion', dataset: '222' })
  })

  it('replace drops previous specs', () => {
    const merged = mergeTrackingSpecs({
      existing: [{ 'action.type': ['post_engagement'], page: ['1'] }],
      incoming: [{ 'action.type': 'offline_conversion', dataset: '222' }],
      replace: true,
    })
    expect(merged).toEqual([{ 'action.type': 'offline_conversion', dataset: '222' }])
  })
})
