import type { SocialPlatform } from '~/types/marketing-social'
import type { OrganicReportPlatform } from '~/types/marketing-organic-reports'

export interface SocialAccountRow {
  id: string
  platform: SocialPlatform
  name: string
  username?: string | null
  avatar_url?: string | null
  external_account_id: string
  is_active?: boolean
  provider?: string
}

const PLATFORM_ORDER: OrganicReportPlatform[] = ['facebook', 'instagram', 'linkedin']

/** Platforms with at least one active social account, stable sort. */
export function filterConnectedOrganicPlatforms(
  accounts: SocialAccountRow[] | null | undefined,
): OrganicReportPlatform[] {
  const active = (accounts || []).filter(a => a.is_active !== false)
  const connected = new Set<OrganicReportPlatform>()
  for (const account of active) {
    if (PLATFORM_ORDER.includes(account.platform))
      connected.add(account.platform)
  }
  return PLATFORM_ORDER.filter(p => connected.has(p))
}

export function findAccountForPlatform(
  accounts: SocialAccountRow[] | null | undefined,
  platform: OrganicReportPlatform,
): SocialAccountRow | null {
  const match = (accounts || []).find(a => a.is_active !== false && a.platform === platform)
  return match || null
}

export function defaultOrganicPlatform(
  platforms: OrganicReportPlatform[],
): OrganicReportPlatform | null {
  return platforms[0] || null
}

export function isOrganicPlatformAvailable(
  platforms: OrganicReportPlatform[],
  platform: OrganicReportPlatform,
): boolean {
  return platforms.includes(platform)
}
