import type { CmsErrorCode } from '~/lib/cms/contracts'

import { createError, isError } from 'h3'

const CODE_BY_STATUS: Record<number, CmsErrorCode> = {
  400: 'validation_failed',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'route_conflict',
  413: 'payload_too_large',
  422: 'validation_failed',
}

export function articleError(
  statusCode: number,
  code: CmsErrorCode,
  message: string,
  details?: unknown,
) {
  return createError({
    statusCode,
    statusMessage: message,
    message,
    data: { error: { code, message, ...(details === undefined ? {} : { details }) } },
  })
}

/** Normalizes errors thrown by shared resolvers into the article error envelope. */
export function toArticleError(error: unknown) {
  if (isError(error)) {
    if ((error.data as { error?: unknown } | undefined)?.error)
      return error
    const statusCode = error.statusCode || 500
    return articleError(
      statusCode,
      CODE_BY_STATUS[statusCode] ?? 'internal_error',
      error.statusMessage || error.message || 'Erro interno do servidor',
    )
  }
  return articleError(500, 'internal_error', 'Erro interno do servidor')
}
