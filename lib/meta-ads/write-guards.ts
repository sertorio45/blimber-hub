import { z } from 'zod'
import { MetaAdsToolError } from './types'
import { normalizeMetaAdAccountId } from './graph'
import { buildMetaWriteReadiness } from './integration'
import {
  getMetaGptBulkMax,
  getMetaGptBudgetDailyMaxCents,
  getMetaGptBudgetIncreaseMaxPercent,
} from './write-limits'

/**
 * Shared write confirmation contract for Meta GPT/MCP mutations.
 * - confirm must be literal true
 * - confirmTenantId must equal tenantId
 * - dryRun is optional; default depends on the tool schema (legacy status = false)
 */
export const metaWriteConfirmationFields = {
  confirmTenantId: z.string().min(1).describe('Deve ser idêntico a tenantId.'),
  confirm: z.literal(true).describe('Deve ser true para aplicar a mutação.'),
} as const

export const metaWriteDryRunField = {
  dryRun: z
    .boolean()
    .optional()
    .describe('Se true, valida e retorna preview sem POST/DELETE na Graph.'),
} as const

export const metaWriteConfirmationSchema = z.object({
  tenantId: z.string().min(1),
  ...metaWriteConfirmationFields,
})

export type MetaWriteConfirmationInput = z.infer<typeof metaWriteConfirmationSchema>

export interface MetaDryRunPreview {
  dryRun: true
  wouldMutate: true
  method: string
  path: string
  body?: Record<string, unknown>
  contentType?: string
  notes?: string[]
}

export interface WithDryRunResult<TExecute> {
  dryRun: boolean
  preview?: MetaDryRunPreview
  result?: TExecute
}

/**
 * Ensures confirm === true (via Zod) and confirmTenantId === tenantId.
 * Call after schema.parse (or with raw confirmation fields).
 */
export function assertWriteConfirmation(input: {
  tenantId: string
  confirmTenantId: string
  confirm: unknown
}): void {
  if (input.confirm !== true) {
    throw new MetaAdsToolError(
      'CONFIRM_REQUIRED',
      'Mutações exigem confirm: true.',
      400,
    )
  }
  if (input.confirmTenantId !== input.tenantId) {
    throw new MetaAdsToolError(
      'CONFIRM_TENANT_MISMATCH',
      'confirmTenantId deve ser idêntico a tenantId.',
      400,
    )
  }
}

/**
 * Ensures Graph object account_id matches the tenant ad account.
 * Pass null/undefined accountFromObject when the API omits the field (skip check).
 */
export function assertAdAccountOwnership(params: {
  objectAccountId: string | null | undefined
  tenantAdAccountId: string
  code?: string
  message?: string
}): string | null {
  const objectAccount = params.objectAccountId
    ? normalizeMetaAdAccountId(String(params.objectAccountId))
    : null
  if (objectAccount && objectAccount !== normalizeMetaAdAccountId(params.tenantAdAccountId)) {
    throw new MetaAdsToolError(
      params.code || 'OBJECT_TENANT_MISMATCH',
      params.message || 'Objeto não pertence à ad account do tenant.',
      403,
    )
  }
  return objectAccount
}

/** Enforce bulk size using META_GPT_BULK_MAX. */
export function assertBulkItemLimit(count: number, label = 'itens'): void {
  const max = getMetaGptBulkMax()
  if (count > max) {
    throw new MetaAdsToolError(
      'BULK_LIMIT_EXCEEDED',
      `Máximo de ${max} ${label} por request (recebido: ${count}).`,
      400,
      { max, count },
    )
  }
}

/**
 * Validate campaign/adset budget amounts (minor units / cents).
 * daily ≤ META_GPT_BUDGET_DAILY_MAX_CENTS; lifetime ≤ dailyMax × 31 (soft month cap).
 */
export function assertCampaignBudgetWithinLimit(params: {
  dailyBudgetCents?: number | null
  lifetimeBudgetCents?: number | null
}): void {
  const dailyMax = getMetaGptBudgetDailyMaxCents()
  const lifetimeMax = dailyMax * 31

  if (params.dailyBudgetCents != null && params.lifetimeBudgetCents != null) {
    throw new MetaAdsToolError(
      'BUDGET_XOR_REQUIRED',
      'Informe dailyBudget OU lifetimeBudget, não ambos.',
      400,
    )
  }

  if (params.dailyBudgetCents != null) {
    if (!Number.isFinite(params.dailyBudgetCents) || params.dailyBudgetCents < 1) {
      throw new MetaAdsToolError(
        'BUDGET_INVALID',
        'dailyBudget deve ser um inteiro ≥ 1 (centavos / minor units).',
        400,
      )
    }
    if (params.dailyBudgetCents > dailyMax) {
      throw new MetaAdsToolError(
        'BUDGET_LIMIT_EXCEEDED',
        `dailyBudget excede o teto de ${dailyMax} centavos (META_GPT_BUDGET_DAILY_MAX_CENTS).`,
        400,
        { max: dailyMax, value: params.dailyBudgetCents },
      )
    }
  }

  if (params.lifetimeBudgetCents != null) {
    if (!Number.isFinite(params.lifetimeBudgetCents) || params.lifetimeBudgetCents < 1) {
      throw new MetaAdsToolError(
        'BUDGET_INVALID',
        'lifetimeBudget deve ser um inteiro ≥ 1 (centavos / minor units).',
        400,
      )
    }
    if (params.lifetimeBudgetCents > lifetimeMax) {
      throw new MetaAdsToolError(
        'BUDGET_LIMIT_EXCEEDED',
        `lifetimeBudget excede o teto de ${lifetimeMax} centavos (META_GPT_BUDGET_DAILY_MAX_CENTS × 31).`,
        400,
        { max: lifetimeMax, value: params.lifetimeBudgetCents },
      )
    }
  }
}

