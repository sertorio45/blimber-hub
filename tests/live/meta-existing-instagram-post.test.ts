import { describe, expect, it } from 'vitest'
import { encryptSecret } from '~/lib/marketing-secrets'
import { defaultMetaGraphFetch, metaCreateAdFromInstagramPost, metaGraphUrl, setMetaWriteAuditSink } from '~/lib/meta-ads'
import { MetaAdsToolError } from '~/lib/meta-ads/types'

/** Manual-only: run this file with META_LIVE_TESTS=true and a development ad account. */
describe.skipIf(process.env.META_LIVE_TESTS !== 'true')('live existing Instagram post ad', () => {
  it('creates only PAUSED objects and cleans up its own ad and creative', async () => {
    const required = [
      'META_LIVE_ACCESS_TOKEN',
      'META_LIVE_PAGE_TOKEN',
      'META_LIVE_AD_ACCOUNT_ID',
      'META_LIVE_PAGE_ID',
      'META_LIVE_INSTAGRAM_ACCOUNT_ID',
      'META_LIVE_ADSET_ID',
      'META_LIVE_INSTAGRAM_MEDIA_ID',
    ] as const
    for (const key of required) {
      if (!process.env[key])
        throw new Error(`Missing ${key}; no live request was sent.`)
    }
    process.env.MARKETING_ENCRYPTION_SECRET = 'meta-existing-post-live-test-secret-32'
    const accessToken = process.env.META_LIVE_ACCESS_TOKEN!
    const config = {
      access_token_enc: encryptSecret(accessToken),
      page_access_token_enc: encryptSecret(process.env.META_LIVE_PAGE_TOKEN!),
      ad_account_id: process.env.META_LIVE_AD_ACCOUNT_ID!,
      page_id: process.env.META_LIVE_PAGE_ID!,
      instagram_business_account_id: process.env.META_LIVE_INSTAGRAM_ACCOUNT_ID!,
      api_version: process.env.META_LIVE_GRAPH_VERSION || 'v25.0',
    }
    const row = { id: 'live-integration', tenant_id: 'live-tenant', provider: 'meta', is_active: true, updated_at: new Date().toISOString(), config }
    const client = {
      from: () => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: async () => ({ data: [row], error: null }),
          maybeSingle: async () => ({ data: row, error: null }),
          insert: async () => ({ error: null }),
        }
        return chain
      },
    }
    setMetaWriteAuditSink(() => {})
    let adId: string | null = null
    let creativeId: string | null = null
    let cleanupError: Error | null = null
    let operationError: unknown
    try {
      const result = await metaCreateAdFromInstagramPost({ client }, {
        tenantId: 'live-tenant',
        adAccountId: config.ad_account_id,
        adsetId: process.env.META_LIVE_ADSET_ID!,
        instagramMediaId: process.env.META_LIVE_INSTAGRAM_MEDIA_ID!,
        name: `[BLIMBER TEST] existing IG post ${Date.now()}`,
        confirmTenantId: 'live-tenant',
        confirm: true,
        dryRun: false,
      })
      adId = result.adId
      creativeId = result.creativeId
      expect(result.status).toBe('PAUSED')
      expect(adId).toBeTruthy()
    }
    catch (error) {
      operationError = error
      if (error instanceof MetaAdsToolError && error.details && typeof error.details === 'object') {
        const details = error.details as Record<string, unknown>
        creativeId = typeof details.orphanCreativeId === 'string' ? details.orphanCreativeId : null
      }
    }
    finally {
      for (const id of [adId, creativeId].filter((value): value is string => Boolean(value))) {
        try {
          await defaultMetaGraphFetch(metaGraphUrl(config.api_version, `/${id}`), {
            method: 'DELETE',
            query: { access_token: accessToken },
          })
        }
        catch {
          cleanupError = new Error(`Cleanup failed for Meta object ${id}; remove it manually in the development account.`)
        }
      }
    }
    if (operationError)
      throw operationError
    if (cleanupError)
      throw cleanupError
  })
})
