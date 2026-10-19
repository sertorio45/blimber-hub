import type { CmsAuditEvent, CmsAuditListQuery, CmsPage } from '~/lib/cms/contracts'
import type { CmsContext } from '~/server/utils/cms/context'

import { CMS_TABLES, cmsAuditEventSchema } from '~/lib/cms/contracts'
import { assertAnyCmsCapability } from '~/server/utils/cms/context'
import { assertNoDbError, cmsError } from '~/server/utils/cms/errors'
import { cursorFilter, decodeCmsCursor, paginate } from '~/server/utils/cms/pagination'

const AUDIT_COLUMNS = 'id, site_id, actor_user_id, action, document_id, revision_id, metadata, created_at'

interface AuditRow {
  id: string
  site_id: string | null
  actor_user_id: string | null
  action: string
  document_id: string | null
  revision_id: string | null
  metadata: unknown
  created_at: string
}

function mapAudit(row: AuditRow): CmsAuditEvent {
  const parsed = cmsAuditEventSchema.safeParse({
    id: row.id,
    siteId: row.site_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    documentId: row.document_id,
    revisionId: row.revision_id,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
    createdAt: row.created_at,
  })
  if (!parsed.success) {
    console.error('[cms] invalid audit row', row.id, parsed.error)
    throw cmsError(500, 'internal_error', 'Erro ao ler a auditoria')
  }
  return parsed.data
}

/** Append-only activity for a site or a single document. */
export async function listCmsAuditEvents(
  ctx: CmsContext,
  query: CmsAuditListQuery,
): Promise<CmsPage<CmsAuditEvent>> {
  assertAnyCmsCapability(ctx, ['cms.read', 'cms.settings.manage'])

  let request = ctx.client
    .from(CMS_TABLES.auditEvents)
    .select(AUDIT_COLUMNS)
    .eq('tenant_id', ctx.tenantId)

  if (query.siteId)
    request = request.eq('site_id', query.siteId)
  if (query.documentId)
    request = request.eq('document_id', query.documentId)
  if (query.cursor)
    request = request.or(cursorFilter('created_at', decodeCmsCursor(query.cursor)))

  const { data, error } = await request
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(query.limit + 1)
  assertNoDbError(error, 'Erro ao carregar a auditoria')

  const page = paginate((data ?? []) as AuditRow[], query.limit, row => ({
    key: row.created_at,
    id: row.id,
  }))
  return { data: page.rows.map(mapAudit), nextCursor: page.nextCursor }
}
