import type { H3Event } from 'h3'

import type { WorkspaceCapability } from '~/constants/workspace'
import type { MediaAccessContext, MediaAction } from '~/server/utils/media/service'

import { createError } from 'h3'

import { requireWorkspaceContext } from '~/server/utils/workspace-context'

export const CMS_MEDIA_CAPABILITIES: Record<MediaAction, WorkspaceCapability> = {
  read: 'cms.media.read',
  upload: 'cms.media.upload',
  delete: 'cms.media.delete',
}

/**
 * CMS media never depends on the Marketing module: the tenant must contract
 * `cms` and the member must hold the matching `cms.media.*` capability. The
 * tenant comes from the validated workspace scope, never from the payload.
 */
export async function requireCmsMediaContext(
  event: H3Event,
  action: MediaAction,
): Promise<MediaAccessContext> {
  const workspace = await requireWorkspaceContext(event, {
    module: 'cms',
    requireTenant: true,
    capability: CMS_MEDIA_CAPABILITIES[action],
  })

  if (!workspace.tenantId)
    throw createError({ statusCode: 400, statusMessage: 'Selecione uma empresa' })

  return {
    event,
    client: workspace.client,
    tenantId: workspace.tenantId,
    userId: workspace.userId,
    module: 'cms',
    can: {
      read: workspace.has(CMS_MEDIA_CAPABILITIES.read),
      upload: workspace.has(CMS_MEDIA_CAPABILITIES.upload),
      delete: workspace.has(CMS_MEDIA_CAPABILITIES.delete),
    },
  }
}
