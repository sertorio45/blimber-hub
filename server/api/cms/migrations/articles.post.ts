import type { CmsItem } from '~/lib/cms/contracts'
import type { LegacyArticleMigrationReport } from '~/server/utils/cms/legacy-migration'

import { cmsError, cmsForbidden } from '~/server/utils/cms/errors'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'
import {
  legacyArticleMigrationInputSchema,
  migrateLegacyArticles,
  resolveLegacyMigrationScope,
} from '~/server/utils/cms/legacy-migration'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'

/**
 * Re-runs the legacy article import for the selected company.
 * Platform staff may pass `tenantId: null` to import every tenant.
 * Requires `cms.settings.manage` (staff hold every capability).
 */
export default defineCmsHandler(async (event): Promise<CmsItem<LegacyArticleMigrationReport>> => {
  const ws = await requireWorkspaceContext(event, {
    module: 'cms',
    requireTenant: false,
    capability: 'cms.settings.manage',
  })

  const input = await readCmsBody(event, legacyArticleMigrationInputSchema)
  const scope = resolveLegacyMigrationScope({
    isPlatformStaff: ws.isPlatformStaff,
    contextTenantId: ws.tenantId,
    requestedTenantId: input.tenantId,
  })

  if (!scope.ok) {
    if (scope.status === 403)
      throw cmsForbidden(scope.message)
    throw cmsError(scope.status, 'validation_failed', scope.message)
  }

  const report = await migrateLegacyArticles(ws.client, scope.tenantId)
  return { data: report }
})
