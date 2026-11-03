import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { serverSupabaseServiceRole } from '#supabase/server'

import { holdsCapability } from '~/constants/workspace'
import {
  enqueueApprovedPost,
  isSelfServeSocialRelease,
} from '~/server/utils/social-approval-domain'
import { recordSocialAudit } from '~/server/utils/social-audit'
import { requireSocialContext } from '~/server/utils/social-context'
import { processPublicationJob } from '~/server/utils/social-publisher'

const schema = z.object({
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  publishNow: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const postId = String(getRouterParam(event, 'id'))
  const input = schema.parse(await readBody(event))
  const context = await requireSocialContext(event, 'marketing.social.read')

  const capabilities = context.workspace.capabilities
  const publishNow = Boolean(input.publishNow)
  const required = publishNow ? 'marketing.social.publish' : 'marketing.social.schedule'
  const canRelease = context.isPlatformStaff
    || holdsCapability(capabilities, required)
    || holdsCapability(capabilities, 'marketing.social.publish')
  if (!canRelease)
    throw createError({ statusCode: 403, statusMessage: 'Sem permissão para agendar ou publicar' })

  const selfServe = isSelfServeSocialRelease({
    isPlatformStaff: context.isPlatformStaff,
    organizationType: context.workspace.organization?.type,
    effectiveRole: context.workspace.effectiveRole,
    capabilities,
  })

  const jobs = await enqueueApprovedPost(context.client, {
    tenantId: context.tenantId,
    postId,
    scheduledAt: input.scheduledAt,
    publishNow,
    capabilities: [...capabilities],
    isPlatformStaff: context.isPlatformStaff,
    selfServe,
    userId: context.user.id,
  })

  // Publish-now must not wait for pg_cron → production worker. Process inline
  // with the service role so local/dev and paused deploys still ship.
  let processResults: Array<Record<string, unknown>> = []
  if (publishNow && jobs.length) {
    const service = await serverSupabaseServiceRole(event)
    const workerId = `publish-now:${context.user.id}`
    for (const job of jobs) {
      processResults.push({
        jobId: job.id,
        ...(await processPublicationJob(service, job, workerId)),
      })
    }
  }

  await recordSocialAudit(event, context.client, {
    tenantId: context.tenantId,
    actorId: context.user.id,
    action: publishNow ? 'social_post.publish_now' : 'social_post.scheduled',
    entityType: 'social_post',
    entityId: postId,
    after: {
      jobIds: jobs.map((job: any) => job.id),
      scheduledAt: publishNow ? new Date().toISOString() : input.scheduledAt,
      publishNow,
      processResults,
    },
  })

  return { data: jobs, processResults }
})
