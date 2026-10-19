import type { AssignableTenantModuleName } from '~/constants/modules'

import { createError } from 'h3'
import {
  ASSIGNABLE_MODULE_SLUGS,
  ASSIGNABLE_TENANT_MODULE_NAMES,
  LEGACY_MODULE_ALIASES,
  resolveTenantModuleSlugs,
  TENANT_MODULE_BUNDLE_ALL,
} from '~/constants/modules'

interface TenantModulesClient { from: (table: string) => any }

export interface TenantModulesState {
  activeModuleNames: string[]
  hasAllBundle: boolean
  resolvedModules: string[]
}

export async function getTenantModulesState(
  client: TenantModulesClient,
  tenantId: string,
): Promise<TenantModulesState> {
  const { data, error } = await client
    .from('tenant_modules')
    .select('module_name, is_active')
    .eq('tenant_id', tenantId)

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  const activeModuleNames = (data || [])
    .filter((row: { is_active: boolean }) => row.is_active)
    .map((row: { module_name: string }) => String(row.module_name))

  const hasAllBundle = activeModuleNames.includes(TENANT_MODULE_BUNDLE_ALL)

  return {
    activeModuleNames,
    hasAllBundle,
    resolvedModules: resolveTenantModuleSlugs(activeModuleNames),
  }
}

export function parseTenantModuleNames(
  modules: readonly string[],
): AssignableTenantModuleName[] {
  const unique = [...new Set(modules.map(name => LEGACY_MODULE_ALIASES[name] ?? name))]
  for (const name of unique) {
    if (!ASSIGNABLE_TENANT_MODULE_NAMES.includes(name as AssignableTenantModuleName)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Módulo inválido: ${name}`,
      })
    }
  }
  return unique as AssignableTenantModuleName[]
}

/**
 * Replace the tenant module contract: either the `all` bundle or an explicit subset.
 */
export async function syncTenantModules(
  client: TenantModulesClient,
  tenantId: string,
  requestedModules: readonly string[],
): Promise<TenantModulesState> {
  const unique = parseTenantModuleNames(requestedModules)

  if (!unique.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Selecione pelo menos um módulo',
    })
  }

  const useAllBundle = unique.includes(TENANT_MODULE_BUNDLE_ALL)
  const activeSet = useAllBundle
    ? new Set<string>([TENANT_MODULE_BUNDLE_ALL])
    : new Set(unique.filter(name => name !== TENANT_MODULE_BUNDLE_ALL))

  if (!useAllBundle && activeSet.size === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Selecione pelo menos um módulo',
    })
  }

  const { data: existing, error: existingError } = await client
    .from('tenant_modules')
    .select('id, module_name, is_active')
    .eq('tenant_id', tenantId)

  if (existingError)
    throw createError({ statusCode: 400, statusMessage: existingError.message })

  const now = new Date().toISOString()
  const knownNames = new Set<string>([
    ...ASSIGNABLE_MODULE_SLUGS,
    ...Object.keys(LEGACY_MODULE_ALIASES),
    TENANT_MODULE_BUNDLE_ALL,
  ])

  for (const row of existing || []) {
    const moduleName = String(row.module_name)
    if (!knownNames.has(moduleName))
      continue

    // Legacy rows (`article`) follow their commercial module, otherwise the
    // alias would keep granting access after the module is switched off.
    const shouldBeActive = activeSet.has(LEGACY_MODULE_ALIASES[moduleName] ?? moduleName)
    if (row.is_active === shouldBeActive)
      continue

    const { error } = await client
      .from('tenant_modules')
      .update({
        is_active: shouldBeActive,
        updated_at: now,
        ...(shouldBeActive ? { activated_at: now } : {}),
      })
      .eq('id', row.id)

    if (error)
      throw createError({ statusCode: 400, statusMessage: error.message })
  }

  for (const moduleName of activeSet) {
    const row = (existing || []).find(
      (item: { module_name: string }) => String(item.module_name) === moduleName,
    )

    if (!row) {
      const { error } = await client
        .from('tenant_modules')
        .upsert(
          {
            tenant_id: tenantId,
            module_name: moduleName,
            is_active: true,
            activated_at: now,
          },
          { onConflict: 'tenant_id,module_name' },
        )

      if (error)
        throw createError({ statusCode: 400, statusMessage: error.message })
      continue
    }

    if (!row.is_active) {
      const { error } = await client
        .from('tenant_modules')
        .update({
          is_active: true,
          activated_at: now,
          updated_at: now,
        })
        .eq('id', row.id)

      if (error)
        throw createError({ statusCode: 400, statusMessage: error.message })
    }
  }

  return getTenantModulesState(client, tenantId)
}
