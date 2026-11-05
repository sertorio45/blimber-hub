import { getQuery } from 'h3'
import { z } from 'zod'

import { requireSocialContext } from '~/server/utils/social-context'

const querySchema = z.object({
  status: z.enum(['active', 'revoked', 'expired', 'all']).optional().default('all'),
})

export default defineEventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  const { client, tenantId } = await requireSocialContext(event, 'marketing.social.briefing.manage')

  const { data, error } = await client
    .from('social_briefing_links')
    .select(`
      id,
      briefing_id,
      campaign_id,
      expires_at,
      revoked_at,
      max_uses,
      use_count,
      require_email_confirm,
      created_at,
      last_accessed_at,
      social_briefings (
        id,
        title,
        status,
        client_email,
        post_id,
        submitted_at
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  const now = Date.now()
  const rows = (data || []).map((row: any) => {
    const briefing = Array.isArray(row.social_briefings)
      ? row.social_briefings[0]
      : row.social_briefings
    const expired = new Date(row.expires_at).getTime() < now
    const exhausted = row.max_uses != null && row.use_count >= row.max_uses
    let linkStatus: 'active' | 'revoked' | 'expired' | 'used' = 'active'
    if (row.revoked_at)
      linkStatus = 'revoked'
    else if (expired)
      linkStatus = 'expired'
    else if (exhausted)
      linkStatus = 'used'

    return {
      id: row.id,
      briefingId: row.briefing_id,
      campaignId: row.campaign_id,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      maxUses: row.max_uses,
      useCount: row.use_count,
      requireEmailConfirm: row.require_email_confirm,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      linkStatus,
      briefing: briefing
        ? {
            id: briefing.id,
            title: briefing.title,
            status: briefing.status,
            clientEmail: briefing.client_email,
            postId: briefing.post_id,
            submittedAt: briefing.submitted_at,
          }
        : null,
    }
  })

  const filtered = query.status === 'all'
    ? rows
    : rows.filter((row) => {
        if (query.status === 'active')
          return row.linkStatus === 'active'
        if (query.status === 'revoked')
          return row.linkStatus === 'revoked'
        if (query.status === 'expired')
          return row.linkStatus === 'expired' || row.linkStatus === 'used'
        return true
      })

  return { data: filtered }
})
