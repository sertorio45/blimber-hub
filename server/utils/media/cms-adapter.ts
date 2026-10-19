import type { H3Event } from 'h3'

import type { WorkspaceCapability } from '~/constants/workspace'
import type { CmsErrorBody, CmsErrorCode } from '~/lib/cms/contracts'
import type { MediaAccessContext, MediaAction } from '~/server/utils/media/service'

import { createError, isError } from 'h3'

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

export function cmsError(
  statusCode: number,
  code: CmsErrorCode,
  message: string,
  details?: unknown,
): Error {
  const body: CmsErrorBody = {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  }
  return createError({ statusCode, statusMessage: message, data: body })
}

function codeForStatus(statusCode: number, message: string): CmsErrorCode {
  if (statusCode === 401)
    return 'unauthenticated'
  if (statusCode === 403)
    return /m[óo]dulo n[ãa]o contratado/i.test(message) ? 'module_disabled' : 'forbidden'
  if (statusCode === 404)
    return 'not_found'
  if (statusCode === 413)
    return 'payload_too_large'
  if (statusCode >= 500)
    return 'internal_error'
  return 'validation_failed'
}

function isCmsErrorBody(value: unknown): value is CmsErrorBody {
  const error = (value as CmsErrorBody | null)?.error
  return Boolean(error && typeof error.code === 'string' && typeof error.message === 'string')
}

/** Re-shapes any H3/unknown error into the CMS `{ error: { code, message } }` envelope. */
export function toCmsError(error: unknown): Error {
  if (isError(error)) {
    if (isCmsErrorBody(error.data))
      return error
    const statusCode = error.statusCode || 500
    const message = error.statusMessage || error.message || 'Erro inesperado'
    return cmsError(statusCode, codeForStatus(statusCode, message), message, error.data ?? undefined)
  }
  console.error('[cms/media] unexpected error', error)
  return cmsError(500, 'internal_error', 'Erro inesperado ao processar a mídia')
}

export async function withCmsErrors<T>(handler: () => Promise<T>): Promise<T> {
  try {
    return await handler()
  }
  catch (error: unknown) {
    throw toCmsError(error)
  }
}