/**
 * When next budget exceeds previous by more than META_GPT_BUDGET_INCREASE_MAX_PERCENT,
 * require confirmBudgetIncrease: true. Decreases and same/new when previous is null skip the flag.
 * Compares same-kind amounts (daily→daily or lifetime→lifetime); cross-kind treated as new amount
 * vs previous of that kind (0 if absent) — still capped by absolute limit via assertCampaignBudgetWithinLimit.
 */
export function assertBudgetIncreaseAllowed(params: {
  previousCents: number | null | undefined
  nextCents: number
  confirmBudgetIncrease?: boolean
}): void {
  const previous = params.previousCents
  if (previous == null || !Number.isFinite(previous) || previous < 1) {
    return
  }
  if (params.nextCents <= previous) {
    return
  }
  const maxPercent = getMetaGptBudgetIncreaseMaxPercent()
  const increasePercent = ((params.nextCents - previous) / previous) * 100
  if (increasePercent > maxPercent && params.confirmBudgetIncrease !== true) {
    throw new MetaAdsToolError(
      'CONFIRM_BUDGET_INCREASE_REQUIRED',
      `Aumento de budget ${increasePercent.toFixed(1)}% excede o teto de ${maxPercent}% (META_GPT_BUDGET_INCREASE_MAX_PERCENT). Envie confirmBudgetIncrease: true após confirmação do usuário.`,
      400,
      {
        previousCents: previous,
        nextCents: params.nextCents,
        increasePercent,
        maxPercent,
      },
    )
  }
}

/**
 * Creating or setting ACTIVE spend-capable objects requires an extra confirmActive: true.
 */
export function assertConfirmActive(params: {
  status: string
  confirmActive?: boolean
}): void {
  if (params.status === 'ACTIVE' && params.confirmActive !== true) {
    throw new MetaAdsToolError(
      'CONFIRM_ACTIVE_REQUIRED',
      'status=ACTIVE exige confirmActive: true (confirmação extra de gasto). Prefira PAUSED no create.',
      400,
    )
  }
}

/**
 * Bulk delete execute requires confirmDelete: true after an explicit chat confirmation
 * (in addition to confirm + confirmTenantId + previewToken + dryRun:false).
 */
export function assertConfirmDelete(confirmDelete: unknown): void {
  if (confirmDelete !== true) {
    throw new MetaAdsToolError(
      'CONFIRM_DELETE_REQUIRED',
      'Exclusão em massa exige confirmDelete: true após preview e confirmação explícita do usuário (listar IDs).',
      400,
    )
  }
}

/**
 * Enforce ads_management from stored granted_scopes (no new OAuth).
 * Unknown/empty scopes: allow if a user token exists (same as write_readiness).
 */
export function assertMetaAdsManagementReady(params: {
  grantedScopes: unknown
  hasAccessToken: boolean
}): void {
  const readiness = buildMetaWriteReadiness({
    hasAccessToken: params.hasAccessToken,
    hasPageToken: true,
    grantedScopes: params.grantedScopes,
  })
  if (!readiness.ads_management) {
    throw new MetaAdsToolError(
      'META_PERMISSION_MISSING',
      'Escopo ads_management ausente na integração. Reconecte o OAuth Meta com gerenciamento de anúncios.',
      403,
      { missing: ['ads_management'], write_readiness: readiness },
    )
  }
}

/**
 * Returns trimmed page_id when present on the Meta integration.
 * Used by WhatsApp adset promoted_object (page_id required; page token optional here).
 */
export function assertMetaPageId(pageId?: string | null): string {
  const trimmed = pageId ? String(pageId).trim() : ''
  if (!trimmed) {
    throw new MetaAdsToolError(
      'META_PAGE_ID_REQUIRED',
      'page_id ausente na integração Meta. Configure a Page em Ads → Integrações.',
      400,
    )
  }
  return trimmed
}

/**
 * Link/page creatives need page_id + page_access_token on the Meta integration.
 * Returns the trimmed page_id when both are present.
 */
export function assertMetaPageCreativeReady(params: {
  pageId?: string | null
  pageAccessToken?: string | null
}): string {
  const pageId = assertMetaPageId(params.pageId)
  if (!params.pageAccessToken) {
    throw new MetaAdsToolError(
      'META_PAGE_TOKEN_REQUIRED',
      'page_access_token ausente. Reconecte o OAuth Meta com permissões de Page (write_readiness.has_page_token).',
      400,
    )
  }
  return pageId
}

/**
 * When dryRun is true, returns preview and skips execute().
 * When false/undefined, runs execute() and returns the result.
 */
export async function withDryRun<TExecute>(
  dryRun: boolean | undefined,
  preview: Omit<MetaDryRunPreview, 'dryRun' | 'wouldMutate'>,
  execute: () => Promise<TExecute>,
): Promise<WithDryRunResult<TExecute>> {
  if (dryRun === true) {
    return {
      dryRun: true,
      preview: {
        dryRun: true,
        wouldMutate: true,
        ...preview,
      },
    }
  }
  const result = await execute()
  return { dryRun: false, result }
}

/** Resolve dryRun flag with an explicit default (legacy tools: false). */
export function resolveDryRun(
  value: boolean | undefined,
  defaultValue: boolean,
): boolean {
  return value === undefined ? defaultValue : value
}
