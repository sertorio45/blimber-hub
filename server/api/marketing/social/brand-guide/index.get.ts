import { fetchBrandGuideForTenant } from '~/server/utils/brand-guide'
import { requireSocialContext } from '~/server/utils/social-context'

export default defineEventHandler(async (event) => {
  const { client, tenantId } = await requireSocialContext(event, 'marketing.social.brand_guide.read')
  const data = await fetchBrandGuideForTenant(client, tenantId)
  return { data }
})
