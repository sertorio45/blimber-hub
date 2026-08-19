import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encryptSecret } from '~/lib/marketing-secrets'
import {
  MetaAdsToolError,
  metaCreateExperiment,
  metaGetCapabilities,
  metaListExperiments,
  setMetaWriteAuditSink,
} from '~/lib/meta-ads'

process.env.MARKETING_ENCRYPTION_SECRET = 'test-marketing-encryption-secret-for-mcp'

const USER_ID = '111222333'
const BUSINESS_ID = '9988776655'
const AD_ACCOUNT = '555'

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

function graphMethodException() {
  return new MetaAdsToolError(
    'META_GRAPH_ERROR',
    'Unsupported request - method type: post',
    400,
    { type: 'GraphMethodException', code: 100 },
  )
}

function adNode(id: string, accountId = AD_ACCOUNT) {
  return {
    id,
    name: id,
    account_id: accountId,
    adset_id: 'as_1',
    campaign_id: 'c_1',
    creative: {
      object_story_spec: { page_id: 'p', link_data: { message: 'm', link: 'https://ex.com' } },
    },
  }
}

function createBaseClient(extra: Record<string, unknown> = {}) {
  return createIntegrationClient({
    access_token_enc: encryptSecret('user-access-token'),
    ad_account_id: AD_ACCOUNT,
    business_id: BUSINESS_ID,
    api_version: 'v25.0',
    ...extra,
  })
}

const createInput = {
  tenantId: 'tenant-1',
  confirmTenantId: 'tenant-1',
  confirm: true,
  name: 'Teste criativo unico',
  type: 'SPLIT_TEST_V2' as const,
  baseAdId: 'ad_base',
  variations: [{ name: 'V2', message: 'copy B' }],
  startTime: 1800000000,
  endTime: 1800600000,
  creativeTestDailyBudget: 15000,
}

