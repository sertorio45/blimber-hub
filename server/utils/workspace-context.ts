import type { User } from '@supabase/supabase-js'

import type { AppRoleSlug } from '~/constants/roles'
import type {
  OrganizationRelationshipType,
  OrganizationType,
  WorkspaceCapability,
} from '~/constants/workspace'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

import { createError, getHeader, getQuery } from 'h3'

import { isStaffRole } from '~/constants/roles'
import { resolveGlobalRole } from '~/server/utils/tenant-role'
import {
  ORGANIZATION_HEADER,
  TENANT_HEADER,
  holdsCapability,
} from '~/constants/workspace'
import { resolveEffectiveCapabilities } from '~/server/utils/resolve-capabilities'

/**
 * The generated Supabase types lag behind the schema, and every workspace query
 * runs with the service role anyway. Naming the escape hatch keeps it auditable.
 */
export type WorkspaceClient = any

export type WorkspaceModule = 'crm' | 'article' | 'marketing' | 'whatsapp'

export interface WorkspaceOrganization {
  id: string
  name: string
  slug: string
  type: OrganizationType
  isActive: boolean
  anchorTenantId: string | null
  settings: Record<string, unknown>
}

export interface WorkspaceTenant {
  id: string
  name: string
  slug: string
  isActive: boolean
}

export interface WorkspaceOrganizationMembership {
  id: string
  organizationId: string
  userId: string
  role: AppRoleSlug
  roleId: string | null
  isActive: boolean
  accessAllTenants: boolean
}

export interface WorkspaceOrganizationTenantLink {
  organizationId: string
  tenantId: string
  relationshipType: OrganizationRelationshipType
  isPrimary: boolean
  isActive: boolean
}

export interface WorkspaceRequestedContext {
  organizationId: string | null
  tenantId: string | null
  source: 'option' | 'header' | 'query' | 'jwt' | 'none'
}

export interface WorkspaceContext {
  client: WorkspaceClient
  user: User
  userId: string
  /** Global role from `app_metadata` only. Never derived from client input. */
  globalRole: AppRoleSlug | null
  isPlatformStaff: boolean
  organization: WorkspaceOrganization | null
  organizationMembership: WorkspaceOrganizationMembership | null
  organizationRole: AppRoleSlug | null
  organizationRoleId: string | null
  organizationRoleSlug: string | null
  organizationRoleName: string | null
  organizationTenantLink: WorkspaceOrganizationTenantLink | null
  tenant: WorkspaceTenant | null
  tenantId: string | null
  tenantRole: AppRoleSlug | null
  /** Role actually used for capability checks in the resolved scope. */
  effectiveRole: AppRoleSlug | null
  capabilities: WorkspaceCapability[]
  /** Contracted modules of the resolved tenant, with the `all` bundle expanded. */
  modules: WorkspaceModule[]
  canAccessAllOrganizationTenants: boolean
  requested: WorkspaceRequestedContext
  has: (capability: WorkspaceCapability) => boolean
}

