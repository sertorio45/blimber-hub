import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  assertWhatsAppAdsetCompatibility,
  buildMetaCreateAdCreativeBody,
  buildMetaCreateAdCreativeBodyByType,
  buildMetaCreateAdsetGraphBody,
  buildMetaCreateCampaignGraphBody,
  defaultMetaGraphFetch,
  encodeMetaGraphBodyValue,
  enrichMetaGraphWriteError,
  extractMetaGraphErrorFields,
  isMetaMessagingProtocolUrl,
  MetaAdsToolError,
  META_GRAPH_FORM_CONTENT_TYPE,
  META_WHATSAPP_MESSAGING_LINK,
  normalizeMetaAdCreativeType,
  resolveMetaAdsStudiesGraphVersion,
  resolveMetaGraphVersion,
  toMetaGraphFormParams,
} from '~/lib/meta-ads'

describe('resolveMetaGraphVersion', () => {
  it('defaults to v25.0 when no env is set', () => {
    const prevAds = process.env.META_ADS_GRAPH_VERSION
    const prevGraph = process.env.META_GRAPH_VERSION
    delete process.env.META_ADS_GRAPH_VERSION
    delete process.env.META_GRAPH_VERSION
    try {
      expect(resolveMetaGraphVersion()).toBe('v25.0')
      expect(resolveMetaGraphVersion('v24.0')).toBe('v24.0')
    }
    finally {
      if (prevAds === undefined)
        delete process.env.META_ADS_GRAPH_VERSION
      else
        process.env.META_ADS_GRAPH_VERSION = prevAds
      if (prevGraph === undefined)
        delete process.env.META_GRAPH_VERSION
      else
        process.env.META_GRAPH_VERSION = prevGraph
    }
  })

  it('prefers META_ADS_GRAPH_VERSION over META_GRAPH_VERSION', () => {
    const prevAds = process.env.META_ADS_GRAPH_VERSION
    const prevGraph = process.env.META_GRAPH_VERSION
    process.env.META_ADS_GRAPH_VERSION = 'v25.0'
    process.env.META_GRAPH_VERSION = 'v20.0'
    try {
      expect(resolveMetaGraphVersion()).toBe('v25.0')
    }
    finally {
      if (prevAds === undefined)
        delete process.env.META_ADS_GRAPH_VERSION
      else
        process.env.META_ADS_GRAPH_VERSION = prevAds
      if (prevGraph === undefined)
        delete process.env.META_GRAPH_VERSION
      else
        process.env.META_GRAPH_VERSION = prevGraph
    }
  })
})

