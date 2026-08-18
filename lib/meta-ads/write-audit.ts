import { randomUUID } from 'node:crypto'
import type { SupabaseLike } from './integration'

const SENSITIVE_KEYS = /token|secret|password|authorization|credential|access_token|email|phone|\busers\b|payload|\bbytes\b/i

/** Marker stored in audit payload — GPT has no Hub user (actor_id stays null). */
export const META_GPT_AUDIT_ACTOR = 'gpt-meta' as const

export type MetaWriteAuditAction =
  | 'meta.gpt.campaign.status'
  | 'meta.gpt.campaign.status.preview'
  | 'meta.gpt.adset.status'
  | 'meta.gpt.adset.status.preview'
  | 'meta.gpt.ad.status'
  | 'meta.gpt.ad.status.preview'
  | 'meta.gpt.campaign.create'
  | 'meta.gpt.adset.create'
  | 'meta.gpt.ad.create'
  | 'meta.gpt.budget.update'
  | 'meta.gpt.bulk.delete'
  | string

export interface MetaWriteAuditInput {
  tenantId: string
  action: MetaWriteAuditAction
  entityType: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  dryRun?: boolean
  /** Optional override; default null (no Hub user). Fingerprint of API key is deferred. */
  actorId?: string | null
  requestId?: string | null
}

export interface MetaWriteAuditRecord {
  at: string
  source: typeof META_GPT_AUDIT_ACTOR
  tenantId: string
  action: string
  entityType: string
  entityId: string | null
  dryRun: boolean
  before: unknown
  after: unknown
  requestId: string
}

export type MetaWriteAuditSink = (record: MetaWriteAuditRecord) => void | Promise<void>

/** Drops credential-shaped keys before logging or persisting. */
export function sanitizeMetaWriteAuditPayload(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(sanitizeMetaWriteAuditPayload)

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_KEYS.test(key))
        .map(([key, nested]) => [key, sanitizeMetaWriteAuditPayload(nested)]),
    )
  }

  return value
}

function defaultConsoleSink(record: MetaWriteAuditRecord): void {
  // Structured single-line JSON for log aggregators — never includes tokens.
  console.info('[meta-gpt-write-audit]', JSON.stringify(record))
}

let sink: MetaWriteAuditSink = defaultConsoleSink

/** Override sink in tests or to fan-out. */
export function setMetaWriteAuditSink(next: MetaWriteAuditSink | null): void {
  sink = next || defaultConsoleSink
}

/**
 * Emits a structured write audit record (console by default).
 * Optionally mirrors into `audit_events` when `client` is provided and dryRun is false
 * (or when action ends with `.preview` if caller forces persist).
 *
 * actor_id in DB: always null for GPT writes (MVP). Identity lives in `after.source`.
 */
export async function logMetaWriteAudit(
  input: MetaWriteAuditInput,
  client?: SupabaseLike | null,
): Promise<MetaWriteAuditRecord> {
  const dryRun = Boolean(input.dryRun)
  const requestId = input.requestId || randomUUID()
  const afterSanitized = sanitizeMetaWriteAuditPayload({
    source: META_GPT_AUDIT_ACTOR,
    ...(input.after && typeof input.after === 'object'
      ? (input.after as Record<string, unknown>)
      : { value: input.after }),
  })

  const record: MetaWriteAuditRecord = {
    at: new Date().toISOString(),
    source: META_GPT_AUDIT_ACTOR,
    tenantId: input.tenantId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId || null,
    dryRun,
    before: input.before === undefined ? null : sanitizeMetaWriteAuditPayload(input.before),
    after: afterSanitized,
    requestId,
  }

  await sink(record)

  // Persist executed mutations (not dry-run previews) when a Supabase client is available.
  if (client && !dryRun) {
    try {
      const { error } = await (client as any).from('audit_events').insert({
        tenant_id: input.tenantId,
        organization_id: null,
        actor_id: input.actorId ?? null,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId || null,
        before_data: record.before,
        after_data: record.after,
        request_id: requestId,
        ip: null,
        user_agent: null,
      })
      if (error)
        console.error('[meta-gpt-write-audit] falha ao persistir audit_events', error.message || error)
    }
    catch (err) {
      console.error(
        '[meta-gpt-write-audit] falha ao persistir audit_events',
        err instanceof Error ? err.message : err,
      )
    }
  }

  return record
}