export interface WorkspaceContextOptions {
  /** Explicit ids win over headers and query strings, but are validated the same way. */
  organizationId?: string | null
  tenantId?: string | null
  requireOrganization?: boolean
  requireTenant?: boolean
  /** Rejects anyone who is not `admin` or `funcionario` in `app_metadata`. */
  platformOnly?: boolean
  /** Requires `organization.manage` on the resolved organization. */
  manageOrganization?: boolean
  module?: WorkspaceModule
  capability?: WorkspaceCapability | WorkspaceCapability[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const MODULE_NAMES: WorkspaceModule[] = ['crm', 'article', 'marketing', 'whatsapp']

const CONTEXT_CACHE_KEY = '__workspaceContext'

function asRole(value: unknown): AppRoleSlug | null {
  return value === 'admin' || value === 'funcionario' || value === 'cliente' || value === 'atendente'
    ? value
    : null
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function trimmed(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length ? text : null
}

async function resolveTenantIdentifier(
  client: WorkspaceClient,
  value: string | null,
): Promise<string | null> {
  if (!value)
    return null
  if (UUID_PATTERN.test(value))
    return value

  const { data } = await client
    .from('tenant')
    .select('id')
    .eq('slug', value)
    .maybeSingle()

  return data?.id ? String(data.id) : null
}

async function resolveOrganizationIdentifier(
  client: WorkspaceClient,
  value: string | null,
): Promise<string | null> {
  if (!value)
    return null
  if (UUID_PATTERN.test(value))
    return value

  const { data } = await client
    .from('organizations')
    .select('id')
    .eq('slug', value)
    .maybeSingle()

  return data?.id ? String(data.id) : null
}

/**
 * Headers, query strings and JWT metadata are treated as a *request* for a
 * context. Nothing here grants access on its own.
 *
 * Naming `organizationId` or `tenantId` in the options switches the resolver to
 * explicit mode, so an organization-only handler is never widened by whatever
 * the browser happens to be sending in `X-Tenant-Id`.
 */
function readRequestedContext(
  event: any,
  options: WorkspaceContextOptions,
  user: User,
): { organization: string | null, tenant: string | null, source: WorkspaceRequestedContext['source'] } {
  const query = getQuery(event)

  if ('organizationId' in options || 'tenantId' in options) {
    return {
      organization: trimmed(options.organizationId),
      tenant: trimmed(options.tenantId),
      source: 'option',
    }
  }

  const headerOrganization = trimmed(getHeader(event, ORGANIZATION_HEADER))
  const headerTenant = trimmed(getHeader(event, TENANT_HEADER))
  if (headerOrganization || headerTenant)
    return { organization: headerOrganization, tenant: headerTenant, source: 'header' }

  const queryOrganization = trimmed(query.organization_id)
  const queryTenant = trimmed(query.tenant_id)
  if (queryOrganization || queryTenant)
    return { organization: queryOrganization, tenant: queryTenant, source: 'query' }

  const tenantRoles = (user.app_metadata as { tenant_roles?: Record<string, string> })?.tenant_roles || {}
  const jwtTenant = Object.keys(tenantRoles)[0] || null
  if (jwtTenant)
    return { organization: null, tenant: jwtTenant, source: 'jwt' }

  return { organization: null, tenant: null, source: 'none' }
}

function mapOrganization(row: any): WorkspaceOrganization {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    type: row.type as OrganizationType,
    isActive: toBoolean(row.is_active, true),
    anchorTenantId: row.tenant_id ? String(row.tenant_id) : null,
    settings: (row.settings || {}) as Record<string, unknown>,
  }
}

function mapTenant(row: any): WorkspaceTenant {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    isActive: toBoolean(row.is_active, true),
  }
}

function mapMembership(row: any): WorkspaceOrganizationMembership {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    role: asRole(row.role) ?? 'atendente',
    roleId: row.role_id ? String(row.role_id) : null,
    isActive: toBoolean(row.is_active, true),
    accessAllTenants: toBoolean(row.access_all_tenants, true),
  }
}

function mapLink(row: any): WorkspaceOrganizationTenantLink {
  return {
    organizationId: String(row.organization_id),
    tenantId: String(row.tenant_id),
    relationshipType: (row.relationship_type as OrganizationRelationshipType) || 'managed',
    isPrimary: toBoolean(row.is_primary, false),
    isActive: toBoolean(row.is_active, true),
  }
}

function isLinkUsable(row: any): boolean {
  if (!toBoolean(row.is_active, true))
    return false
  if (!row.ended_at)
    return true
  return new Date(String(row.ended_at)).getTime() > Date.now()
}

async function loadActiveMemberships(
  client: WorkspaceClient,
  userId: string,
): Promise<WorkspaceOrganizationMembership[]> {
  const { data } = await client
    .from('organization_memberships')
    .select('id, organization_id, user_id, role, role_id, is_active, access_all_tenants')
    .eq('user_id', userId)
    .eq('is_active', true)

  return (data || []).map(mapMembership)
}

