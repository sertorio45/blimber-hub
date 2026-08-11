import { computed } from 'vue'

import { useAuth } from '~/composables/useAuth'
import { useWorkspace } from '~/composables/useWorkspace'
import {
  CLIENT_PORTAL_ADS_LINKS,
  CLIENT_PORTAL_MARKETING_LINKS,
  isClientPortalAdsLink,
  isClientPortalMarketingLink,
} from '~/constants/marketing-audience'
import { isTenantScopedRole } from '~/constants/roles'
import { matchesNavAudience } from '~/utils/workspace-guard'

/**
 * End-customer portal vs agency ops.
 *
 * Prefer org type + app role over capability aliases: `organization.tenants.read`
 * used to expand into `agency.clients.read` and unlock the full agency menu.
 */
export function useMarketingAudience() {
  const {
    isAgencyWorkspace,
    organizationType,
    organizationRelationshipType,
    isPlatformStaff,
    capabilities,
    effectiveRole,
  } = useWorkspace()
  const { currentRole } = useAuth()

  const role = computed(() => effectiveRole.value || currentRole.value)

  const hasExactAgencyPortfolio = computed(() =>
    (capabilities.value || []).includes('agency.clients.read')
    || (capabilities.value || []).includes('agency.clients.manage'),
  )

  const isClientExperience = computed(() => {
    if (isPlatformStaff.value)
      return false

    // Direct customer org → always client portal for tenant roles.
    if (isTenantScopedRole(role.value) && organizationType.value === 'direct')
      return true

    // Managed client workspace without agency portfolio grants.
    if (isTenantScopedRole(role.value) && !hasExactAgencyPortfolio.value) {
      if (organizationRelationshipType.value === 'managed' || !isAgencyWorkspace.value)
        return true
    }

    if (hasExactAgencyPortfolio.value)
      return false

    return organizationRelationshipType.value === 'managed' || !isAgencyWorkspace.value
  })

  const isAgencyExperience = computed(() => !isClientExperience.value)

  return {
    isClientExperience,
    isAgencyExperience,
    matchesNavAudience,
    isClientPortalMarketingLink,
    isClientPortalAdsLink,
    CLIENT_PORTAL_MARKETING_LINKS,
    CLIENT_PORTAL_ADS_LINKS,
  }
}
