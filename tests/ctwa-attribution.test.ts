import { describe, expect, it } from 'vitest'

import {
  CTWA_ATTRIBUTION_MATCH_DAYS,
  buildCtwaMessageMetadata,
  buildLeadCtwaFields,
  extractCtwaReferral,
  normalizePhoneE164,
  type WhatsappAttributionRow,
} from '~/server/utils/whatsapp/ctwa-attribution'

describe('CTWA attribution helpers', () => {
  describe('normalizePhoneE164', () => {
    it('normalizes Brazilian mobile with country code', () => {
      expect(normalizePhoneE164('+55 11 98765-4321')).toBe('5511987654321')
      expect(normalizePhoneE164('(11) 98765-4321')).toBe('5511987654321')
      expect(normalizePhoneE164('11987654321')).toBe('5511987654321')
    })

    it('returns null for short or empty values', () => {
      expect(normalizePhoneE164(null)).toBeNull()
      expect(normalizePhoneE164('')).toBeNull()
      expect(normalizePhoneE164('123')).toBeNull()
    })
  })

  describe('match window', () => {
    it('uses a 7-day attribution window', () => {
      expect(CTWA_ATTRIBUTION_MATCH_DAYS).toBe(7)
    })
  })

  describe('extractCtwaReferral', () => {
    it('extracts Cloud API referral.ctwa_clid', () => {
      const referral = extractCtwaReferral({
        referral: {
          ctwa_clid: 'clid_cloud_1',
          source_id: 'ad_111',
          source_type: 'ad',
          headline: 'Oferta WhatsApp',
          body: 'Fale conosco',
        },
      })

      expect(referral).toEqual({
        ctwaClid: 'clid_cloud_1',
        sourceId: 'ad_111',
        sourceType: 'ad',
        headline: 'Oferta WhatsApp',
        body: 'Fale conosco',
      })
    })

    it('extracts nested message.referral (Cloud webhook shape)', () => {
      const referral = extractCtwaReferral({
        message: {
          referral: {
            ctwa_clid: 'clid_nested',
            source_id: 'ad_222',
            source_type: 'ad',
          },
        },
      })

      expect(referral?.ctwaClid).toBe('clid_nested')
      expect(referral?.sourceId).toBe('ad_222')
    })

    it('extracts Evolution externalAdReply with camelCase click id', () => {
      const referral = extractCtwaReferral({
        contextInfo: {
          externalAdReply: {
            ctwaClid: 'clid_evo_1',
            sourceId: 'ad_333',
            sourceType: 'ad',
            title: 'Headline Evo',
            description: 'Body Evo',
          },
        },
      })

      expect(referral).toEqual({
        ctwaClid: 'clid_evo_1',
        sourceId: 'ad_333',
        sourceType: 'ad',
        headline: 'Headline Evo',
        body: 'Body Evo',
      })
    })

    it('extracts Evolution message.contextInfo.externalAdReply', () => {
      const referral = extractCtwaReferral({
        message: {
          contextInfo: {
            externalAdReply: {
              ctwa_clid: 'clid_evo_nested',
              ad_id: 'ad_444',
            },
          },
        },
      })

      expect(referral?.ctwaClid).toBe('clid_evo_nested')
      expect(referral?.sourceId).toBe('ad_444')
    })

    it('returns null without ctwa click id', () => {
      expect(extractCtwaReferral({ referral: { source_id: 'ad_only' } })).toBeNull()
      expect(extractCtwaReferral(null)).toBeNull()
      expect(extractCtwaReferral({})).toBeNull()
    })
  })

  describe('buildCtwaMessageMetadata / buildLeadCtwaFields', () => {
    it('builds message metadata from referral', () => {
      expect(buildCtwaMessageMetadata({
        ctwaClid: 'clid_x',
        sourceId: 'ad_1',
        sourceType: 'ad',
        headline: 'H',
        body: 'B',
      })).toEqual({
        ctwa: {
          ctwa_clid: 'clid_x',
          source_id: 'ad_1',
          source_type: 'ad',
          headline: 'H',
          body: 'B',
        },
      })
    })

    it('maps attribution row to CRM lead fields', () => {
      const row: WhatsappAttributionRow = {
        id: 'attr-1',
        tenant_id: 't1',
        instance_id: null,
        phone_e164: '5511987654321',
        ctwa_clid: 'clid_map',
        source_id: 'ad_src',
        source_type: 'ad',
        headline: 'Click headline',
        body: null,
        meta_campaign_id: 'camp_1',
        meta_adset_id: 'adset_1',
        meta_ad_id: 'ad_1',
        meta_campaign_name: 'Campanha',
        meta_adset_name: 'Conjunto',
        meta_ad_name: 'Anúncio',
        waba_id: '987654321098765',
        received_at: '2026-08-20T12:00:00.000Z',
        matched_lead_id: null,
      }

      expect(buildLeadCtwaFields(row)).toMatchObject({
        meta_ctwa_clid: 'clid_map',
        meta_source_id: 'ad_src',
        meta_campaign_id: 'camp_1',
        meta_adset_id: 'adset_1',
        meta_ad_id: 'ad_1',
        meta_campaign_name: 'Campanha',
        meta_waba_id: '987654321098765',
        attribution_method: 'ctwa_clid',
        attribution_channel: 'whatsapp',
        attribution_date: '2026-08-20T12:00:00.000Z',
      })
    })
  })
})
