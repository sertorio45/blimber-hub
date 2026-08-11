import { describe, expect, it } from 'vitest'
import type { BrandGuide } from '~/types/brand-guide'
import {
  createEmptyBrandContext,
  isBrandContextForTenant,
  toBrandContext,
} from '~/utils/brand-context'
import {
  createEmptyAiPreferences,
  createEmptyBrandGuide,
  createEmptyVisualDirection,
  normalizeBrandGuide,
} from '~/utils/brand-guide'

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function guideForTenant(tenantId: string, productName: string): BrandGuide {
  const guide = createEmptyBrandGuide(tenantId)
  guide.id = `guide-${tenantId.slice(0, 8)}`
  guide.toneOfVoice = `Tom ${tenantId.slice(0, 4)}`
  guide.products = [{
    id: `prod-${tenantId.slice(0, 8)}`,
    name: productName,
    description: '',
    url: '',
    keywords: [],
  }]
  guide.logoAssetIds = [`logo-${tenantId.slice(0, 8)}`]
  guide.metadata.communicationStyle = 'Curto'
  guide.metadata.visualDirection = {
    ...createEmptyVisualDirection(),
    preferredElements: [`elemento-${tenantId.slice(0, 4)}`],
  }
  guide.metadata.aiPreferences = {
    ...createEmptyAiPreferences(),
    fidelity: 'strict',
    notes: `notas-${tenantId.slice(0, 4)}`,
  }
  guide.competitors = [{
    id: `comp-${tenantId.slice(0, 8)}`,
    name: `Rival ${tenantId.slice(0, 4)}`,
    url: '',
    notes: '',
    strengths: '',
    weaknesses: '',
  }]
  guide.metadata.references = [{
    id: `ref-${tenantId.slice(0, 8)}`,
    name: `Ref ${tenantId.slice(0, 4)}`,
    url: '',
    notes: '',
    kind: 'inspiration',
  }]
  return guide
}

