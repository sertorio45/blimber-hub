/**
 * Dual-route shell (ETAPA 2–3): `/ads*` and `/marketing/ads*` share views.
 * Marketing shell adds breadcrumb + tenant label. Channel boards stay on `/ads/*`.
 */
import {
  adsShellPageTitle,
  buildMarketingAdsTrail,
  isMarketingAdsPath,
  resolveAdsShellPage,
} from '~/utils/ads-shell'

export function useAdsShellBase() {
  const route = useRoute()
  const { currentTenant } = useTenant()

  const adsBasePath = computed(() => {
    const path = route.path
    if (isMarketingAdsPath(path))
      return '/marketing/ads'
    return '/ads'
  })

  const isMarketingAdsShell = computed(() => isMarketingAdsPath(route.path))

  const adsPage = computed(() => resolveAdsShellPage(route.path))

  const adsPageTitle = computed(() => adsShellPageTitle(adsPage.value))

  const marketingAdsTrail = computed(() => buildMarketingAdsTrail(route.path))

  const tenantLabel = computed(() => currentTenant.value?.name?.trim() || null)

  return {
    adsBasePath,
    isMarketingAdsShell,
    adsPage,
    adsPageTitle,
    marketingAdsTrail,
    tenantLabel,
  }
}
