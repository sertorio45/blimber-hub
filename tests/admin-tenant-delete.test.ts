import { describe, expect, it } from 'vitest'

import { deleteAdminTenant } from '~/server/utils/admin-tenant'

type Row = Record<string, string>

const TENANT_ID = '6bb5c04c-4159-4b97-8561-7b5c1a427961'
const DIRECT_ORG_ID = 'dd276fba-114e-453a-9264-ff7a18278d28'

function createFakeClient(store: Record<string, Row[]>) {
  const deletedOrder: string[] = []

  return {
    deletedOrder,
    from(table: string) {
      const filters: Array<{ col: string, val: string, negate: boolean }> = []
      let operation: 'select' | 'delete' = 'select'

      const matches = (row: Row) => filters.every(f =>
        f.negate ? row[f.col] !== f.val : row[f.col] === f.val,
      )

      const execute = () => {
        const rows = store[table] || []
        if (operation === 'delete') {
          deletedOrder.push(table)
          store[table] = rows.filter(row => !matches(row))
          return { data: null, error: null }
        }
        return { data: rows.filter(matches), error: null }
      }

      const chain: any = {
        select() { return chain },
        delete() { operation = 'delete'; return chain },
        eq(col: string, val: string) { filters.push({ col, val, negate: false }); return chain },
        neq(col: string, val: string) { filters.push({ col, val, negate: true }); return chain },
        maybeSingle() {
          const { data, error } = execute()
          return Promise.resolve({ data: data?.[0] ?? null, error })
        },
        then(resolve: (value: unknown) => void) {
          return Promise.resolve(execute()).then(resolve)
        },
      }

      return chain
    },
  }
}

function baseStore(anchorType = 'direct'): Record<string, Row[]> {
  return {
    tenant: [{ id: TENANT_ID, name: 'Green Village', slug: 'green-village' }],
    organizations: [{ id: DIRECT_ORG_ID, name: 'Green Village', type: anchorType, tenant_id: TENANT_ID }],
    organization_tenants: [{ id: 'link-1', organization_id: DIRECT_ORG_ID, tenant_id: TENANT_ID }],
    crm_lead: [],
    crm_funnel: [],
    articles_tag_relations: [],
    articles: [],
    articles_category: [],
    articles_tag: [],
    tenant_modules: [],
  }
}

describe('deleteAdminTenant', () => {
  it('deletes a tenant together with its auto-created direct organization', async () => {
    const store = baseStore()
    const client = createFakeClient(store)

    const deleted = await deleteAdminTenant(client as any, TENANT_ID)

    expect(deleted.name).toBe('Green Village')
    expect(store.organizations).toEqual([])
    expect(store.tenant).toEqual([])
    // Shadow org must go before the tenant row.
    expect(client.deletedOrder.indexOf('organizations'))
      .toBeLessThan(client.deletedOrder.lastIndexOf('tenant'))
  })

  it('blocks when the tenant anchors a real (non-direct) organization', async () => {
    const store = baseStore('agency')
    const client = createFakeClient(store)

    await expect(deleteAdminTenant(client as any, TENANT_ID))
      .rejects.toMatchObject({ statusCode: 409 })

    expect(store.tenant).toHaveLength(1)
    expect(store.organizations).toHaveLength(1)
  })

  it('blocks when the direct organization links other tenants', async () => {
    const store = baseStore()
    store.organization_tenants.push({
      id: 'link-2',
      organization_id: DIRECT_ORG_ID,
      tenant_id: 'other-tenant',
    })
    const client = createFakeClient(store)

    await expect(deleteAdminTenant(client as any, TENANT_ID))
      .rejects.toMatchObject({ statusCode: 409 })

    expect(store.tenant).toHaveLength(1)
  })

  it('returns 404 for an unknown tenant', async () => {
    const client = createFakeClient(baseStore())

    await expect(deleteAdminTenant(client as any, 'missing-id'))
      .rejects.toMatchObject({ statusCode: 404 })
  })
})
