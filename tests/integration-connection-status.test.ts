import { describe, expect, it } from 'vitest'

import {
  integrationStatusLabel,
  resolveIntegrationConnectionStatus,
} from '~/composables/marketing/useIntegrationConnectionStatus'

describe('resolveIntegrationConnectionStatus', () => {
  it('returns disconnected when there is no token', () => {
    expect(resolveIntegrationConnectionStatus('meta', undefined)).toBe('disconnected')
    expect(resolveIntegrationConnectionStatus('meta', { has_key: false })).toBe('disconnected')
  })

  it('returns expired when token_expires_at is in the past', () => {
    expect(resolveIntegrationConnectionStatus('google_ads', {
      has_key: true,
      config: { token_expires_at: '2020-01-01T00:00:00.000Z' },
    })).toBe('expired')
  })

  it('returns needs_setup for incomplete provider configs', () => {
    expect(resolveIntegrationConnectionStatus('google_ads', {
      has_key: true,
      google_ads_needs_account: true,
      config: {},
    })).toBe('needs_setup')

    expect(resolveIntegrationConnectionStatus('google_analytics', {
      has_key: true,
      google_analytics_needs_property: true,
      config: {},
    })).toBe('needs_setup')

    expect(resolveIntegrationConnectionStatus('meta', {
      has_key: true,
      can_publish: false,
      config: {},
    })).toBe('needs_setup')

    expect(resolveIntegrationConnectionStatus('linkedin', {
      has_key: true,
      config: {},
    })).toBe('needs_setup')
  })

  it('returns connected when provider is ready', () => {
    expect(resolveIntegrationConnectionStatus('meta', {
      has_key: true,
      can_publish: true,
      config: { token_expires_at: '2099-01-01T00:00:00.000Z' },
    })).toBe('connected')

    expect(resolveIntegrationConnectionStatus('linkedin', {
      has_key: true,
      config: { organization_id: 'urn:li:organization:1' },
    })).toBe('connected')
  })

  it('exposes Portuguese labels', () => {
    expect(integrationStatusLabel('disconnected')).toBe('Não conectado')
    expect(integrationStatusLabel('needs_setup')).toBe('Configuração pendente')
    expect(integrationStatusLabel('expired')).toBe('Expirado')
  })
})
