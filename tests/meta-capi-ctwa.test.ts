import { describe, expect, it } from 'vitest'

import {
  META_CRM_ACTION_SOURCE,
  buildUserData,
  describeMetaError,
  hasMinimumMatchData,
  resolveMetaActionSource,
} from '~/server/utils/crm/meta-capi'

describe('Meta CAPI CTWA / business_messaging', () => {
  describe('resolveMetaActionSource', () => {
    it('returns business_messaging when ctwa_clid is present', () => {
      expect(resolveMetaActionSource({
        metaCtwaClid: 'clid_abc',
        source: 'social',
      })).toBe('business_messaging')
    })

    it('falls back to system_generated for classic CRM leads', () => {
      expect(resolveMetaActionSource({
        source: 'website',
        metaLeadId: 'lead_form_1',
        hasWhatsapp: true,
      })).toBe(META_CRM_ACTION_SOURCE)
      expect(resolveMetaActionSource({})).toBe('system_generated')
    })

    it('ignores blank ctwa_clid', () => {
      expect(resolveMetaActionSource({ metaCtwaClid: '   ' })).toBe('system_generated')
    })
  })

  describe('buildUserData', () => {
    it('includes ctwa_clid in user_data when present', () => {
      const userData = buildUserData({
        email: 'lead@example.com',
        phone: '11987654321',
        name: 'Maria Silva',
        metaCtwaClid: 'ctwa_click_xyz',
      })

      expect(userData.ctwa_clid).toBe('ctwa_click_xyz')
      expect(Array.isArray(userData.em)).toBe(true)
      expect(Array.isArray(userData.ph)).toBe(true)
      expect(hasMinimumMatchData(userData)).toBe(true)
    })

    it('surfaces the Meta user-facing reason instead of the generic message', () => {
      const message = describeMetaError({
        data: {
          error: {
            message: 'Invalid parameter',
            error_user_title: 'Parâmetro inválido',
            error_user_msg: 'ctwa_clid requer whatsapp_business_account_id',
          },
        },
      })

      expect(message).toBe(
        'Parâmetro inválido — ctwa_clid requer whatsapp_business_account_id — Invalid parameter',
      )
    })

    it('falls back to a default message when Meta sends no detail', () => {
      expect(describeMetaError({})).toBe('Falha ao enviar evento para a Meta')
    })

    it('includes whatsapp_business_account_id alongside ctwa_clid', () => {
      const userData = buildUserData({
        phone: '11987654321',
        metaCtwaClid: 'ctwa_click_xyz',
        wabaId: '123456789012345',
      })

      expect(userData.ctwa_clid).toBe('ctwa_click_xyz')
      expect(userData.whatsapp_business_account_id).toBe('123456789012345')
    })

    it('omits whatsapp_business_account_id when there is no ctwa_clid', () => {
      const userData = buildUserData({
        phone: '11987654321',
        wabaId: '123456789012345',
      })

      expect(userData.whatsapp_business_account_id).toBeUndefined()
    })

    it('omits ctwa_clid when absent', () => {
      const userData = buildUserData({
        email: 'lead@example.com',
        phone: '11987654321',
        name: 'Maria',
      })

      expect(userData.ctwa_clid).toBeUndefined()
    })

    it('treats ctwa_clid alone as enough matching data', () => {
      const userData = buildUserData({
        metaCtwaClid: 'only_clid',
      })

      expect(userData.ctwa_clid).toBe('only_clid')
      expect(hasMinimumMatchData(userData)).toBe(true)
    })
  })
})
