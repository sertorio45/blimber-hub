import type { CmsErrorCode } from '~/lib/cms/contracts'

/** Client-only codes added on top of the server `CmsErrorCode` set. */
export type CmsClientErrorCode = CmsErrorCode | 'aborted' | 'network_error' | 'no_tenant'

export interface CmsApiError {
  status: number
  code: CmsClientErrorCode
  message: string
  details?: unknown
}

export class CmsRequestError extends Error implements CmsApiError {
  status: number
  code: CmsClientErrorCode
  details?: unknown

  constructor(error: CmsApiError) {
    super(error.message)
    this.name = 'CmsRequestError'
    this.status = error.status
    this.code = error.code
    this.details = error.details
  }
}

const SERVER_CODES: readonly CmsErrorCode[] = [
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_failed',
  'version_conflict',
  'route_conflict',
  'asset_in_use',
  'module_disabled',
  'payload_too_large',
  'internal_error',
]

function codeForStatus(status: number): CmsClientErrorCode {
  if (status === 0)
    return 'network_error'
  if (status === 401)
    return 'unauthenticated'
  if (status === 403)
    return 'forbidden'
  if (status === 404)
    return 'not_found'
  if (status === 409)
    return 'version_conflict'
  if (status === 413)
    return 'payload_too_large'
  if (status >= 500)
    return 'internal_error'
  return 'validation_failed'
}

export const DEFAULT_CMS_ERROR_MESSAGES: Partial<Record<CmsClientErrorCode, string>> = {
  unauthenticated: 'Sua sessão expirou. Entre novamente.',
  forbidden: 'Você não tem permissão para esta ação.',
  not_found: 'Conteúdo não encontrado.',
  module_disabled: 'O CMS não está contratado para esta empresa.',
  network_error: 'Sem conexão com o servidor. Verifique sua internet.',
  no_tenant: 'Selecione uma empresa para continuar.',
  internal_error: 'Erro inesperado no servidor. Tente novamente.',
  payload_too_large: 'O conteúdo é grande demais para ser salvo.',
}

interface RawFetchError {
  name?: string
  message?: string
  statusCode?: number
  status?: number
  statusMessage?: string
  data?: unknown
}

function readEnvelope(data: unknown): { code?: string, message?: string, details?: unknown } | null {
  if (!data || typeof data !== 'object')
    return null
  // h3 `createError({ data })` arrives either as `data.error` or wrapped once more in `data.data.error`.
  const direct = (data as { error?: unknown }).error
  if (direct && typeof direct === 'object')
    return direct as { code?: string, message?: string, details?: unknown }
  const nested = (data as { data?: { error?: unknown } }).data?.error
  if (nested && typeof nested === 'object')
    return nested as { code?: string, message?: string, details?: unknown }
  return null
}

/** Turns any `$fetch`/runtime failure into the `{ code, message, details }` shape the UI renders. */
export function normalizeCmsError(error: unknown): CmsApiError {
  if (error instanceof CmsRequestError)
    return { status: error.status, code: error.code, message: error.message, details: error.details }

  const raw = (error ?? {}) as RawFetchError
  if (raw.name === 'AbortError' || /aborted/i.test(raw.message ?? ''))
    return { status: 0, code: 'aborted', message: 'Requisição cancelada.' }

  const status = Number(raw.statusCode ?? raw.status ?? 0)
  const envelope = readEnvelope(raw.data)
  const code = envelope?.code && (SERVER_CODES as readonly string[]).includes(envelope.code)
    ? envelope.code as CmsErrorCode
    : codeForStatus(status)

  const message = envelope?.message
    || DEFAULT_CMS_ERROR_MESSAGES[code]
    || raw.statusMessage
    || 'Não foi possível concluir a operação.'

  return { status, code, message, details: envelope?.details }
}

export function isCmsAbort(error: unknown): boolean {
  return normalizeCmsError(error).code === 'aborted'
}

/** Load errors worth rendering: aborts caused by switching company are silent. */
export function visibleCmsError(error: unknown): CmsApiError | null {
  if (!error)
    return null
  const normalized = normalizeCmsError(error)
  return normalized.code === 'aborted' ? null : normalized
}
