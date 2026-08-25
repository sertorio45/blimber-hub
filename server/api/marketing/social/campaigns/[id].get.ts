import { getRouterParam } from 'h3'

import { requireSocialContext } from '~/server/utils/social-context'

export default defineEventHandler(async (event) => {
  const campaignId = String(getRouterParam(event, 'id'))
  const { client, tenantId } = await requireSocialContext(event, 'marketing.social.campaigns.read')

  const { data: campaign, error } = await client
    .from('social_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })
  if (!campaign)
    throw createError({ statusCode: 404, statusMessage: 'Campanha não encontrada' })

  const { data: posts } = await client
    .from('social_posts')
    .select('id, title, production_status, editorial_status, publication_status, current_version, scheduled_at')
    .eq('tenant_id', tenantId)
    .eq('campaign_id', campaignId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return {
    data: {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective ?? '',
      status: campaign.status,
      startsAt: campaign.starts_at ?? null,
      endsAt: campaign.ends_at ?? null,
      ownerId: campaign.owner_id ?? null,
      briefingSummary: campaign.briefing_summary ?? '',
      postsCount: (posts || []).length,
      createdAt: campaign.created_at,
      updatedAt: campaign.updated_at,
      posts: posts || [],
    },
  }
})
