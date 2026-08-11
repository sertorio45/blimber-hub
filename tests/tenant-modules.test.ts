import { describe, expect, it } from 'vitest'

import {
  resolveTenantModuleSlugs,
  TENANT_MODULE_BUNDLE_ALL,
} from '~/constants/modules'
import {
  getTenantModulesState,
  syncTenantModules,
} from '~/server/utils/tenant-modules'

function createTenantModulesClient(seed: Array<{
  id: string
  tenant_id: string
  module_name: string
  is_active: boolean
}>) {
  const rows = [...seed]

  return {
    from(table: string) {
      if (table !== 'tenant_modules')
        throw new Error(`Unexpected table ${table}`)

      const queryState: {
        tenantId?: string
        rowId?: string
        patch?: Record<string, unknown>
      } = {}

      const chain: any = {
        select() { return chain },
        eq(col: string, val: string) {
          if (col === 'tenant_id')
            queryState.tenantId = val
          if (col === 'id')
            queryState.rowId = val
          return chain
        },
        update(patch: Record<string, unknown>) {
          queryState.patch = patch
          return chain
        },
        upsert(payload: Record<string, unknown>) {
          const tenantId = String(payload.tenant_id)
          const moduleName = String(payload.module_name)
          const existing = rows.find(
            row => row.tenant_id === tenantId && row.module_name === moduleName,
          )
          if (existing) {
            Object.assign(existing, payload, { is_active: true })
          }
          else {
            rows.push({
              id: `row-${rows.length + 1}`,
              tenant_id: tenantId,
              module_name: moduleName,
              is_active: Boolean(payload.is_active),
            })
          }
          return Promise.resolve({ error: null })
        },
        then(resolve: (value: unknown) => void) {
          if (queryState.patch && queryState.rowId) {
            const target = rows.find(row => row.id === queryState.rowId)
            if (target)
              Object.assign(target, queryState.patch)
            return Promise.resolve({ error: null }).then(resolve)
          }

          let data = rows
          if (queryState.tenantId)
            data = rows.filter(row => row.tenant_id === queryState.tenantId)
          if (queryState.rowId)
            data = rows.filter(row => row.id === queryState.rowId)

          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }

      return chain
    },
  }
}

describe('tenant modules helpers', () => {
  it('expands the all bundle to every module slug', () => {
    expect(resolveTenantModuleSlugs([TENANT_MODULE_BUNDLE_ALL])).toEqual([
      'crm',
      'article',
      'marketing',
      'ads',
      'whatsapp',
    ])
  })

  it('unlocks Ads as a companion whenever Marketing is active', () => {
    expect(resolveTenantModuleSlugs(['marketing'])).toEqual(['marketing', 'ads'])
    expect(resolveTenantModuleSlugs(['crm', 'marketing'])).toEqual([
      'crm',
      'marketing',
      'ads',
    ])
  })

  it('reads active module names from tenant_modules rows', async () => {
    const client = createTenantModulesClient([
      {
        id: '1',
        tenant_id: 'tenant-1',
        module_name: 'marketing',
        is_active: true,
      },
      {
        id: '2',
        tenant_id: 'tenant-1',
        module_name: 'crm',
        is_active: false,
      },
    ])

    const state = await getTenantModulesState(client, 'tenant-1')
    expect(state.activeModuleNames).toEqual(['marketing'])
    expect(state.resolvedModules).toEqual(['marketing', 'ads'])
    expect(state.hasAllBundle).toBe(false)
  })

  it('syncs explicit modules and deactivates removed ones', async () => {
    const client = createTenantModulesClient([
      {
        id: '1',
        tenant_id: 'tenant-1',
        module_name: 'marketing',
        is_active: true,
      },
      {
        id: '2',
        tenant_id: 'tenant-1',
        module_name: 'crm',
        is_active: true,
      },
      {
        id: '3',
        tenant_id: 'tenant-1',
        module_name: 'all',
        is_active: true,
      },
    ])

    const after = await syncTenantModules(client, 'tenant-1', ['whatsapp'])
    expect(after.resolvedModules).toEqual(['whatsapp'])
    expect(after.hasAllBundle).toBe(false)

    const state = await getTenantModulesState(client, 'tenant-1')
    expect(state.activeModuleNames).toEqual(['whatsapp'])
  })

  it('syncs the all bundle and deactivates granular modules', async () => {
    const client = createTenantModulesClient([
      {
        id: '1',
        tenant_id: 'tenant-1',
        module_name: 'marketing',
        is_active: true,
      },
    ])

    const after = await syncTenantModules(client, 'tenant-1', ['all'])
    expect(after.hasAllBundle).toBe(true)
    expect(after.resolvedModules).toHaveLength(5)

    const state = await getTenantModulesState(client, 'tenant-1')
    expect(state.activeModuleNames).toEqual(['all'])
  })
})
