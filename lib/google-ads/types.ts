export type GoogleAdsDatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7d'
  | 'last_14d'
  | 'last_30d'
  | 'last_90d'
  | 'custom'

export interface GoogleAdsIntegrationPublicConfig {
  customer_id?: string
  token_expires_at?: string
  granted_scopes?: unknown
}

export interface GoogleAdsIntegrationRecord {
  id: string
  tenant_id: string
  provider: string
  is_active: boolean
  updated_at: string | null
  config: Record<string, any> | null
}

export interface ResolvedGoogleAdsCredentials {
  tenantId: string
  accessToken: string
  customerId: string | null
  developerToken: string | null
  integrationId: string
  isActive: boolean
  publicConfig: GoogleAdsIntegrationPublicConfig
  config: Record<string, any>
}

export interface GoogleAdsToolContext {
  client: {
    from: (table: string) => {
      select: (columns: string) => any
    }
  }
}

export class GoogleAdsToolError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly details?: unknown

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message)
    this.name = 'GoogleAdsToolError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}
