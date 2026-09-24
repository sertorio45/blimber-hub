import { describe, expect, it } from 'vitest'
import {
  assertCreativeDestinationCompatibility,
  buildMetaCreateAdCreativeBodyByType,
  buildMetaCreateAdsetGraphBody,
  getMetaCapabilities,
  MetaAdsToolError,
  META_AD_CREATIVE_TYPES,
  META_AD_DESTINATION_TYPES,
} from '~/lib/meta-ads'

const ALLOWED: Record<string, readonly string[]> = {
  IMAGE: ['WEBSITE', 'WHATSAPP', 'MESSENGER', 'INSTAGRAM_DIRECT', 'INSTAGRAM_PROFILE'],
  VIDEO: ['WEBSITE', 'WHATSAPP', 'MESSENGER', 'INSTAGRAM_DIRECT', 'INSTAGRAM_PROFILE'],
  CAROUSEL: ['WEBSITE', 'WHATSAPP', 'MESSENGER', 'INSTAGRAM_DIRECT', 'INSTAGRAM_PROFILE'],
  DYNAMIC_CREATIVE_LEGACY: ['WEBSITE'],
  CATALOG: ['WEBSITE'],
}

function sampleBody(creativeType: string, destinationType: string) {
  const messaging = ['WHATSAPP', 'MESSENGER', 'INSTAGRAM_DIRECT'].includes(destinationType)
  return buildMetaCreateAdCreativeBodyByType({
    creativeName: 'T',
    pageId: 'page_1',
    creativeType: creativeType as any,
    destinationType: destinationType as any,
    instagramUserId: destinationType === 'INSTAGRAM_DIRECT' || destinationType === 'INSTAGRAM_PROFILE' ? 'ig_1' : undefined,
    website: destinationType === 'WEBSITE' || destinationType === 'INSTAGRAM_PROFILE'
      ? {
          message: 'Hi',
          linkUrl: 'https://example.com',
          callToAction: 'LEARN_MORE',
        }
      : undefined,
    whatsapp: messaging ? { message: 'Oi', imageHash: 'h1' } : undefined,
    videoId: creativeType === 'VIDEO' ? 'vid_1' : undefined,
    childAttachments: creativeType === 'CAROUSEL'
      ? [
          { name: 'A', imageHash: 'h1', ...(!messaging ? { link: 'https://example.com/a' } : {}) },
          { name: 'B', imageHash: 'h2', ...(!messaging ? { link: 'https://example.com/b' } : {}) },
        ]
      : undefined,
    assetFeed: creativeType === 'DYNAMIC_CREATIVE_LEGACY'
      ? {
          bodies: [{ text: 'A' }],
          titles: [{ text: 'T' }],
          images: [{ hash: 'h1' }],
          linkUrls: [{ websiteUrl: 'https://example.com' }],
          callToActionTypes: ['LEARN_MORE'],
          adFormats: ['SINGLE_IMAGE'],
        }
      : undefined,
    productSetId: creativeType === 'CATALOG' ? 'ps_1' : undefined,
  })
}

describe('creativeType × destination matrix', () => {
  for (const creativeType of META_AD_CREATIVE_TYPES) {
    for (const destinationType of META_AD_DESTINATION_TYPES) {
      const allowed = ALLOWED[creativeType]?.includes(destinationType)
      it(`${creativeType} × ${destinationType} ${allowed ? 'allowed' : 'rejected'}`, () => {
        if (allowed) {
          expect(() => assertCreativeDestinationCompatibility({ creativeType, destinationType })).not.toThrow()
          expect(() => sampleBody(creativeType, destinationType)).not.toThrow()
        }
        else {
          expect(() => assertCreativeDestinationCompatibility({ creativeType, destinationType })).toThrow(MetaAdsToolError)
          expect(() => sampleBody(creativeType, destinationType)).toThrow(MetaAdsToolError)
        }
      })
    }
  }

  it('MESSENGER and INSTAGRAM_DIRECT adsets set destination_type + page promoted_object', () => {
    const messenger = buildMetaCreateAdsetGraphBody({
      name: 'M',
      campaignId: 'c1',
      billingEvent: 'IMPRESSIONS',
      optimizationGoal: 'CONVERSATIONS',
      status: 'PAUSED',
      targeting: { geo_locations: { countries: ['BR'] } },
      destinationType: 'MESSENGER',
      pageId: 'page_1',
      dailyBudget: 1000,
    })
    expect(messenger).toMatchObject({
      destination_type: 'MESSENGER',
      promoted_object: { page_id: 'page_1' },
    })

    const ig = buildMetaCreateAdsetGraphBody({
      name: 'IG',
      campaignId: 'c1',
      billingEvent: 'IMPRESSIONS',
      optimizationGoal: 'CONVERSATIONS',
      status: 'PAUSED',
      targeting: { geo_locations: { countries: ['BR'] } },
      destinationType: 'INSTAGRAM_DIRECT',
      pageId: 'page_1',
      dailyBudget: 1000,
    })
    expect(ig.destination_type).toBe('INSTAGRAM_DIRECT')
  })

  it('uses the connected Instagram identity for INSTAGRAM_PROFILE adsets', () => {
    const profile = buildMetaCreateAdsetGraphBody({
      name: 'Visitas ao perfil',
      campaignId: 'c1',
      billingEvent: 'IMPRESSIONS',
      optimizationGoal: 'PROFILE_VISIT',
      status: 'PAUSED',
      targeting: { geo_locations: { countries: ['BR'] } },
      destinationType: 'INSTAGRAM_PROFILE',
      instagramUserId: 'ig_1',
      dailyBudget: 1000,
    })
    expect(profile).toMatchObject({
      destination_type: 'INSTAGRAM_PROFILE',
      promoted_object: { instagram_user_id: 'ig_1' },
    })
  })

  it('capabilities report messaging destinations and carousel beyond WEBSITE', () => {
    const caps = getMetaCapabilities('v25.0')
    expect(caps.destinations.WHATSAPP_CTWA.supported).toBe(true)
    expect(caps.destinations.MESSENGER.supported).toBe(true)
    expect(caps.destinations.INSTAGRAM_DIRECT.supported).toBe(true)
    expect(caps.destinations.INSTAGRAM_PROFILE.supported).toBe(true)
    expect(caps.creativeTypes.CAROUSEL.notes).toMatch(/WHATSAPP/)
  })
})
