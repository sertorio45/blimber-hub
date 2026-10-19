import type { AppRoleSlug } from '~/constants/roles'
import type { CmsCapability } from '~/constants/workspace'
import type { WorkspaceClient, WorkspaceContext, WorkspaceModule } from '~/server/utils/workspace-context'

import { articleError, toArticleError } from '~/server/utils/articles/errors'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'

export type ArticleAccess = 'read' | 'create' | 'update' | 'delete'
export type ArticleWriteAccess = Exclude<ArticleAccess, 'read'>

export interface ArticleContext {
  workspace: WorkspaceContext
  client: WorkspaceClient
  tenantId: string
}

/** A tenant contracted with the new CMS keeps access to the legacy article screens. */
const ARTICLE_MODULES: WorkspaceModule[] = ['article', 'cms']

/**
 * Roles that already managed articles before CMS capabilities existed. Kept so
 * current users are not locked out until CMS role presets are seeded.
 */
const LEGACY_ARTICLE_ROLES: AppRoleSlug[] = ['cliente', 'atendente']

const CAPABILITY_BY_ACCESS: Record<ArticleAccess, CmsCapability> = {
  read: 'cms.read',
  create: 'cms.publications.create',
  update: 'cms.publications.update',
  delete: 'cms.publications.delete',
}

export function hasArticleModule(ctx: WorkspaceContext): boolean {
  return ctx.isPlatformStaff || ARTICLE_MODULES.some(module => ctx.modules.includes(module))
}

export function canAccessArticles(ctx: WorkspaceContext, access: ArticleAccess): boolean {
  if (ctx.isPlatformStaff)
    return true
  if (ctx.has(CAPABILITY_BY_ACCESS[access]))
    return true
  return !!ctx.effectiveRole && LEGACY_ARTICLE_ROLES.includes(ctx.effectiveRole)
}

export function assertArticleWrite(ctx: WorkspaceContext, access: ArticleWriteAccess = 'update') {
  if (!canAccessArticles(ctx, access))
    throw articleError(403, 'forbidden', 'Sem permissão para alterar artigos')
}

/**
 * Single gate for every `/api/articles/**` handler. The tenant always comes from
 * the validated workspace context, never from the body, query or user metadata.
 */
export async function requireArticleContext(
  event: any,
  access: ArticleAccess = 'read',
): Promise<ArticleContext> {
  let workspace: WorkspaceContext
  try {
    workspace = await requireWorkspaceContext(event, { requireTenant: true })
  }
  catch (error) {
    throw toArticleError(error)
  }

  if (!workspace.tenantId)
    throw articleError(400, 'validation_failed', 'Selecione uma empresa')

  if (!hasArticleModule(workspace))
    throw articleError(403, 'module_disabled', 'Módulo não contratado por esta empresa')

  if (access === 'read') {
    if (!canAccessArticles(workspace, 'read'))
      throw articleError(403, 'forbidden', 'Sem permissão para visualizar artigos')
  }
  else {
    assertArticleWrite(workspace, access)
  }

  return { workspace, client: workspace.client, tenantId: workspace.tenantId }
}
