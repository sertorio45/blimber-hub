import { describe, expect, it } from 'vitest'

import {
  defaultOrganicPlatform,
  filterConnectedOrganicPlatforms,
  findAccountForPlatform,
  isOrganicPlatformAvailable,
} from '~/lib/marketing/organic-report-platforms'

describe('organic-report-platforms', () => {
  const accounts = [
    { id: '1', platform: 'facebook' as const, name: 'Page', external_account_id: 'fb-1', is_active: true },
    { id: '2', platform: 'instagram' as const, name: 'IG', external_account_id: 'ig-1', is_active: false },
    { id: '3', platform: 'linkedin' as const, name: 'LI', external_account_id: 'li-1', is_active: true },
  ]

  it('filterConnectedOrganicPlatforms returns only active platforms in stable order', () => {
    expect(filterConnectedOrganicPlatforms(accounts)).toEqual(['facebook', 'linkedin'])
  })

  it('filterConnectedOrganicPlatforms handles empty input', () => {
    expect(filterConnectedOrganicPlatforms([])).toEqual([])
    expect(filterConnectedOrganicPlatforms(null)).toEqual([])
  })

  it('findAccountForPlatform ignores inactive accounts', () => {
    expect(findAccountForPlatform(accounts, 'instagram')).toBeNull()
    expect(findAccountForPlatform(accounts, 'facebook')?.id).toBe('1')
  })

  it('defaultOrganicPlatform picks first connected platform', () => {
    expect(defaultOrganicPlatform(['instagram', 'facebook'])).toBe('instagram')
    expect(defaultOrganicPlatform([])).toBeNull()
  })

  it('isOrganicPlatformAvailable checks membership', () => {
    expect(isOrganicPlatformAvailable(['facebook'], 'facebook')).toBe(true)
    expect(isOrganicPlatformAvailable(['facebook'], 'instagram')).toBe(false)
  })
})
