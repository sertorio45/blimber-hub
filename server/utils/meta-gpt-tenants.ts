/**
 * Helpers for GPT tenant lookup (administrative Bearer key).
 * Returns only public fields — never Meta tokens or secrets.
 */

export const META_GPT_TENANT_SEARCH_LIMIT_DEFAULT = 20
export const META_GPT_TENANT_SEARCH_LIMIT_MAX = 50
export const META_GPT_TENANT_SEARCH_MIN_CHARS = 2

export interface MetaGptTenantMatch {
  id: string
  name: string
  slug: string
}

/** Escape ILIKE wildcards so user input cannot broaden the pattern unexpectedly. */
export function escapeIlikePattern(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

export function buildTenantNameSearchPattern(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  return `%${escapeIlikePattern(trimmed)}%`
}

export function clampTenantSearchLimit(limit: number | undefined): number {
  if (limit === undefined)
    return META_GPT_TENANT_SEARCH_LIMIT_DEFAULT
  return Math.min(
    META_GPT_TENANT_SEARCH_LIMIT_MAX,
    Math.max(1, Math.trunc(limit)),
  )
}

export function normalizeTenantSearchQuery(raw: string | undefined): string | null {
  if (!raw)
    return null
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  if (trimmed.length < META_GPT_TENANT_SEARCH_MIN_CHARS)
    return null
  return trimmed
}
