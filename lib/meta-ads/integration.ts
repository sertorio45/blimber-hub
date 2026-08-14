import type {
  MetaIntegrationPublicConfig,
  MetaIntegrationRecord,
  ResolvedMetaCredentials,
} from './types'
import { decryptSecret, maskSensitiveValue } from '../marketing-secrets'
import { normalizeMetaAdAccountId, resolveMetaGraphVersion } from './graph'
import { MetaAdsToolError } from './types'

export interface SupabaseLike {
  from: (table: string) => {
    select: (columns: string) => any
  }
}

function publicConfigFrom(config: Record<string, any> | null | undefined): MetaIntegrationPublicConfig {
  const c = config || {}
  return {
    ad_account_id: c.ad_account_id ? normalizeMetaAdAccountId(String(c.ad_account_id)) : undefined,
    business_id: c.business_id ? String(c.business_id).trim() || undefined : undefined,
    page_id: c.page_id,
    page_name: c.page_name,
    pixel_id: c.pixel_id,
    instagram_business_account_id: c.instagram_business_account_id,
    instagram_name: c.instagram_name,
    instagram_username: c.instagram_username,
    granted_scopes: c.granted_scopes,
    missing_publish_scopes: c.missing_publish_scopes,
    token_expires_at: c.token_expires_at,
    api_version: c.api_version,
  }
}

/**
 * Normalize granted_scopes (array or comma/space string) and check for a permission.
 * Does not request new OAuth scopes — only reports what is already stored.
 */
export function hasGrantedMetaScope(grantedScopes: unknown, scope: string): boolean {
  const needle = scope.trim().toLowerCase()
  if (!needle)
    return false

  const list: string[] = []
  if (Array.isArray(grantedScopes)) {
    for (const item of grantedScopes) {
      if (item == null)
        continue
      String(item).split(/[,\s]+/).forEach((part) => {
        if (part)
          list.push(part)
      })
    }
  }
  else if (typeof grantedScopes === 'string') {
    grantedScopes.split(/[,\s]+/).forEach((part) => {
      if (part)
        list.push(part)
    })
  }

  return list.some(s => s.trim().toLowerCase() === needle)
}

export interface MetaWriteReadiness {
  /** True when ads_management appears in granted_scopes (or scopes unknown → assume OK if token present). */
  ads_management: boolean
  /** Page access token present (needed later for Page/IG creatives — not required for status). */
  has_page_token: boolean
  /** Scopes list was missing/empty — readiness is best-effort. */
  scopes_unknown: boolean
  notes: string[]
}

/** Build write readiness flags for Meta integrations (no new OAuth). */
export function buildMetaWriteReadiness(params: {
  hasAccessToken: boolean
  hasPageToken: boolean
  grantedScopes: unknown
}): MetaWriteReadiness {
  const scopesEmpty = params.grantedScopes == null
    || (Array.isArray(params.grantedScopes) && params.grantedScopes.length === 0)
    || (typeof params.grantedScopes === 'string' && !params.grantedScopes.trim())

  const scopesUnknown = scopesEmpty
  const adsManagement = scopesUnknown
    ? params.hasAccessToken
    : hasGrantedMetaScope(params.grantedScopes, 'ads_management')

  const notes: string[] = []
  if (!params.hasAccessToken)
    notes.push('Sem access_token — reconecte o OAuth Meta.')
  if (scopesUnknown)
    notes.push('granted_scopes ausente; ads_management assumido se houver token.')
  else if (!adsManagement)
    notes.push('Escopo ads_management não encontrado em granted_scopes — write Ads pode falhar.')
  if (!params.hasPageToken)
    notes.push('Sem page_access_token — create ad/creative (object_story_spec) exige page token.')

  return {
    ads_management: adsManagement,
    has_page_token: params.hasPageToken,
    scopes_unknown: scopesUnknown,
    notes,
  }
}

