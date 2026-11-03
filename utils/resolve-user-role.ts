import { isStaffRole } from '~/constants/roles'

export function decodeJwtPayload(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  }
  catch {
    return null
  }
}

function isUuid(value: string | null | undefined) {
  if (!value)
    return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/**
 * Staff global (Superadministrador / Funcionário) tem prioridade sobre tenant_roles.
 */
export function resolveRoleFromJwtPayload(
  payload: {
    app_metadata?: { role?: string, tenant_roles?: Record<string, string> }
    user_metadata?: { role?: string, tenant_id?: string }
  } | null,
  tenantId?: string | null,
): string | null {
  if (!payload)
    return null

  const globalRole = payload.app_metadata?.role || payload.user_metadata?.role
  if (isStaffRole(globalRole))
    return globalRole

  const tenantRoles = payload.app_metadata?.tenant_roles || {}

  if (tenantId && tenantRoles[tenantId])
    return tenantRoles[tenantId]

  const keys = Object.keys(tenantRoles)
  if (keys.length === 1)
    return tenantRoles[keys[0]] ?? null

  if (tenantId) {
    for (const key of keys) {
      if (!isUuid(key) && key === tenantId)
        return tenantRoles[key]
    }
  }

  if (keys.length)
    return tenantRoles[keys[0]] ?? null

  return globalRole || null
}

type SupabaseBrowserClient = ReturnType<typeof import('#imports').useSupabaseClient>

type SessionLike = {
  access_token?: string | null
} | null | undefined

/**
 * Resolves role from an existing session when provided, avoiding a second
 * auth.getSession() round-trip (common in middleware / useAuth / useRole).
 */
export async function resolveRoleFromSession(
  supabase: SupabaseBrowserClient,
  tenantId?: string | null,
  existingSession?: SessionLike,
) {
  const session = existingSession === undefined
    ? (await supabase.auth.getSession()).data.session
    : existingSession
  if (!session?.access_token)
    return null

  const payload = decodeJwtPayload(session.access_token)
  const globalRole = payload?.app_metadata?.role || payload?.user_metadata?.role
  if (isStaffRole(globalRole))
    return globalRole

  const tenantRoles = payload?.app_metadata?.tenant_roles || {}

  if (tenantId && isUuid(tenantId) && tenantRoles[tenantId])
    return tenantRoles[tenantId]

  if (tenantId && isUuid(tenantId)) {
    const { data } = await supabase.from('tenant').select('slug').eq('id', tenantId).maybeSingle()
    if (data?.slug && tenantRoles[data.slug])
      return tenantRoles[data.slug]
  }

  return resolveRoleFromJwtPayload(payload, tenantId)
}

export function isGlobalStaffFromJwt(payload: {
  app_metadata?: { role?: string, tenant_roles?: Record<string, string> }
  user_metadata?: { role?: string }
} | null): boolean {
  if (!payload)
    return false
  const globalRole = payload.app_metadata?.role || payload.user_metadata?.role
  return isStaffRole(globalRole)
}

export async function getAllowedTenantIdsFromSession(
  supabase: ReturnType<typeof import('#imports').useSupabaseClient>,
): Promise<Set<string> | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token)
    return new Set()

  const payload = decodeJwtPayload(session.access_token)
  if (!payload)
    return new Set()

  if (isGlobalStaffFromJwt(payload))
    return null

  const tenantRoles = payload.app_metadata?.tenant_roles || {}
  const allowed = new Set<string>()

  for (const key of Object.keys(tenantRoles)) {
    if (isUuid(key))
      allowed.add(key)
  }

  const slugs = Object.keys(tenantRoles).filter(key => !isUuid(key))
  if (slugs.length) {
    const { data } = await supabase.from('tenant').select('id, slug').in('slug', slugs)
    for (const row of data || [])
      allowed.add(row.id)
  }

  const metadataTenantId = payload.user_metadata?.tenant_id
  if (metadataTenantId && isUuid(metadataTenantId))
    allowed.add(metadataTenantId)

  return allowed
}
