import process from 'node:process'

/**
 * Configurable limits for Meta GPT/MCP write tools.
 * Env vars are read at call time so tests can override process.env.
 */

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '')
    return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1)
    return fallback
  return Math.trunc(n)
}

/** Max IDs per bulk delete/update request. Default 20. */
export function getMetaGptBulkMax(): number {
  return parsePositiveInt(process.env.META_GPT_BULK_MAX, 20)
}

/**
 * TTL for bulk-delete previewToken (milliseconds). Default 15 minutes.
 * Env: META_GPT_BULK_PREVIEW_TTL_MS
 */
export function getMetaGptBulkPreviewTtlMs(): number {
  return parsePositiveInt(process.env.META_GPT_BULK_PREVIEW_TTL_MS, 15 * 60 * 1000)
}

/** Soft ceiling for daily budget (minor units / cents). Used by create/edit etapas. */
export function getMetaGptBudgetDailyMaxCents(): number {
  return parsePositiveInt(process.env.META_GPT_BUDGET_DAILY_MAX_CENTS, 500_000)
}

/**
 * Max % increase of adset budget without confirmBudgetIncrease: true.
 * Default 50 (e.g. 10000 → 15000 ok; 10000 → 15001 requires flag).
 */
export function getMetaGptBudgetIncreaseMaxPercent(): number {
  return parsePositiveInt(process.env.META_GPT_BUDGET_INCREASE_MAX_PERCENT, 50)
}

/** Max write mutations per tenant per rolling minute (throttle helper for later etapas). */
export function getMetaGptWritesPerMinute(): number {
  return parsePositiveInt(process.env.META_GPT_WRITES_PER_MINUTE, 30)
}

export interface MetaWriteLimitsSnapshot {
  bulkMax: number
  bulkPreviewTtlMs: number
  budgetDailyMaxCents: number
  budgetIncreaseMaxPercent: number
  writesPerMinute: number
}

export function getMetaWriteLimits(): MetaWriteLimitsSnapshot {
  return {
    bulkMax: getMetaGptBulkMax(),
    bulkPreviewTtlMs: getMetaGptBulkPreviewTtlMs(),
    budgetDailyMaxCents: getMetaGptBudgetDailyMaxCents(),
    budgetIncreaseMaxPercent: getMetaGptBudgetIncreaseMaxPercent(),
    writesPerMinute: getMetaGptWritesPerMinute(),
  }
}
