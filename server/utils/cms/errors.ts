import type { CmsErrorBody, CmsErrorCode, CmsVersionConflictDetails } from '~/lib/cms/contracts'

import { createError, isError } from 'h3'
import { ZodError } from 'zod'

/** Shape returned by PostgREST / supabase-js for database errors. */
export interface CmsDbError {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

/**
 * Same envelope as `server/utils/media/cms-adapter.ts`, so every `/api/cms/**`
 * endpoint answers `{ error: { code, message, details? } }`.
 */
export function cmsError(
  statusCode: number,
  code: CmsErrorCode,
  message: string,
  details?: unknown,
): Error {
  const body: CmsErrorBody = {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  }
  return createError({ statusCode, statusMessage: message, message, data: body })
}

export function cmsNotFound(message = 'Conteúdo não encontrado'): Error {
  return cmsError(404, 'not_found', message)
}

/** Withdrawn content: crawlers should drop the URL instead of retrying. */
export function cmsGone(message = 'Este conteúdo foi retirado'): Error {
  return cmsError(410, 'gone', message)
}

export function cmsForbidden(message = 'Sem permissão para esta ação'): Error {
  return cmsError(403, 'forbidden', message)
}

export function cmsValidationError(error: ZodError, message = 'Dados inválidos'): Error {
  return cmsError(422, 'validation_failed', message, error.flatten())
}

export function cmsVersionConflict(details: CmsVersionConflictDetails): Error {
  return cmsError(
    409,
    'version_conflict',
    'Este conteúdo foi alterado por outra pessoa. Recarregue para continuar.',
    details,
  )
}

function parseJsonDetails(value: string | null | undefined): unknown {
  if (!value)
    return undefined
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    return value
  }
}

function asConflictDetails(value: unknown): CmsVersionConflictDetails | undefined {
  if (!value || typeof value !== 'object')
    return undefined
  const record = value as Record<string, unknown>
  if (typeof record.currentVersion !== 'number')
    return undefined
  return {
    currentVersion: record.currentVersion,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : null,
  }
}

function isDbError(value: unknown): value is CmsDbError {
  return Boolean(value && typeof value === 'object' && typeof (value as CmsDbError).code === 'string')
}

const ROUTE_CONSTRAINT_PATTERN = /cms_routes|one_home|path/i

/**
 * Maps database errors (custom SQLSTATEs raised by the CMS migration plus the
 * common integrity codes) onto the contract error codes. Unknown codes become
 * a generic 500 and are logged server-side only.
 */
export function cmsDbError(error: CmsDbError, fallbackMessage = 'Erro ao processar o conteúdo'): Error {
  const details = parseJsonDetails(error.details)
  const text = `${error.message ?? ''} ${error.details ?? ''}`

  switch (error.code) {
    case 'P0404':
    case 'PGRST116':
      return cmsNotFound()
    case 'P0409': {
      const conflict = asConflictDetails(details)
      return conflict
        ? cmsVersionConflict(conflict)
        : cmsError(409, 'version_conflict', 'Este conteúdo foi alterado por outra pessoa. Recarregue para continuar.')
    }
    case 'P0410':
      return cmsError(409, 'route_conflict', 'Este endereço já está em uso por outro conteúdo', details)
    case 'P0422':
      return cmsError(422, 'validation_failed', 'O conteúdo não pode ser publicado', details)
    case 'P0403':
      return cmsError(403, 'forbidden', 'O histórico não pode ser alterado')
    case '23505':
      return ROUTE_CONSTRAINT_PATTERN.test(text)
        ? cmsError(409, 'route_conflict', 'Este endereço já está em uso por outro conteúdo')
        : cmsError(409, 'validation_failed', 'Já existe um registro com estes dados')
    case '23503':
    case '23514':
    case '22P02':
    case '22001':
      return cmsError(422, 'validation_failed', 'Dados inválidos')
    default:
      console.error('[cms] database error', error)
      return cmsError(500, 'internal_error', fallbackMessage)
  }
}

function codeForStatus(statusCode: number, message: string): CmsErrorCode {
  if (statusCode === 401)
    return 'unauthenticated'
  if (statusCode === 403)
    return /m[óo]dulo n[ãa]o contratado/i.test(message) ? 'module_disabled' : 'forbidden'
  if (statusCode === 404)
    return 'not_found'
  if (statusCode === 410)
    return 'gone'
  if (statusCode === 409)
    return 'version_conflict'
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

/** Re-shapes any H3, Zod, database or unknown error into the CMS envelope. */
export function toCmsError(error: unknown): Error {
  if (isError(error)) {
    if (isCmsErrorBody(error.data))
      return error
    const statusCode = error.statusCode || 500
    const message = error.statusMessage || error.message || 'Erro inesperado'
    if (statusCode >= 500) {
      console.error('[cms] unexpected error', error)
      return cmsError(500, 'internal_error', 'Erro inesperado ao processar o conteúdo')
    }
    return cmsError(statusCode, codeForStatus(statusCode, message), message)
  }
  if (error instanceof ZodError)
    return cmsValidationError(error)
  if (isDbError(error))
    return cmsDbError(error)
  console.error('[cms] unexpected error', error)
  return cmsError(500, 'internal_error', 'Erro inesperado ao processar o conteúdo')
}

export async function withCmsErrors<T>(handler: () => Promise<T>): Promise<T> {
  try {
    return await handler()
  }
  catch (error: unknown) {
    throw toCmsError(error)
  }
}

/** Throws the mapped error when a supabase-js call failed. */
export function assertNoDbError(error: CmsDbError | null | undefined, fallbackMessage?: string): void {
  if (error)
    throw cmsDbError(error, fallbackMessage)
}
