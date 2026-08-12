/**
 * Shared types for the unified Blimber MCP registry and marketing tools.
 */

export type BlimberMcpNamespace =
  | 'platform'
  | 'common'
  | 'marketing'
  | 'ads'
  | 'ads.meta'
  | 'ads.google'
  | 'crm'
  | 'brand'

/** Alias used by the registry catalog. */
export type BlimberMcpDomain = BlimberMcpNamespace

export type BlimberMcpToolStatus = 'ready' | 'alias' | 'stub' | 'planned'

export type MarketingCampaignKind = 'editorial' | 'paid'

export const MARKETING_CONTENT_URL = 'https://app.blimber.com.br/marketing/content'
export const MARKETING_CAMPAIGNS_URL = 'https://app.blimber.com.br/marketing/campaigns'
export const MARKETING_LIBRARY_URL = 'https://app.blimber.com.br/marketing/media'
export const MARKETING_BRAND_URL = 'https://app.blimber.com.br/marketing/brand'

export interface BlimberMcpToolDescriptor {
  name: string
  domain: BlimberMcpDomain
  description: string
  status: BlimberMcpToolStatus
  httpPath?: string
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  arguments?: string[]
  aliasOf?: string
  notes?: string
}

export interface BlimberMcpSupabaseLike {
  from: (table: string) => any
  /** Optional RPC (service role). Used for domain soft-delete of social_posts. */
  rpc?: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown, error: { message?: string } | null }>
  /**
   * Optional Auth admin. Execute must not depend on this — Nuxt/Vercel
   * service clients often expose getUserById without a working fetch.
   */
  auth?: {
    admin?: {
      getUserById: (id: string) => Promise<{
        data: { user?: { id?: string } | null } | null
        error: unknown
      }>
    }
  }
  storage?: {
    from: (bucket: string) => {
      createSignedUrls: (
        paths: string[],
        expiresIn: number,
      ) => Promise<{ data: Array<{ signedUrl?: string | null, path?: string | null }> | null }>
      createSignedUrl?: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl?: string | null } | null }>
      list?: (
        path: string,
        options?: { search?: string, limit?: number },
      ) => Promise<{ data: Array<{ name?: string }> | null }>
    }
  }
}

export interface BlimberMcpToolContext {
  client: BlimberMcpSupabaseLike
  /** Optional default actor for created_by (or use BLIMBER_MCP_ACTOR_USER_ID). */
  actorUserId?: string
}