describe('resolveMetaAdsStudiesGraphVersion', () => {
  it('defaults to v26.0 without bumping Ads Graph v25.0', () => {
    const prevAds = process.env.META_ADS_GRAPH_VERSION
    const prevGraph = process.env.META_GRAPH_VERSION
    const prevStudies = process.env.META_ADS_STUDIES_GRAPH_VERSION
    delete process.env.META_ADS_GRAPH_VERSION
    delete process.env.META_GRAPH_VERSION
    delete process.env.META_ADS_STUDIES_GRAPH_VERSION
    try {
      expect(resolveMetaGraphVersion()).toBe('v25.0')
      expect(resolveMetaAdsStudiesGraphVersion()).toBe('v26.0')
    }
    finally {
      if (prevAds === undefined)
        delete process.env.META_ADS_GRAPH_VERSION
      else
        process.env.META_ADS_GRAPH_VERSION = prevAds
      if (prevGraph === undefined)
        delete process.env.META_GRAPH_VERSION
      else
        process.env.META_GRAPH_VERSION = prevGraph
      if (prevStudies === undefined)
        delete process.env.META_ADS_STUDIES_GRAPH_VERSION
      else
        process.env.META_ADS_STUDIES_GRAPH_VERSION = prevStudies
    }
  })

  it('honors META_ADS_STUDIES_GRAPH_VERSION independently of Ads version', () => {
    const prevAds = process.env.META_ADS_GRAPH_VERSION
    const prevStudies = process.env.META_ADS_STUDIES_GRAPH_VERSION
    process.env.META_ADS_GRAPH_VERSION = 'v25.0'
    process.env.META_ADS_STUDIES_GRAPH_VERSION = 'v25.0'
    try {
      expect(resolveMetaGraphVersion()).toBe('v25.0')
      expect(resolveMetaAdsStudiesGraphVersion()).toBe('v25.0')
    }
    finally {
      if (prevAds === undefined)
        delete process.env.META_ADS_GRAPH_VERSION
      else
        process.env.META_ADS_GRAPH_VERSION = prevAds
      if (prevStudies === undefined)
        delete process.env.META_ADS_STUDIES_GRAPH_VERSION
      else
        process.env.META_ADS_STUDIES_GRAPH_VERSION = prevStudies
    }
  })
})

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

  it('builds VIDEO creative with video_data', () => {
    const body = buildMetaCreateAdCreativeBodyByType({
      creativeName: 'Vid',
      pageId: 'page_1',
      creativeType: 'VIDEO',
      destinationType: 'WEBSITE',
      videoId: 'vid_99',
      website: {
        message: 'Assista',
        linkUrl: 'https://example.com/v',
        callToAction: 'LEARN_MORE',
        headline: 'Novo vídeo',
        imageHash: 'thumb_hash',
      },
    })
    expect(body.object_story_spec).toMatchObject({
      page_id: 'page_1',
      video_data: {
        video_id: 'vid_99',
        message: 'Assista',
        title: 'Novo vídeo',
        image_hash: 'thumb_hash',
        call_to_action: {
          type: 'LEARN_MORE',
          value: { link: 'https://example.com/v' },
        },
      },
    })
  })

  it('builds CAROUSEL WHATSAPP with protocol link and WHATSAPP_MESSAGE on parent and cards', () => {
    const body = buildMetaCreateAdCreativeBodyByType({
      creativeName: 'CarWA',
      pageId: 'page_1',
      creativeType: 'CAROUSEL',
      destinationType: 'WHATSAPP',
      whatsapp: {
        message: 'Fale conosco',
        headline: 'Instituto',
        welcomeMessage: 'Olá!',
      },
      childAttachments: [
        { name: 'Aula 1', imageHash: 'h1' },
        { name: 'Aula 2', imageHash: 'h2' },
      ],
    })
    expect(body.object_story_spec).toMatchObject({
      page_id: 'page_1',
      link_data: {
        message: 'Fale conosco',
        name: 'Instituto',
        link: META_WHATSAPP_MESSAGING_LINK,
        multi_share_optimized: true,
        call_to_action: {
          type: 'WHATSAPP_MESSAGE',
          value: { app_destination: 'WHATSAPP' },
        },
        child_attachments: [
          {
            name: 'Aula 1',
            image_hash: 'h1',
            link: META_WHATSAPP_MESSAGING_LINK,
            call_to_action: {
              type: 'WHATSAPP_MESSAGE',
              value: { app_destination: 'WHATSAPP' },
            },
          },
          {
            name: 'Aula 2',
            image_hash: 'h2',
            link: META_WHATSAPP_MESSAGING_LINK,
            call_to_action: {
              type: 'WHATSAPP_MESSAGE',
              value: { app_destination: 'WHATSAPP' },
            },
          },
        ],
      },
    })
    expect((body.object_story_spec as any).link_data.page_welcome_message).toBeTruthy()
  })

  it('builds INSTAGRAM_DIRECT IMAGE with instagram_user_id and INSTAGRAM_MESSAGE', () => {
    const body = buildMetaCreateAdCreativeBodyByType({
      creativeName: 'IG',
      pageId: 'page_1',
      creativeType: 'IMAGE',
      destinationType: 'INSTAGRAM_DIRECT',
      instagramUserId: 'ig_99',
      whatsapp: { message: 'DM no Instagram', imageHash: 'h1' },
    })
    expect(body.object_story_spec).toMatchObject({
      page_id: 'page_1',
      instagram_user_id: 'ig_99',
      link_data: {
        message: 'DM no Instagram',
        image_hash: 'h1',
        call_to_action: {
          type: 'INSTAGRAM_MESSAGE',
          value: { app_destination: 'INSTAGRAM_DIRECT' },
        },
      },
    })
    expect((body.object_story_spec as any).link_data.link).toBeUndefined()
  })

  it('rejects DYNAMIC_CREATIVE_LEGACY with WHATSAPP', () => {
    expect(() => buildMetaCreateAdCreativeBodyByType({
      creativeName: 'Dyn',
      pageId: 'page_1',
      creativeType: 'DYNAMIC_CREATIVE_LEGACY',
      destinationType: 'WHATSAPP',
      assetFeed: {
        bodies: [{ text: 'A' }],
        titles: [{ text: 'T' }],
        images: [{ hash: 'h1' }],
        linkUrls: [{ websiteUrl: 'https://example.com' }],
        callToActionTypes: ['LEARN_MORE'],
        adFormats: ['SINGLE_IMAGE'],
      },
    })).toThrow(/DYNAMIC/)
  })

  it('builds CAROUSEL creative with child_attachments', () => {
    const body = buildMetaCreateAdCreativeBodyByType({
      creativeName: 'Car',
      pageId: 'page_1',
      creativeType: 'CAROUSEL',
      destinationType: 'WEBSITE',
      website: {
        message: 'Escolha',
        linkUrl: 'https://example.com',
        callToAction: 'SHOP_NOW',
      },
      childAttachments: [
        { link: 'https://example.com/p1', name: 'P1', imageHash: 'h1' },
        { link: 'https://example.com/p2', name: 'P2', imageHash: 'h2' },
      ],
    })
    expect(body.object_story_spec).toMatchObject({
      page_id: 'page_1',
      link_data: {
        message: 'Escolha',
        link: 'https://example.com',
        multi_share_optimized: true,
        child_attachments: [
          { link: 'https://example.com/p1', name: 'P1', image_hash: 'h1' },
          { link: 'https://example.com/p2', name: 'P2', image_hash: 'h2' },
        ],
      },
    })
  })

  it('builds DYNAMIC_CREATIVE_LEGACY with asset_feed_spec', () => {
    const body = buildMetaCreateAdCreativeBodyByType({
      creativeName: 'Dyn',
      pageId: 'page_1',
      creativeType: 'DYNAMIC_CREATIVE_LEGACY',
      destinationType: 'WEBSITE',
      assetFeed: {
        bodies: [{ text: 'Body A' }],
        titles: [{ text: 'Title A' }],
        images: [{ hash: 'h1' }, { hash: 'h2' }],
        linkUrls: [{ websiteUrl: 'https://example.com' }],
        callToActionTypes: ['LEARN_MORE'],
        adFormats: ['SINGLE_IMAGE'],
      },
    })
    expect(body).toMatchObject({
      name: 'Dyn',
      object_story_spec: { page_id: 'page_1' },
      asset_feed_spec: {
        ad_formats: ['SINGLE_IMAGE'],
        bodies: [{ text: 'Body A' }],
        images: [{ hash: 'h1' }, { hash: 'h2' }],
      },
    })
  })

  it('builds Advantage+ degrees_of_freedom_spec with pac_relaxation', () => {
    const body = buildMetaCreateAdCreativeBodyByType({
      creativeName: 'Img+',
      pageId: 'page_1',
      creativeType: 'IMAGE',
      destinationType: 'WEBSITE',
      website: {
        message: 'Oi',
        linkUrl: 'https://example.com',
        callToAction: 'LEARN_MORE',
      },
      degreesOfFreedom: {
        creativeFeaturesSpec: {
          pac_relaxation: { enrollStatus: 'OPT_IN' },
          text_optimizations: { enrollStatus: 'OPT_IN' },
        },
      },
    })
    expect(body.degrees_of_freedom_spec).toEqual({
      creative_features_spec: {
        pac_relaxation: { enroll_status: 'OPT_IN' },
        text_optimizations: { enroll_status: 'OPT_IN' },
      },
    })
  })

  it('normalizes DYNAMIC_CREATIVE alias to DYNAMIC_CREATIVE_LEGACY', () => {
    expect(normalizeMetaAdCreativeType('DYNAMIC_CREATIVE')).toBe('DYNAMIC_CREATIVE_LEGACY')
    expect(normalizeMetaAdCreativeType('dynamic')).toBe('DYNAMIC_CREATIVE_LEGACY')
  })

  it('rejects FLEXIBLE_AD_FORMAT creativeType', () => {
    expect(() => normalizeMetaAdCreativeType('FLEXIBLE_AD_FORMAT')).toThrow(/CREATIVE_TYPE_UNSUPPORTED|FLEXIBLE/)
  })

  it('normalizes creativeType aliases', () => {
    expect(normalizeMetaAdCreativeType('static')).toBe('IMAGE')
    expect(normalizeMetaAdCreativeType('VIDEO')).toBe('VIDEO')
    expect(normalizeMetaAdCreativeType('carousel')).toBe('CAROUSEL')
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

  it('isDynamicCreative sets is_dynamic_creative on WEBSITE adset', () => {
    const body = buildMetaCreateAdsetGraphBody({
      name: 'Dyn',
      campaignId: 'cmp_1',
      billingEvent: 'IMPRESSIONS',
      optimizationGoal: 'LINK_CLICKS',
      status: 'PAUSED',
      targeting: { geo_locations: { countries: ['BR'] }, age_min: 18, age_max: 65 },
      destinationType: 'WEBSITE',
      isDynamicCreative: true,
      dailyBudget: 3000,
    })
    expect(body.is_dynamic_creative).toBe(true)
  })

  it('isDynamicCreative rejects WHATSAPP destination', () => {
    expect(() => buildMetaCreateAdsetGraphBody({
      name: 'Bad',
      campaignId: 'cmp_1',
      billingEvent: 'IMPRESSIONS',
      optimizationGoal: 'CONVERSATIONS',
      status: 'PAUSED',
      targeting: { geo_locations: { countries: ['BR'] }, age_min: 18, age_max: 65 },
      destinationType: 'WHATSAPP',
      pageId: 'page_1',
      isDynamicCreative: true,
      dailyBudget: 1000,
    })).toThrow(/isDynamicCreative|WEBSITE/)
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
    expect(encodeMetaGraphBodyValue('{"already":"string"}')).toBe('{"already":"string"}')
  })

  it('form-urlencoded body stringifies nested fields once', () => {
    const rule = { inclusions: { operator: 'or', rules: [{ filter: { value: 'ig_business_profile_engaged' } }] } }
    const params = toMetaGraphFormParams({
      name: 'IM_IG_ENGAJAMENTO_30D',
      subtype: 'ENGAGEMENT',
      prefill: '1',
      rule: JSON.stringify(rule),
    })
    expect(params.get('prefill')).toBe('1')
    expect(params.get('rule')![0]).toBe('{')
    expect(JSON.parse(params.get('rule')!)).toEqual(rule)
    expect(params.get('rule')).not.toBe(JSON.stringify(JSON.stringify(rule)))
    expect(params.toString()).toContain('rule=%7B')
    expect(params.toString()).toContain(encodeURIComponent(JSON.stringify(rule)).replace(/%20/g, '+'))
  })
})

