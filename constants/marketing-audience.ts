/**
 * Marketing links allowed on the end-customer portal (MVP / ETAPA 3).
 * "Publicações" for clients = `/marketing/content` (see menus clientTitle).
 * The agency send queue `/marketing/publishing` stays agency-only.
 * Contas sociais: `/settings/integrations` (also via Marketing → Configurações).
 */
export const CLIENT_PORTAL_MARKETING_LINKS = [
  '/marketing',
  '/marketing/calendar',
  '/marketing/campaigns',
  '/marketing/content',
  '/marketing/media',
  '/marketing/reports',
  '/marketing/settings',
  '/settings/integrations',
  // Legacy bookmarks (redirected to MVP routes).
  '/marketing/posts',
  '/marketing/library',
] as const

/**
 * Ads product links allowed on the end-customer portal (ETAPA 2).
 * `isClientPortalAdsLink` treats `/ads` as prefix for all `/ads/*` routes.
 */
export const CLIENT_PORTAL_ADS_LINKS = [
  '/ads',
  '/ads/meta',
  '/ads/google',
  '/ads/analytics',
  '/ads/campaigns',
  '/ads/reports',
  '/ads/integrations',
] as const

/** Agency-only production sub-routes that stay hidden from the client portal. */
const CLIENT_PORTAL_MARKETING_BLOCKLIST = [
  '/marketing/production',
  '/marketing/production/tasks',
  '/marketing/posts/tasks',
  '/marketing/approvals',
  '/marketing/briefings',
  '/marketing/brand-guide',
  '/marketing/brand',
  '/marketing/publishing',
  '/marketing/packages',
  '/marketing/ops-metrics',
  '/marketing/automations',
  '/marketing/logs',
  '/marketing/notifications',
] as const

export function isClientPortalMarketingLink(link: string | undefined | null): boolean {
  if (!link)
    return false
  const path = link.split('?')[0]

  if ((CLIENT_PORTAL_MARKETING_BLOCKLIST as readonly string[]).some(
    blocked => path === blocked || path.startsWith(`${blocked}/`),
  )) {
    return false
  }

  return (CLIENT_PORTAL_MARKETING_LINKS as readonly string[]).some((allowed) => {
    if (allowed === '/marketing')
      return path === '/marketing'
    return path === allowed || path.startsWith(`${allowed}/`)
  })
}

export function isClientPortalAdsLink(link: string | undefined | null): boolean {
  if (!link)
    return false
  const path = link.split('?')[0]

  return (CLIENT_PORTAL_ADS_LINKS as readonly string[]).some((allowed) => {
    if (allowed === '/ads')
      return path === '/ads' || path.startsWith('/ads/')
    return path === allowed || path.startsWith(`${allowed}/`)
  })
}
