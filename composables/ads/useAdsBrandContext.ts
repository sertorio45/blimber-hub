/**
 * Ads-facing loader for Brand Context of the active workspace tenant.
 *
 * Reuses Marketing `useBrandContext` + `GET /api/marketing/brand/context`.
 * Same tenant source as Ads overview (`useTenant` via `useMarketingSocial`).
 * Identical on `/ads*` and `/marketing/ads*` — no duplicate brand storage.
 */
import type { AdsBrandContextSummary } from '~/types/ads-brand'
import { toAdsBrandContextSummary } from '~/utils/ads-brand'
import { isBrandContextForTenant } from '~/utils/brand-context'

export function useAdsBrandContext() {
  const {
    context,
    pending,
    showSkeleton,
    error,
    refresh,
    canRead,
    tenantId,
  } = useBrandContext()

  const summary = computed<AdsBrandContextSummary | null>(() => {
    const ctx = context.value
    const tid = tenantId.value || ''
    if (!ctx || !tid)
      return null
    if (!isBrandContextForTenant(ctx, tid))
      return null
    return toAdsBrandContextSummary(ctx)
  })

  const isBoundToActiveTenant = computed(() => {
    const tid = tenantId.value || ''
    return Boolean(tid && context.value && isBrandContextForTenant(context.value, tid))
  })

  return {
    context,
    summary,
    pending,
    showSkeleton,
    error,
    refresh,
    canRead,
    tenantId,
    isBoundToActiveTenant,
  }
}
