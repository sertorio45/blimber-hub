import type { WorkspaceClient } from '~/server/utils/workspace-context'

import { CMS_TABLES } from '~/lib/cms/contracts'

export interface CmsAuditInput {
  action: string
  siteId?: string | null
  documentId?: string | null
  revisionId?: string | null
  metadata?: Record<string, unknown>
}

interface CmsAuditActor {
  client: WorkspaceClient
  tenantId: string
  userId: string
}

/**
 * Appends a `cms_audit_events` row. The write it describes is already
 * committed, so a failing audit insert is logged instead of failing the request.
 * Publish/unpublish are audited inside their RPCs and must not call this.
 */
export async function recordCmsAudit(actor: CmsAuditActor, input: CmsAuditInput): Promise<void> {
  const { error } = await actor.client.from(CMS_TABLES.auditEvents).insert({
    tenant_id: actor.tenantId,
    site_id: input.siteId ?? null,
    actor_user_id: actor.userId,
    action: input.action,
    document_id: input.documentId ?? null,
    revision_id: input.revisionId ?? null,
    metadata: input.metadata ?? {},
  })
  if (error)
    console.error('[cms] audit insert failed', input.action, error)
}
