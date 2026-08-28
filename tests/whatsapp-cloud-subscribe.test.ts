import process from 'node:process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn(async () => ({ success: true }))
vi.stubGlobal('$fetch', fetchMock)

const {
  cloudApiSetWebhookOverride,
  cloudApiSubscribeApp,
  extractWabaIdsFromDebug,
} = await import('~/server/utils/whatsapp/cloud-api-client')

describe('cloud api subscription', () => {
  beforeEach(() => {
    fetchMock.mockClear()
    process.env.META_APP_SECRET = 'app-secret'
  })

  it('subscribes without a body, then overrides the callback', async () => {
    await cloudApiSubscribeApp({ accessToken: 'token-1', wabaId: 'waba-1' })
    await cloudApiSetWebhookOverride({
      accessToken: 'token-1',
      wabaId: 'waba-1',
      overrideCallbackUri: 'https://app.blimber.com.br/api/whatsapp/webhooks/cloud/instance-1',
      verifyToken: 'secret-1',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Meta rejects an override on an unsubscribed WABA with error 100.
    const [subscribeUrl, subscribeOptions] = fetchMock.mock.calls[0] as any[]
    expect(subscribeUrl).toContain('/waba-1/subscribed_apps')
    expect(subscribeOptions.method).toBe('POST')
    expect(subscribeOptions.body).toBeUndefined()

    const [overrideUrl, overrideOptions] = fetchMock.mock.calls[1] as any[]
    expect(overrideUrl).toContain('/waba-1/subscribed_apps')
    expect(overrideOptions.body).toEqual({
      override_callback_uri: 'https://app.blimber.com.br/api/whatsapp/webhooks/cloud/instance-1',
      verify_token: 'secret-1',
    })
  })

  it('signs post-token Graph calls with appsecret_proof', async () => {
    await cloudApiSubscribeApp({ accessToken: 'token-1', wabaId: 'waba-1' })

    const [, options] = fetchMock.mock.calls[0] as any[]
    expect(options.query.appsecret_proof).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('extractWabaIdsFromDebug', () => {
  it('reads the granted WABAs from granular_scopes', () => {
    const ids = extractWabaIdsFromDebug({
      data: {
        granular_scopes: [
          { scope: 'whatsapp_business_management', target_ids: ['waba-1'] },
          { scope: 'whatsapp_business_messaging', target_ids: ['waba-1', 'waba-2'] },
          { scope: 'ads_management', target_ids: ['act_1'] },
        ],
      },
    })

    expect(ids).toEqual(['waba-1', 'waba-2'])
  })

  it('returns nothing when the token carries no WhatsApp grant', () => {
    expect(extractWabaIdsFromDebug({ data: { granular_scopes: [] } })).toEqual([])
  })
})
