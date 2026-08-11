import { fetchBrandContextForTenant } from '~/server/utils/brand-context'
import { requireSocialContext } from '~/server/utils/social-context'

/**
 * GET /api/marketing/brand/context
 * Unified BrandContext for the active workspace tenant (agency → client switcher).
 * Capability: marketing.social.brand_guide.read
 */
export default defineEventHandler(async (event) => {
  const { client, tenantId } = await requireSocialContext(event, 'marketing.social.brand_guide.read')
  const data = await fetchBrandContextForTenant(client, tenantId)
  return { data }
})
