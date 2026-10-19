import type { H3Event } from 'h3'

import type { MarketingSocialCapability } from '~/constants/workspace'
import type { MediaAccessContext, MediaAction } from '~/server/utils/media/service'

import { requireSocialContext } from '~/server/utils/social-context'

/**
 * Capabilities the Marketing library endpoints have always required. Deleting
 * is gated by `update` (not `delete`) because removing a library file is an
 * edit of the social workspace, not of a post.
 */
export const MARKETING_MEDIA_CAPABILITIES: Record<MediaAction, MarketingSocialCapability> = {
  read: 'marketing.social.read',
  upload: 'marketing.social.create',
  delete: 'marketing.social.update',
}

/**
 * `requestedTenantId` keeps the legacy `tenant_id` query/body hint; it is only a
 * request — the workspace resolver validates membership before it is trusted.
 */
export async function requireMarketingMediaContext(
  event: H3Event,
  action: MediaAction,
  requestedTenantId?: string | null,
): Promise<MediaAccessContext> {
  const social = await requireSocialContext(
    event,
    MARKETING_MEDIA_CAPABILITIES[action],
    requestedTenantId,
  )

  const has = (capability: MarketingSocialCapability) => social.workspace.has(capability)

  return {
    event,
    client: social.client,
    tenantId: social.tenantId,
    userId: social.user.id,
    module: 'marketing',
    can: {
      read: has(MARKETING_MEDIA_CAPABILITIES.read),
      upload: has(MARKETING_MEDIA_CAPABILITIES.upload),
      delete: has(MARKETING_MEDIA_CAPABILITIES.delete),
    },
  }
}
