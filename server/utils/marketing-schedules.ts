import type { MarketingPostScheduleInput } from '~/types/marketing-schedules'
import { mapMarketingPostSchedule } from '~/types/marketing-schedules'

type SupabaseClientLike = {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => any
}

function toIso(value: string) {
  // Accept both datetime-local (no Z) and full ISO.
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    throw createError({ statusCode: 400, statusMessage: 'Data de agendamento inválida' })
  return date.toISOString()
}

export async function syncPostNextScheduledAt(
  client: SupabaseClientLike,
  tenantId: string,
  postId: string,
) {
  const { error } = await client.rpc('marketing_sync_post_next_scheduled_at', {
    p_tenant_id: tenantId,
    p_post_id: postId,
  })
  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })
}

export async function listPostSchedules(
  client: SupabaseClientLike,
  tenantId: string,
  postId: string,
) {
  const { data, error } = await client
    .from('marketing_post_schedules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true })

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  return (data || []).map((row: Record<string, unknown>) => mapMarketingPostSchedule(row))
}

export async function replacePostSchedules(
  client: SupabaseClientLike,
  input: {
    tenantId: string
    postId: string
    userId: string
    schedules: MarketingPostScheduleInput[]
    timezone?: string
  },
) {
  const timezone = input.timezone || 'America/Sao_Paulo'
  const keepIds = new Set(
    input.schedules.map(slot => slot.id).filter((id): id is string => Boolean(id)),
  )

  const { data: existing, error: existingError } = await client
    .from('marketing_post_schedules')
    .select('id, status')
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)
    .neq('status', 'cancelled')

  if (existingError)
    throw createError({ statusCode: 400, statusMessage: existingError.message })

  const toCancel = (existing || [])
    .filter((row: { id: string }) => !keepIds.has(row.id))
    .map((row: { id: string }) => row.id)

  if (toCancel.length) {
    const { error: cancelError } = await client
      .from('marketing_post_schedules')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('tenant_id', input.tenantId)
      .eq('post_id', input.postId)
      .in('id', toCancel)
    if (cancelError)
      throw createError({ statusCode: 400, statusMessage: cancelError.message })
  }

  for (const slot of input.schedules) {
    const payload = {
      tenant_id: input.tenantId,
      post_id: input.postId,
      variant_id: slot.variantId || null,
      platform: slot.platform || null,
      format: slot.format || null,
      scheduled_at: toIso(slot.scheduledAt),
      timezone: slot.timezone || timezone,
      notes: slot.notes || null,
      status: slot.status || 'planned',
      updated_at: new Date().toISOString(),
    }

    if (slot.id) {
      const { error } = await client
        .from('marketing_post_schedules')
        .update(payload)
        .eq('tenant_id', input.tenantId)
        .eq('post_id', input.postId)
        .eq('id', slot.id)
        .neq('status', 'cancelled')
      if (error)
        throw createError({ statusCode: 400, statusMessage: error.message })
    }
    else {
      const { error } = await client
        .from('marketing_post_schedules')
        .insert({
          ...payload,
          created_by: input.userId,
        })
      if (error)
        throw createError({ statusCode: 400, statusMessage: error.message })
    }
  }

  await syncPostNextScheduledAt(client, input.tenantId, input.postId)
  return listPostSchedules(client, input.tenantId, input.postId)
}

/**
 * Ensure at least one schedule exists when legacy scheduledAt is provided on create/update.
 */
export async function ensurePrimaryScheduleFromLegacy(
  client: SupabaseClientLike,
  input: {
    tenantId: string
    postId: string
    userId: string
    scheduledAt: string | null | undefined
    timezone?: string
  },
) {
  if (!input.scheduledAt)
    return

  const existing = await listPostSchedules(client, input.tenantId, input.postId)
  if (existing.length)
    return

  const { error } = await client
    .from('marketing_post_schedules')
    .insert({
      tenant_id: input.tenantId,
      post_id: input.postId,
      scheduled_at: toIso(input.scheduledAt),
      timezone: input.timezone || 'America/Sao_Paulo',
      status: 'planned',
      created_by: input.userId,
    })

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  await syncPostNextScheduledAt(client, input.tenantId, input.postId)
}

/**
 * Calendar feed reads marketing_post_schedules, not publication_jobs.
 * Enqueue (Hub schedule + MCP schedulePost) must upsert a queued slot so the
 * post appears on /marketing calendar.
 */
export async function ensureQueuedCalendarSlot(
  client: SupabaseClientLike,
  input: {
    tenantId: string
    postId: string
    scheduledAt: string
    timezone?: string | null
    userId?: string | null
    publicationJobId?: string | null
  },
) {
  const scheduledAt = toIso(input.scheduledAt)
  const timezone = input.timezone || 'America/Sao_Paulo'
  const now = new Date().toISOString()

  const { data: nextSlot, error: lookupError } = await client
    .from('marketing_post_schedules')
    .select('id')
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)
    .in('status', ['planned', 'queued', 'failed'])
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (lookupError)
    throw createError({ statusCode: 400, statusMessage: lookupError.message })

  if (nextSlot?.id) {
    const { error } = await client
      .from('marketing_post_schedules')
      .update({
        scheduled_at: scheduledAt,
        timezone,
        status: 'queued',
        publication_job_id: input.publicationJobId || null,
        updated_at: now,
      })
      .eq('id', nextSlot.id)
      .eq('tenant_id', input.tenantId)
    if (error)
      throw createError({ statusCode: 400, statusMessage: error.message })
    return
  }

  const { error } = await client
    .from('marketing_post_schedules')
    .insert({
      tenant_id: input.tenantId,
      post_id: input.postId,
      scheduled_at: scheduledAt,
      timezone,
      status: 'queued',
      publication_job_id: input.publicationJobId || null,
      created_by: input.userId || null,
      updated_at: now,
    })

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })
}
