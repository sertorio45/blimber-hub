import { requireSocialContext } from '~/server/utils/social-context'
import {
  emptyMarketingMvpOverviewCounts,
  MARKETING_MVP_STATUSES,
  type MarketingMvpOverviewCounts,
  type MarketingMvpStatus,
} from '~/types/marketing-mvp'

/**
 * Overview counters for /marketing.
 *
 * Intentionally aggregates with the workspace service_role client (same pattern
 * as other marketing routes). requireSocialContext already validated tenant +
 * capability — we must not call RPCs that require auth.uid(), because the
 * service key has no JWT subject and used to make this endpoint return 500
 * (UI silently fell back to zeros via useMarketingFetch).
 */
export default defineEventHandler(async (event) => {
  const { client, tenantId } = await requireSocialContext(event, 'marketing.social.read')

  const empty = emptyMarketingMvpOverviewCounts()
  const nowIso = new Date().toISOString()

  const [
    contentsRes,
    approvalsRes,
    campaignsRes,
    jobsRes,
    schedulesRes,
    orphanSchedulesRes,
  ] = await Promise.all([
    client
      .from('marketing_mvp_contents')
      .select('mvp_status')
      .eq('tenant_id', tenantId),
    client
      .from('approval_requests')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending'),
    client
      .from('social_campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
    client
      .from('publication_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'processing', 'retrying']),
    client
      .from('marketing_post_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', ['planned', 'queued'])
      .gte('scheduled_at', nowIso),
    client
      .from('marketing_schedules_missing_jobs')
      .select('schedule_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
  ])

  const firstError = contentsRes.error
    || approvalsRes.error
    || campaignsRes.error
    || jobsRes.error
    || schedulesRes.error
    || orphanSchedulesRes.error

  if (firstError) {
    throw createError({
      statusCode: 500,
      statusMessage: firstError.message || 'Não foi possível carregar a visão geral do Marketing.',
    })
  }

  const byStatus: Record<MarketingMvpStatus, number> = { ...empty.contents_by_mvp_status }
  for (const row of contentsRes.data || []) {
    const status = row.mvp_status as MarketingMvpStatus
    if (MARKETING_MVP_STATUSES.includes(status))
      byStatus[status] += 1
  }

  const payload: MarketingMvpOverviewCounts = {
    contents_total: (contentsRes.data || []).length,
    contents_by_mvp_status: byStatus,
    approvals_pending: approvalsRes.count || 0,
    campaigns_active: campaignsRes.count || 0,
    publication_jobs_open: jobsRes.count || 0,
    schedules_upcoming: schedulesRes.count || 0,
    schedules_without_job: orphanSchedulesRes.count || 0,
  }

  return { data: payload }
})