/** List marketing_integrations for a tenant (never expose token ciphertext). */
export async function listMarketingIntegrations(
  client: SupabaseLike,
  tenantId: string,
): Promise<Array<{
    id: string
    provider: string
    is_active: boolean
    updated_at: string | null
    has_access_token: boolean
    has_page_token: boolean
    masked_key: string | null
    config: MetaIntegrationPublicConfig
    meta_ready: boolean | undefined
    /** Present only for provider=meta — write Ads readiness (no new OAuth). */
    write_readiness?: MetaWriteReadiness
  }>> {
  const { data, error } = await client
    .from('marketing_integrations')
    .select('id, tenant_id, provider, is_active, updated_at, config')
    .eq('tenant_id', tenantId)
    .order('provider')

  if (error)
    throw new MetaAdsToolError('INTEGRATION_QUERY_FAILED', error.message, 500)

  return (data || []).map((row: MetaIntegrationRecord) => {
    const config = row.config || {}
    const token = decryptSecret(config.access_token_enc)
    const pageToken = decryptSecret(config.page_access_token_enc)
    const pub = publicConfigFrom(config)
    const hasAccessToken = Boolean(token)
    const hasPageToken = Boolean(pageToken)
    const metaReady = row.provider === 'meta'
      ? Boolean(token && pub.ad_account_id)
      : undefined
    const writeReadiness = row.provider === 'meta'
      ? buildMetaWriteReadiness({
          hasAccessToken,
          hasPageToken,
          grantedScopes: pub.granted_scopes,
        })
      : undefined
    return {
      id: row.id,
      provider: row.provider,
      is_active: Boolean(row.is_active),
      updated_at: row.updated_at,
      has_access_token: hasAccessToken,
      has_page_token: hasPageToken,
      masked_key: maskSensitiveValue(token),
      config: pub,
      meta_ready: metaReady,
      write_readiness: writeReadiness,
    }
  })
}

/**
 * Resolve Meta access token for a tenant. Allows missing ad_account_id
 * (needed before setup completes, e.g. list ad accounts).
 */
export async function resolveMetaAccessToken(
  client: SupabaseLike,
  tenantId: string,
): Promise<{
    accessToken: string
    apiVersion: string
    integrationId: string
    isActive: boolean
    publicConfig: MetaIntegrationPublicConfig
    config: Record<string, any>
  }> {
  if (!tenantId)
    throw new MetaAdsToolError('TENANT_REQUIRED', 'tenantId é obrigatório')

  const { data, error } = await client
    .from('marketing_integrations')
    .select('id, tenant_id, provider, is_active, updated_at, config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'meta')
    .maybeSingle()

  if (error)
    throw new MetaAdsToolError('INTEGRATION_QUERY_FAILED', error.message, 500)

  if (!data) {
    throw new MetaAdsToolError(
      'META_NOT_CONNECTED',
      'Integração Meta não encontrada para este tenant. Conecte em Ads → Integrações.',
      404,
    )
  }

  const config = data.config || {}
  const accessToken = decryptSecret(config.access_token_enc)
  if (!accessToken) {
    throw new MetaAdsToolError(
      'META_TOKEN_MISSING',
      'Token Meta ausente ou inválido. Reconecte a conta OAuth.',
      401,
    )
  }

  return {
    accessToken,
    apiVersion: resolveMetaGraphVersion(config.api_version),
    integrationId: String(data.id),
    isActive: Boolean(data.is_active),
    publicConfig: publicConfigFrom(config),
    config,
  }
}

/**
 * Resolve Meta credentials for a tenant from marketing_integrations.
 * Tokens stay in memory only — never returned to callers of tools.
 */
export async function resolveMetaCredentials(
  client: SupabaseLike,
  tenantId: string,
  adAccountIdOverride?: string,
): Promise<ResolvedMetaCredentials> {
  const base = await resolveMetaAccessToken(client, tenantId)
  const adAccountId = normalizeMetaAdAccountId(
    String(adAccountIdOverride || base.config.ad_account_id || ''),
  )
  if (!adAccountId) {
    throw new MetaAdsToolError(
      'AD_ACCOUNT_REQUIRED',
      'ad_account_id não configurado na integração Meta. Informe adAccountId ou complete o setup.',
      400,
    )
  }

  return {
    tenantId,
    accessToken: base.accessToken,
    adAccountId,
    apiVersion: base.apiVersion,
    integrationId: base.integrationId,
    isActive: base.isActive,
    publicConfig: base.publicConfig,
  }
}
