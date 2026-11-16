import { describe, expect, it } from 'vitest'

import {
  aspectRatioLabel,
  previewFormatBadge,
  resolveDisplayAspectRatio,
} from '~/utils/marketing-social-preview'

describe('resolveDisplayAspectRatio', () => {
  it('prefers intrinsic media size over format defaults', () => {
    expect(resolveDisplayAspectRatio({
      format: 'story',
      platform: 'instagram',
      width: 1080,
      height: 1080,
    })).toBeCloseTo(1)

    expect(resolveDisplayAspectRatio({
      format: 'static',
      platform: 'instagram',
      width: 1080,
      height: 1350,
    })).toBeCloseTo(1080 / 1350)
  })

  it('falls back to 9:16 for Stories/Reels when size is unknown', () => {
    expect(resolveDisplayAspectRatio({ format: 'story', platform: 'facebook' })).toBeCloseTo(9 / 16)
    expect(resolveDisplayAspectRatio({ format: 'video', platform: 'instagram' })).toBeCloseTo(9 / 16)
  })

  it('falls back to Instagram square when dimensions are missing', () => {
    expect(resolveDisplayAspectRatio({ format: 'static', platform: 'instagram' })).toBe(1)
  })
})

describe('aspectRatioLabel', () => {
  it('maps common ratios to labels', () => {
    expect(aspectRatioLabel(1)).toBe('1:1')
    expect(aspectRatioLabel(9 / 16)).toBe('9:16')
    expect(aspectRatioLabel(4 / 5)).toBe('4:5')
    expect(aspectRatioLabel(1.91)).toBe('1.91:1')
  })
})

describe('previewFormatBadge', () => {
  it('labels Stories, Reels and carousel', () => {
    expect(previewFormatBadge({ format: 'story' })).toBe('Stories · 9:16')
    expect(previewFormatBadge({ format: 'video', platform: 'instagram' })).toBe('Reels · 9:16')
    expect(previewFormatBadge({ format: 'carousel', aspectLabel: '1:1', mediaCount: 3 })).toBe('Carrossel · 1:1')
  })
})
