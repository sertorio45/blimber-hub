import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'

import { recordSocialAudit } from '~/server/utils/social-audit'
import { requireSocialContext } from '~/server/utils/social-context'
import { validateSocialPostAssets } from '~/server/utils/social-post-assets'
import {
  ensurePrimaryScheduleFromLegacy,
  replacePostSchedules,
} from '~/server/utils/marketing-schedules'

const inputSchema = z.object({
  title: z.string().trim().min(2).max(180),
  content: z.string().max(10000).default(''),
  artText: z.string().max(2000).nullable().optional(),
  cta: z.string().max(240).nullable().optional(),
  hashtags: z.array(z.string().max(100)).max(30).default([]),
  campaignId: z.string().uuid().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  schedules: z.array(z.object({
    id: z.string().uuid().optional(),
    variantId: z.string().uuid().nullable().optional(),
    platform: z.enum(['facebook', 'instagram', 'linkedin']).nullable().optional(),
    format: z.enum(['static', 'carousel', 'video', 'story']).nullable().optional(),
    scheduledAt: z.string().min(1),
    timezone: z.string().min(1).max(80).optional(),
    notes: z.string().max(500).nullable().optional(),
  })).max(50).optional(),
  timezone: z.string().min(1).max(80).default('America/Sao_Paulo'),
  approvalPolicy: z.enum(['any', 'all', 'minimum']).default('any'),
  minimumApprovals: z.number().int().positive().max(100).default(1),
  copyOwnerId: z.string().uuid().nullable().optional(),
  designOwnerId: z.string().uuid().nullable().optional(),
  publishOwnerId: z.string().uuid().nullable().optional(),
  productionPriority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  productionDueAt: z.string().datetime({ offset: true }).nullable().optional(),
  variants: z.array(z.object({
    id: z.string().uuid().optional(),
    accountId: z.string().uuid(),
    platform: z.enum(['facebook', 'instagram', 'linkedin']),
    format: z.enum(['static', 'carousel', 'video', 'story']).default('static'),
    caption: z.string().max(5000).default(''),
    linkUrl: z.string().url().nullable().optional(),
    hashtags: z.array(z.string().max(100)).max(30).default([]),
    platformConfig: z.record(z.unknown()).default({}),
    assetIds: z.array(z.string().uuid()).max(20).default([]),
  })).max(20).default([]),
  referenceAssetIds: z.array(z.string().uuid()).max(20).default([]),
})

