/**
 * Load / save Marketing Report layouts for the active tenant.
 */
import type {
  MarketingReportLayoutJson,
  MarketingReportLayoutProvider,
  MarketingReportLayoutRecord,
} from '~/types/marketing-report-layout'
import {
  buildDefaultReportLayout,
  normalizeReportLayout,
} from '~/lib/marketing/report-layout'

export function useMarketingReportLayouts() {
  const { tenantId } = useTenant()

  const records = ref<MarketingReportLayoutRecord[]>([])
  const pending = ref(false)
  const saving = ref(false)
  const errorMessage = ref('')
  const successMessage = ref('')

  let successTimer: ReturnType<typeof setTimeout> | null = null

  function flashSuccess(message: string) {
    successMessage.value = message
    if (successTimer)
      clearTimeout(successTimer)
    successTimer = setTimeout(() => {
      successMessage.value = ''
    }, 3200)
  }

  async function loadLayouts(provider?: MarketingReportLayoutProvider) {
    if (!tenantId.value) {
      records.value = []
      return
    }
    pending.value = true
    errorMessage.value = ''
    try {
      const response = await $fetch<{ data: MarketingReportLayoutRecord[] }>(
        '/api/marketing/report-layouts',
        {
          query: {
            tenant_id: tenantId.value,
            ...(provider ? { provider } : {}),
          },
        },
      )
      records.value = response.data || []
    }
    catch (error: any) {
      errorMessage.value = error?.statusMessage
        || error?.message
        || 'Não foi possível carregar os layouts salvos.'
      records.value = []
    }
    finally {
      pending.value = false
    }
  }

  function findRecord(
    provider: MarketingReportLayoutProvider,
    templateBaseId: string,
  ): MarketingReportLayoutRecord | null {
    return records.value.find(
      r => r.provider === provider && r.template_base_id === templateBaseId,
    ) || null
  }

  function hasCustomLayout(
    provider: MarketingReportLayoutProvider,
    templateBaseId: string,
  ): boolean {
    return Boolean(findRecord(provider, templateBaseId))
  }

  /** Effective layout: saved custom or default from template catalog. */
  function resolveLayout(
    provider: MarketingReportLayoutProvider,
    templateBaseId: string,
  ): MarketingReportLayoutJson {
    const saved = findRecord(provider, templateBaseId)
    if (saved?.layout)
      return normalizeReportLayout(provider, templateBaseId, saved.layout)
    return buildDefaultReportLayout(provider, templateBaseId)
  }

  async function saveLayout(params: {
    provider: MarketingReportLayoutProvider
    templateBaseId: string
    layout: MarketingReportLayoutJson
    name?: string
  }) {
    if (!tenantId.value)
      throw new Error('Empresa não selecionada')

    saving.value = true
    errorMessage.value = ''
    try {
      const response = await $fetch<{ data: MarketingReportLayoutRecord }>(
        '/api/marketing/report-layouts',
        {
          method: 'PUT',
          body: {
            provider: params.provider,
            template_base_id: params.templateBaseId,
            name: params.name || 'Personalizado',
            layout: {
              ...params.layout,
              version: 1,
              templateBaseId: params.templateBaseId,
            },
          },
          query: { tenant_id: tenantId.value },
        },
      )
      const saved = response.data
      if (saved) {
        const idx = records.value.findIndex(
          r => r.provider === params.provider && r.template_base_id === params.templateBaseId,
        )
        if (idx >= 0)
          records.value[idx] = saved
        else
          records.value = [saved, ...records.value]
      }
      flashSuccess('Layout salvo para esta empresa.')
      return saved
    }
    catch (error: any) {
      errorMessage.value = error?.statusMessage
        || error?.message
        || 'Não foi possível salvar o layout.'
      throw error
    }
    finally {
      saving.value = false
    }
  }

  async function restoreDefault(params: {
    provider: MarketingReportLayoutProvider
    templateBaseId: string
  }) {
    if (!tenantId.value)
      throw new Error('Empresa não selecionada')

    saving.value = true
    errorMessage.value = ''
    try {
      await $fetch('/api/marketing/report-layouts', {
        method: 'PUT',
        body: {
          provider: params.provider,
          template_base_id: params.templateBaseId,
          restore_default: true,
        },
        query: { tenant_id: tenantId.value },
      })
      records.value = records.value.filter(
        r => !(r.provider === params.provider && r.template_base_id === params.templateBaseId),
      )
      flashSuccess('Layout padrão restaurado.')
    }
    catch (error: any) {
      errorMessage.value = error?.statusMessage
        || error?.message
        || 'Não foi possível restaurar o padrão.'
      throw error
    }
    finally {
      saving.value = false
    }
  }

  /** True when the tenant has any custom layout for the provider (blocks auto-preset). */
  function providerHasAnyCustomLayout(provider: MarketingReportLayoutProvider): boolean {
    return records.value.some(r => r.provider === provider)
  }

  return {
    records,
    pending,
    saving,
    errorMessage,
    successMessage,
    loadLayouts,
    findRecord,
    hasCustomLayout,
    resolveLayout,
    saveLayout,
    restoreDefault,
    providerHasAnyCustomLayout,
  }
}