/** A narrowed collaborator only reaches the client workspaces explicitly assigned to them. */
async function loadAssignedTenantIds(
  client: WorkspaceClient,
  membershipIds: string[],
): Promise<Map<string, Set<string>>> {
  const assignments = new Map<string, Set<string>>()
  if (!membershipIds.length)
    return assignments

  const { data } = await client
    .from('organization_member_tenants')
    .select('organization_membership_id, tenant_id')
    .in('organization_membership_id', membershipIds)
    .eq('is_active', true)

  for (const row of data || []) {
    const key = String(row.organization_membership_id)
    if (!assignments.has(key))
      assignments.set(key, new Set<string>())
    assignments.get(key)!.add(String(row.tenant_id))
  }

  return assignments
}

function membershipReaches(
  membership: WorkspaceOrganizationMembership,
  tenantId: string,
  assignments: Map<string, Set<string>>,
): boolean {
  if (membership.accessAllTenants)
    return true
  return assignments.get(membership.id)?.has(tenantId) ?? false
}

async function loadTenantModules(
  client: WorkspaceClient,
  tenantId: string,
): Promise<WorkspaceModule[]> {
  const { data } = await client
    .from('tenant_modules')
    .select('module_name, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  const names = (data || []).map((row: any) => String(row.module_name))
  if (names.includes('all'))
    return [...MODULE_NAMES]

  return MODULE_NAMES.filter(module => names.includes(module))
}

async function loadCapabilities(
  client: WorkspaceClient,
  input: {
    isPlatformStaff: boolean
    globalRole: AppRoleSlug | null
    organizationId: string | null
    organizationRoleId: string | null
    tenantId: string | null
    userId: string
    modules: WorkspaceModule[]
    /** Skip a second membership round-trip when already known. */
    legacyRole?: AppRoleSlug | null
  },
): Promise<WorkspaceCapability[]> {
  const resolved = await resolveEffectiveCapabilities({
    client,
    userId: input.userId,
    organizationId: input.organizationId,
    organizationRoleId: input.organizationRoleId,
    tenantId: input.tenantId,
    globalRole: input.globalRole,
    isPlatformStaff: input.isPlatformStaff,
    modules: input.modules,
    enforceModules: true,
    legacyRole: input.legacyRole,
  })
  return resolved.capabilities
}

/**
 * Cookie session is preferred; Bearer JWT is accepted for browser multipart uploads
 * where the Supabase SSR cookie may not ride along on FormData requests.
 */
async function resolveRequestUser(event: any): Promise<User> {
  try {
    const user = await serverSupabaseUser(event)
    if (user)
      return user
  }
  catch {
    // Cookie session missing or expired — fall through to Bearer.
  }

  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token)
    throw createError({ statusCode: 401, statusMessage: 'Não autenticado' })

  const serviceClient: WorkspaceClient = await serverSupabaseServiceRole(event)
  const { data: { user }, error } = await serviceClient.auth.getUser(token)
  if (error || !user)
    throw createError({ statusCode: 401, statusMessage: 'Não autenticado' })

  return user
}

/**
 * Resolves the scope without applying the caller's requirements. Callers should
 * use `requireWorkspaceContext`, which also enforces `options`.
 */
