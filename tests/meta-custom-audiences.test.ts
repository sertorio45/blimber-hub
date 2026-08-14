import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encryptSecret } from '~/lib/marketing-secrets'
import {
  buildEngagementRule,
  hashCustomerListUsers,
  META_GRAPH_FORM_CONTENT_TYPE,
  MetaAdsToolError,
  metaCreateCustomAudience,
  metaCreateCustomAudiencesBatch,
  metaDeleteCustomAudience,
  metaGetCustomAudienceUsage,
  metaUpdateAdsetTargeting,
  resolveAdsetTargeting,
  retentionDaysToSeconds,
  selectAdsManagementAccessToken,
  serializeCustomAudienceForm,
  serializeCustomAudienceGraphJsonFields,
  setMetaWriteAuditSink,
  suggestCustomAudienceName,
} from '~/lib/meta-ads'

process.env.MARKETING_ENCRYPTION_SECRET = 'test-marketing-encryption-secret-for-mcp'

function createIntegrationClient(config: Record<string, unknown>) {
  return {
    from(_table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        insert: async () => ({ error: null }),
        order: async () => ({
          data: [{
            id: 'int-1',
            tenant_id: 'tenant-1',
            provider: 'meta',
            is_active: true,
            updated_at: '2026-01-01T00:00:00.000Z',
            config,
          }],
          error: null,
        }),
        maybeSingle: async () => ({
          data: {
            id: 'int-1',
            tenant_id: 'tenant-1',
            provider: 'meta',
            is_active: true,
            updated_at: '2026-01-01T00:00:00.000Z',
            config,
          },
          error: null,
        }),
      }
      return chain
    },
  }
}

const baseConfig = {
  access_token_enc: encryptSecret('tok'),
  ad_account_id: '555',
  page_id: 'page_1',
  page_name: 'Clínica',
  instagram_business_account_id: 'ig_1',
  instagram_username: 'clinica',
  pixel_id: 'px_1',
  granted_scopes: ['ads_management', 'ads_read'],
}

const confirm = {
  tenantId: 'tenant-1',
  confirmTenantId: 'tenant-1',
  confirm: true as const,
}

