import { decryptSecret, maskSensitiveValue } from '../marketing-secrets'
import {
  formatGoogleAdsCustomerId,
  getGoogleAccessToken,
  normalizeGoogleCustomerId,
  resolveGoogleAdsDeveloperToken,
} from '~/server/utils/google-ads'
import type {
  GoogleAdsIntegrationPublicConfig,
  GoogleAdsIntegrationRecord,
  ResolvedGoogleAdsCredentials,
} from './types'
import { GoogleAdsToolError } from './types'

export interface SupabaseLike {
  from: (table: string) => {
    select: (columns: string) => any
  }
}

const GOOGLE_ADS_PROVIDERS = ['google_ads', 'google'] as const

function publicConfigFrom(config: Record<string, any> | null | undefined): GoogleAdsIntegrationPublicConfig {
  const c = config || {}
  const customerId = normalizeGoogleCustomerId(c.customer_id)
  return {
    customer_id: customerId || undefined,
    token_expires_at: c.token_expires_at,
    granted_scopes: c.granted_scopes,
  }
}

function hasStoredOauth(config: Record<string, any>): boolean {
  return Boolean(
    decryptSecret(config.access_token_enc) || decryptSecret(config.refresh_token_enc),
  )
}

export interface GoogleAdsIntegrationSummary {
  id: string
  provider: string
  is_active: boolean
  updated_at: string | null
  has_oauth: boolean
  has_access_token: boolean
  masked_token: string | null
  publicConfig: GoogleAdsIntegrationPublicConfig
  developer_token_configured: boolean
  needs_account: boolean
  ready: boolean
  token_expires_at: string | null
  notes: string[]
}

/** Resolve the Google Ads row for a tenant (supports legacy provider `google`). */
export async function resolveGoogleAdsIntegrationRow(
  client: SupabaseLike,
  tenantId: string,
): Promise<GoogleAdsIntegrationRecord | null> {
  if (!tenantId)
    throw new GoogleAdsToolError('TENANT_REQUIRED', 'tenantId é obrigatório', 400)

  const { data, error } = await client
    .from('marketing_integrations')
    .select('id, tenant_id, provider, is_active, updated_at, config')
    .eq('tenant_id', tenantId)
    .in('provider', [...GOOGLE_ADS_PROVIDERS])
    .order('provider')
    .limit(1)

  if (error)
    throw new GoogleAdsToolError('INTEGRATION_QUERY_FAILED', error.message, 500)

  const row = (data || [])[0] as GoogleAdsIntegrationRecord | undefined
  return row || null
}

export function summarizeGoogleAdsIntegration(
  row: GoogleAdsIntegrationRecord | null,
): GoogleAdsIntegrationSummary {
  if (!row) {
    return {
      id: '',
      provider: 'google_ads',
      is_active: false,
      updated_at: null,
      has_oauth: false,
      has_access_token: false,
      masked_token: null,
      publicConfig: {},
      developer_token_configured: false,
      needs_account: false,
      ready: false,
      token_expires_at: null,
      notes: ['Integração Google Ads não encontrada para este tenant.'],
    }
  }

  const config = row.config || {}
  const accessToken = decryptSecret(config.access_token_enc)
  const refreshToken = decryptSecret(config.refresh_token_enc)
  const hasOauth = Boolean(accessToken || refreshToken)
  const developerTokenConfigured = Boolean(resolveGoogleAdsDeveloperToken(config))
  const customerId = normalizeGoogleCustomerId(config.customer_id)
  const needsAccount = hasOauth && !customerId
  const notes: string[] = []

  if (!hasOauth)
    notes.push('Sem tokens OAuth — conecte o Google Ads em Integrações.')
  if (!developerTokenConfigured)
    notes.push('Developer token do servidor ausente (GOOGLE_ADS_DEVELOPER_TOKEN).')
  if (needsAccount)
    notes.push('Selecione a conta de anúncios (customer_id) na integração.')
  if (!row.is_active)
    notes.push('Integração marcada como inativa.')

  const ready = Boolean(hasOauth && developerTokenConfigured && customerId && row.is_active)

  return {
    id: String(row.id),
    provider: row.provider,
    is_active: Boolean(row.is_active),
    updated_at: row.updated_at,
    has_oauth: hasOauth,
    has_access_token: Boolean(accessToken),
    masked_token: maskSensitiveValue(accessToken || refreshToken),
    publicConfig: publicConfigFrom(config),
    developer_token_configured: developerTokenConfigured,
    needs_account: needsAccount,
    ready,
    token_expires_at: config.token_expires_at ? String(config.token_expires_at) : null,
    notes,
  }
}

export async function resolveGoogleAdsCredentials(
  client: SupabaseLike,
  tenantId: string,
  options?: { requireCustomerId?: boolean, requireActive?: boolean },
): Promise<ResolvedGoogleAdsCredentials> {
  const requireCustomerId = options?.requireCustomerId ?? true
  const requireActive = options?.requireActive ?? true

  const row = await resolveGoogleAdsIntegrationRow(client, tenantId)
  if (!row) {
    throw new GoogleAdsToolError(
      'GOOGLE_ADS_NOT_CONNECTED',
      'Integração Google Ads não encontrada para este tenant. Conecte em Integrações.',
      404,
    )
  }

  if (requireActive && !row.is_active) {
    throw new GoogleAdsToolError(
      'GOOGLE_ADS_INACTIVE',
      'Integração Google Ads inativa para este tenant.',
      403,
    )
  }

  const config = row.config || {}
  if (!hasStoredOauth(config)) {
    throw new GoogleAdsToolError(
      'GOOGLE_ADS_TOKEN_MISSING',
      'Token Google Ads ausente ou inválido. Reconecte a conta OAuth.',
      401,
    )
  }

  const accessToken = await getGoogleAccessToken(config)
  if (!accessToken) {
    throw new GoogleAdsToolError(
      'GOOGLE_ADS_TOKEN_EXPIRED',
      'Sessão Google expirada. Reconecte o Google Ads em Integrações.',
      401,
    )
  }

  const customerId = normalizeGoogleCustomerId(config.customer_id) || null
  if (requireCustomerId && !customerId) {
    throw new GoogleAdsToolError(
      'GOOGLE_ADS_ACCOUNT_REQUIRED',
      'customer_id não configurado na integração Google Ads. Selecione a conta de anúncios.',
      400,
    )
  }

  const developerToken = resolveGoogleAdsDeveloperToken(config)
  if (!developerToken) {
    throw new GoogleAdsToolError(
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'Google Ads sem developer token no servidor (GOOGLE_ADS_DEVELOPER_TOKEN).',
      503,
    )
  }

  return {
    tenantId,
    accessToken,
    customerId,
    developerToken,
    integrationId: String(row.id),
    isActive: Boolean(row.is_active),
    publicConfig: publicConfigFrom(config),
    config,
  }
}

export function formatCustomerIdLabel(customerId: string | null | undefined): string | null {
  const normalized = normalizeGoogleCustomerId(customerId)
  if (!normalized)
    return null
  return formatGoogleAdsCustomerId(normalized)
}
