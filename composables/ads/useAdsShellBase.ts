/**
 * Ads UI under Marketing. Canonical base is `/marketing/ads`.
 * Legacy `/ads*` bookmarks 301 via `ADS_LEGACY_REDIRECTS`.
 */
import {
  adsShellPageTitle,
  buildMarketingAdsTrail,
  isMarketingAdsPath,
  MARKETING_ADS_BASE_PATH,
  resolveAdsShellPage,
} from '~/utils/ads-shell'

export function useAdsShellBase() {
  const route = useRoute()
  const { currentTenant } = useTenant()

  const adsBasePath = computed(() => MARKETING_ADS_BASE_PATH)

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
