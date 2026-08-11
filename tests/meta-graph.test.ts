import { describe, expect, it } from 'vitest'
import {
  assertWhatsAppAdsetCompatibility,
  buildMetaCreateAdCreativeBody,
  buildMetaCreateAdsetGraphBody,
  buildMetaCreateCampaignGraphBody,
  encodeMetaGraphBodyValue,
  enrichMetaGraphWriteError,
  extractMetaGraphErrorFields,
  isMetaMessagingProtocolUrl,
  MetaAdsToolError,
  META_WHATSAPP_MESSAGING_LINK,
} from '~/lib/meta-ads'

describe('meta graph create campaign payload', () => {
  it('always includes special_ad_categories and ABO flag when no campaign budget', () => {
    const body = buildMetaCreateCampaignGraphBody({
      name: 'Test',
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
    })
    expect(body).toEqual({
      name: 'Test',
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    })
  })

  it('omits is_adset_budget_sharing_enabled when daily_budget is set (CBO)', () => {
    const body = buildMetaCreateCampaignGraphBody({
      name: 'CBO',
      objective: 'OUTCOME_SALES',
      status: 'PAUSED',
      dailyBudget: 5000,
      specialAdCategories: ['HOUSING'],
    })
    expect(body).toEqual({
      name: 'CBO',
      objective: 'OUTCOME_SALES',
      status: 'PAUSED',
      special_ad_categories: ['HOUSING'],
      daily_budget: 5000,
    })
    expect(body.is_adset_budget_sharing_enabled).toBeUndefined()
  })

  it('omits sharing flag when lifetime_budget is set', () => {
    const body = buildMetaCreateCampaignGraphBody({
      name: 'Life',
      objective: 'OUTCOME_LEADS',
      status: 'ACTIVE',
      lifetimeBudget: 90000,
    })
    expect(body.lifetime_budget).toBe(90000)
    expect(body.is_adset_budget_sharing_enabled).toBeUndefined()
  })
})

describe('meta CTWA / destination payloads', () => {
  it('detects messaging protocol hosts used as fake website URLs', () => {
    expect(isMetaMessagingProtocolUrl('https://wa.me/5511999999999')).toBe(true)
    expect(isMetaMessagingProtocolUrl('https://api.whatsapp.com/send')).toBe(true)
    expect(isMetaMessagingProtocolUrl('https://example.com/oferta')).toBe(false)
  })

  it('builds WEBSITE creative with value.link = site URL', () => {
    const body = buildMetaCreateAdCreativeBody({
      creativeName: 'C',
      pageId: 'page_1',
      destinationType: 'WEBSITE',
      website: {
        message: 'Buy',
        linkUrl: 'https://example.com/lp',
        callToAction: 'LEARN_MORE',
      },
    })
    expect(body).toEqual({
      name: 'C',
      object_story_spec: {
        page_id: 'page_1',
        link_data: {
          message: 'Buy',
          link: 'https://example.com/lp',
          call_to_action: {
            type: 'LEARN_MORE',
            value: { link: 'https://example.com/lp' },
          },
        },
      },
    })
  })

  it('builds WHATSAPP creative with official CTWA CTA (no site linkUrl)', () => {
    const body = buildMetaCreateAdCreativeBody({
      creativeName: 'WA',
      pageId: 'page_9',
      destinationType: 'WHATSAPP',
      whatsapp: { message: 'Oi WhatsApp' },
    })
    expect(body).toEqual({
      name: 'WA',
      object_story_spec: {
        page_id: 'page_9',
        link_data: {
          message: 'Oi WhatsApp',
          link: META_WHATSAPP_MESSAGING_LINK,
          call_to_action: {
            type: 'WHATSAPP_MESSAGE',
            value: { app_destination: 'WHATSAPP' },
          },
        },
      },
    })
  })

  it('builds WHATSAPP adset with destination_type and promoted_object', () => {
    const body = buildMetaCreateAdsetGraphBody({
      name: 'Set',
      campaignId: 'cmp_1',
      billingEvent: 'IMPRESSIONS',
      optimizationGoal: 'CONVERSATIONS',
      status: 'PAUSED',
      targeting: { geo_locations: { countries: ['BR'] }, age_min: 18, age_max: 65 },
      destinationType: 'WHATSAPP',
      pageId: 'page_1',
      whatsappPhoneNumber: '+5511999999999',
      dailyBudget: 1000,
    })
    expect(body).toMatchObject({
      destination_type: 'WHATSAPP',
      promoted_object: {
        page_id: 'page_1',
        whatsapp_phone_number: '+5511999999999',
      },
      optimization_goal: 'CONVERSATIONS',
      daily_budget: 1000,
    })
    expect(body).not.toHaveProperty('link')
  })

  it('WEBSITE adset omits destination_type (retrocompat)', () => {
    const body = buildMetaCreateAdsetGraphBody({
      name: 'Web',
      campaignId: 'cmp_1',
      billingEvent: 'IMPRESSIONS',
      optimizationGoal: 'LINK_CLICKS',
      status: 'PAUSED',
      targeting: { geo_locations: { countries: ['BR'] }, age_min: 18, age_max: 65 },
      destinationType: 'WEBSITE',
      dailyBudget: 2000,
    })
    expect(body.destination_type).toBeUndefined()
    expect(body.promoted_object).toBeUndefined()
  })

  it('assertWhatsAppAdsetCompatibility rejects AWARENESS', () => {
    expect(() => assertWhatsAppAdsetCompatibility({
      destinationType: 'WHATSAPP',
      optimizationGoal: 'CONVERSATIONS',
      billingEvent: 'IMPRESSIONS',
      campaignObjective: 'OUTCOME_AWARENESS',
    })).toThrow(MetaAdsToolError)
  })
})

