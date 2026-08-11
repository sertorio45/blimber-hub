import type { BrandGuide } from '~/types/brand-guide'
import { describe, expect, it } from 'vitest'
import {
  ADS_CREATIVE_PIPELINE_FACTORS,
  buildAdsCreativeGenerationInput,
  createEmptyAdsCreativeGenerationInput,
  toAdsBrandContextSummary,
} from '~/utils/ads-brand'
import { toBrandContext } from '~/utils/brand-context'
import { createEmptyBrandGuide } from '~/utils/brand-guide'

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function guideWithBrand(tenantId: string): BrandGuide {
  const guide = createEmptyBrandGuide(tenantId)
  guide.id = `guide-${tenantId.slice(0, 8)}`
  guide.toneOfVoice = 'Próximo e claro'
  guide.metadata.communicationStyle = 'Conversacional'
  guide.colors = [
    { id: 'c1', name: 'Verde', hex: '#0a7a3e', role: 'primary' },
    { id: 'c2', name: 'Cinza', hex: '#666666', role: 'neutral' },
  ]
  guide.products = [{
    id: 'p1',
    name: 'Suite',
    description: '',
    url: '',
    keywords: [],
  }]
  return guide
}

describe('ads-brand helpers', () => {
  it('summarizes BrandContext for Ads UI', () => {
    const context = toBrandContext(guideWithBrand(TENANT_A))
    const summary = toAdsBrandContextSummary(context)

    expect(summary.tenantId).toBe(TENANT_A)
    expect(summary.hasGuide).toBe(true)
    expect(summary.toneOfVoice).toBe('Próximo e claro')
    expect(summary.communicationStyle).toBe('Conversacional')
    expect(summary.primaryColorHexes[0]).toBe('#0a7a3e')
    expect(summary.productCount).toBe(1)
    expect(summary.brandCenterPath).toBe('/marketing/brand')
    expect(summary.completenessPercent).toBeGreaterThanOrEqual(0)
  })

  it('builds creative input only when brand tenant matches workspace', () => {
    const brand = toBrandContext(guideWithBrand(TENANT_A))
    const input = buildAdsCreativeGenerationInput({
      tenantId: TENANT_A,
      brand,
      campaign: {
        provider: 'meta',
        externalId: '123',
        name: 'Prospecting',
      },
      objective: 'leads',
    })

    expect(input.tenantId).toBe(TENANT_A)
    expect(input.campaign?.provider).toBe('meta')
    expect(input.objective).toBe('leads')
    expect(input.brand.tenantId).toBe(TENANT_A)
  })

  it('rejects Brand Context from another tenant', () => {
    const brandB = toBrandContext(guideWithBrand(TENANT_B))
    expect(() => buildAdsCreativeGenerationInput({
      tenantId: TENANT_A,
      brand: brandB,
    })).toThrow(/does not match/)
  })

  it('empty creative input stays bound to tenant with empty brand', () => {
    const empty = createEmptyAdsCreativeGenerationInput(TENANT_A)
    expect(empty.tenantId).toBe(TENANT_A)
    expect(empty.brand.tenantId).toBe(TENANT_A)
    expect(empty.campaign).toBeNull()
    expect(empty.product).toBeNull()
  })

  it('pipeline factors cover campaign + product + brand + objective', () => {
    const ids = ADS_CREATIVE_PIPELINE_FACTORS.map(f => f.id)
    expect(ids).toEqual(['campaign', 'product', 'brand', 'objective'])
  })
})
