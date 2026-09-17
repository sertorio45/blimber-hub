import type { LocationQueryRaw } from 'vue-router'
import type { MarketingReportRangePreset } from '~/lib/marketing/reports-hub'
import {
  DEFAULT_MARKETING_REPORT_RANGE,
  clampMarketingReportRangeForTab,
  defaultCustomDateRange,
  parseMarketingReportRange,
  resolveMarketingReportTab,
} from '~/lib/marketing/reports-hub'

export function useMarketingReportsRange() {
  const route = useRoute()
  const router = useRouter()

  function currentQuery(): LocationQueryRaw {
    return { ...route.query }
  }

  async function patchRange(patch: {
    range?: MarketingReportRangePreset
    date_start?: string
    date_end?: string
  }) {
    const query: LocationQueryRaw = { ...currentQuery() }
    const tab = resolveMarketingReportTab(route.path)
    const range = clampMarketingReportRangeForTab(
      tab.id,
      patch.range ?? parseMarketingReportRange(query.range),
    )

    query.range = range

    if (range === 'custom') {
      const fallback = defaultCustomDateRange()
      const start = patch.date_start ?? String(query.date_start || fallback.dateStart)
      const end = patch.date_end ?? String(query.date_end || fallback.dateEnd)
      query.date_start = start
      query.date_end = end
    }
    else {
      delete query.date_start
      delete query.date_end
    }

    await router.replace({ path: route.path, query, hash: route.hash })
  }

  const datePreset = computed({
    get: (): MarketingReportRangePreset => {
      const tab = resolveMarketingReportTab(route.path)
      return clampMarketingReportRangeForTab(
        tab.id,
        parseMarketingReportRange(route.query.range),
      )
    },
    set: (value: MarketingReportRangePreset | string) => {
      void patchRange({ range: parseMarketingReportRange(value) })
    },
  })

  const dateStart = computed({
    get: () => String(route.query.date_start || ''),
    set: (value: string) => {
      void patchRange({ range: 'custom', date_start: value })
    },
  })

  const dateEnd = computed({
    get: () => String(route.query.date_end || ''),
    set: (value: string) => {
      void patchRange({ range: 'custom', date_end: value })
    },
  })

  watch(datePreset, (value) => {
    if (value === 'custom' && (!dateStart.value || !dateEnd.value))
      void patchRange({ range: 'custom' })
  })

  // If URL has range=all on social, rewrite to last_90d.
  watch(
    () => [route.path, route.query.range] as const,
    ([path, range]) => {
      const tab = resolveMarketingReportTab(path)
      if (tab.id === 'social' && String(range || '') === 'all')
        void patchRange({ range: 'last_90d' })
    },
    { immediate: true },
  )

  return {
    datePreset,
    dateStart,
    dateEnd,
    defaultRange: DEFAULT_MARKETING_REPORT_RANGE,
    patchRange,
  }
}
