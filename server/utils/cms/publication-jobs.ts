import type {
  CmsJobListQuery,
  CmsPage,
  CmsPublicationJob,
  CmsScheduleInput,
} from '~/lib/cms/contracts'
import type { CmsContext, CmsDocumentContext } from '~/server/utils/cms/context'
import type { CmsDbError } from '~/server/utils/cms/errors'
import type { CmsDocumentRow } from '~/server/utils/cms/mappers'
import type { WorkspaceClient } from '~/server/utils/workspace-context'

import { Buffer } from 'node:buffer'

import { CMS_LIMITS, CMS_RPC, CMS_TABLES, cmsPublicationJobSchema, cmsPublishablePayloadSchema, cmsSlugSchema } from '~/lib/cms/contracts'
import { resolveRunAt, ScheduleTimeError } from '~/lib/cms/schedule-time'
import { recordCmsAudit } from '~/server/utils/cms/audit'
import { assertCmsCapability } from '~/server/utils/cms/context'
import { assertNoDbError, cmsDbError, cmsError, cmsNotFound, cmsValidationError, cmsVersionConflict } from '~/server/utils/cms/errors'
import { cursorFilter, decodeCmsCursor, paginate } from '~/server/utils/cms/pagination'

/** A processing lock older than this is reclaimed. The publish itself is idempotent. */
export const CMS_JOB_LOCK_MS = 5 * 60 * 1000

const OPEN_STATUSES = ['pending', 'processing', 'retrying'] as const
const TERMINAL_CODES = new Set(['P0404', 'P0409', 'P0410', 'P0422', 'not_found', 'version_conflict'])

const JOB_COLUMNS = 'id, tenant_id, site_id, document_id, revision_id, edit_version, run_at, timezone, status, attempts, max_attempts, last_error, next_attempt_at, locked_at, locked_by, result_revision_id, actor_user_id, created_at, updated_at'

interface JobRow {
  id: string
  tenant_id: string
  site_id: string
  document_id: string
  revision_id: string | null
  edit_version: number | null
  run_at: string
  timezone: string
  status: CmsPublicationJob['status']
  attempts: number
  max_attempts: number
  last_error: string | null
  next_attempt_at: string | null
  locked_at: string | null
  locked_by: string | null
  result_revision_id: string | null
  actor_user_id: string | null
  created_at: string
  updated_at: string
}

interface DocumentPinRow {
  id: string
  tenant_id: string
  edit_version: number
  public_status: string
  has_unpublished_changes: boolean
  published_revision_id: string | null
  deleted_at: string | null
  draft_payload: unknown
  is_home: boolean
}

export interface CmsJobProcessResult {
  success?: boolean
  skipped?: boolean
  idempotent?: boolean
  reason?: string
  code?: string
  message?: string
  revisionId?: string | null
}

