export type MetaDatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7d'
  | 'last_14d'
  | 'last_30d'
  | 'last_90d'
  | 'custom'

export type MetaInsightLevel = 'account' | 'campaign' | 'adset' | 'ad'

export type MetaCampaignStatusUpdate = 'ACTIVE' | 'PAUSED'

/** `form` = POST application/x-www-form-urlencoded (customaudiences). Default `query` keeps fields on the URL. */
export type MetaGraphBodyEncoding = 'query' | 'form'

export interface MetaGraphFetchInit {
  method?: string
  query?: Record<string, string | number | undefined>
  body?: Record<string, unknown>
  bodyEncoding?: MetaGraphBodyEncoding
  contentType?: string
}

export interface MetaGraphFetch {
  (url: string, init?: MetaGraphFetchInit): Promise<any>
}

export interface MetaIntegrationPublicConfig {
  ad_account_id?: string
  /** Meta Business Manager id, when stored on the tenant integration. */
  business_id?: string
  page_id?: string
  page_name?: string
  pixel_id?: string
  instagram_business_account_id?: string
  instagram_name?: string
  instagram_username?: string
  granted_scopes?: unknown
  missing_publish_scopes?: unknown
  token_expires_at?: string
  api_version?: string
}

export interface MetaIntegrationRecord {
  id: string
  tenant_id: string
  provider: string
  is_active: boolean
  updated_at: string | null
  config: Record<string, any> | null
}

export interface ResolvedMetaCredentials {
  tenantId: string
  accessToken: string
  adAccountId: string
  apiVersion: string
  integrationId: string
  isActive: boolean
  publicConfig: MetaIntegrationPublicConfig
}

export class MetaAdsToolError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly details?: unknown

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message)
    this.name = 'MetaAdsToolError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}
