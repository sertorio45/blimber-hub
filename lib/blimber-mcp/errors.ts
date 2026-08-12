/**
 * Typed errors for the unified Blimber MCP / GPT Actions surface.
 */

export class BlimberMcpError extends Error {
  code: string
  statusCode: number
  details?: unknown

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message)
    this.name = 'BlimberMcpError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

/** @deprecated Prefer BlimberMcpError — alias kept for newer call sites. */
export const BlimberMcpToolError = BlimberMcpError

function isPostgrestLikeError(error: unknown): error is {
  code?: string
  message?: string
  details?: string
  hint?: string
} {
  return Boolean(
    error
    && typeof error === 'object'
    && ('code' in error || 'details' in error)
    && 'message' in error,
  )
}

/** Maps Supabase PostgREST / RPC failures to structured MCP errors. */
export function mapSupabaseRpcError(
  error: unknown,
  fallbackMessage = 'Falha na operação de banco',
): BlimberMcpError {
  if (error instanceof BlimberMcpError)
    return error

  if (isPostgrestLikeError(error)) {
    const message = error.message || fallbackMessage
    const statusCode = error.code === 'PGRST116' ? 404 : 400
    return new BlimberMcpError('DB_ERROR', message, statusCode, {
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
  }

  if (error instanceof Error) {
    return new BlimberMcpError('DB_ERROR', error.message || fallbackMessage, 400)
  }

  return new BlimberMcpError('DB_ERROR', fallbackMessage, 400)
}

export function formatBlimberMcpError(error: unknown) {
  if (error instanceof BlimberMcpError) {
    return {
      ok: false as const,
      error: {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        details: error.details,
      },
    }
  }

  if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'ZodError') {
    const zodError = error as { flatten: () => unknown }
    return {
      ok: false as const,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input inválido',
        statusCode: 400,
        details: typeof zodError.flatten === 'function' ? zodError.flatten() : error,
      },
    }
  }

  if (isPostgrestLikeError(error)) {
    const mapped = mapSupabaseRpcError(error)
    return {
      ok: false as const,
      error: {
        code: mapped.code,
        message: mapped.message,
        statusCode: mapped.statusCode,
        details: mapped.details,
      },
    }
  }

  const message = error instanceof Error ? error.message : 'Erro interno'
  return {
    ok: false as const,
    error: {
      code: 'INTERNAL_ERROR',
      message,
      statusCode: 500,
    },
  }
}

/** @deprecated Prefer formatBlimberMcpError */
export const formatBlimberMcpToolError = formatBlimberMcpError
