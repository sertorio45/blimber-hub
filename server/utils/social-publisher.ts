import { createSocialNotification, writeSocialAudit } from '~/server/utils/social-audit'
import { publishToLinkedin } from '~/server/utils/social-publishers/linkedin-publisher'
import { publishToMeta } from '~/server/utils/social-publishers/meta-publisher'

/** Publication media for a channel: variant-linked rows only (not reference assets). */
export function mediaAssetsForVariant(
  snapshot: { assets?: Array<{ variant_id?: string | null, position?: number, media_assets?: unknown }> } | null | undefined,
  variantId: string,
) {
  return (snapshot?.assets || [])
    .filter(row => row.variant_id === variantId)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map(row => row.media_assets)
    .filter(Boolean)
}

function retryDelay(attempt: number) {
  const minutes = Math.min(6 * 60, 2 ** Math.max(0, attempt - 1))
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

function errorDetails(error: unknown) {
  const candidate = error as any
  return {
    code: String(candidate?.data?.error?.code || candidate?.statusCode || candidate?.code || 'publish_error'),
    message: String(candidate?.data?.error?.message || candidate?.statusMessage || candidate?.message || 'Falha ao publicar'),
  }
}

export async function processPublicationJob(
  client: any,
  job: any,
  workerId: string,
) {
  const claimedAt = new Date().toISOString()
  const { data: claimed } = await client
    .from('publication_jobs')
    .update({
      status: 'processing',
      locked_at: claimedAt,
      locked_by: workerId,
      attempts: Number(job.attempts || 0) + 1,
    })
    .eq('id', job.id)
    .in('status', ['pending', 'retrying'])
    .select('*')
    .maybeSingle()

  if (!claimed)
    return { skipped: true }

  const startedAt = Date.now()
  const attemptNumber = Number(claimed.attempts)
  const { data: version } = await client
    .from('content_versions')
    .select('snapshot')
    .eq('id', claimed.version_id)
    .eq('tenant_id', claimed.tenant_id)
    .maybeSingle()
  const { data: account } = await client
    .from('social_accounts')
    .select('*')
    .eq('id', claimed.account_id)
    .eq('tenant_id', claimed.tenant_id)
    .maybeSingle()
  const { data: post } = await client
    .from('social_posts')
    .select('title, created_by, deleted_at, publication_status, deletion_status')
    .eq('id', claimed.post_id)
    .maybeSingle()

  if (post?.deleted_at || ['deletion_pending', 'deleted'].includes(String(post?.publication_status || ''))) {
    await client.from('publication_jobs').update({
      status: 'failed',
      last_error_code: 'deletion_in_progress',
      last_error_message: 'Publicação cancelada: exclusão em andamento ou concluída',
      locked_at: null,
      locked_by: null,
    }).eq('id', claimed.id)
    return { skipped: true, reason: 'deletion_in_progress' }
  }

  const snapshot = version?.snapshot || {}
  let variant = (snapshot.variants || []).find((row: any) => row.id === claimed.variant_id)
  let assets = mediaAssetsForVariant(snapshot, claimed.variant_id)

  // Fallback: variant IDs may have changed after the snapshot was created.
  // Fetch live data from DB to avoid invalid_snapshot failures.
  if (!variant && account) {
    const { data: liveVariant } = await client
      .from('social_post_variants')
      .select('*')
      .eq('id', claimed.variant_id)
      .eq('tenant_id', claimed.tenant_id)
      .maybeSingle()
    if (liveVariant) {
      variant = liveVariant
      const { data: liveAssets } = await client
        .from('social_post_assets')
        .select('id, variant_id, asset_id, position, media_assets!social_post_assets_asset_id_fkey(id, name, bucket, object_path, mime_type, purpose, metadata)')
        .eq('variant_id', claimed.variant_id)
        .eq('tenant_id', claimed.tenant_id)
        .order('position')
      assets = (liveAssets || []).map((row: any) => row.media_assets).filter(Boolean)
    }
  }

  if (!variant || !account) {
    const message = 'Snapshot, variante ou conta social não encontrado'
    await client.from('publication_jobs').update({
      status: 'failed',
      last_error_code: 'invalid_snapshot',
      last_error_message: message,
      locked_at: null,
      locked_by: null,
    }).eq('id', claimed.id)

    await writeSocialAudit(client, {
      tenantId: claimed.tenant_id,
      actorId: null,
      action: 'social_post.publish_failed',
      entityType: 'social_post',
      entityId: claimed.post_id,
      after: {
        jobId: claimed.id,
        workerId,
        reason: message,
        code: 'invalid_snapshot',
      },
      userAgent: `worker:${workerId}`,
    })

    return { success: false, message }
  }

  try {
    const publisherInput = {
      client,
      tenantId: claimed.tenant_id,
      account,
      variant,
      assets,
    }
    const result = account.provider === 'linkedin'
      ? await publishToLinkedin(publisherInput)
      : await publishToMeta(publisherInput)

    await client.from('publication_attempts').insert({
      tenant_id: claimed.tenant_id,
      job_id: claimed.id,
      attempt_number: attemptNumber,
      status: 'published',
      request_summary: {
        provider: account.provider,
        platform: account.platform,
        assetCount: assets.length,
      },
      response_summary: { externalPostId: result.externalPostId },
      external_post_id: result.externalPostId,
      duration_ms: Date.now() - startedAt,
    })

    await client.from('publication_jobs').update({
      status: 'published',
      published_at: new Date().toISOString(),
      last_error_code: null,
      last_error_message: null,
      locked_at: null,
      locked_by: null,
    }).eq('id', claimed.id)

    await client.from('social_post_variants').update({
      external_post_id: result.externalPostId,
      external_post_url: result.externalPostUrl,
      external_object_type: (result as any).externalObjectType || null,
      external_container_id: (result as any).externalContainerId || null,
      external_media_id: (result as any).externalMediaId || result.externalPostId || null,
      external_permalink: (result as any).externalPermalink || result.externalPostUrl || null,
      remote_identifiers: (result as any).remoteIdentifiers || {},
    }).eq('id', claimed.variant_id)

    await writeSocialAudit(client, {
      tenantId: claimed.tenant_id,
      actorId: null,
      action: 'social_post.channel_published',
      entityType: 'social_post',
      entityId: claimed.post_id,
      after: {
        jobId: claimed.id,
        workerId,
        platform: account.platform,
        provider: account.provider,
        accountId: account.id,
        accountName: account.name,
        externalPostId: result.externalPostId,
        externalPostUrl: result.externalPostUrl,
        attempt: attemptNumber,
        durationMs: Date.now() - startedAt,
      },
      userAgent: `worker:${workerId}`,
    })

    const { count: remaining } = await client
      .from('publication_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', claimed.post_id)
      .neq('status', 'published')
    if (!remaining) {
      await client.from('social_posts').update({
        status: 'published',
        published_at: new Date().toISOString(),
      }).eq('id', claimed.post_id)

      await writeSocialAudit(client, {
        tenantId: claimed.tenant_id,
        actorId: null,
        action: 'social_post.published',
        entityType: 'social_post',
        entityId: claimed.post_id,
        after: {
          workerId,
          title: post?.title || null,
          publishedAt: new Date().toISOString(),
        },
        userAgent: `worker:${workerId}`,
      })

      if (post?.created_by) {
        await createSocialNotification(client, {
          tenantId: claimed.tenant_id,
          userId: post.created_by,
          type: 'published',
          title: 'Publicação concluída',
          body: `${post.title} foi publicada em todos os canais.`,
          actionUrl: `/marketing/content/${claimed.post_id}`,
        })
      }
    }

    return { success: true, externalPostId: result.externalPostId }
  }
  catch (error) {
    const details = errorDetails(error)
    const shouldRetry = attemptNumber < Number(claimed.max_attempts)
    const status = shouldRetry ? 'retrying' : 'failed'
    const nextAttemptAt = shouldRetry ? retryDelay(attemptNumber) : null

    await client.from('publication_attempts').insert({
      tenant_id: claimed.tenant_id,
      job_id: claimed.id,
      attempt_number: attemptNumber,
      status,
      request_summary: {
        provider: account.provider,
        platform: account.platform,
        assetCount: assets.length,
      },
      error_code: details.code,
      error_message: details.message,
      duration_ms: Date.now() - startedAt,
    })
    await client.from('publication_jobs').update({
      status,
      next_attempt_at: nextAttemptAt,
      last_error_code: details.code,
      last_error_message: details.message,
      locked_at: null,
      locked_by: null,
    }).eq('id', claimed.id)

    await writeSocialAudit(client, {
      tenantId: claimed.tenant_id,
      actorId: null,
      action: shouldRetry ? 'social_post.publish_retrying' : 'social_post.publish_failed',
      entityType: 'social_post',
      entityId: claimed.post_id,
      after: {
        jobId: claimed.id,
        workerId,
        platform: account.platform,
        provider: account.provider,
        accountId: account.id,
        attempt: attemptNumber,
        nextAttemptAt,
        code: details.code,
        message: details.message,
      },
      userAgent: `worker:${workerId}`,
    })

    if (!shouldRetry) {
      await client.from('social_posts').update({ status: 'failed' }).eq('id', claimed.post_id)
      await client.from('dead_letter_events').insert({
        tenant_id: claimed.tenant_id,
        source: 'publication_job',
        source_id: claimed.id,
        reason: details.message,
        payload: {
          postId: claimed.post_id,
          variantId: claimed.variant_id,
          accountId: claimed.account_id,
          errorCode: details.code,
        },
      })
      if (post?.created_by) {
        await createSocialNotification(client, {
          tenantId: claimed.tenant_id,
          userId: post.created_by,
          type: 'publish_failed',
          title: 'Falha na publicação',
          body: `${post.title}: ${details.message}`,
          actionUrl: `/marketing/content/${claimed.post_id}`,
        })
      }

      const { emitSocialAutomation } = await import('~/server/utils/social-automations')
      await emitSocialAutomation(client, {
        tenantId: claimed.tenant_id,
        trigger: 'publication.failed',
        actorId: post?.created_by || null,
        postId: claimed.post_id,
        entityType: 'publication_job',
        entityId: claimed.id,
        payload: { code: details.code, message: details.message },
      })
    }

    return { success: false, retrying: shouldRetry, ...details }
  }
}

export async function processDuePublicationJobs(
  client: any,
  workerId: string,
  limit = 10,
) {
  const now = new Date().toISOString()
  const { data: jobs, error } = await client
    .from('publication_jobs')
    .select('*')
    .in('status', ['pending', 'retrying'])
    .lte('scheduled_at', now)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order('priority')
    .order('scheduled_at')
    .limit(Math.min(50, Math.max(1, limit)))

  if (error)
    throw new Error(error.message)

  const results = []
  for (const job of jobs || [])
    results.push({ jobId: job.id, ...(await processPublicationJob(client, job, workerId)) })
  return results
}
