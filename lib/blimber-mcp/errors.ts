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
