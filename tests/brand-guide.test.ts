import { describe, expect, it } from 'vitest'
import {
  applyBrandLogoSelection,
  computeBrandCompleteness,
  createEmptyAiPreferences,
  createEmptyBrandGuide,
  createEmptyVisualDirection,
  isAiPreferencesFilled,
  isVisualDirectionFilled,
  normalizeAiPreferences,
  normalizeBrandGuide,
  normalizeVisualDirection,
  toBrandGuideInput,
} from '~/utils/brand-guide'

describe('brand-guide utils', () => {
  it('normalizes snake_case DB rows into BrandGuide', () => {
    const guide = normalizeBrandGuide({
      id: '11111111-1111-1111-1111-111111111111',
      tenant_id: '22222222-2222-2222-2222-222222222222',
      tone_of_voice: 'Próximo e direto',
      audience: 'PMEs de serviços',
      allowed_words: ['parceria'],
      forbidden_words: ['barato'],
      ctas: ['Fale conosco'],
      hashtags: ['#marca'],
      colors: [{ name: 'Azul', hex: '2563eb', role: 'primary' }],
      fonts: [{ family: 'Inter', role: 'body' }],
      products: [{ name: 'Plano Pro' }],
      competitors: [{ name: 'Rival SA' }],
      restrictions: 'Sem claims médicos',
      legal_notes: 'CNPJ obrigatório',
      logo_asset_ids: ['33333333-3333-3333-3333-333333333333'],
      metadata: {
        communicationStyle: 'Frases curtas',
        references: [{ name: 'Apple', kind: 'style' }],
      },
    })

    expect(guide.toneOfVoice).toBe('Próximo e direto')
    expect(guide.logoAssetIds).toHaveLength(1)
    expect(guide.colors[0]?.hex).toBe('#2563eb')
    expect(guide.metadata.communicationStyle).toBe('Frases curtas')
    expect(guide.metadata.references?.[0]?.name).toBe('Apple')
    expect(guide.metadata.audienceProfile?.summary).toBe('PMEs de serviços')
    expect(guide.metadata.visualDirection).toBeTruthy()
    expect(guide.metadata.aiPreferences?.fidelity).toBe('balanced')
    expect(guide.visualReferenceAssets).toEqual([])
  })

  it('normalizes visualDirection and aiPreferences from metadata', () => {
    const visual = normalizeVisualDirection({
      styles: [{ name: 'Editorial clean', description: 'Espaço negativo' }],
      photography: {
        general: 'Natural',
        lighting: 'Soft daylight',
        framing: 'Close produto',
        environments: ['escritório', 'cidade'],
      },
      composition: { notes: 'Centro limpo', rules: ['regra dos terços'] },
      people: { direction: 'Profissionais em ação', contexts: ['reunião'], avoid: ['poses stock'] },
      productsInImages: { direction: 'Hero packshot', presentation: 'mesa clara', contexts: ['unboxing'] },
      preferredElements: ['madeira clara'],
      forbiddenElements: ['neon'],
      disallowedStyles: ['cyberpunk'],
      negativeGuidance: 'Sem overlays baratos',
      visualReferenceAssetIds: ['44444444-4444-4444-4444-444444444444'],
    })

    expect(visual.styles[0]?.name).toBe('Editorial clean')
    expect(visual.photography.environments).toEqual(['escritório', 'cidade'])
    expect(visual.people.avoid).toEqual(['poses stock'])
    expect(visual.visualReferenceAssetIds).toHaveLength(1)
    expect(isVisualDirectionFilled(visual)).toBe(true)
    expect(isVisualDirectionFilled(createEmptyVisualDirection())).toBe(false)

    const ai = normalizeAiPreferences({
      fidelity: 'strict',
      realism: 'photoreal',
      textInImage: 'brand_only',
      logo: 'required',
      preferences: 'Manter tipografia da marca',
      observations: 'Sem stock genérico',
    })
    expect(ai.notes).toBe('Sem stock genérico')
    expect(ai.fidelity).toBe('strict')
    expect(isAiPreferencesFilled(ai)).toBe(true)
    expect(isAiPreferencesFilled(createEmptyAiPreferences())).toBe(false)
    expect(isAiPreferencesFilled(normalizeAiPreferences({ fidelity: 'nope' }))).toBe(false)
  })

  it('computes completeness including visual and AI sections', () => {
    const empty = computeBrandCompleteness(createEmptyBrandGuide())
    expect(empty.percent).toBe(0)
    expect(empty.sections.some(section => section.id === 'visual')).toBe(true)
    expect(empty.sections.some(section => section.id === 'ai')).toBe(true)

    const partial = createEmptyBrandGuide()
    partial.toneOfVoice = 'Amigável'
    partial.colors = [{ id: '1', name: 'Azul', hex: '#00f', role: 'primary' }]
    const result = computeBrandCompleteness(partial)
    expect(result.percent).toBeGreaterThan(0)
    expect(result.percent).toBeLessThan(100)
    expect(result.sections.some(section => section.id === 'tone' && section.filled)).toBe(true)

    partial.metadata.visualDirection = {
      ...createEmptyVisualDirection(),
      preferredElements: ['luz natural'],
    }
    partial.metadata.aiPreferences = {
      ...createEmptyAiPreferences(),
      notes: 'Preferir close de produto',
    }
    const withVisual = computeBrandCompleteness(partial)
    expect(withVisual.sections.find(section => section.id === 'visual')?.filled).toBe(true)
    expect(withVisual.sections.find(section => section.id === 'ai')?.filled).toBe(true)
    expect(withVisual.percent).toBeGreaterThan(result.percent)
  })

  it('filters incomplete list rows before save payload including visual styles', () => {
    const guide = createEmptyBrandGuide('tenant')
    guide.fonts = [{ id: '1', family: '', role: 'body', weights: [], notes: '' }]
    guide.products = [{ id: '2', name: 'CRM', description: '', url: '', keywords: [] }]
    guide.metadata.references = [{ id: '3', name: '', url: '', notes: '', kind: 'other' }]
    guide.metadata.visualDirection = {
      ...createEmptyVisualDirection(),
      styles: [
        { id: 's1', name: 'Clean', description: 'ok' },
        { id: 's2', name: '', description: 'ignore' },
      ],
      preferredElements: ['vidro', ''],
      visualReferenceAssetIds: ['55555555-5555-5555-5555-555555555555'],
    }

    const input = toBrandGuideInput(guide)
    expect(input.fonts).toEqual([])
    expect(input.products).toHaveLength(1)
    expect(input.metadata?.references).toEqual([])
    expect(input.metadata?.visualDirection?.styles).toHaveLength(1)
    expect(input.metadata?.visualDirection?.preferredElements).toEqual(['vidro'])
    expect(input.metadata?.visualDirection?.visualReferenceAssetIds).toHaveLength(1)
    expect(input.metadata?.aiPreferences).toBeTruthy()
  })

  it('applies logo selection atomically so save payload keeps logoAssetIds', () => {
    const guide = createEmptyBrandGuide('tenant')
    const logoId = '33333333-3333-3333-3333-333333333333'
    const logoAssets = [{
      id: logoId,
      name: 'logo.png',
      mimeType: 'image/png',
      previewUrl: 'https://example.com/logo.png',
      objectPath: 'tenant/logo.png',
    }]

    // Stale dual-patch: assets present, ids wiped — save must still persist ids.
    const onlyAssets = { ...guide, logoAssets }
    expect(toBrandGuideInput(onlyAssets).logoAssetIds).toEqual([logoId])

    const linked = applyBrandLogoSelection(guide, {
      logoAssetIds: [logoId],
      logoAssets,
    })
    expect(linked.logoAssetIds).toEqual([logoId])
    expect(linked.logoAssets).toHaveLength(1)
    expect(toBrandGuideInput(linked).logoAssetIds).toEqual([logoId])
  })
})
