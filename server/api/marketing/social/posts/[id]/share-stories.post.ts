import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { serverSupabaseServiceRole } from '#supabase/server'

import { recordSocialAudit } from '~/server/utils/social-audit'
import { requireSocialContext } from '~/server/utils/social-context'
import { createContentVersion, enqueueApprovedPost } from '~/server/utils/social-approval-domain'
import { processPublicationJob } from '~/server/utils/social-publisher'

const schema = z.object({
  accountIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  publishNow: z.boolean().optional().default(true),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const sourcePostId = String(getRouterParam(event, 'id'))
  const input = schema.parse(await readBody(event) || {})
  const { client, tenantId, user, workspace, isPlatformStaff } = await requireSocialContext(event, 'marketing.social.publish')
  const { holdsCapability } = await import('~/constants/workspace')
  if (
    !isPlatformStaff
    && !holdsCapability(workspace.capabilities, 'marketing.social.publish')
    && !holdsCapability(workspace.capabilities, 'marketing.social.schedule')
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Sem permissão para publicar Stories' })
  }

  const { data: source, error: sourceError } = await client
    .from('social_posts')
    .select(`
      id,
      title,
      content,
      status,
      timezone,
      social_post_variants (
        id,
        account_id,
        platform,
        caption,
        hashtags,
        social_post_assets (
          position,
          media_assets!social_post_assets_asset_id_fkey (id, purpose)
        )
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('id', sourcePostId)
    .maybeSingle()

  if (sourceError || !source)
    throw createError({ statusCode: 404, statusMessage: 'Publicação de origem não encontrada' })
  if (!['published', 'scheduled', 'approved'].includes(source.status)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Só é possível compartilhar nos Stories posts já aprovados ou publicados',
    })
  }

  const sourceVariants = source.social_post_variants || []
  const assetIds = [...new Set(
    sourceVariants
      .flatMap((variant: any) => variant.social_post_assets || [])
      .sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0))
      .map((relation: any) => relation.media_assets)
      .filter((asset: any) => asset?.purpose === 'publication')
      .map((asset: any) => String(asset.id)),
  )]

  if (!assetIds.length)
    throw createError({ statusCode: 400, statusMessage: 'A publicação de origem não tem peça final para Stories' })

  // Stories accept a single media item — use the primary publication asset.
  const storyAssetId = assetIds[0]

  let accountsQuery = client
    .from('social_accounts')
    .select('id, platform, name')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('platform', ['facebook', 'instagram'])

  if (input.accountIds?.length)
    accountsQuery = accountsQuery.in('id', input.accountIds)

  const { data: accounts, error: accountsError } = await accountsQuery
  if (accountsError)
    throw createError({ statusCode: 400, statusMessage: accountsError.message })
  if (!accounts?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Conecte Facebook e/ou Instagram para publicar nos Stories',
    })
  }

  const { data: storyPost, error: createErrorResult } = await client
    .from('social_posts')
    .insert({
      tenant_id: tenantId,
      title: `Stories · ${source.title}`,
      content: source.content || '',
      status: 'draft',
      timezone: source.timezone || 'America/Sao_Paulo',
      created_by: user.id,
      approval_policy: 'any',
      minimum_approvals: 1,
      scheduled_at: input.publishNow === false ? (input.scheduledAt || null) : null,
    })
    .select('*')
    .single()

  if (createErrorResult || !storyPost) {
    throw createError({
      statusCode: 400,
      statusMessage: createErrorResult?.message || 'Não foi possível criar o Stories',
    })
  }

  const variantRows = accounts.map((account: any) => ({
    tenant_id: tenantId,
    post_id: storyPost.id,
    account_id: account.id,
    platform: account.platform,
    format: 'story',
    caption: sourceVariants.find((variant: any) => variant.platform === account.platform)?.caption
      || source.content
      || '',
    hashtags: sourceVariants.find((variant: any) => variant.platform === account.platform)?.hashtags || [],
    platform_config: {
      source_post_id: sourcePostId,
      placement: 'stories',
    },
  }))

  const { data: createdVariants, error: variantsError } = await client
    .from('social_post_variants')
    .insert(variantRows)
    .select('id')

  if (variantsError || !createdVariants?.length) {
    await client.from('social_posts').delete().eq('id', storyPost.id)
    throw createError({ statusCode: 400, statusMessage: variantsError?.message || 'Falha ao criar variantes de Stories' })
  }

  const { error: assetsError } = await client.from('social_post_assets').insert(
    createdVariants.map((variant: any) => ({
      tenant_id: tenantId,
      post_id: storyPost.id,
      variant_id: variant.id,
      asset_id: storyAssetId,
      position: 0,
    })),
  )
  if (assetsError) {
    await client.from('social_posts').delete().eq('id', storyPost.id)
    throw createError({ statusCode: 400, statusMessage: assetsError.message })
  }

  try {
    const version = await createContentVersion(client, tenantId, storyPost.id, user.id)
    await client
      .from('social_posts')
      .update({
        status: 'approved',
        approved_version_id: version.id,
        current_version: version.version,
      })
      .eq('id', storyPost.id)

    const publishNow = input.publishNow !== false
    const jobs = await enqueueApprovedPost(client, {
      tenantId,
      postId: storyPost.id,
      scheduledAt: input.scheduledAt,
      publishNow,
    })

    // Same as schedule.publishNow: do not wait for worker/cron on immediate share.
    let processResults: Array<Record<string, unknown>> = []
    if (publishNow && jobs.length) {
      const service = await serverSupabaseServiceRole(event)
      const workerId = `stories-share:${user.id}`
      for (const job of jobs) {
        processResults.push({
          jobId: job.id,
          ...(await processPublicationJob(service, job, workerId)),
        })
      }
    }

    await recordSocialAudit(event, client, {
      tenantId,
      actorId: user.id,
      action: 'social_post.stories_share',
      entityType: 'social_post',
      entityId: storyPost.id,
      after: {
        sourcePostId,
        storyPostId: storyPost.id,
        accountIds: accounts.map((account: any) => account.id),
        jobIds: jobs.map((job: any) => job.id),
        publishNow,
        processResults,
      },
    })

    return {
      data: {
        storyPostId: storyPost.id,
        jobs,
        processResults,
      },
    }
  }
  catch (error: any) {
    await client.from('social_posts').delete().eq('id', storyPost.id)
    throw createError({
      statusCode: error?.statusCode || 400,
      statusMessage: error?.statusMessage || error?.message || 'Falha ao enfileirar Stories',
    })
  }
})
