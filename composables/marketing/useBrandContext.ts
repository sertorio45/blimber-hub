import type { BrandContext } from '~/types/brand-context'
import { createEmptyBrandContext } from '~/utils/brand-context'

/**
 * Client loader for the unified Brand Context API.
 * Ready for future Prompt Builder / Blimber AI — does not generate content.
 */
export function useBrandContext() {
  const social = useMarketingSocial()
  const { can } = useWorkspace()

  const canRead = computed(() => can('marketing.social.brand_guide.read'))

  const { data, pending, showSkeleton, refresh, error } = useMarketingFetch({
    key: () => `brand-context-${social.tenantId.value}`,
    handler: async () => {
      const response = await $fetch<{ data: BrandContext }>(
        '/api/marketing/brand/context',
        { query: { tenant_id: social.tenantId.value || undefined } },
      )
      return response.data
    },
    default: () => createEmptyBrandContext(social.tenantId.value || ''),
    watch: [social.tenantId],
    enabled: () => Boolean(social.tenantId.value) && canRead.value,
  })

  return {
    context: data,
    pending,
    showSkeleton,
    error,
    refresh,
    canRead,
    tenantId: social.tenantId,
  }
}
