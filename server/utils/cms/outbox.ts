import type { WorkspaceClient } from '~/server/utils/workspace-context'

import { CMS_TABLES } from '~/lib/cms/contracts'

export const CMS_INVALIDATION_EVENTS = ['publish', 'unpublish'] as const
export type CmsInvalidationEvent = typeof CMS_INVALIDATION_EVENTS[number]

export interface CmsInvalidationInput {
  tenantId: string
  siteId?: string | null
  documentId?: string | null
  revisionId?: string | null
  eventType: CmsInvalidationEvent
  payload?: Record<string, unknown>
}

/**
 * Inserts one cache-invalidation job. Publish and unpublish already do this
 * inside the database, from the audit trigger, so those RPCs must not call
 * this helper or the worker would see two jobs for one edit.
 */
export async function enqueueCmsInvalidation(client: WorkspaceClient, input: CmsInvalidationInput): Promise<void> {
  const { error } = await client.from(CMS_TABLES.eventOutbox).insert({
    tenant_id: input.tenantId,
    site_id: input.siteId ?? null,
    document_id: input.documentId ?? null,
    revision_id: input.revisionId ?? null,
    event_type: input.eventType,
    payload: input.payload ?? {},
  })
  if (error)
    console.error('[cms] outbox insert failed', input.eventType, error)
}