describe('meta graph error parsing', () => {
  it('extracts code, subcode, user title/msg and fbtrace_id', () => {
    const fields = extractMetaGraphErrorFields({
      error: {
        message: 'Invalid parameter',
        type: 'OAuthException',
        code: 100,
        error_subcode: 1487694,
        error_user_title: 'Invalid Parameter',
        error_user_msg: 'special_ad_categories is required',
        fbtrace_id: 'AbcDef',
        is_transient: false,
      },
    }, 400)

    expect(fields).toEqual({
      message: 'Invalid parameter',
      type: 'OAuthException',
      code: 100,
      error_subcode: 1487694,
      error_user_title: 'Invalid Parameter',
      error_user_msg: 'special_ad_categories is required',
      fbtrace_id: 'AbcDef',
      is_transient: false,
    })
  })

  it('enrichMetaGraphWriteError attaches sanitized request_payload and strips tokens', () => {
    const err = new MetaAdsToolError('META_GRAPH_ERROR', 'Invalid parameter', 400, {
      type: 'OAuthException',
      code: 100,
      error_subcode: 1,
      fbtrace_id: 'x',
    })

    expect(() => enrichMetaGraphWriteError(err, {
      name: 'Camp',
      access_token: 'secret-token',
      special_ad_categories: [],
    })).toThrow(MetaAdsToolError)

    try {
      enrichMetaGraphWriteError(err, {
        name: 'Camp',
        access_token: 'secret-token',
        special_ad_categories: [],
      })
    }
    catch (thrown) {
      expect(thrown).toMatchObject({
        code: 'META_GRAPH_ERROR',
        details: {
          code: 100,
          error_subcode: 1,
          request_payload: {
            name: 'Camp',
            special_ad_categories: [],
          },
        },
      })
      expect(JSON.stringify((thrown as MetaAdsToolError).details)).not.toContain('secret-token')
      expect((thrown as MetaAdsToolError).details as any).not.toHaveProperty('request_payload.access_token')
    }
  })

  it('encodes booleans as 0/1 for Graph form posts', () => {
    expect(encodeMetaGraphBodyValue(false)).toBe(0)
    expect(encodeMetaGraphBodyValue(true)).toBe(1)
    expect(encodeMetaGraphBodyValue([])).toBe('[]')
    expect(encodeMetaGraphBodyValue(undefined)).toBeUndefined()
  })
})
