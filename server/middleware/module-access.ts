import type { WorkspaceModule } from '~/server/utils/workspace-context'
import { serverSupabaseUser } from '#supabase/server'

import { getRequestURL } from 'h3'

import { isStaffUser } from '~/server/utils/tenant-role'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'

/**
 * `/api/articles` is the legacy CMS surface: gating it on `cms` is enough because
 * the resolver expands `article` ⇄ `cms`, so tenants holding either row pass.
 * Public delivery (`/api/public/**`) is never listed here.
 */
const MODULE_BY_PREFIX: Array<[string, WorkspaceModule]> = [
  ['/api/crm', 'crm'],
  ['/api/cms', 'cms'],
  ['/api/articles', 'cms'],
  ['/api/marketing', 'marketing'],
  ['/api/whatsapp', 'whatsapp'],
]

/** Browser OAuth returns here; the exchange itself is authenticated via `oauth_states`. */
function isOAuthCallbackPath(path: string): boolean {
  return /\/oauth\/[^/]+\/callback\/?$/.test(path)
}

/** Segment-aware match so `/api/cms-foo` or `/api/public/cms` never hit `/api/cms`. */
export function resolveApiPathModule(path: string): WorkspaceModule | null {
  const match = MODULE_BY_PREFIX.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
  return match ? match[1] : null
}

/**
 * Blocks module endpoints when the tenant did not contract the module, or when
 * the user cannot reach the requested tenant at all. The decision itself lives in
 * `requireWorkspaceContext`, so this middleware and the handlers cannot drift.
 */
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  // CRM Meta CAPI reuses marketing OAuth start URLs historically — never gate
  // the provider callback on a contracted module (session cookie may be present).
  if (isOAuthCallbackPath(path))
    return

  const module = resolveApiPathModule(path)
  if (!module)
    return

  // Machine-to-machine callers (pg_cron worker) authenticate inside the handler.
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user)
    return

  // Platform staff reach every module; the handlers still scope the data.
  if (isStaffUser(user))
    return

  await requireWorkspaceContext(event, {
    requireTenant: true,
    module,
  })
})
