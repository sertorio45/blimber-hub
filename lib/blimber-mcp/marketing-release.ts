import { z } from 'zod'
import {
  assertPostCanBePublished,
  assertPostCanBeScheduled,
  enqueueApprovedPost,
  unscheduleApprovedPost,
} from '~/server/utils/social-approval-domain'
import {
  assertBlimberWriteConfirmation,
  blimberWriteConfirmationFields,
  blimberWriteDryRunField,
  resolveDryRun,
} from './confirm'
import { BlimberMcpError } from './errors'
import {
  mapH3LikeToMcp,
  resolveMcpEditorialActor,
} from './marketing-editorial'
import type { BlimberMcpToolContext } from './types'
import { MARKETING_CONTENT_URL } from './types'

const uuid = z.string().uuid()
const tenantIdField = z.string().uuid().describe('UUID do tenant (cliente).')

export const publicationReleaseEnum = z.enum([
  'scheduled',
  'published',
  'not_scheduled',
])

export type PublicationReleaseStatus = z.infer<typeof publicationReleaseEnum>

export type ReleaseAction =
  | { type: 'schedule', scheduledAt: string | null }
  | { type: 'publish' }
  | { type: 'unschedule', clearScheduledAt: boolean }

const ISO_TZ_NOTE = 'ISO-8601 com offset. Timezone do Hub: America/Sao_Paulo (BRT, UTC-3). Ex.: 2026-08-17T19:00:00-03:00.'

