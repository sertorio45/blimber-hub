import { describe, expect, it } from 'vitest'
import {
  buildMetaCreateCampaignGraphBody,
  encodeMetaGraphBodyValue,
  enrichMetaGraphWriteError,
  extractMetaGraphErrorFields,
  MetaAdsToolError,
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