describe('defaultMetaGraphFetch form encoding', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('POSTs customaudiences as application/x-www-form-urlencoded', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'aud_1' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const rule = {
      inclusions: {
        operator: 'or',
        rules: [{
          event_sources: [{ type: 'ig_business', id: 'ig_1' }],
          retention_seconds: 2592000,
          filter: {
            operator: 'and',
            filters: [{ field: 'event', operator: 'eq', value: 'ig_business_profile_engaged' }],
          },
        }],
      },
    }

    await defaultMetaGraphFetch('https://graph.facebook.com/v25.0/act_1/customaudiences', {
      method: 'POST',
      query: { access_token: 'tok' },
      body: {
        name: 'IM_IG_ENGAJAMENTO_30D',
        subtype: 'ENGAGEMENT',
        prefill: '1',
        rule: JSON.stringify(rule),
      },
      bodyEncoding: 'form',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('https://graph.facebook.com/v25.0/act_1/customaudiences')
    expect(url).toContain('access_token=tok')
    expect(url).not.toContain('rule=')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(META_GRAPH_FORM_CONTENT_TYPE)
    const form = new URLSearchParams(String(init.body))
    expect(form.get('prefill')).toBe('1')
    expect(form.get('subtype')).toBe('ENGAGEMENT')
    expect(typeof form.get('rule')).toBe('string')
    expect(form.get('rule')![0]).toBe('{')
    expect(JSON.parse(form.get('rule')!)).toEqual(rule)
    expect(form.get('rule')).not.toBe(JSON.stringify(JSON.stringify(rule)))
  })
})