describe('meta custom audiences', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    setMetaWriteAuditSink(() => {})
  })

  it('names IG engagement 365d and converts retention to seconds', () => {
    expect(suggestCustomAudienceName({
      sourceType: 'INSTAGRAM',
      event: 'ALL',
      retentionDays: 365,
    })).toBe('IG | Engajamento | 365d')
    expect(retentionDaysToSeconds({
      sourceType: 'INSTAGRAM',
      event: 'ALL',
      retentionDays: 365,
    })).toEqual({ retentionDays: 365, retentionSeconds: 31536000, forcedZero: false })
  })

  it('1. Instagram ALL 365 days dryRun builds ig_business_profile_all rule', async () => {
    const client = createIntegrationClient(baseConfig)
    const graphFetch = vi.fn(async () => ({ data: [] }))
    const result = await metaCreateCustomAudience(
      { client, graphFetch },
      {
        ...confirm,
        sourceType: 'INSTAGRAM',
        event: 'ALL',
        retentionDays: 365,
      },
    )
    expect((result as any).dryRun).toBe(true)
    expect((result as any).name).toBe('IG | Engajamento | 365d')
    expect((result as any).metaEvent).toBe('ig_business_profile_all')
    expect((result as any).retentionSeconds).toBe(31536000)
    const expectedRule = buildEngagementRule({
      eventSourceType: 'ig_business',
      sourceId: 'ig_1',
      metaEvent: 'ig_business_profile_all',
      retentionSeconds: 31536000,
    })
    expect(typeof (result as any).preview.body.rule).toBe('string')
    expect(JSON.parse((result as any).preview.body.rule)).toEqual(expectedRule)
    expect((result as any).preview.contentType).toBe(META_GRAPH_FORM_CONTENT_TYPE)
    expect((result as any).preview.body.prefill).toBe('1')
    expect((result as any).preview.notes).toContain(`Content-Type=${META_GRAPH_FORM_CONTENT_TYPE}`)
    expect(graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })

  it('2. Instagram PROFILE_VISIT 180 days', async () => {
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch: vi.fn() },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'PROFILE_VISIT', retentionDays: 180 },
    )
    expect((result as any).name).toBe('IG | Visitou Perfil | 180d')
    expect((result as any).metaEvent).toBe('ig_business_profile_visit')
    expect((result as any).retentionSeconds).toBe(15552000)
  })

  it('3. Instagram MESSAGED 180 days', async () => {
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch: vi.fn() },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'MESSAGED', retentionDays: 180 },
    )
    expect((result as any).metaEvent).toBe('ig_business_profile_user_messaged')
    expect((result as any).name).toBe('IG | Mensagem | 180d')
  })

  it('4. Instagram FOLLOWERS uses retention zero', async () => {
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch: vi.fn() },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'FOLLOWERS', retentionDays: 365 },
    )
    expect((result as any).retentionSeconds).toBe(0)
    expect((result as any).metaEvent).toBe('INSTAGRAM_PROFILE_FOLLOW')
    expect(typeof (result as any).preview.body.rule).toBe('string')
    expect(JSON.parse((result as any).preview.body.rule).inclusions.rules[0].retention_seconds).toBe(0)
  })

  it('5. Facebook ENGAGED 365 days', async () => {
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch: vi.fn() },
      { ...confirm, sourceType: 'FACEBOOK_PAGE', event: 'ENGAGED', retentionDays: 365 },
    )
    expect((result as any).name).toBe('FB | Engajamento | 365d')
    expect((result as any).metaEvent).toBe('page_engaged')
    expect(typeof (result as any).preview.body.rule).toBe('string')
    expect(JSON.parse((result as any).preview.body.rule)).toEqual(buildEngagementRule({
      eventSourceType: 'page',
      sourceId: 'page_1',
      metaEvent: 'page_engaged',
      retentionSeconds: 31536000,
    }))
  })

  it('6. Facebook MESSAGED 180 days', async () => {
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch: vi.fn() },
      { ...confirm, sourceType: 'FACEBOOK_PAGE', event: 'MESSAGED', retentionDays: 180 },
    )
    expect((result as any).metaEvent).toBe('page_messaged')
    expect((result as any).name).toBe('FB | Mensagem | 180d')
  })

  it('7. Facebook FOLLOWERS retention zero', async () => {
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch: vi.fn() },
      { ...confirm, sourceType: 'FACEBOOK_PAGE', event: 'FOLLOWERS' },
    )
    expect((result as any).retentionSeconds).toBe(0)
    expect((result as any).metaEvent).toBe('page_liked')
  })

  it('8. Lookalike 1%', async () => {
    const graphFetch = vi.fn(async (url: string) => {
      if (String(url).includes('/origin_1')) {
        return { id: 'origin_1', name: 'IG | Engajamento | 365d', account_id: '555', subtype: 'ENGAGEMENT' }
      }
      return { data: [] }
    })
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      {
        ...confirm,
        sourceType: 'LOOKALIKE',
        originAudienceId: 'origin_1',
        lookalikeRatio: 0.01,
      },
    )
    expect((result as any).dryRun).toBe(true)
    expect((result as any).name).toBe('LAL 1% | IG | Engajamento | 365d')
    expect(typeof (result as any).preview.body.lookalike_spec).toBe('string')
    expect(JSON.parse((result as any).preview.body.lookalike_spec)).toEqual({
      type: 'similarity',
      country: 'BR',
      ratio: 0.01,
    })
    expect((result as any).preview.body.origin_audience_id).toBe('origin_1')
    expect((result as any).preview.contentType).toBe(META_GRAPH_FORM_CONTENT_TYPE)
    const once = JSON.stringify({
      type: 'similarity',
      country: 'BR',
      ratio: 0.01,
    })
    expect((result as any).preview.body.lookalike_spec).toBe(once)
    expect((result as any).preview.body.lookalike_spec).not.toBe(JSON.stringify(once))
  })

  it('9. Lookalike ratio inválido', async () => {
    await expect(metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch: vi.fn() },
      {
        ...confirm,
        sourceType: 'LOOKALIKE',
        originAudienceId: 'origin_1',
        lookalikeRatio: 0.5,
      },
    )).rejects.toMatchObject({ code: 'META_AUDIENCE_LOOKALIKE_INVALID_RATIO' })
  })

  it('10. Tenant incorreto (confirmTenantId)', async () => {
    await expect(metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        confirmTenantId: 'other',
        confirm: true,
        sourceType: 'INSTAGRAM',
        event: 'ALL',
      },
    )).rejects.toMatchObject({ code: 'CONFIRM_TENANT_MISMATCH' })
  })

  it('11. Ad account de outro tenant no seed lookalike', async () => {
    const graphFetch = vi.fn(async () => ({
      id: 'origin_1',
      name: 'Seed',
      account_id: '999',
      subtype: 'ENGAGEMENT',
    }))
    await expect(metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      {
        ...confirm,
        sourceType: 'LOOKALIKE',
        originAudienceId: 'origin_1',
        lookalikeRatio: 0.01,
      },
    )).rejects.toMatchObject({ code: 'META_AUDIENCE_ORIGIN_NOT_FOUND' })
  })

  it('12. Instagram não acessível', async () => {
    const graphFetch = vi.fn(async () => {
      throw new MetaAdsToolError('META_GRAPH_ERROR', 'Object does not exist', 400, { code: 803 })
    })
    await expect(metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      {
        ...confirm,
        sourceType: 'INSTAGRAM',
        event: 'ALL',
        instagramAccountId: 'ig_missing',
      },
    )).rejects.toMatchObject({ code: 'META_AUDIENCE_SOURCE_NOT_FOUND' })
  })

  it('13. Múltiplos Instagrams sem resolução', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      granted_scopes: ['ads_management'],
    })
    const graphFetch = vi.fn(async (url: string) => {
      if (String(url).includes('/me/accounts')) {
        return {
          data: [
            { id: 'p1', name: 'Page A', instagram_business_account: { id: 'ig_a' } },
            { id: 'p2', name: 'Page B', instagram_business_account: { id: 'ig_b' } },
          ],
        }
      }
      return { data: [] }
    })
    await expect(metaCreateCustomAudience(
      { client, graphFetch },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ALL' },
    )).rejects.toMatchObject({ code: 'META_AUDIENCE_MULTIPLE_SOURCES' })
  })

  it('14. Dry run does not POST', async () => {
    const graphFetch = vi.fn(async () => ({ data: [] }))
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ALL', dryRun: true },
    )
    expect((result as any).dryRun).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/"tok"/)
    expect(JSON.stringify(result)).not.toContain('Bearer tok')
    expect(graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })

  it('15. Criação real POST customaudiences', async () => {
    const graphFetch = vi.fn(async () => ({ data: [] }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'aud_created' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      {
        ...confirm,
        sourceType: 'INSTAGRAM',
        event: 'ALL',
        retentionDays: 365,
        dryRun: false,
      },
    )
    expect((result as any).dryRun).toBe(false)
    expect((result as any).id).toBe('aud_created')
    expect((result as any).status).toBe('processing')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/act_555/customaudiences')
    expect(url).not.toMatch(/access_token=/)
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(META_GRAPH_FORM_CONTENT_TYPE)
    const form = new URLSearchParams(String(init.body))
    const expectedRule = buildEngagementRule({
      eventSourceType: 'ig_business',
      sourceId: 'ig_1',
      metaEvent: 'ig_business_profile_all',
      retentionSeconds: 31536000,
    })
    expect(form.get('prefill')).toBe('1')
    expect(form.get('subtype')).toBeNull()
    expect(JSON.parse(form.get('rule')!)).toEqual(expectedRule)
  })

  it('15b. Instagram ENGAGED 30d posts rule as JSON string', async () => {
    const graphFetch = vi.fn(async () => ({ data: [] }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'aud_ig_30d' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const expectedRule = buildEngagementRule({
      eventSourceType: 'ig_business',
      sourceId: 'ig_1',
      metaEvent: 'ig_business_profile_engaged',
      retentionSeconds: 30 * 86400,
    })
    const preview = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      {
        ...confirm,
        sourceType: 'INSTAGRAM',
        event: 'ENGAGED',
        retentionDays: 30,
        dryRun: true,
      },
    )
    expect((preview as any).metaEvent).toBe('ig_business_profile_engaged')
    expect((preview as any).name).toBe('IG | Interações | 30d')
    expect((preview as any).preview.contentType).toBe(META_GRAPH_FORM_CONTENT_TYPE)
    expect((preview as any).preview.body.prefill).toBe('1')
    expect(typeof (preview as any).preview.body.rule).toBe('string')
    expect((preview as any).preview.body.rule[0]).toBe('{')
    expect(JSON.parse((preview as any).preview.body.rule)).toEqual(expectedRule)
    expect((preview as any).preview.body.rule).not.toBe(JSON.stringify(JSON.stringify(expectedRule)))

    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      {
        ...confirm,
        sourceType: 'INSTAGRAM',
        event: 'ENGAGED',
        retentionDays: 30,
        dryRun: false,
      },
    )
    expect((result as any).id).toBe('aud_ig_30d')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const form = new URLSearchParams(String(init.body))
    const graphRule = form.get('rule')
    expect(typeof graphRule).toBe('string')
    expect((graphRule as string)[0]).toBe('{')
    expect(JSON.parse(graphRule as string)).toEqual(expectedRule)
    expect(graphRule).not.toBe(JSON.stringify(JSON.stringify(expectedRule)))
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(META_GRAPH_FORM_CONTENT_TYPE)
    expect(form.get('prefill')).toBe('1')
    expect(form.get('subtype')).toBeNull()
  })

  it('does not double-stringify rule or lookalike_spec', () => {
    const rule = buildEngagementRule({
      eventSourceType: 'ig_business',
      sourceId: 'ig_1',
      metaEvent: 'ig_business_profile_engaged',
      retentionSeconds: 2592000,
    })
    const once = serializeCustomAudienceGraphJsonFields({ rule, prefill: '1' })
    const twice = serializeCustomAudienceGraphJsonFields(once)
    expect(once.rule).toBe(JSON.stringify(rule))
    expect(twice.rule).toBe(once.rule)
    expect(twice.rule).not.toBe(JSON.stringify(JSON.stringify(rule)))
    expect(typeof JSON.parse(twice.rule as string)).toBe('object')
  })

  it('16. Erro Graph mapeado', async () => {
    const graphFetch = vi.fn(async () => ({ data: [] }))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: 'Invalid parameter',
          code: 100,
          error_subcode: 33,
          fbtrace_id: 'trace1',
        },
      }),
    })))
    await expect(metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ALL', dryRun: false },
    )).rejects.toMatchObject({ code: 'META_AUDIENCE_GRAPH_ERROR' })
  })

  it('17. Público duplicado (ERROR)', async () => {
    const graphFetch = vi.fn(async () => ({
      data: [{ id: 'aud_old', name: 'IG | Engajamento | 365d', subtype: 'ENGAGEMENT' }],
    }))
    await expect(metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ALL', retentionDays: 365, dryRun: false },
    )).rejects.toMatchObject({ statusCode: 409 })
  })

  it('17b. RETURN_EXISTING devolve o público', async () => {
    const graphFetch = vi.fn(async () => ({
      data: [{ id: 'aud_old', name: 'IG | Engajamento | 365d', subtype: 'ENGAGEMENT' }],
    }))
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      {
        ...confirm,
        sourceType: 'INSTAGRAM',
        event: 'ALL',
        retentionDays: 365,
        dryRun: false,
        duplicateStrategy: 'RETURN_EXISTING',
      },
    )
    expect((result as any).id).toBe('aud_old')
    expect((result as any).reused).toBe(true)
    expect(graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })

  it('18. Público utilizado em Ad Set (delete recusa)', async () => {
    const graphFetch = vi.fn(async () => ({
      id: 'aud_1',
      name: 'IG | Engajamento | 365d',
      account_id: '555',
      subtype: 'ENGAGEMENT',
      ads: { data: [{ id: 'ad_1', name: 'Ad', effective_status: 'ACTIVE' }] },
      lookalike_audience_ids: [],
    }))
    const usage = await metaGetCustomAudienceUsage(
      { client: createIntegrationClient(baseConfig), graphFetch },
      { tenantId: 'tenant-1', audienceId: 'aud_1' },
    )
    expect(usage.inUse).toBe(true)
    await expect(metaDeleteCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      { ...confirm, audienceId: 'aud_1', confirmDelete: true, dryRun: false },
    )).rejects.toMatchObject({ code: 'META_AUDIENCE_IN_USE' })
  })

  it('19. Inclusão em targeting custom_audiences', () => {
    const resolved = resolveAdsetTargeting({
      targeting: {
        geo_locations: { countries: ['BR'] },
        age_min: 18,
        age_max: 65,
        custom_audiences: [{ id: 'aud_123' }],
      },
    })
    expect(resolved.targeting.custom_audiences).toEqual([{ id: 'aud_123' }])
  })

  it('20. Exclusão em targeting excluded_custom_audiences', async () => {
    const resolved = resolveAdsetTargeting({
      targeting: {
        geo_locations: { countries: ['BR'] },
        age_min: 18,
        age_max: 65,
        excluded_custom_audiences: [{ id: 'aud_exc' }],
      },
    })
    expect(resolved.targeting.excluded_custom_audiences).toEqual([{ id: 'aud_exc' }])

    const graphFetch = vi.fn(async () => ({
      id: 'adset_1',
      name: 'Adset',
      account_id: '555',
      targeting: { geo_locations: { countries: ['BR'] }, age_min: 18, age_max: 65 },
    }))
    const result = await metaUpdateAdsetTargeting(
      { client: createIntegrationClient(baseConfig), graphFetch },
      {
        ...confirm,
        adsetId: 'adset_1',
        targeting: {
          geo_locations: { countries: ['BR'] },
          age_min: 18,
          age_max: 65,
          excluded_custom_audiences: [{ id: 'aud_exc' }],
        },
      },
    )
    expect((result as any).after.targeting.excluded_custom_audiences).toEqual([{ id: 'aud_exc' }])
  })

  it('lookalike of lookalike is refused', async () => {
    const graphFetch = vi.fn(async () => ({
      id: 'lal_1',
      name: 'LAL 1%',
      account_id: '555',
      subtype: 'LOOKALIKE',
    }))
    await expect(metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch },
      { ...confirm, sourceType: 'LOOKALIKE', originAudienceId: 'lal_1', lookalikeRatio: 0.01 },
    )).rejects.toMatchObject({ code: 'META_AUDIENCE_INVALID_SOURCE' })
  })

  it('website ALL_VISITORS uses empty url i_contains', async () => {
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(baseConfig), graphFetch: vi.fn() },
      { ...confirm, sourceType: 'WEBSITE', event: 'ALL_VISITORS', retentionDays: 180 },
    )
    expect(typeof (result as any).preview.body.rule).toBe('string')
    const filters = JSON.parse((result as any).preview.body.rule).inclusions.rules[0].filter.filters
    expect(filters).toEqual([{ field: 'url', operator: 'i_contains', value: '' }])
    expect((result as any).subtype).toBe('WEBSITE')
    expect((result as any).preview.body.subtype).toBeUndefined()
  })

  it('hashes customer list PII with SHA-256 and never returns raw emails', () => {
    const hashed = hashCustomerListUsers({ emails: ['Ada@Example.com'] })
    expect(hashed.schema).toEqual(['EMAIL'])
    expect(hashed.data[0]![0]).toHaveLength(64)
    expect(JSON.stringify(hashed)).not.toMatch(/Ada@Example/i)
  })

  it('batch sequential returns succeeded/failed without fake transaction', async () => {
    const graphFetch = vi.fn(async () => ({ data: [] }))
    const result = await metaCreateCustomAudiencesBatch(
      { client: createIntegrationClient(baseConfig), graphFetch },
      {
        ...confirm,
        items: [
          { sourceType: 'INSTAGRAM', event: 'ALL', retentionDays: 30 },
          { sourceType: 'LOOKALIKE', originAudienceId: 'missing', lookalikeRatio: 0.01 },
        ],
      },
    )
    expect(result.succeeded.length).toBe(1)
    expect(result.failed.length).toBe(1)
    expect(result.dryRun).toBe(true)
  })

  it('refuses write without ads_management when scopes are known', async () => {
    const client = createIntegrationClient({
      ...baseConfig,
      granted_scopes: ['ads_read'],
    })
    await expect(metaCreateCustomAudience(
      { client, graphFetch: vi.fn() },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ALL' },
    )).rejects.toMatchObject({ code: 'META_PERMISSION_MISSING' })
  })
})

