import { z } from 'zod'
import { BlimberMcpError } from './errors'

/** Shared write confirmation contract (Marketing mutations + future CRM writes). */
export const blimberWriteConfirmationFields = {
  confirmTenantId: z.string().min(1).describe('Deve ser idêntico a tenantId.'),
  confirm: z.literal(true).describe('Deve ser true para aplicar a mutação.'),
} as const

export const blimberWriteDryRunField = {
  dryRun: z
    .boolean()
    .optional()
    .describe('Se true (default), valida e retorna preview sem gravar.'),
} as const

/**
 * Ensures confirm === true and confirmTenantId === tenantId.
 * Call after Zod parse (or with raw confirmation fields).
 */
export function assertBlimberWriteConfirmation(input: {
  tenantId: string
  confirmTenantId: string
  confirm: unknown
}): void {
  if (input.confirm !== true) {
    throw new BlimberMcpError(
      'CONFIRM_REQUIRED',
      'Mutações exigem confirm: true.',
      400,
    )
  }
  if (input.confirmTenantId !== input.tenantId) {
    throw new BlimberMcpError(
      'CONFIRM_TENANT_MISMATCH',
      'confirmTenantId deve ser idêntico a tenantId.',
      400,
    )
  }
}

export function resolveDryRun(value: boolean | undefined, defaultValue = true): boolean {
  return value === undefined ? defaultValue : value
}