export default defineEventHandler(async (event) => {
  const postId = String(getRouterParam(event, 'id'))
  const input = inputSchema.parse(await readBody(event))
  const { client, tenantId, user } = await requireSocialContext(event, 'marketing.social.update')
  await validateSocialPostAssets(client, tenantId, input.variants, input.referenceAssetIds)

  const { data: existing } = await client
    .from('social_posts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', postId)
    .maybeSingle()

  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Publicação não encontrada' })
  if (['publishing', 'published'].includes(existing.status) || existing.deleted_at) {
    throw createError({ statusCode: 409, statusMessage: 'Uma publicação enviada ou excluída não pode ser alterada' })
  }
  if (['deletion_pending', 'deleted'].includes(String(existing.publication_status || ''))) {
    throw createError({ statusCode: 409, statusMessage: 'Publicação em exclusão não pode ser alterada' })
  }

  if (input.campaignId) {
    const { data: campaign } = await client
      .from('social_campaigns')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', input.campaignId)
      .maybeSingle()
    if (!campaign)
      throw createError({ statusCode: 400, statusMessage: 'Campanha inválida' })
  }

  // Material edit → domain revision (supersedes open approval, returns to draft).
  const { createRevision } = await import('~/server/utils/social-approval-domain')
  await createRevision(client, { tenantId, postId })

  await client
    .from('publication_jobs')
    .update({ status: 'cancelled', locked_at: null, locked_by: null })
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .in('status', ['pending', 'retrying'])

  // Editing supersedes approval and cancels pending jobs — clear legacy
  // publication_status so the UI can offer submit/publish again.
  const previousPublication = String(existing.publication_status || 'not_scheduled')
  const shouldResetPublication = ['scheduled', 'failed', 'publishing'].includes(previousPublication)

  const sharedHashtags = input.hashtags || []
  const sharedArtText = input.artText?.trim() || ''
  const sharedCta = input.cta?.trim() || ''
  const existingMetadata = (existing.metadata && typeof existing.metadata === 'object')
    ? existing.metadata as Record<string, unknown>
    : {}

  const primarySchedule = input.schedules?.length
    ? [...input.schedules]
        .map(slot => new Date(slot.scheduledAt))
        .filter(date => !Number.isNaN(date.getTime()))
        .sort((a, b) => a.getTime() - b.getTime())[0]
        ?.toISOString()
    : (input.scheduledAt || null)

  const productionPatch: Record<string, unknown> = {}
  if (input.copyOwnerId !== undefined)
    productionPatch.copy_owner_id = input.copyOwnerId
  if (input.designOwnerId !== undefined)
    productionPatch.design_owner_id = input.designOwnerId
  if (input.publishOwnerId !== undefined)
    productionPatch.publish_owner_id = input.publishOwnerId
  if (input.productionPriority !== undefined)
    productionPatch.production_priority = input.productionPriority
  if (input.productionDueAt !== undefined)
    productionPatch.production_due_at = input.productionDueAt

  const { data: post, error: postError } = await client
    .from('social_posts')
    .update({
      title: input.title,
      content: input.content,
      campaign_id: input.campaignId || null,
      assigned_to: input.assignedTo || null,
      scheduled_at: primarySchedule,
      timezone: input.timezone,
      approval_policy: input.approvalPolicy,
      minimum_approvals: input.minimumApprovals,
      editorial_status: 'draft',
      approval_bypassed: false,
      approved_version_id: null,
      ...(shouldResetPublication ? { publication_status: 'not_scheduled' } : {}),
      ...productionPatch,
      metadata: {
        ...existingMetadata,
        art_text: sharedArtText || null,
        cta: sharedCta || null,
        hashtags: sharedHashtags,
      },
    })
    .eq('tenant_id', tenantId)
    .eq('id', postId)
    .is('deleted_at', null)
    .select('*')
    .single()

  if (postError)
    throw createError({ statusCode: 400, statusMessage: postError.message })

  const { data: currentVariants } = await client
    .from('social_post_variants')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
  const incomingIds = new Set(input.variants.map(variant => variant.id).filter(Boolean))
  const removedIds = (currentVariants || [])
    .map((row: any) => String(row.id))
    .filter((id: string) => !incomingIds.has(id))

  if (removedIds.length) {
    await client
      .from('social_post_variants')
      .delete()
      .eq('tenant_id', tenantId)
      .in('id', removedIds)
  }

  function buildVariantPayload(variant: (typeof input.variants)[number]) {
    const platformConfig = {
      ...(variant.platformConfig || {}),
      artText: String((variant.platformConfig as any)?.artText || sharedArtText || ''),
      cta: String((variant.platformConfig as any)?.cta || sharedCta || ''),
    }
    return {
      tenant_id: tenantId,
      post_id: postId,
      account_id: variant.accountId,
      platform: variant.platform,
      format: variant.format,
      caption: variant.caption || input.content,
      link_url: variant.linkUrl || null,
      hashtags: (variant.hashtags?.length ? variant.hashtags : sharedHashtags),
      platform_config: platformConfig,
    }
  }

  const variantsToUpdate = input.variants.filter(variant => Boolean(variant.id))
  const variantsToInsert = input.variants.filter(variant => !variant.id)

  const updatedPairs = await Promise.all(variantsToUpdate.map(async (variant) => {
    const { data: savedVariant, error: variantError } = await client
      .from('social_post_variants')
      .update(buildVariantPayload(variant))
      .eq('id', variant.id!)
      .eq('tenant_id', tenantId)
      .select('id')
      .single()
    if (variantError)
      throw createError({ statusCode: 400, statusMessage: variantError.message })
    return { id: String(savedVariant.id), assetIds: variant.assetIds }
  }))

  let insertedPairs: Array<{ id: string, assetIds: string[] }> = []
  if (variantsToInsert.length) {
    const { data: inserted, error: insertError } = await client
      .from('social_post_variants')
      .insert(variantsToInsert.map(buildVariantPayload))
      .select('id')
    if (insertError)
      throw createError({ statusCode: 400, statusMessage: insertError.message })
    insertedPairs = (inserted || []).map((row: { id: string }, index: number) => ({
      id: String(row.id),
      assetIds: variantsToInsert[index]?.assetIds || [],
    }))
  }

  const savedVariants = [...updatedPairs, ...insertedPairs]
  const savedVariantIds = savedVariants.map(variant => variant.id)

  if (savedVariantIds.length) {
    const { error: deleteAssetsError } = await client
      .from('social_post_assets')
      .delete()
      .eq('tenant_id', tenantId)
      .in('variant_id', savedVariantIds)
    if (deleteAssetsError)
      throw createError({ statusCode: 400, statusMessage: deleteAssetsError.message })
  }

  const assetRows = savedVariants.flatMap(variant =>
    variant.assetIds.map((assetId, position) => ({
      tenant_id: tenantId,
      post_id: postId,
      variant_id: variant.id,
      asset_id: assetId,
      position,
    })),
  )
  if (assetRows.length) {
    const { error: assetsError } = await client.from('social_post_assets').insert(assetRows)
    if (assetsError)
      throw createError({ statusCode: 400, statusMessage: assetsError.message })
  }

  await client
    .from('social_post_assets')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .is('variant_id', null)

  if (input.referenceAssetIds.length) {
    const { error: referenceError } = await client.from('social_post_assets').insert(
      input.referenceAssetIds.map((assetId, position) => ({
        tenant_id: tenantId,
        post_id: postId,
        variant_id: null,
        asset_id: assetId,
        position,
      })),
    )
    if (referenceError)
      throw createError({ statusCode: 400, statusMessage: referenceError.message })
  }

  if (input.schedules) {
    await replacePostSchedules(client, {
      tenantId,
      postId,
      userId: user.id,
      schedules: input.schedules,
      timezone: input.timezone,
    })
  }
  else if (input.scheduledAt) {
    await ensurePrimaryScheduleFromLegacy(client, {
      tenantId,
      postId,
      userId: user.id,
      scheduledAt: input.scheduledAt,
      timezone: input.timezone,
    })
  }

  await recordSocialAudit(event, client, {
    tenantId,
    actorId: user.id,
    action: 'social_post.updated',
    entityType: 'social_post',
    entityId: postId,
    before: existing,
    after: post,
  })

  return { data: post }
})
