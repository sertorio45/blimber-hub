import { describe, expect, it } from 'vitest'
import { listClients, listClientsSchema } from '../lib/blimber-mcp/platform/clients'

const rows = {
  tenant: [
    { id: '00000000-0000-4000-8000-000000000001', name: 'Alfa', slug: 'alfa', is_active: true },
    { id: '00000000-0000-4000-8000-000000000002', name: 'Beta', slug: 'beta', is_active: true },
    { id: '00000000-0000-4000-8000-000000000003', name: 'Gama', slug: 'gama', is_active: false },
  ],
  tenant_modules: [
    { tenant_id: '00000000-0000-4000-8000-000000000001', module_name: 'all', is_active: true },
    { tenant_id: '00000000-0000-4000-8000-000000000002', module_name: 'crm', is_active: true },
    { tenant_id: '00000000-0000-4000-8000-000000000003', module_name: 'marketing', is_active: true },
  ],
  marketing_integrations: [
    { tenant_id: '00000000-0000-4000-8000-000000000001', provider: 'meta', is_active: true, config: { access_token_enc: 'SECRET', ad_account_id: '123' } },
    { tenant_id: '00000000-0000-4000-8000-000000000002', provider: 'meta', is_active: true, config: { access_token_enc: 'SECRET' } },
    { tenant_id: '00000000-0000-4000-8000-000000000003', provider: 'google_ads', is_active: false, config: { refresh_token_enc: 'SECRET', customer_id: '456' } },
  ],
  whatsapp_instance: [
    { tenant_id: '00000000-0000-4000-8000-000000000002', status: 'connected' },
  ],
}

function fakeClient() {
  return {
    from(table: keyof typeof rows) {
      const filters: Array<(row: any) => boolean> = []
      let max = Number.POSITIVE_INFINITY
      const query = {
        select: () => query,
        order: () => query,
        limit: (value: number) => { max = value; return query },
        gt: (key: string, value: string) => { filters.push(row => row[key] > value); return query },
        in: (key: string, values: string[]) => { filters.push(row => values.includes(row[key])); return query },
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query },
        or: () => { filters.push(row => row.is_active !== false); return query },
        then: (resolve: (value: unknown) => void) => resolve({ data: rows[table].filter(row => filters.every(fn => fn(row))).slice(0, max), error: null }),
      }
      return query
    },
  }
}

describe('listClients inventory', () => {
  it('returns active clients, expands all bundle, and never returns credentials', async () => {
    const result = await listClients(fakeClient(), {})
    expect(result.clients.map(client => client.name)).toEqual(['Alfa', 'Beta'])
    expect(result.clients[0]?.activeModules).toContain('marketing')
    expect(result.clients[0]?.activeModules).not.toContain('ads')
    expect(result.clients[0]?.integrations).toEqual([{ provider: 'meta', active: true, connected: true, ready: true }])
    expect(JSON.stringify(result)).not.toContain('SECRET')
  })

  it('filters by active module and ready provider', async () => {
    const result = await listClients(fakeClient(), { module: 'marketing', integrationProvider: 'meta', integrationStatus: 'ready' })
    expect(result.clients.map(client => client.slug)).toEqual(['alfa'])
  })

  it('distinguishes an active integration from one ready for use', async () => {
    const result = await listClients(fakeClient(), { integrationProvider: 'meta', integrationStatus: 'active' })
    expect(result.clients.map(client => client.slug)).toEqual(['alfa', 'beta'])
    expect(result.clients[1]?.integrations[0]?.ready).toBe(false)
  })

  it('reports connected WhatsApp instances without phone or credentials', async () => {
    const result = await listClients(fakeClient(), { integrationProvider: 'whatsapp', integrationStatus: 'ready' })
    expect(result.clients.map(client => client.slug)).toEqual(['beta'])
    expect(result.clients[0]?.integrations).toContainEqual({ provider: 'whatsapp', active: true, connected: true, ready: true })
  })

  it('paginates with a stable cursor for n8n', async () => {
    const first = await listClients(fakeClient(), { limit: 1 })
    const second = await listClients(fakeClient(), { limit: 1, cursor: first.nextCursor })
    expect(first.clients[0]?.slug).toBe('alfa')
    expect(second.clients[0]?.slug).toBe('beta')
  })

  it('includes inactive clients only when requested', async () => {
    const result = await listClients(fakeClient(), { includeInactive: true, integrationProvider: 'google_ads', integrationStatus: 'missing' })
    expect(result.clients.map(client => client.slug)).toEqual(['alfa', 'beta', 'gama'])
    expect(result.clients[2]?.active).toBe(false)
  })

  it('rejects unscoped integration status filters', () => {
    expect(listClientsSchema.safeParse({ integrationStatus: 'ready' }).success).toBe(false)
  })
})
