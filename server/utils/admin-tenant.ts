import { createError } from 'h3'

export function generateTenantSlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function createAdminTenant(
  client: { from: (table: string) => any },
  name: string,
) {
  const trimmed = name.trim()
  if (!trimmed)
    throw createError({ statusCode: 400, statusMessage: 'Nome da empresa é obrigatório' })

  const slug = generateTenantSlug(trimmed)
  if (!slug)
    throw createError({ statusCode: 400, statusMessage: 'Nome da empresa inválido' })

  const { data, error } = await client
    .from('tenant')
    .insert({
      name: trimmed,
      slug,
      is_active: true,
    })
    .select('id, name, slug')
    .single()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  return data as { id: string, name: string, slug: string }
}

export async function seedTenantAllModules(
  client: { from: (table: string) => any },
  tenantId: string,
) {
  const { error } = await client
    .from('tenant_modules')
    .upsert(
      {
        tenant_id: tenantId,
        module_name: 'all',
        is_active: true,
        activated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,module_name' },
    )

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })
}

/**
 * Hard-delete a tenant and tenant-scoped data. Platform staff only.
 *
 * Every tenant gets an auto-created `direct` organization anchored on it
 * (trigger `sync_tenant_organization`), so that shadow org must be removed
 * together with the tenant — otherwise no tenant could ever be deleted.
 * Blocks only when the tenant anchors a real organization (e.g. `agency`)
 * or when its direct organization links other tenants.
 */
export async function deleteAdminTenant(
  client: { from: (table: string) => any },
  tenantId: string,
) {
  const { data: tenant, error: findError } = await client
    .from('tenant')
    .select('id, name, slug')
    .eq('id', tenantId)
    .maybeSingle()

  if (findError)
    throw createError({ statusCode: 400, statusMessage: findError.message })
  if (!tenant)
    throw createError({ statusCode: 404, statusMessage: 'Empresa não encontrada' })

  const { data: anchorOrgs, error: anchorError } = await client
    .from('organizations')
    .select('id, name, type')
    .eq('tenant_id', tenantId)

  if (anchorError)
    throw createError({ statusCode: 400, statusMessage: anchorError.message })

  const anchors = (anchorOrgs || []) as Array<{ id: string, name: string, type: string }>
  const blockingOrgs = anchors.filter(org => org.type !== 'direct')

  if (blockingOrgs.length > 0) {
    const names = blockingOrgs.map(row => row.name).join(', ')
    throw createError({
      statusCode: 409,
      statusMessage: `Esta empresa é a base da organização: ${names}. Remova a organização antes de excluir o tenant.`,
    })
  }

  for (const org of anchors) {
    const { data: otherLinks, error: linksError } = await client
      .from('organization_tenants')
      .select('id')
      .eq('organization_id', org.id)
      .neq('tenant_id', tenantId)

    if (linksError)
      throw createError({ statusCode: 400, statusMessage: linksError.message })

    if ((otherLinks || []).length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: `A organização "${org.name}" possui outras empresas vinculadas. Desvincule-as antes de excluir este tenant.`,
      })
    }

    // ON DELETE CASCADE clears organization_tenants/memberships/roles/invites.
    const { error: orgDeleteError } = await client
      .from('organizations')
      .delete()
      .eq('id', org.id)

    if (orgDeleteError)
      throw createError({
        statusCode: 400,
        statusMessage: `Falha ao remover a organização "${org.name}": ${orgDeleteError.message}`,
      })
  }

  // Tables with ON DELETE NO ACTION on tenant_id must be cleared first.
  const cleanupTables = [
    'crm_lead',
    'crm_funnel',
    'articles_tag_relations',
    'articles',
    'articles_category',
    'articles_tag',
    'tenant_modules',
  ] as const

  for (const table of cleanupTables) {
    const { error } = await client.from(table).delete().eq('tenant_id', tenantId)
    if (error)
      throw createError({
        statusCode: 400,
        statusMessage: `Falha ao limpar ${table}: ${error.message}`,
      })
  }

  const { error: deleteError } = await client.from('tenant').delete().eq('id', tenantId)
  if (deleteError)
    throw createError({ statusCode: 400, statusMessage: deleteError.message })

  return tenant as { id: string, name: string, slug: string }
}