function mapJob(row: JobRow): CmsPublicationJob {
  const parsed = cmsPublicationJobSchema.safeParse({
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    documentId: row.document_id,
    revisionId: row.revision_id,
    editVersion: row.edit_version,
    runAt: row.run_at,
    timezone: row.timezone,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    resultRevisionId: row.result_revision_id,
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
  if (!parsed.success) {
    console.error('[cms] invalid publication job row', row.id, parsed.error)
    throw cmsError(500, 'internal_error', 'Erro ao ler o agendamento')
  }
  return parsed.data
}

function clipError(message: string): string {
  return message.slice(0, 500)
}

function terminalMessage(code: string): string {
  switch (code) {
    case 'P0409':
    case 'version_conflict':
      return 'O rascunho mudou depois do agendamento. Agende de novo para publicar esta versão.'
    case 'P0410':
      return 'O endereço já está em uso por outro conteúdo.'
    case 'P0422':
      return 'O conteúdo não passou na validação de publicação.'
    case 'P0404':
    case 'not_found':
      return 'O conteúdo não está mais disponível.'
    default:
      return 'Não foi possível publicar o agendamento.'
  }
}

function errorCode(error: unknown): string {
  const candidate = error as { code?: string, data?: { error?: { code?: string } } }
  return String(candidate?.code || candidate?.data?.error?.code || 'publish_error')
}

function errorMessage(error: unknown, code: string): string {
  if (TERMINAL_CODES.has(code))
    return terminalMessage(code)
  const candidate = error as { message?: string }
  return clipError(candidate?.message || terminalMessage(code))
}

function retryDelay(attempt: number): string {
  const minutes = Math.min(6 * 60, 2 ** Math.max(0, attempt - 1))
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

function isAlreadyLive(job: JobRow, document: DocumentPinRow): boolean {
  if (document.public_status !== 'published' || !document.published_revision_id || document.deleted_at)
    return false
  if (job.revision_id)
    return document.published_revision_id === job.revision_id
  return job.edit_version != null
    && document.edit_version === job.edit_version
    && document.has_unpublished_changes === false
}

async function writeJobAudit(
  client: WorkspaceClient,
  job: JobRow,
  action: 'schedule.fulfilled' | 'schedule.failed',
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from(CMS_TABLES.auditEvents).insert({
    tenant_id: job.tenant_id,
    site_id: job.site_id,
    actor_user_id: job.actor_user_id,
    action,
    document_id: job.document_id,
    revision_id: metadata.revisionId ?? null,
    metadata,
  })
  if (error)
    console.error('[cms] publication job audit failed', action, error)
}

async function loadJobDocument(client: WorkspaceClient, job: JobRow): Promise<DocumentPinRow | null> {
  const { data, error } = await client
    .from(CMS_TABLES.documents)
    .select('id, tenant_id, edit_version, public_status, has_unpublished_changes, published_revision_id, deleted_at, draft_payload, is_home')
    .eq('id', job.document_id)
    .eq('tenant_id', job.tenant_id)
    .maybeSingle()
  if (error)
    throw error
  return (data ?? null) as DocumentPinRow | null
}

interface PublishCallResult {
  revisionId: string
  idempotent: boolean
}

async function callPublish(client: WorkspaceClient, job: JobRow): Promise<PublishCallResult> {
  const args = job.revision_id
    ? {
        fn: CMS_RPC.publishPinnedRevision,
        body: {
          p_document_id: job.document_id,
          p_revision_id: job.revision_id,
          p_actor: job.actor_user_id,
        },
      }
    : {
        fn: CMS_RPC.publishRevision,
        body: {
          p_document_id: job.document_id,
          p_expected_version: job.edit_version,
          p_actor: job.actor_user_id,
        },
      }

  const { data, error } = await client.rpc(args.fn, args.body)
  if (error)
    throw error

  const revisionId = typeof data?.revision_id === 'string' ? data.revision_id : ''
  if (!revisionId)
    throw cmsError(500, 'internal_error', 'A publicação não devolveu a revisão')
  return { revisionId, idempotent: data?.idempotent === true }
}

async function claimJob(client: WorkspaceClient, job: JobRow, workerId: string): Promise<JobRow | null> {
  const patch = {
    status: 'processing',
    attempts: Number(job.attempts || 0) + 1,
    locked_at: new Date().toISOString(),
    locked_by: workerId.slice(0, 120),
    last_error: null,
  }
  let request = client.from(CMS_TABLES.publicationJobs).update(patch).eq('id', job.id)
  if (job.status === 'processing') {
    const staleBefore = new Date(Date.now() - CMS_JOB_LOCK_MS).toISOString()
    request = request.eq('status', 'processing').lte('locked_at', staleBefore)
  }
  else {
    request = request.in('status', ['pending', 'retrying'])
  }

  const { data, error } = await request.select(JOB_COLUMNS).maybeSingle()
  if (error)
    throw error
  return (data ?? null) as JobRow | null
}

async function finishJob(
  client: WorkspaceClient,
  jobId: string,
  revisionId: string,
): Promise<void> {
  const { error } = await client
    .from(CMS_TABLES.publicationJobs)
    .update({
      status: 'published',
      result_revision_id: revisionId,
      last_error: null,
      next_attempt_at: null,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', jobId)
  if (error)
    throw error
}

async function failOrRetry(
  client: WorkspaceClient,
  job: JobRow,
  error: unknown,
): Promise<{ code: string, message: string, retrying: boolean }> {
  const code = errorCode(error)
  const message = errorMessage(error, code)
  const attempts = Number(job.attempts || 1)
  const maxAttempts = Number(job.max_attempts || 3)
  const retrying = !TERMINAL_CODES.has(code) && attempts < maxAttempts
  const { error: updateError } = await client
    .from(CMS_TABLES.publicationJobs)
    .update({
      status: retrying ? 'retrying' : 'failed',
      last_error: message,
      next_attempt_at: retrying ? retryDelay(attempts) : null,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', job.id)
  if (updateError)
    throw updateError
  return { code, message, retrying }
}

/**
 * Publishes one job. A second call after success (or after a crash that already
 * published) does not call `cms_publish_revision` again.
 */
export async function processCmsPublicationJob(
  client: WorkspaceClient,
  job: JobRow,
  workerId: string,
): Promise<CmsJobProcessResult> {
  if (job.status === 'published')
    return { success: true, idempotent: true, revisionId: job.result_revision_id }

  if (job.status === 'cancelled' || job.status === 'failed')
    return { skipped: true, reason: job.status }

  const claimed = await claimJob(client, job, workerId)
  if (!claimed) {
    const { data, error } = await client
      .from(CMS_TABLES.publicationJobs)
      .select(JOB_COLUMNS)
      .eq('id', job.id)
      .maybeSingle()
    if (error)
      throw error
    const current = data as JobRow | null
    if (current?.status === 'published')
      return { success: true, idempotent: true, revisionId: current.result_revision_id }
    return { skipped: true, reason: current?.status === 'processing' ? 'in_progress' : (current?.status ?? 'missing') }
  }

  const document = await loadJobDocument(client, claimed)
  if (!document || document.deleted_at) {
    const failure = await failOrRetry(client, claimed, { code: 'not_found', message: terminalMessage('not_found') })
    await writeJobAudit(client, claimed, 'schedule.failed', { jobId: claimed.id, code: failure.code, message: failure.message })
    return { success: false, code: failure.code, message: failure.message }
  }

  if (claimed.edit_version != null && document.edit_version !== claimed.edit_version) {
    const failure = await failOrRetry(client, claimed, { code: 'version_conflict', message: terminalMessage('version_conflict') })
    await writeJobAudit(client, claimed, 'schedule.failed', { jobId: claimed.id, code: failure.code, message: failure.message })
    return { success: false, code: failure.code, message: failure.message }
  }

  let outcome: PublishCallResult | null = null
  try {
    if (isAlreadyLive(claimed, document))
      outcome = { revisionId: document.published_revision_id as string, idempotent: true }
    else
      outcome = await callPublish(client, claimed)
  }
  catch (error: unknown) {
    const failure = await failOrRetry(client, claimed, error)
    await writeJobAudit(client, claimed, 'schedule.failed', {
      jobId: claimed.id,
      code: failure.code,
      message: failure.message,
      retrying: failure.retrying,
    })
    return { success: false, code: failure.code, message: failure.message, reason: failure.retrying ? 'retrying' : 'failed' }
  }

  try {
    await finishJob(client, claimed.id, outcome.revisionId)
  }
  catch (error: unknown) {
    // The publish committed. Leave the row in `processing` so a stale reclaim
    // observes the live document and finishes without publishing again.
    console.error('[cms] publication job status update failed', claimed.id, error)
    throw error
  }

  await writeJobAudit(client, claimed, 'schedule.fulfilled', {
    jobId: claimed.id,
    revisionId: outcome.revisionId,
    idempotent: outcome.idempotent,
  })
  return { success: true, idempotent: outcome.idempotent, revisionId: outcome.revisionId }
}

export async function processDueCmsPublicationJobs(
  client: WorkspaceClient,
  workerId: string,
  limit = 10,
): Promise<Array<CmsJobProcessResult & { jobId: string }>> {
  const capped = Math.min(25, Math.max(1, Number(limit) || 10))
  const now = new Date().toISOString()
  const staleBefore = new Date(Date.now() - CMS_JOB_LOCK_MS).toISOString()

  const dueResult = await client
    .from(CMS_TABLES.publicationJobs)
    .select(JOB_COLUMNS)
    .in('status', ['pending', 'retrying'])
    .lte('run_at', now)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order('run_at', { ascending: true })
    .limit(capped)
  if (dueResult.error)
    throw new Error(dueResult.error.message)

  const staleResult = await client
    .from(CMS_TABLES.publicationJobs)
    .select(JOB_COLUMNS)
    .eq('status', 'processing')
    .lte('locked_at', staleBefore)
    .order('locked_at', { ascending: true })
    .limit(capped)
  if (staleResult.error)
    throw new Error(staleResult.error.message)

  const seen = new Set<string>()
  const jobs: JobRow[] = []
  for (const row of [...(dueResult.data ?? []), ...(staleResult.data ?? [])] as JobRow[]) {
    if (seen.has(row.id))
      continue
    if (row.next_attempt_at && row.next_attempt_at > now)
      continue
    seen.add(row.id)
    jobs.push(row)
    if (jobs.length >= capped)
      break
  }

  const results: Array<CmsJobProcessResult & { jobId: string }> = []
  for (const job of jobs) {
    try {
      results.push({ jobId: job.id, ...(await processCmsPublicationJob(client, job, workerId)) })
    }
    catch (error: unknown) {
      console.error('[cms] publication job failed', job.id, error)
      results.push({ jobId: job.id, success: false, message: 'Não foi possível concluir o agendamento.' })
    }
  }
  return results
}

function scheduleTimeError(error: ScheduleTimeError): Error {
  if (error.field === 'timezone')
    return cmsError(422, 'validation_failed', 'Fuso horário inválido', { field: 'timezone', reason: 'invalid' })
  return cmsError(422, 'validation_failed', 'Escolha um horário futuro, no máximo daqui a um ano.', { field: 'runAt', reason: 'invalid' })
}

async function findOpenJob(ctx: CmsDocumentContext): Promise<JobRow | null> {
  const { data, error } = await ctx.client
    .from(CMS_TABLES.publicationJobs)
    .select(JOB_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('document_id', ctx.document.id)
    .in('status', [...OPEN_STATUSES])
    .maybeSingle()
  assertNoDbError(error)
  return (data ?? null) as JobRow | null
}

function assertPinnedDraft(document: CmsDocumentRow, expectedVersion: number): void {
  if (document.edit_version !== expectedVersion) {
    throw cmsVersionConflict({
      currentVersion: document.edit_version,
      updatedAt: document.updated_at,
      updatedBy: document.updated_by,
    })
  }
  const schema = document.is_home
    ? cmsPublishablePayloadSchema.extend({ slug: cmsSlugSchema.optional() })
    : cmsPublishablePayloadSchema
  const parsed = schema.safeParse(document.draft_payload ?? {})
  if (!parsed.success)
    throw cmsValidationError(parsed.error, 'Revise os campos obrigatórios antes de agendar')
  if (Buffer.byteLength(JSON.stringify(document.draft_payload ?? {}), 'utf8') > CMS_LIMITS.maxPayloadBytes)
    throw cmsError(413, 'payload_too_large', 'Conteúdo grande demais para ser salvo')
}

async function assertPinnedRevision(ctx: CmsDocumentContext, revisionId: string): Promise<void> {
  const { data, error } = await ctx.client
    .from(CMS_TABLES.revisions)
    .select('id')
    .eq('id', revisionId)
    .eq('tenant_id', ctx.tenantId)
    .eq('document_id', ctx.document.id)
    .maybeSingle()
  assertNoDbError(error)
  if (!data)
    throw cmsNotFound('Versão não encontrada')
}

async function writeJob(
  ctx: CmsDocumentContext,
  existing: JobRow | null,
  values: Record<string, unknown>,
): Promise<JobRow> {
  if (existing) {
    const { data, error } = await ctx.client
      .from(CMS_TABLES.publicationJobs)
      .update(values)
      .eq('id', existing.id)
      .eq('tenant_id', ctx.tenantId)
      .in('status', ['pending', 'retrying'])
      .select(JOB_COLUMNS)
      .maybeSingle()
    assertNoDbError(error, 'Erro ao atualizar o agendamento')
    if (!data)
      throw cmsError(409, 'validation_failed', 'A publicação agendada já está sendo processada.')
    return data as JobRow
  }

  const { data, error } = await ctx.client
    .from(CMS_TABLES.publicationJobs)
    .insert({
      tenant_id: ctx.tenantId,
      site_id: ctx.document.site_id,
      document_id: ctx.document.id,
      actor_user_id: ctx.userId,
      ...values,
    })
    .select(JOB_COLUMNS)
    .single()
  if (error) {
    if ((error as CmsDbError).code === '23505')
      throw cmsError(409, 'validation_failed', 'Já existe um agendamento para este conteúdo.')
    throw cmsDbError(error as CmsDbError, 'Erro ao agendar a publicação')
  }
  return data as JobRow
}

/** Pins the current draft (or a revision) and queues a publish at `runAt`. */
export async function scheduleDocument(
  ctx: CmsDocumentContext,
  input: CmsScheduleInput,
): Promise<CmsPublicationJob> {
  assertCmsCapability(ctx, 'cms.publish', 'Sem permissão para agendar a publicação')

  let runAt: Date
  try {
    runAt = resolveRunAt(input.runAt, input.timezone)
  }
  catch (error: unknown) {
    if (error instanceof ScheduleTimeError)
      throw scheduleTimeError(error)
    throw error
  }

  if (input.revisionId)
    await assertPinnedRevision(ctx, input.revisionId)
  else
    assertPinnedDraft(ctx.document, input.expectedVersion as number)

  const open = await findOpenJob(ctx)
  if (open?.status === 'processing')
    throw cmsError(409, 'validation_failed', 'A publicação agendada já está sendo processada.')

  const row = await writeJob(ctx, open, {
    revision_id: input.revisionId ?? null,
    edit_version: input.revisionId ? null : input.expectedVersion,
    run_at: runAt.toISOString(),
    timezone: input.timezone.trim(),
    status: 'pending',
    attempts: 0,
    last_error: null,
    next_attempt_at: null,
    locked_at: null,
    locked_by: null,
    result_revision_id: null,
    actor_user_id: ctx.userId,
  })

  await recordCmsAudit(ctx, {
    action: 'schedule',
    siteId: ctx.document.site_id,
    documentId: ctx.document.id,
    revisionId: input.revisionId ?? null,
    metadata: {
      jobId: row.id,
      runAt: row.run_at,
      timezone: row.timezone,
      editVersion: row.edit_version,
      replaced: Boolean(open),
    },
  })
  return mapJob(row)
}

/** Cancels the open schedule. In-flight (`processing`) jobs are left to the worker. */
export async function cancelDocumentSchedule(ctx: CmsDocumentContext): Promise<CmsPublicationJob> {
  assertCmsCapability(ctx, 'cms.publish', 'Sem permissão para cancelar o agendamento')
  const open = await findOpenJob(ctx)
  if (!open)
    throw cmsNotFound('Não há agendamento para cancelar')
  if (open.status === 'processing')
    throw cmsError(409, 'validation_failed', 'A publicação agendada já está sendo processada.')

  const { data, error } = await ctx.client
    .from(CMS_TABLES.publicationJobs)
    .update({ status: 'cancelled', locked_at: null, locked_by: null, next_attempt_at: null })
    .eq('id', open.id)
    .eq('tenant_id', ctx.tenantId)
    .in('status', ['pending', 'retrying'])
    .select(JOB_COLUMNS)
    .maybeSingle()
  assertNoDbError(error, 'Erro ao cancelar o agendamento')
  if (!data)
    throw cmsError(409, 'validation_failed', 'A publicação agendada já está sendo processada.')

  await recordCmsAudit(ctx, {
    action: 'schedule.cancel',
    siteId: ctx.document.site_id,
    documentId: ctx.document.id,
    metadata: { jobId: open.id, reason: 'user' },
  })
  return mapJob(data as JobRow)
}

/**
 * Drops a pending schedule when the document leaves the publish flow (unpublish
 * or trash) so the worker cannot put it back online.
 */
export async function cancelOpenPublicationJobs(
  ctx: Pick<CmsContext, 'client' | 'tenantId' | 'userId'>,
  document: { id: string, site_id: string },
  reason: 'unpublish' | 'trash',
): Promise<void> {
  const { data, error } = await ctx.client
    .from(CMS_TABLES.publicationJobs)
    .update({ status: 'cancelled', locked_at: null, locked_by: null, next_attempt_at: null })
    .eq('tenant_id', ctx.tenantId)
    .eq('document_id', document.id)
    .in('status', ['pending', 'retrying'])
    .select('id')
  assertNoDbError(error, 'Erro ao cancelar o agendamento')

  const cancelled = (data ?? []) as Array<{ id: string }>
  if (!cancelled.length)
    return

  await recordCmsAudit(
    { client: ctx.client, tenantId: ctx.tenantId, userId: ctx.userId },
    {
      action: 'schedule.cancel',
      siteId: document.site_id,
      documentId: document.id,
      metadata: { jobIds: cancelled.map(row => row.id), reason },
    },
  )
}

export async function listPublicationJobs(
  ctx: CmsContext,
  query: CmsJobListQuery,
): Promise<CmsPage<CmsPublicationJob>> {
  assertCmsCapability(ctx, 'cms.publish', 'Sem permissão para ver os agendamentos')

  let request = ctx.client
    .from(CMS_TABLES.publicationJobs)
    .select(JOB_COLUMNS)
    .eq('tenant_id', ctx.tenantId)

  if (query.siteId)
    request = request.eq('site_id', query.siteId)
  if (query.documentId)
    request = request.eq('document_id', query.documentId)
  if (query.status)
    request = request.eq('status', query.status)
  if (query.cursor)
    request = request.or(cursorFilter('created_at', decodeCmsCursor(query.cursor)))

  const { data, error } = await request
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(query.limit + 1)
  assertNoDbError(error)

  const page = paginate((data ?? []) as JobRow[], query.limit, row => ({
    key: row.created_at,
    id: row.id,
  }))
  return { data: page.rows.map(mapJob), nextCursor: page.nextCursor }
}