describe('meta custom audience fetch contract (Etapa 7)', () => {
  const dualTokenConfig = {
    ...baseConfig,
    page_access_token_enc: encryptSecret('page-tok'),
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    setMetaWriteAuditSink(() => {})
  })

  function stubOkFetch(id = 'aud_1') {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('1. Instagram ENGAGED maps to ig_business_profile_engaged', async () => {
    const fetchMock = stubOkFetch()
    await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ENGAGED', retentionDays: 30, dryRun: false },
    )
    const form = new URLSearchParams(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))
    expect(JSON.parse(form.get('rule')!).inclusions.rules[0].filter.filters[0].value).toBe('ig_business_profile_engaged')
  })

  it('2. Instagram PROFILE_VISIT maps to ig_business_profile_visit', async () => {
    const fetchMock = stubOkFetch()
    await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'PROFILE_VISIT', retentionDays: 30, dryRun: false },
    )
    const form = new URLSearchParams(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))
    expect(JSON.parse(form.get('rule')!).inclusions.rules[0].filter.filters[0].value).toBe('ig_business_profile_visit')
  })

  it('3. Facebook ENGAGED maps to page_engaged', async () => {
    const fetchMock = stubOkFetch()
    await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...confirm, sourceType: 'FACEBOOK_PAGE', event: 'ENGAGED', retentionDays: 30, dryRun: false },
    )
    const form = new URLSearchParams(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))
    expect(JSON.parse(form.get('rule')!).inclusions.rules[0].filter.filters[0].value).toBe('page_engaged')
  })

  it('4. rule is serialized exactly once', async () => {
    const fetchMock = stubOkFetch()
    const expectedRule = buildEngagementRule({
      eventSourceType: 'ig_business',
      sourceId: 'ig_1',
      metaEvent: 'ig_business_profile_engaged',
      retentionSeconds: 2592000,
    })
    await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ENGAGED', retentionDays: 30, dryRun: false },
    )
    const form = new URLSearchParams(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))
    const rule = form.get('rule')!
    expect(rule).toBe(JSON.stringify(expectedRule))
    expect(rule).not.toBe(JSON.stringify(JSON.stringify(expectedRule)))
    expect(JSON.parse(rule)).toEqual(expectedRule)
  })

  it('5. rule remains valid after URLSearchParams.get()', async () => {
    const fetchMock = stubOkFetch()
    await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ENGAGED', retentionDays: 30, dryRun: false },
    )
    const form = new URLSearchParams(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))
    const serializedRule = form.get('rule')!
    expect(serializedRule.startsWith('{')).toBe(true)
    expect(serializedRule.endsWith('}')).toBe(true)
    expect(serializedRule.startsWith('"{')).toBe(false)
    const parsed = JSON.parse(serializedRule)
    expect(typeof parsed).toBe('object')
    expect(parsed.inclusions.rules[0].filter.filters[0].value).toBe('ig_business_profile_engaged')
  })

  it('6. Content-Type is application/x-www-form-urlencoded', async () => {
    const fetchMock = stubOkFetch()
    await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ENGAGED', retentionDays: 30, dryRun: false },
    )
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(META_GRAPH_FORM_CONTENT_TYPE)
  })

  it('7. prefill is sent as "1"', async () => {
    const fetchMock = stubOkFetch()
    await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ENGAGED', retentionDays: 30, prefill: true, dryRun: false },
    )
    const form = new URLSearchParams(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))
    expect(form.get('prefill')).toBe('1')
  })

  it('8. uses access_token Bearer, never page_token', async () => {
    const fetchMock = stubOkFetch()
    const credsToken = selectAdsManagementAccessToken({ accessToken: 'tok' })
    expect(credsToken).toBe('tok')
    await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ENGAGED', retentionDays: 30, dryRun: false },
    )
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(headers.Authorization).not.toContain('page-tok')
    expect(url).not.toMatch(/access_token=/)
    expect(String(init.body)).not.toContain('page-tok')
    expect(new URLSearchParams(String(init.body)).get('subtype')).toBeNull()
  })

  it('9. logs never include tokens', async () => {
    stubOkFetch()
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ENGAGED', retentionDays: 30, dryRun: false },
    )
    const dumped = JSON.stringify(info.mock.calls)
    expect(dumped).not.toContain('page-tok')
    expect(dumped).not.toMatch(/Bearer /)
    expect(dumped).not.toMatch(/"tok"/)
    expect(dumped).toContain('"tokenSource":"access_token"')
  })

  it('10. sanitizes Graph error but keeps fbtrace_id, code and subcode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: 'Invalid Event Name',
          code: 2654,
          error_subcode: 1713151,
          fbtrace_id: 'AxHS-i3s9dpL3HGVWmfJao1',
        },
      }),
    })))
    await expect(metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...confirm, sourceType: 'INSTAGRAM', event: 'ENGAGED', retentionDays: 30, dryRun: false },
    )).rejects.toMatchObject({
      code: 'META_AUDIENCE_GRAPH_ERROR',
      details: {
        code: 2654,
        error_subcode: 1713151,
        fbtrace_id: 'AxHS-i3s9dpL3HGVWmfJao1',
      },
    })
  })

  it('11. RETURN_EXISTING skips Graph POST', async () => {
    const fetchMock = stubOkFetch('should-not-create')
    const graphFetch = vi.fn(async () => ({
      data: [{ id: 'aud_old', name: 'IG | Interações | 30d', subtype: 'ENGAGEMENT' }],
    }))
    const result = await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch },
      {
        ...confirm,
        sourceType: 'INSTAGRAM',
        event: 'ENGAGED',
        retentionDays: 30,
        dryRun: false,
        duplicateStrategy: 'RETURN_EXISTING',
      },
    )
    expect((result as any).id).toBe('aud_old')
    expect((result as any).reused).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('12. dry-run and execute use the same form serializer', async () => {
    const fetchMock = stubOkFetch()
    const input = {
      ...confirm,
      sourceType: 'INSTAGRAM' as const,
      event: 'ENGAGED',
      retentionDays: 30,
    }
    const preview = await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...input, dryRun: true },
    )
    await metaCreateCustomAudience(
      { client: createIntegrationClient(dualTokenConfig), graphFetch: vi.fn(async () => ({ data: [] })) },
      { ...input, dryRun: false },
    )
    const form = new URLSearchParams(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))
    const executed = Object.fromEntries(form.entries())
    expect((preview as any).preview.body).toEqual(executed)
    expect((preview as any).preview.body).toEqual(
      Object.fromEntries(serializeCustomAudienceForm((preview as any).preview.body).entries()),
    )
    expect((preview as any).preview.contentType).toBe(META_GRAPH_FORM_CONTENT_TYPE)
    expect((preview as any).subtype).toBe('ENGAGEMENT')
    expect(form.get('subtype')).toBeNull()
  })
})