export const marketingSchedulePostSchema = z.object({
  tenantId: tenantIdField,
  postId: uuid,
  scheduledAt: z.string().datetime({ offset: true }).optional()
    .describe(ISO_TZ_NOTE),
  timezone: z.string().min(1).max(80).optional()
    .describe('IANA. Default America/Sao_Paulo.'),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export const marketingPublishPostSchema = z.object({
  tenantId: tenantIdField,
  postId: uuid,
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export const marketingUnschedulePostSchema = z.object({
  tenantId: tenantIdField,
  postId: uuid,
  clearScheduledAt: z.boolean().optional().default(false)
    .describe('Se true, também zera social_posts.scheduled_at.'),
  actorUserId: uuid.optional(),
  ...blimberWriteConfirmationFields,
  ...blimberWriteDryRunField,
})

export function resolveReleaseAction(input: {
  scheduledAt?: string | null
  publicationStatus?: PublicationReleaseStatus
  publishNow?: boolean
}): ReleaseAction | null {
  if (input.publishNow === true || input.publicationStatus === 'published') {
    if (input.publicationStatus && input.publicationStatus !== 'published') {
      throw new BlimberMcpError(
        'STATUS_CONFLICT',
        'publishNow/publicationStatus=published não combina com outro publicationStatus.',
        400,
      )
    }
    return { type: 'publish' }
  }

  if (input.publicationStatus === 'not_scheduled') {
    return { type: 'unschedule', clearScheduledAt: input.scheduledAt === null }
  }

  if (input.publicationStatus === 'scheduled') {
    if (input.scheduledAt === null) {
      throw new BlimberMcpError(
        'SCHEDULE_REQUIRED',
        'publicationStatus=scheduled exige scheduledAt ISO (ex. 2026-08-17T19:00:00-03:00) ou a data já gravada no post.',
        400,
      )
    }
    return { type: 'schedule', scheduledAt: input.scheduledAt ?? null }
  }

  if (input.scheduledAt === null)
    return { type: 'unschedule', clearScheduledAt: true }
  if (typeof input.scheduledAt === 'string')
    return { type: 'schedule', scheduledAt: input.scheduledAt }
  return null
}

function mapReleaseError(error: unknown): never {
  if (error instanceof BlimberMcpError)
    throw error
  const message = String((error as any)?.statusMessage || (error as any)?.message || '')
  if (/precisa estar aprovada/i.test(message) || /versão atual ainda não foi aprovada/i.test(message)) {
    throw new BlimberMcpError(
      'NOT_APPROVED',
      'Aprove o post primeiro (approvePost com decision=approved) antes de agendar ou publicar. O Hub exige editorial_status=approved e approved_version_id.',
      409,
    )
  }
  if (/versão aprovada está desatualizada/i.test(message)) {
    throw new BlimberMcpError(
      'STALE_VERSION',
      'A versão aprovada está desatualizada — reaprove a versão atual antes de agendar.',
      409,
    )
  }
  mapH3LikeToMcp(error, 'Falha ao agendar/publicar')
}

async function loadReleasePost(
  ctx: BlimberMcpToolContext,
  tenantId: string,
  postId: string,
) {
  const { data, error } = await ctx.client
    .from('social_posts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', postId)
    .maybeSingle()

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message, 400)
  if (!data)
    throw new BlimberMcpError('NOT_FOUND', 'Publicação não encontrada', 404)
  if (data.deleted_at)
    throw new BlimberMcpError('GONE', 'Publicação excluída não pode ser alterada', 409)
  return data
}

function mapReleasePost(row: Record<string, any>) {
  return {
    kind: 'editorial' as const,
    entity: 'social_post',
    id: String(row.id),
    title: String(row.title || ''),
    editorialStatus: row.editorial_status ?? null,
    publicationStatus: row.publication_status ?? null,
    status: row.status,
    scheduledAt: row.scheduled_at ?? null,
    timezone: row.timezone ?? 'America/Sao_Paulo',
    hubUrl: `${MARKETING_CONTENT_URL}/${row.id}`,
  }
}

function mapJobs(jobs: any[] | null | undefined) {
  return (jobs || []).map((job: any) => ({
    id: job.id,
    variantId: job.variant_id,
    status: job.status,
    scheduledAt: job.scheduled_at,
  }))
}

async function assertReleaseAllowed(
  ctx: BlimberMcpToolContext,
  action: Extract<ReleaseAction, { type: 'schedule' } | { type: 'publish' }>,
  tenantId: string,
  postId: string,
) {
  try {
    if (action.type === 'publish') {
      await assertPostCanBePublished(ctx.client, { tenantId, postId })
      return
    }
    await assertPostCanBeScheduled(ctx.client, { tenantId, postId })
  }
  catch (error) {
    mapReleaseError(error)
  }
}

export async function applyPostRelease(
  ctx: BlimberMcpToolContext,
  input: {
    tenantId: string
    postId: string
    action: ReleaseAction
    actorUserId?: string
    dryRun: boolean
    timezone?: string
    /** Skip Hub releasable checks (dry-run when the same call will approve first). */
    skipReleasableCheck?: boolean
  },
) {
  const existing = await loadReleasePost(ctx, input.tenantId, input.postId)

  if (input.action.type === 'schedule' && !input.action.scheduledAt && !existing.scheduled_at) {
    throw new BlimberMcpError(
      'SCHEDULE_REQUIRED',
      'Informe scheduledAt em ISO com offset (ex. 2026-08-17T19:00:00-03:00, America/Sao_Paulo).',
      400,
    )
  }

  if (input.action.type !== 'unschedule' && !input.skipReleasableCheck)
    await assertReleaseAllowed(ctx, input.action, input.tenantId, input.postId)

  const scheduledAtPreview = input.action.type === 'publish'
    ? new Date().toISOString()
    : input.action.type === 'schedule'
      ? (input.action.scheduledAt || existing.scheduled_at)
      : (input.action.clearScheduledAt ? null : existing.scheduled_at)

  const notes = input.action.type === 'publish'
    ? [
        'Usa enqueueApprovedPost({ publishNow: true }) — o mesmo do botão Publicar agora.',
        'Worker publica quando scheduled_at <= agora. Timezone America/Sao_Paulo.',
      ]
    : input.action.type === 'schedule'
      ? [
          'Usa enqueueApprovedPost — cria/atualiza publication_jobs e publication_status=scheduled.',
          'Não grava só a data. ISO com offset; Hub tz America/Sao_Paulo (BRT UTC-3).',
        ]
      : [
          'Cancela publication_jobs pending/retrying/failed e slots planned/queued.',
          'Volta publication_status=not_scheduled. Não remove o post das redes.',
        ]

  if (input.dryRun) {
    return {
      dryRun: true as const,
      wouldMutate: true,
      action: input.action.type,
      entity: 'social_post' as const,
      kind: 'editorial' as const,
      before: mapReleasePost(existing),
      afterPreview: {
        publicationStatus: input.action.type === 'unschedule' ? 'not_scheduled' : 'scheduled',
        scheduledAt: scheduledAtPreview,
        timezone: input.timezone || existing.timezone || 'America/Sao_Paulo',
        publishNow: input.action.type === 'publish',
      },
      notes: [...notes, 'Reenvie com dryRun=false após confirmação.'],
    }
  }

  const actor = await resolveMcpEditorialActor(ctx, input.tenantId, input.actorUserId)

  if (input.timezone) {
    await ctx.client
      .from('social_posts')
      .update({ timezone: input.timezone, updated_at: new Date().toISOString() })
      .eq('tenant_id', input.tenantId)
      .eq('id', input.postId)
  }

  try {
    if (input.action.type === 'unschedule') {
      const result = await unscheduleApprovedPost(ctx.client, {
        tenantId: input.tenantId,
        postId: input.postId,
        capabilities: actor.capabilities,
        isPlatformStaff: actor.isPlatformStaff,
        clearScheduledAt: input.action.clearScheduledAt,
      })
      const post = await loadReleasePost(ctx, input.tenantId, input.postId)
      return {
        dryRun: false as const,
        kind: 'editorial' as const,
        action: 'unschedule' as const,
        cancelled: result.cancelled,
        post: mapReleasePost(post),
      }
    }

    const jobs = await enqueueApprovedPost(ctx.client, {
      tenantId: input.tenantId,
      postId: input.postId,
      scheduledAt: input.action.type === 'publish' ? null : input.action.scheduledAt,
      publishNow: input.action.type === 'publish',
      capabilities: actor.capabilities,
      isPlatformStaff: actor.isPlatformStaff,
      userId: actor.userId,
    })
    const post = await loadReleasePost(ctx, input.tenantId, input.postId)
    return {
      dryRun: false as const,
      kind: 'editorial' as const,
      action: input.action.type,
      jobs: mapJobs(jobs),
      post: mapReleasePost(post),
    }
  }
  catch (error) {
    mapReleaseError(error)
  }
}

export async function marketingSchedulePost(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingSchedulePostSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  return applyPostRelease(ctx, {
    tenantId: input.tenantId,
    postId: input.postId,
    action: { type: 'schedule', scheduledAt: input.scheduledAt ?? null },
    actorUserId: input.actorUserId,
    dryRun,
    timezone: input.timezone,
  })
}

export async function marketingPublishPost(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingPublishPostSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  return applyPostRelease(ctx, {
    tenantId: input.tenantId,
    postId: input.postId,
    action: { type: 'publish' },
    actorUserId: input.actorUserId,
    dryRun,
  })
}

export async function marketingUnschedulePost(
  ctx: BlimberMcpToolContext,
  raw: unknown,
) {
  const input = marketingUnschedulePostSchema.parse(raw)
  assertBlimberWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  return applyPostRelease(ctx, {
    tenantId: input.tenantId,
    postId: input.postId,
    action: { type: 'unschedule', clearScheduledAt: Boolean(input.clearScheduledAt) },
    actorUserId: input.actorUserId,
    dryRun,
  })
}
