interface SocialApprover {
  userId: string
  role: string
  name: string
  email: string
  isPlatformAdmin: boolean
}

async function listAuthUsers(client: any) {
  const users: any[] = []
  let page = 1

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 1000,
    })
    if (error)
      throw createError({ statusCode: 400, statusMessage: error.message })

    users.push(...(data?.users || []))
    if ((data?.users || []).length < 1000)
      break
    page += 1
  }

  return users
}

export async function listEligibleSocialApprovers(
  client: any,
  tenantId: string,
): Promise<SocialApprover[]> {
  const { data: directMembers, error: directError } = await client
    .from('user_tenant_role')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
  if (directError)
    throw createError({ statusCode: 400, statusMessage: directError.message })

  const { data: portfolioRows, error: portfolioError } = await client
    .from('organization_tenants')
    .select('organization_id')
    .eq('tenant_id', tenantId)
  if (portfolioError)
    throw createError({ statusCode: 400, statusMessage: portfolioError.message })

  const organizationIds = (portfolioRows || []).map((row: any) => row.organization_id)
  const { data: organizationMembers, error: organizationError } = organizationIds.length
    ? await client
      .from('organization_memberships')
      .select('user_id, role')
      .eq('is_active', true)
      .in('organization_id', organizationIds)
    : { data: [], error: null }
  if (organizationError)
    throw createError({ statusCode: 400, statusMessage: organizationError.message })

  const roles = new Map<string, string>()
  for (const row of organizationMembers || [])
    roles.set(String(row.user_id), String(row.role))
  for (const row of directMembers || [])
    roles.set(String(row.user_id), String(row.role))

  const { data: roleCapabilities, error: capabilityError } = await client
    .from('role_capabilities')
    .select('role')
    .in('capability', ['marketing.social.approve', 'marketing.social.approval.client'])
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
  if (capabilityError)
    throw createError({ statusCode: 400, statusMessage: capabilityError.message })
  const allowedRoles = new Set((roleCapabilities || []).map((row: any) => String(row.role)))

  const linkedUserIds = [...roles.keys()]
  const { data: grants, error: grantsError } = linkedUserIds.length
    ? await client
      .from('tenant_capability_grants')
      .select('user_id, allowed')
      .eq('tenant_id', tenantId)
      .eq('capability', 'marketing.social.approve')
      .in('user_id', linkedUserIds)
    : { data: [], error: null }
  if (grantsError)
    throw createError({ statusCode: 400, statusMessage: grantsError.message })
  const overrides = new Map(
    (grants || []).map((row: any): [string, boolean] => [String(row.user_id), Boolean(row.allowed)]),
  )

  const authUsers = await listAuthUsers(client)
  const eligibleIds = new Set<string>()
  for (const [userId, role] of roles) {
    const override = overrides.get(userId)
    if (override ?? allowedRoles.has(role))
      eligibleIds.add(userId)
  }
  for (const user of authUsers) {
    if (user.app_metadata?.role === 'admin')
      eligibleIds.add(String(user.id))
  }

  return authUsers
    .filter(user => eligibleIds.has(String(user.id)))
    .map((user): SocialApprover => {
      const isPlatformAdmin = user.app_metadata?.role === 'admin'
      return {
        userId: String(user.id),
        role: isPlatformAdmin ? 'admin' : (roles.get(String(user.id)) || 'cliente'),
        name: String(user.user_metadata?.name || user.email || 'Usuário'),
        email: String(user.email || ''),
        isPlatformAdmin,
      }
    })
    .sort((left, right) => {
      if (left.isPlatformAdmin !== right.isPlatformAdmin)
        return left.isPlatformAdmin ? -1 : 1
      return left.name.localeCompare(right.name, 'pt-BR')
    })
}
