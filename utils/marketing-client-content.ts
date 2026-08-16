import type { MarketingMvpStatus } from '~/types/marketing-mvp'

/** Query extras for `/api/marketing/social/posts` (existing editorial_status column). */
export type ClientPortalPostsListQuery = {
  exclude_editorial_status?: 'draft'
}

/**
 * Portal Publicações: hide agency drafts by default.
 * Staff keep an unfiltered list. Clients only see drafts when they pick Rascunho.
 */
export function clientPortalPostsListQuery(options: {
  isClientExperience: boolean
  mvpStatus: string
}): ClientPortalPostsListQuery {
  if (!options.isClientExperience)
    return {}
  if (options.mvpStatus === 'rascunho')
    return {}
  return { exclude_editorial_status: 'draft' }
}

export function includeClientPortalBoardItem(
  mvpStatus: MarketingMvpStatus | string | null | undefined,
  options: {
    isClientExperience: boolean
    mvpStatusFilter: string
  },
): boolean {
  const resolved = mvpStatus || 'rascunho'

  if (options.mvpStatusFilter !== 'all')
    return resolved === options.mvpStatusFilter

  if (options.isClientExperience)
    return resolved !== 'rascunho'

  return true
}