describe('brand-context mapper', () => {
  it('maps BrandGuide sections into BrandContext contract', () => {
    const raw = normalizeBrandGuide({
      id: '11111111-1111-1111-1111-111111111111',
      tenant_id: TENANT_A,
      tone_of_voice: 'Próximo',
      audience: 'Hotéis boutique',
      allowed_words: ['acolhedor'],
      forbidden_words: ['barato'],
      ctas: ['Reserve'],
      hashtags: ['#hotel'],
      colors: [{ name: 'Verde', hex: '#0a7', role: 'primary' }],
      fonts: [{ family: 'DM Sans', role: 'body' }],
      products: [{ name: 'Suite Luxo' }],
      competitors: [{ name: 'Hotel Rivais' }],
      restrictions: 'Sem claim médico',
      legal_notes: 'CNPJ no rodapé',
      logo_asset_ids: ['33333333-3333-3333-3333-333333333333'],
      metadata: {
        communicationStyle: 'Conversacional',
        references: [{ name: 'Aman', kind: 'style' }],
        audienceProfile: {
          summary: 'Hotéis boutique',
          segments: ['lazer'],
          demographics: '25-45',
          pains: ['ocupação'],
          motivations: ['experiência'],
          preferredChannels: ['instagram'],
        },
        visualDirection: {
          styles: [{ name: 'Editorial', description: 'luz natural' }],
          preferredElements: ['linhaça'],
          visualReferenceAssetIds: ['44444444-4444-4444-4444-444444444444'],
        },
        aiPreferences: {
          fidelity: 'strict',
          realism: 'photoreal',
          notes: 'Preferir produto hero',
        },
      },
    }, TENANT_A)

    raw.logoAssets = [{
      id: '33333333-3333-3333-3333-333333333333',
      name: 'logo.png',
      mimeType: 'image/png',
      previewUrl: null,
      objectPath: 'a/logo.png',
    }]
    raw.visualReferenceAssets = [{
      id: '44444444-4444-4444-4444-444444444444',
      name: 'mood.jpg',
      mimeType: 'image/jpeg',
      previewUrl: null,
      objectPath: 'a/mood.jpg',
    }]

    const context = toBrandContext(raw)

    expect(context.tenantId).toBe(TENANT_A)
    expect(context.guideId).toBe('11111111-1111-1111-1111-111111111111')
    expect(context.identity.colors[0]?.hex).toBe('#0a7')
    expect(context.identity.fonts[0]?.family).toBe('DM Sans')
    expect(context.identity.logos).toHaveLength(1)
    expect(context.visual.direction.styles[0]?.name).toBe('Editorial')
    expect(context.visual.referenceAssets).toHaveLength(1)
    expect(context.communication.toneOfVoice).toBe('Próximo')
    expect(context.communication.style).toBe('Conversacional')
    expect(context.communication.ctas).toEqual(['Reserve'])
    expect(context.audiences.summary).toBe('Hotéis boutique')
    expect(context.audiences.profile.segments).toEqual(['lazer'])
    expect(context.products[0]?.name).toBe('Suite Luxo')
    expect(context.competitors[0]?.name).toBe('Hotel Rivais')
    expect(context.references[0]?.name).toBe('Aman')
    expect(context.ai.fidelity).toBe('strict')
    expect(context.restrictions.legalNotes).toBe('CNPJ no rodapé')
    expect(context.completeness.percent).toBeGreaterThan(0)
  })

  it('creates empty BrandContext stamped with tenantId', () => {
    const empty = createEmptyBrandContext(TENANT_A)
    expect(empty.tenantId).toBe(TENANT_A)
    expect(empty.guideId).toBeNull()
    expect(empty.products).toEqual([])
    expect(empty.ai.fidelity).toBe('balanced')
    expect(empty.visual.direction.preferredElements).toEqual([])
  })

  it('isolates BrandContext by tenant (no cross-contamination)', () => {
    const guideA = guideForTenant(TENANT_A, 'Produto A')
    const guideB = guideForTenant(TENANT_B, 'Produto B')

    const contextA = toBrandContext(guideA)
    const contextB = toBrandContext(guideB)

    expect(isBrandContextForTenant(contextA, TENANT_A)).toBe(true)
    expect(isBrandContextForTenant(contextA, TENANT_B)).toBe(false)
    expect(isBrandContextForTenant(contextB, TENANT_B)).toBe(true)

    expect(contextA.tenantId).toBe(TENANT_A)
    expect(contextB.tenantId).toBe(TENANT_B)
    expect(contextA.products[0]?.name).toBe('Produto A')
    expect(contextB.products[0]?.name).toBe('Produto B')
    expect(contextA.identity.logoAssetIds[0]).not.toBe(contextB.identity.logoAssetIds[0])
    expect(contextA.competitors[0]?.name).not.toBe(contextB.competitors[0]?.name)
    expect(contextA.references[0]?.name).not.toBe(contextB.references[0]?.name)
    expect(contextA.visual.direction.preferredElements[0]).not.toBe(
      contextB.visual.direction.preferredElements[0],
    )
    expect(contextA.ai.notes).not.toBe(contextB.ai.notes)

    // Mutating A must not affect B (shallow arrays cloned at map boundary).
    contextA.products.push({
      id: 'x',
      name: 'inject',
      description: '',
      url: '',
      keywords: [],
    })
    expect(contextB.products.map(p => p.name)).toEqual(['Produto B'])
    expect(contextB.products).toHaveLength(1)
  })

  it('forces tenantId override when mapping for workspace isolation', () => {
    const guide = createEmptyBrandGuide(TENANT_A)
    guide.products = [{
      id: '1',
      name: 'X',
      description: '',
      url: '',
      keywords: [],
    }]

    const stamped = toBrandContext(guide, { tenantId: TENANT_B })
    expect(stamped.tenantId).toBe(TENANT_B)
    expect(stamped.products[0]?.name).toBe('X')
  })
})