async function resolveWorkspaceContext(
  event: any,
  options: WorkspaceContextOptions,
): Promise<WorkspaceContext> {
  const user = await resolveRequestUser(event)

  const client: WorkspaceClient = await serverSupabaseServiceRole(event)

  const globalRole = asRole(resolveGlobalRole(user))
  const isPlatformStaff = isStaffRole(globalRole)

  const requested = readRequestedContext(event, options, user)

  // Parallelize independent lookups: slug→id resolution + memberships.
  const [requestedTenantId, requestedOrganizationId, memberships] = await Promise.all([
    resolveTenantIdentifier(client, requested.tenant),
    resolveOrganizationIdentifier(client, requested.organization),
    loadActiveMemberships(client, user.id),
  ])

  if (requested.tenant && !requestedTenantId)
    throw createError({ statusCode: 404, statusMessage: 'Empresa não encontrada' })
  if (requested.organization && !requestedOrganizationId)
    throw createError({ statusCode: 404, statusMessage: 'Organização não encontrada' })

  const assignments = await loadAssignedTenantIds(client, memberships.map(item => item.id))

  let organization: WorkspaceOrganization | null = null
  let organizationMembership: WorkspaceOrganizationMembership | null = null

  // Fetch org + tenant rows in parallel when both are requested.
  let organizationRow: any = null
  let tenantRow: any = null
  if (requestedOrganizationId || requestedTenantId) {
    const [orgResult, tenantResult] = await Promise.all([
      requestedOrganizationId
        ? client
            .from('organizations')
            .select('id, name, slug, type, is_active, tenant_id, settings')
            .eq('id', requestedOrganizationId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      requestedTenantId
        ? client
            .from('tenant')
            .select('id, name, slug, is_active')
            .eq('id', requestedTenantId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    organizationRow = orgResult.data
    tenantRow = tenantResult.data
  }

  if (requestedOrganizationId) {
    if (!organizationRow)
      throw createError({ statusCode: 404, statusMessage: 'Organização não encontrada' })

    organization = mapOrganization(organizationRow)

    if (!organization.isActive) {
      // Stale browser hints often point at deactivated shadow orgs (`direct-*`).
      // Re-resolve from the tenant portfolio when a tenant is also requested.
      if (requestedTenantId || isPlatformStaff) {
        organization = null
        organizationMembership = null
      }
      else {
        throw createError({ statusCode: 403, statusMessage: 'Organização inativa' })
      }
    }
    else {
      organizationMembership = memberships.find(item => item.organizationId === organization!.id) ?? null
      if (!organizationMembership && !isPlatformStaff)
        throw createError({ statusCode: 403, statusMessage: 'Sem acesso a esta organização' })
    }
  }

  let tenant: WorkspaceTenant | null = null
  let organizationTenantLink: WorkspaceOrganizationTenantLink | null = null
  let tenantRole: AppRoleSlug | null = null

  if (requestedTenantId) {
    if (!tenantRow)
      throw createError({ statusCode: 404, statusMessage: 'Empresa não encontrada' })

    tenant = mapTenant(tenantRow)
    if (!tenant.isActive && !isPlatformStaff)
      throw createError({ statusCode: 403, statusMessage: 'Empresa inativa' })

    // Links + direct role are independent — fetch together for non-staff.
    const [linkResult, directRoleResult] = await Promise.all([
      client
        .from('organization_tenants')
        .select('organization_id, tenant_id, relationship_type, is_primary, is_active, ended_at')
        .eq('tenant_id', tenant.id),
      isPlatformStaff
        ? Promise.resolve({ data: null })
        : client
            .from('user_tenant_role')
            .select('role')
            .eq('user_id', user.id)
            .eq('tenant_id', tenant.id)
            .maybeSingle(),
    ])

    const linkRows = linkResult.data
    const usableLinks = (linkRows || []).filter(isLinkUsable)

    if (organization) {
      const link = usableLinks.find((row: any) => String(row.organization_id) === organization!.id)
      if (!link)
        throw createError({ statusCode: 403, statusMessage: 'Empresa não vinculada a esta organização' })
      organizationTenantLink = mapLink(link)
    }

    if (isPlatformStaff) {
      tenantRole = globalRole
      if (!organization) {
        // Prefer an active agency portfolio over a shadow/direct org that shares
        // the same tenant (common after onboarding mistakes).
        const linkOrganizationIds = usableLinks.map((row: any) => String(row.organization_id))
        const { data: linkedOrganizations } = linkOrganizationIds.length
          ? await client
              .from('organizations')
              .select('id, name, slug, type, is_active, tenant_id, settings')
              .in('id', linkOrganizationIds)
              .eq('is_active', true)
          : { data: [] as any[] }

        const orgById = new Map((linkedOrganizations || []).map((row: any) => [String(row.id), row]))
        const rankedLinks = usableLinks
          .map((row: any) => ({
            row,
            org: orgById.get(String(row.organization_id)) || null,
          }))
          .filter(item => item.org)
          .sort((a, b) => {
            const score = (item: typeof a) => {
              let value = 0
              if (item.org?.type === 'agency')
                value += 100
              if (item.row.relationship_type === 'owner')
                value += 10
              if (item.row.is_primary)
                value += 1
              return value
            }
            return score(b) - score(a)
          })

        const preferred = rankedLinks[0]
        if (preferred?.org) {
          organization = mapOrganization(preferred.org)
          organizationTenantLink = mapLink(preferred.row)
        }
      }
    }
    else {
      const directRole = asRole(directRoleResult.data?.role)

      const linkedOrganizationIds = new Set(
        usableLinks.map((row: any) => String(row.organization_id)),
      )
      const candidateMemberships = memberships.filter(
        item => linkedOrganizationIds.has(item.organizationId),
      )

      if (!directRole && !candidateMemberships.length)
        throw createError({ statusCode: 403, statusMessage: 'Sem acesso a esta empresa' })

      const reachingMemberships = candidateMemberships.filter(
        item => membershipReaches(item, tenant!.id, assignments),
      )

      if (!directRole && !reachingMemberships.length)
        throw createError({ statusCode: 403, statusMessage: 'Colaborador não atribuído a esta empresa' })

      if (organization) {
        if (organizationMembership && !membershipReaches(organizationMembership, tenant.id, assignments))
          throw createError({ statusCode: 403, statusMessage: 'Colaborador não atribuído a esta empresa' })
        tenantRole = directRole ?? organizationMembership?.role ?? null
      }
      else {
        // Single org fetch with full columns — pick preferred in memory.
        const membershipOrgIds = reachingMemberships.map(item => item.organizationId)
        const { data: membershipOrgs } = membershipOrgIds.length
          ? await client
              .from('organizations')
              .select('id, name, slug, type, is_active, tenant_id, settings')
              .in('id', membershipOrgIds)
              .eq('is_active', true)
          : { data: [] as any[] }
        const orgById = new Map((membershipOrgs || []).map((row: any) => [String(row.id), row]))

        const preferred = reachingMemberships.find((item) => {
          return orgById.get(item.organizationId)?.type === 'agency'
        }) ?? reachingMemberships.find((item) => {
          const link = usableLinks.find(
            (row: any) => String(row.organization_id) === item.organizationId,
          )
          return link?.relationship_type === 'owner'
        }) ?? reachingMemberships[0] ?? null

        if (preferred) {
          organizationMembership = preferred
          const link = usableLinks.find(
            (row: any) => String(row.organization_id) === preferred.organizationId,
          )
          if (link)
            organizationTenantLink = mapLink(link)

          const organizationRowPreferred = orgById.get(preferred.organizationId)
          if (organizationRowPreferred)
            organization = mapOrganization(organizationRowPreferred)
        }

        tenantRole = directRole ?? preferred?.role ?? null
      }

      if (!tenantRole)
        throw createError({ statusCode: 403, statusMessage: 'Sem acesso a esta empresa' })
    }
  }

  const organizationRole = isPlatformStaff
    ? globalRole
    : organizationMembership?.role ?? null

  const organizationRoleId = organizationMembership?.roleId ?? null

  // Role metadata + modules are independent.
  const [roleMeta, modules] = await Promise.all([
    organizationRoleId
      ? client
          .from('organization_roles')
          .select('slug, name')
          .eq('id', organizationRoleId)
          .maybeSingle()
          .then((result: any) => result.data)
      : Promise.resolve(null),
    tenant ? loadTenantModules(client, tenant.id) : Promise.resolve([] as WorkspaceModule[]),
  ])

  const organizationRoleSlug = roleMeta?.slug ? String(roleMeta.slug) : null
  const organizationRoleName = roleMeta?.name ? String(roleMeta.name) : null

  const effectiveRole = tenantRole ?? organizationRole

  const capabilities = await loadCapabilities(client, {
    isPlatformStaff,
    globalRole,
    organizationId: organization?.id ?? null,
    organizationRoleId,
    tenantId: tenant?.id ?? null,
    userId: user.id,
    modules,
    legacyRole: organizationMembership?.role ?? null,
  })

  return {
    client,
    user,
    userId: user.id,
    globalRole,
    isPlatformStaff,
    organization,
    organizationMembership,
    organizationRole,
    organizationRoleId,
    organizationRoleSlug,
    organizationRoleName,
    organizationTenantLink,
    tenant,
    tenantId: tenant?.id ?? null,
    tenantRole,
    effectiveRole,
    capabilities,
    modules,
    canAccessAllOrganizationTenants: isPlatformStaff
      || (organizationMembership?.accessAllTenants ?? false),
    requested: {
      organizationId: requestedOrganizationId,
      tenantId: requestedTenantId,
      source: requested.source,
    },
    has: (capability: WorkspaceCapability) => holdsCapability(capabilities, capability),
  }
}

/** Applies the caller requirements to an already resolved scope. */
function assertWorkspaceContext(context: WorkspaceContext, options: WorkspaceContextOptions) {
  if (options.platformOnly && !context.isPlatformStaff)
    throw createError({ statusCode: 403, statusMessage: 'Acesso exclusivo da plataforma' })

  if (options.requireOrganization && !context.organization)
    throw createError({ statusCode: 400, statusMessage: 'Selecione uma organização' })

  if (options.requireTenant && !context.tenant)
    throw createError({ statusCode: 400, statusMessage: 'Selecione uma empresa' })

  if (options.module && context.tenant && !context.isPlatformStaff
    && !context.modules.includes(options.module)) {
    throw createError({ statusCode: 403, statusMessage: 'Módulo não contratado por esta empresa' })
  }

  const requiredCapabilities = options.capability
    ? (Array.isArray(options.capability) ? options.capability : [options.capability])
    : []

  for (const capability of requiredCapabilities) {
    if (!context.has(capability))
      throw createError({ statusCode: 403, statusMessage: 'Sem permissão para esta ação' })
  }

  if (options.manageOrganization) {
    if (!context.organization)
      throw createError({ statusCode: 400, statusMessage: 'Selecione uma organização' })
    if (!context.isPlatformStaff && !context.has('organization.manage'))
      throw createError({ statusCode: 403, statusMessage: 'Sem permissão para gerenciar a organização' })
  }
}

function cacheKeyFor(options: WorkspaceContextOptions): string {
  const organizationId = trimmed(options.organizationId) ?? ''
  const tenantId = trimmed(options.tenantId) ?? ''
  // Empty explicit args share the request-scoped key so middleware and
  // `/api/workspace/context` do not resolve the same bootstrap twice.
  if (!organizationId && !tenantId)
    return 'request||'
  return ['explicit', organizationId, tenantId].join('|')
}

/**
 * Single entry point for authorization in Nitro handlers.
 *
 * Resolves — and validates — the authenticated user, the global role, the active
 * organization, the active tenant, both memberships, the organization ↔ tenant
 * link, the effective capabilities and the contracted modules. The resolved scope
 * is memoised per request so middleware and handlers do not query twice.
 */
export async function requireWorkspaceContext(
  event: any,
  options: WorkspaceContextOptions = {},
): Promise<WorkspaceContext> {
  const cache: Map<string, WorkspaceContext> = event.context[CONTEXT_CACHE_KEY]
    ?? (event.context[CONTEXT_CACHE_KEY] = new Map<string, WorkspaceContext>())

  const key = cacheKeyFor(options)
  let context = cache.get(key)

  if (!context) {
    context = await resolveWorkspaceContext(event, options)
    cache.set(key, context)
  }

  assertWorkspaceContext(context, options)

  return context
}

/** Context resolved earlier in the same request, when a handler needs to reuse it. */
export function getResolvedWorkspaceContext(event: any): WorkspaceContext | null {
  const cache = event.context?.[CONTEXT_CACHE_KEY] as Map<string, WorkspaceContext> | undefined
  if (!cache?.size)
    return null
  return cache.values().next().value ?? null
}

/**
 * Every tenant the user may open, already filtered by organization status, link
 * status and per-member assignment.
 */
export async function listAccessibleTenants(
  client: WorkspaceClient,
  input: { userId: string, isPlatformStaff: boolean, organizationId?: string | null },
): Promise<Array<WorkspaceTenant & {
  organizationId: string | null
  relationshipType: OrganizationRelationshipType | null
}>> {
  if (input.isPlatformStaff && !input.organizationId) {
    const { data } = await client
      .from('tenant')
      .select('id, name, slug, is_active')
      .order('name')

    return (data || []).map((row: any) => ({
      ...mapTenant(row),
      organizationId: null,
      relationshipType: null,
    }))
  }

  const memberships = input.isPlatformStaff
    ? []
    : await loadActiveMemberships(client, input.userId)

  const organizationIds = input.organizationId
    ? [input.organizationId]
    : memberships.map(item => item.organizationId)

  const [assignments, linkResult, directResult] = await Promise.all([
    input.isPlatformStaff
      ? Promise.resolve(new Map<string, Set<string>>())
      : loadAssignedTenantIds(client, memberships.map(item => item.id)),
    organizationIds.length
      ? client
          .from('organization_tenants')
          .select('organization_id, tenant_id, relationship_type, is_primary, is_active, ended_at, organizations!inner(is_active)')
          .in('organization_id', organizationIds)
      : Promise.resolve({ data: [] as any[] }),
    input.isPlatformStaff
      ? Promise.resolve({ data: [] as any[] })
      : client
          .from('user_tenant_role')
          .select('tenant_id')
          .eq('user_id', input.userId),
  ])

  const linkRows = linkResult.data
  const reachable = new Map<string, { organizationId: string, relationshipType: OrganizationRelationshipType }>()

  for (const row of linkRows || []) {
    if (!isLinkUsable(row))
      continue
    if (row.organizations && row.organizations.is_active === false)
      continue

    const tenantId = String(row.tenant_id)
    const organizationId = String(row.organization_id)

    if (!input.isPlatformStaff) {
      const membership = memberships.find(item => item.organizationId === organizationId)
      if (!membership || !membershipReaches(membership, tenantId, assignments))
        continue
    }

    if (!reachable.has(tenantId)) {
      reachable.set(tenantId, {
        organizationId,
        relationshipType: (row.relationship_type as OrganizationRelationshipType) || 'managed',
      })
    }
  }

  if (!input.isPlatformStaff) {
    for (const row of directResult.data || []) {
      const tenantId = row.tenant_id ? String(row.tenant_id) : null
      if (!tenantId)
        continue
      if (input.organizationId && !reachable.has(tenantId))
        continue
      if (!reachable.has(tenantId))
        reachable.set(tenantId, { organizationId: '', relationshipType: 'owner' })
    }
  }

  const tenantIds = [...reachable.keys()]
  if (!tenantIds.length)
    return []

  const { data: tenantRows } = await client
    .from('tenant')
    .select('id, name, slug, is_active')
    .in('id', tenantIds)
    .order('name')

  return (tenantRows || []).map((row: any) => {
    const meta = reachable.get(String(row.id))
    return {
      ...mapTenant(row),
      organizationId: meta?.organizationId || null,
      relationshipType: meta?.relationshipType ?? null,
    }
  })
}

/** Organizations the user may see, respecting cross-agency isolation. */
export async function listAccessibleOrganizations(
  client: WorkspaceClient,
  input: { userId: string, isPlatformStaff: boolean, type?: OrganizationType | null },
): Promise<WorkspaceOrganization[]> {
  let request = client
    .from('organizations')
    .select('id, name, slug, type, is_active, tenant_id, settings')
    .eq('is_active', true)
    .order('name')

  if (input.type)
    request = request.eq('type', input.type)

  if (!input.isPlatformStaff) {
    const memberships = await loadActiveMemberships(client, input.userId)
    const organizationIds = memberships.map(item => item.organizationId)
    if (!organizationIds.length)
      return []
    request = request.in('id', organizationIds)
  }

  const { data } = await request
  return (data || []).map(mapOrganization)
}
