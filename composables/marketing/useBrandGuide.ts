import type { BrandGuide, BrandGuideInput } from '~/types/brand-guide'
import {
  computeBrandCompleteness,
  createEmptyBrandGuide,
  normalizeBrandGuide,
  toBrandGuideInput,
} from '~/utils/brand-guide'

export function useBrandGuide() {
  const social = useMarketingSocial()
  const { can } = useWorkspace()

  const canRead = computed(() => can('marketing.social.brand_guide.read'))
  const canManage = computed(() => can('marketing.social.brand_guide.manage'))

  const draft = ref<BrandGuide>(createEmptyBrandGuide(social.tenantId.value))
  const saving = ref(false)

  const { pending, showSkeleton, refresh, error } = useMarketingFetch({
    key: () => `brand-center-${social.tenantId.value}`,
    handler: async () => {
      const response = await $fetch<{ data: BrandGuide | Record<string, unknown> | null }>(
        '/api/marketing/social/brand-guide',
        { query: { tenant_id: social.tenantId.value || undefined } },
      )
      const guide = normalizeBrandGuide(response.data, social.tenantId.value)
      draft.value = guide
      return guide
    },
    default: () => createEmptyBrandGuide(social.tenantId.value),
    watch: [social.tenantId],
    enabled: () => Boolean(social.tenantId.value) && canRead.value,
  })

  const completeness = computed(() => computeBrandCompleteness(draft.value))

  watch(social.tenantId, (id) => {
    if (!id)
      draft.value = createEmptyBrandGuide(null)
  })

  async function save(partial?: BrandGuideInput) {
    if (!canManage.value)
      return null

    saving.value = true
    try {
      const body = partial || toBrandGuideInput(draft.value)
      const response = await $fetch<{ data: BrandGuide }>('/api/marketing/social/brand-guide', {
        method: 'POST',
        body,
      })
      const guide = normalizeBrandGuide(response.data, social.tenantId.value)
      draft.value = guide
      await refresh()
      return guide
    }
    finally {
      saving.value = false
    }
  }

  return {
    draft,
    pending,
    showSkeleton,
    saving,
    error,
    canRead,
    canManage,
    completeness,
    refresh,
    save,
    tenantId: social.tenantId,
    listAssets: social.listAssets,
  }
}
