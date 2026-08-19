import { describe, expect, it, vi } from 'vitest'
import {
  buildCreativeAssetGroupsSpec,
  buildFlexibleAdGraphBody,
  checkFlexibleAdEligibility,
  getMetaCapabilities,
  MetaAdsToolError,
} from '~/lib/meta-ads'
import {
  metaCheckFlexibleAdEligibility,
  metaCreateFlexibleAd,
  metaGetFlexibleAdStructure,
} from '~/lib/meta-ads/tools'

const MOCK_TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const MOCK_AD_ACCOUNT = '123456789'

function mockCtx(graphResponse?: { ok: boolean; status: number; json: () => Promise<unknown> }) {
  const defaultResponse = { ok: true, status: 200, json: async () => ({ id: '999' }) }
  const mockRow = {
    id: 'int-1',
    tenant_id: MOCK_TENANT,
    provider: 'meta',
    is_active: true,
    config: {
      access_token_enc: 'enc:fake',
      ad_account_id: MOCK_AD_ACCOUNT,
      api_version: 'v25.0',
    },
  }
  const chainEnd = {
    single: async () => ({ data: mockRow, error: null }),
    maybeSingle: async () => ({ data: mockRow, error: null }),
  }
  const eqChain: any = { eq: () => eqChain, ...chainEnd }
  return {
    client: {
      from: () => ({
        select: () => ({ eq: () => eqChain }),
        insert: () => ({ error: null }),
      }),
    } as any,
    graphFetch: vi.fn().mockResolvedValue(graphResponse ?? defaultResponse),
  }
}

vi.mock('~/lib/marketing-secrets', () => ({
  decryptSecret: () => 'fake-access-token',
}))