describe('meta creative tests USER → BUSINESS', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    setMetaWriteAuditSink(() => {})
  })

  it('1. USER succeeds: creates study, skips BUSINESS, no rollback', async () => {
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes(`/${USER_ID}/ad_studies`))
        return { id: 'study_user' }
      if (init?.method === 'POST' && u.includes(`/${BUSINESS_ID}/ad_studies`))
        throw new Error('BUSINESS should not be called')
      if (u.includes('/ad_copy_1'))
        return adNode('ad_copy_1')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client: createBaseClient(), graphFetch },
      { ...createInput, dryRun: false },
    ) as any

    expect(result.success).toBe(true)
    expect(result.studyId).toBe('study_user')
    expect(result.studyOwner).toBe('USER')
    expect(result.studyOwnerId).toBe(USER_ID)
    expect(result.studiesGraphVersion).toBe('v26.0')
    expect(result.copiedAdsRolledBack).toBeUndefined()
    expect(result.baseAdIdPreserved).toBe('ad_base')
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.filter(([url]) => String(url).includes('/ad_base/copies'))).toHaveLength(1)
    expect(posts.some(([url]) => String(url).includes(`/v26.0/${USER_ID}/ad_studies`))).toBe(true)
    expect(posts.some(([url]) => String(url).includes(`/${BUSINESS_ID}/ad_studies`))).toBe(false)
    expect(posts.some(([url, init]) => String(url).includes('/ad_copy_1') && (init as any)?.body?.status === 'DELETED')).toBe(false)
    expect(JSON.stringify(result)).not.toContain('user-access-token')
  })

  it('2. USER code 100 then BUSINESS succeeds: reuses copies, no rollback', async () => {
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes(`/${USER_ID}/ad_studies`))
        throw graphMethodException()
      if (init?.method === 'POST' && u.includes(`/${BUSINESS_ID}/ad_studies`))
        return { id: 'study_biz' }
      if (u.includes('/ad_copy_1'))
        return adNode('ad_copy_1')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client: createBaseClient(), graphFetch },
      { ...createInput, dryRun: false },
    ) as any

    expect(result.studyId).toBe('study_biz')
    expect(result.studyOwner).toBe('BUSINESS')
    expect(result.studyOwnerId).toBe(BUSINESS_ID)
    expect(result.attempts.map((a: any) => [a.ownerType, a.success])).toEqual([
      ['USER', false],
      ['BUSINESS', true],
    ])
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.filter(([url]) => String(url).includes('/copies'))).toHaveLength(1)
    expect(posts.some(([, init]) => (init as any)?.body?.status === 'DELETED')).toBe(false)
    const userPost = posts.find(([url]) => String(url).includes(`/${USER_ID}/ad_studies`))
    const bizPost = posts.find(([url]) => String(url).includes(`/${BUSINESS_ID}/ad_studies`))
    expect(userPost?.[1]?.body?.cells).toEqual(bizPost?.[1]?.body?.cells)
  })

  it('3. USER and BUSINESS fail: deletes only copies, preserves base', async () => {
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes('/ad_studies'))
        throw graphMethodException()
      if (init?.method === 'POST' && u.includes('/ad_copy_1'))
        return { success: true }
      if (u.includes('/ad_copy_1'))
        return adNode('ad_copy_1')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    await expect(metaCreateExperiment(
      { client: createBaseClient(), graphFetch },
      { ...createInput, dryRun: false },
    )).rejects.toMatchObject({
      code: 'META_GRAPH_ERROR',
      details: {
        copiedAdsRolledBack: { deleted: ['ad_copy_1'], failed: [] },
        baseAdIdPreserved: 'ad_base',
      },
    })
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.some(([url, init]) =>
      String(url).includes('/ad_copy_1') && (init as any)?.body?.status === 'DELETED',
    )).toBe(true)
    expect(posts.some(([url, init]) =>
      String(url).includes('/ad_base') && (init as any)?.body?.status === 'DELETED',
    )).toBe(false)
  })

  it('4. timeout but study exists: recover, no rollback', async () => {
    let postedStudy = false
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes(`/${USER_ID}/ad_studies`)) {
        postedStudy = true
        throw new MetaAdsToolError('META_GRAPH_ERROR', 'timed out', 502, { is_transient: true })
      }
      if (postedStudy && (u.includes('impacting_ad_studies') || u.includes('/ad_studies'))) {
        return {
          data: [{
            id: 'study_recovered',
            name: 'Teste criativo unico',
            type: 'SPLIT_TEST_V2',
            cells: {
              data: [{
                ads: { data: [{ id: 'ad_base' }, { id: 'ad_copy_1' }] },
                adaccounts: { data: [{ id: AD_ACCOUNT }] },
              }],
            },
          }],
        }
      }
      if (u.includes('/ad_copy_1'))
        return adNode('ad_copy_1')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client: createBaseClient(), graphFetch },
      { ...createInput, dryRun: false },
    ) as any

    expect(result.success).toBe(true)
    expect(result.studyId).toBe('study_recovered')
    expect(result.recovered).toBe(true)
    expect(result.copiedAdsRolledBack).toBeUndefined()
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.some(([, init]) => (init as any)?.body?.status === 'DELETED')).toBe(false)
    expect(posts.some(([url]) => String(url).includes(`/${BUSINESS_ID}/ad_studies`))).toBe(false)
  })

  it('5. dryRun: no copy POST, no study POST, no delete', async () => {
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST')
        throw new Error('dryRun must not POST')
      if (/\/v26\.0\/me$/.test(String(url).split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (String(url).includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client: createBaseClient(), graphFetch },
      { ...createInput, dryRun: true },
    ) as any

    expect(result.dryRun).toBe(true)
    expect(result.success).toBe(true)
    expect(result.studiesGraphVersion).toBe('v26.0')
    expect(result.preview.ownerOrder).toEqual(['USER', 'BUSINESS'])
    expect(result.preview.plannedEndpoints[0]).toBe(`POST v26.0 /${USER_ID}/ad_studies`)
    expect(result.preview.plannedEndpoints[1]).toBe(`POST v26.0 /${BUSINESS_ID}/ad_studies`)
    expect(result.preview.notes.join(' ')).toMatch(/Rollback das cópias só depois de TODAS/i)
    expect(graphFetch.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
  })

  it('6. ad from another tenant is blocked', async () => {
    const graphFetch = vi.fn(async (url: string) => {
      if (/\/v26\.0\/me$/.test(String(url).split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (String(url).includes('/ad_base'))
        return adNode('ad_base', '999999')
      return { data: [] }
    })

    await expect(metaCreateExperiment(
      { client: createBaseClient(), graphFetch },
      { ...createInput, dryRun: false },
    )).rejects.toMatchObject({ code: 'AD_TENANT_MISMATCH' })
    expect(graphFetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('7. page token is blocked before POST', async () => {
    const pageTok = 'page-access-token-secret'
    const client = createIntegrationClient({
      access_token_enc: encryptSecret(pageTok),
      page_access_token_enc: encryptSecret(pageTok),
      page_id: '555666777',
      ad_account_id: AD_ACCOUNT,
      business_id: BUSINESS_ID,
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async () => ({ id: '555666777', name: 'Page' }))

    await expect(metaCreateExperiment(
      { client, graphFetch },
      { ...createInput, dryRun: false },
    )).rejects.toMatchObject({ code: 'EXPERIMENT_PAGE_TOKEN_FORBIDDEN' })
    expect(graphFetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('8. no Business: USER still works; BUSINESS-only errors clearly', async () => {
    const clientNoBiz = createIntegrationClient({
      access_token_enc: encryptSecret('user-access-token'),
      ad_account_id: AD_ACCOUNT,
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      const path = u.split('?')[0]
      if (/\/v26\.0\/me$/.test(path))
        return { id: USER_ID, name: 'Ana' }
      if (/\/act_555$/.test(path))
        return { id: 'act_555' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes(`/${USER_ID}/ad_studies`))
        return { id: 'study_user_only' }
      if (u.includes('/ad_copy_1'))
        return adNode('ad_copy_1')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client: clientNoBiz, graphFetch },
      { ...createInput, dryRun: false, studyOwner: 'AUTO' },
    ) as any
    expect(result.studyId).toBe('study_user_only')
    expect(result.studyOwner).toBe('USER')

    await expect(metaCreateExperiment(
      { client: clientNoBiz, graphFetch },
      { ...createInput, dryRun: false, studyOwner: 'BUSINESS' },
    )).rejects.toMatchObject({ code: 'EXPERIMENT_PARENT_REQUIRED' })
  })

  it('lists user + business + impacting studies with dedupe', async () => {
    const graphFetch = vi.fn(async (url: string) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (u.includes('/act_555/impacting_ad_studies')) {
        return {
          data: [{
            id: 'study_1',
            name: 'A/B',
            cells: { data: [{ adaccounts: { data: [{ id: AD_ACCOUNT }] } }] },
          }],
        }
      }
      if (u.includes(`/${USER_ID}/ad_studies`)) {
        return {
          data: [{
            id: 'study_user',
            name: 'User study',
            cells: { data: [{ adaccounts: { data: [{ id: AD_ACCOUNT }] } }] },
          }],
        }
      }
      if (u.includes(`/${BUSINESS_ID}/ad_studies`)) {
        return {
          data: [
            { id: 'study_1', name: 'A/B' },
            {
              id: 'study_2',
              name: 'BM',
              cells: { data: [{ adaccounts: { data: [{ id: AD_ACCOUNT }] } }] },
            },
            {
              id: 'study_other',
              name: 'Outra conta',
              cells: { data: [{ adaccounts: { data: [{ id: '999' }] } }] },
            },
          ],
        }
      }
      return { data: [] }
    })

    const result = await metaListExperiments(
      { client: createBaseClient(), graphFetch },
      { tenantId: 'tenant-1' },
    ) as any
    expect(result.studies.map((s: any) => s.id).sort()).toEqual(['study_1', 'study_2', 'study_user'])
    expect(result.sources).toMatchObject({
      impactingAdStudies: true,
      businessAdStudies: true,
      userAdStudies: true,
    })
    expect(result.userId).toBe(USER_ID)
  })

  it('capabilities expose AUTO/USER/BUSINESS for splitTestV2Creative', async () => {
    const report = await metaGetCapabilities(
      { client: createBaseClient() },
      { tenantId: 'tenant-1' },
    ) as any
    const split = report.capabilities.experiments.splitTestV2Creative
    expect(split.supported).toBe(true)
    expect(split.defaultOwnerStrategy).toBe('AUTO')
    expect(split.ownerStrategies).toEqual(['AUTO', 'USER', 'BUSINESS'])
    expect(split.studiesGraphVersion).toBe('v26.0')
  })
})

describe('meta creative tests — media variations', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    setMetaWriteAuditSink(() => {})
  })

  it('variation with imageHash creates new creative + swaps on copied ad', async () => {
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes(`/${USER_ID}/ad_studies`))
        return { id: 'study_media' }
      if (init?.method === 'POST' && u.includes('/adcreatives'))
        return { id: 'creative_new_1' }
      if (init?.method === 'POST' && u.includes('/ad_copy_1') && init?.body?.creative)
        return { success: true }
      if (u.includes('/ad_copy_1'))
        return adNode('ad_copy_1')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client: createBaseClient({ page_id: 'p', page_access_token_enc: encryptSecret('page-token') }), graphFetch },
      {
        ...createInput,
        dryRun: false,
        variations: [{
          name: 'Image V2',
          imageHash: 'abc123hash',
        }],
      },
    ) as any

    expect(result.success).toBe(true)
    expect(result.studyId).toBe('study_media')

    const creativePosts = graphFetch.mock.calls.filter(
      ([url, init]) => init?.method === 'POST' && String(url).includes('/adcreatives'),
    )
    expect(creativePosts).toHaveLength(1)

    const swapPosts = graphFetch.mock.calls.filter(
      ([url, init]) => init?.method === 'POST' && String(url).includes('/ad_copy_1') && init?.body?.creative,
    )
    expect(swapPosts).toHaveLength(1)
    expect(swapPosts[0][1].body.creative.creative_id).toBe('creative_new_1')
  })

  it('variation with imageUrl uploads image then creates creative', async () => {
    let uploadedImageHash: string | null = null
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes('/adimages')) {
        uploadedImageHash = 'uploaded_hash_xyz'
        return { images: { img: { hash: 'uploaded_hash_xyz' } } }
      }
      if (init?.method === 'POST' && u.includes('/adcreatives'))
        return { id: 'creative_uploaded' }
      if (init?.method === 'POST' && u.includes('/ad_copy_1') && init?.body?.creative)
        return { success: true }
      if (init?.method === 'POST' && u.includes(`/${USER_ID}/ad_studies`))
        return { id: 'study_url' }
      if (u.includes('/ad_copy_1'))
        return adNode('ad_copy_1')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client: createBaseClient({ page_id: 'p', page_access_token_enc: encryptSecret('page-token') }), graphFetch },
      {
        ...createInput,
        dryRun: false,
        variations: [{
          name: 'URL Image',
          imageUrl: 'https://example.com/image.jpg',
        }],
      },
    ) as any

    expect(result.success).toBe(true)
    expect(uploadedImageHash).toBe('uploaded_hash_xyz')

    const uploadPosts = graphFetch.mock.calls.filter(
      ([url, init]) => init?.method === 'POST' && String(url).includes('/adimages'),
    )
    expect(uploadPosts).toHaveLength(1)
  })

  it('text-only variation still works (no creative create/swap)', async () => {
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes(`/${USER_ID}/ad_studies`))
        return { id: 'study_text' }
      if (u.includes('/ad_copy_1'))
        return adNode('ad_copy_1')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client: createBaseClient(), graphFetch },
      {
        ...createInput,
        dryRun: false,
        variations: [{ name: 'V2', message: 'copy B' }],
      },
    ) as any

    expect(result.success).toBe(true)
    expect(result.studyId).toBe('study_text')

    const creativePosts = graphFetch.mock.calls.filter(
      ([url, init]) => init?.method === 'POST' && String(url).includes('/adcreatives'),
    )
    expect(creativePosts).toHaveLength(0)
  })

  it('variation with videoId creates VIDEO creative + swaps', async () => {
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes('/adcreatives'))
        return { id: 'creative_video' }
      if (init?.method === 'POST' && u.includes('/ad_copy_1') && init?.body?.creative)
        return { success: true }
      if (init?.method === 'POST' && u.includes(`/${USER_ID}/ad_studies`))
        return { id: 'study_video' }
      if (u.includes('/ad_copy_1'))
        return adNode('ad_copy_1')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client: createBaseClient({ page_id: 'p', page_access_token_enc: encryptSecret('page-token') }), graphFetch },
      {
        ...createInput,
        dryRun: false,
        variations: [{
          name: 'Video V2',
          videoId: 'vid_123',
        }],
      },
    ) as any

    expect(result.success).toBe(true)
    expect(result.studyId).toBe('study_video')

    const creativePosts = graphFetch.mock.calls.filter(
      ([url, init]) => init?.method === 'POST' && String(url).includes('/adcreatives'),
    )
    expect(creativePosts).toHaveLength(1)
  })

  it('dryRun with media variation does NOT upload/create/swap', async () => {
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (init?.method === 'POST')
        throw new Error('No POST calls expected in dryRun')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client: createBaseClient({ page_id: 'p', page_access_token_enc: encryptSecret('page-token') }), graphFetch },
      {
        ...createInput,
        dryRun: true,
        variations: [{
          name: 'Image V2',
          imageHash: 'abc123hash',
        }],
      },
    ) as any

    expect(result.dryRun).toBe(true)
    expect(result.success).toBe(true)
    expect(result.studyId).toBeNull()
  })

  it('mixed text + media variations: only media ones get creative swap', async () => {
    let copyCount = 0
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies')) {
        copyCount++
        return { copied_ad_id: `ad_copy_${copyCount}` }
      }
      if (init?.method === 'POST' && u.includes('/adcreatives'))
        return { id: 'creative_media' }
      if (init?.method === 'POST' && u.includes('/ad_copy_2') && init?.body?.creative)
        return { success: true }
      if (init?.method === 'POST' && u.includes(`/${USER_ID}/ad_studies`))
        return { id: 'study_mixed' }
      if (u.includes('/ad_copy_1'))
        return adNode('ad_copy_1')
      if (u.includes('/ad_copy_2'))
        return adNode('ad_copy_2')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client: createBaseClient({ page_id: 'p', page_access_token_enc: encryptSecret('page-token') }), graphFetch },
      {
        ...createInput,
        dryRun: false,
        variations: [
          { name: 'Text Only', message: 'copy B' },
          { name: 'Image V2', imageHash: 'hash_v2' },
        ],
      },
    ) as any

    expect(result.success).toBe(true)
    expect(result.copiedAds).toHaveLength(2)

    const creativePosts = graphFetch.mock.calls.filter(
      ([url, init]) => init?.method === 'POST' && String(url).includes('/adcreatives'),
    )
    expect(creativePosts).toHaveLength(1)

    const swapPosts = graphFetch.mock.calls.filter(
      ([, init]) => init?.method === 'POST' && init?.body?.creative?.creative_id,
    )
    expect(swapPosts).toHaveLength(1)
  })

  it('rollback removes copies on creative create failure, preserves base', async () => {
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v26\.0\/me$/.test(u.split('?')[0]))
        return { id: USER_ID, name: 'Ana' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes('/adcreatives'))
        throw new MetaAdsToolError('META_CREATE_CREATIVE_FAILED', 'Mock creative fail', 502)
      if (init?.method === 'POST' && u.includes('/ad_copy_1') && init?.body?.status === 'DELETED')
        return { success: true }
      if (u.includes('/ad_copy_1'))
        return adNode('ad_copy_1')
      if (u.includes('/ad_base'))
        return adNode('ad_base')
      return { data: [] }
    })

    try {
      await metaCreateExperiment(
        { client: createBaseClient({ page_id: 'p', page_access_token_enc: encryptSecret('page-token') }), graphFetch },
        {
          ...createInput,
          dryRun: false,
          variations: [{
            name: 'Fail Image',
            imageHash: 'will_fail',
          }],
        },
      )
      expect.unreachable('Should have thrown')
    }
    catch (err: any) {
      expect(err.message).toContain('Mock creative fail')
      expect(err.details?.copiedAdsRolledBack?.deleted).toContain('ad_copy_1')
      expect(err.details?.baseAdIdPreserved).toBe('ad_base')
    }
  })
})