describe('Flexible Ad Format — creative_asset_groups_spec', () => {
  describe('checkFlexibleAdEligibility', () => {
    it('returns eligible for v25.0', () => {
      const result = checkFlexibleAdEligibility('v25.0')
      expect(result.eligible).toBe(true)
      expect(result.graphVersion).toBe('v25.0')
      expect(result.supportedObjectives).toContain('OUTCOME_SALES')
      expect(result.supportedObjectives).toContain('OUTCOME_APP_PROMOTION')
      expect(result.deprecationWarning).toMatch(/março.*2026|removido/i)
    })

    it('returns not eligible for very old versions', () => {
      const result = checkFlexibleAdEligibility('v16.0')
      expect(result.eligible).toBe(false)
    })
  })

  describe('buildCreativeAssetGroupsSpec', () => {
    it('builds valid spec with images and texts', () => {
      const spec = buildCreativeAssetGroupsSpec([{
        assets: [{ imageHash: 'abc123' }, { imageHash: 'def456' }],
        texts: [
          { text: 'Promoção de verão', textType: 'primary_text' },
          { text: '50% OFF', textType: 'headline' },
        ],
        callToAction: { type: 'LEARN_MORE', link: 'https://example.com' },
      }])

      expect(spec.groups).toHaveLength(1)
      const group = (spec.groups as any[])[0]
      expect(group.images).toHaveLength(2)
      expect(group.texts).toHaveLength(2)
      expect(group.call_to_action.type).toBe('LEARN_MORE')
    })

    it('builds spec with mixed images and videos', () => {
      const spec = buildCreativeAssetGroupsSpec([{
        assets: [
          { imageHash: 'img1' },
          { videoId: 'vid1', videoThumbnailHash: 'thumb1' },
        ],
        texts: [{ text: 'Teste', textType: 'primary_text' }],
        callToAction: { type: 'SHOP_NOW', link: 'https://shop.example.com' },
      }])

      const group = (spec.groups as any[])[0]
      expect(group.images).toHaveLength(1)
      expect(group.videos).toHaveLength(1)
      expect(group.videos[0].image_hash).toBe('thumb1')
    })

    it('throws if no assets in group', () => {
      expect(() => buildCreativeAssetGroupsSpec([{
        assets: [],
        texts: [{ text: 'X', textType: 'primary_text' }],
        callToAction: { type: 'LEARN_MORE', link: 'https://x.com' },
      }])).toThrow(/ao menos 1/)
    })

    it('throws if > 5 texts per text_type', () => {
      const texts = Array.from({ length: 6 }, (_, i) => ({
        text: `T${i}`, textType: 'primary_text' as const,
      }))
      expect(() => buildCreativeAssetGroupsSpec([{
        assets: [{ imageHash: 'h' }],
        texts,
        callToAction: { type: 'LEARN_MORE', link: 'https://x.com' },
      }])).toThrow(/máximo 5/)
    })

    it('throws if CTA types differ across groups', () => {
      expect(() => buildCreativeAssetGroupsSpec([
        {
          assets: [{ imageHash: 'a' }],
          texts: [{ text: 'A', textType: 'primary_text' }],
          callToAction: { type: 'LEARN_MORE', link: 'https://a.com' },
        },
        {
          assets: [{ imageHash: 'b' }],
          texts: [{ text: 'B', textType: 'primary_text' }],
          callToAction: { type: 'SHOP_NOW', link: 'https://b.com' },
        },
      ])).toThrow(/mesmo call_to_action/i)
    })
  })

  describe('buildFlexibleAdGraphBody', () => {
    it('produces correct POST body with serialized spec', () => {
      const body = buildFlexibleAdGraphBody({
        adsetId: '555',
        name: 'Meu Flexible Ad',
        status: 'PAUSED',
        groups: [{
          assets: [{ imageHash: 'hash1' }],
          texts: [{ text: 'Olá', textType: 'primary_text' }],
          callToAction: { type: 'LEARN_MORE', link: 'https://test.com' },
        }],
      })

      expect(body.name).toBe('Meu Flexible Ad')
      expect(body.adset_id).toBe('555')
      expect(body.status).toBe('PAUSED')
      expect(typeof body.creative_asset_groups_spec).toBe('string')
      const parsed = JSON.parse(body.creative_asset_groups_spec as string)
      expect(parsed.groups).toHaveLength(1)
    })
  })

  describe('capabilities matrix', () => {
    it('now reports FLEXIBLE_AD_FORMAT as supported', () => {
      const caps = getMetaCapabilities('v25.0')
      expect(caps.creativeTypes.FLEXIBLE_AD_FORMAT.supported).toBe(true)
      expect(caps.creativeTypes.FLEXIBLE_AD_FORMAT.notes).toMatch(/creative_asset_groups_spec/)
    })
  })

  describe('metaCreateFlexibleAd (dry-run)', () => {
    it('returns validated payload in dry-run mode', async () => {
      const ctx = mockCtx()
      const result = await metaCreateFlexibleAd(ctx, {
        tenantId: MOCK_TENANT,
        adsetId: '12345',
        name: 'Test Flexible',
        groups: [{
          assets: [{ imageHash: 'abc' }],
          texts: [{ text: 'Promo', textType: 'primary_text' }],
          callToAction: { type: 'LEARN_MORE', link: 'https://example.com' },
        }],
        dryRun: true,
      }) as any

      expect(result.dryRun).toBe(true)
      expect(result.graphBody.creative_asset_groups_spec).toBeDefined()
      expect(result.preview.groups).toHaveLength(1)
      expect(result.deprecationWarning).toMatch(/2026/)
      expect(ctx.graphFetch).not.toHaveBeenCalled()
    })
  })

  describe('metaGetFlexibleAdStructure', () => {
    it('reads ad and returns structure', async () => {
      const ctx = mockCtx({
        ok: true,
        status: 200,
        json: async () => ({
          id: '777',
          name: 'Ad Test',
          creative_asset_groups_spec: { groups: [{ images: [{ hash: 'x' }] }] },
        }),
      })

      const result = await metaGetFlexibleAdStructure(ctx, {
        tenantId: MOCK_TENANT,
        adId: '777',
      }) as any

      expect(result.hasFlexibleFormat).toBe(true)
      expect(result.creative_asset_groups_spec.groups).toHaveLength(1)
    })
  })
})
