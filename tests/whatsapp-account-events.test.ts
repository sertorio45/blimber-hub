import { beforeEach, describe, expect, it, vi } from 'vitest'

const broadcast = vi.fn(async () => {})

vi.mock('~/server/utils/whatsapp/realtime-broadcast', () => ({
  broadcastWhatsAppEvent: broadcast,
}))

const { findInstanceByWabaId, processAccountUpdate } = await import(
  '~/server/utils/whatsapp/account-events'
)

const integrations = [
  { instance_id: 'instance-1', provider: 'cloud_api', cloud_business_id: 'waba-1' },
  { instance_id: 'instance-2', provider: 'cloud_api', cloud_business_id: 'waba-2' },
]

const instances = [
  { id: 'instance-1', tenant_id: 'tenant-1', connection_state: {} },
  { id: 'instance-2', tenant_id: 'tenant-2', connection_state: {} },
]

const updates: Record<string, any>[] = []

function createClient() {
  return {
    from(table: string) {
      const filters: Record<string, string> = {}
      let pendingUpdate: Record<string, any> | null = null

      const builder: any = {
        select: () => builder,
        eq: (column: string, value: string) => {
          filters[column] = value
          return builder
        },
        update: (payload: Record<string, any>) => {
          pendingUpdate = payload
          return builder
        },
        maybeSingle: async () => {
          if (pendingUpdate) {
            const row = instances.find(item => item.id === filters.id)
            const merged = { ...row, ...pendingUpdate }
            updates.push({ id: filters.id, ...pendingUpdate })
            return { data: merged }
          }

          if (table === 'whatsapp_integration') {
            return {
              data: integrations.find(item => item.cloud_business_id === filters.cloud_business_id) || null,
            }
          }

          return { data: instances.find(item => item.id === filters.id) || null }
        },
      }

      return builder
    },
  } as any
}

describe('findInstanceByWabaId', () => {
  it('routes an app-level webhook to the instance owning the WABA', async () => {
    const resolved = await findInstanceByWabaId(createClient(), 'waba-2')
    expect(resolved?.instance.id).toBe('instance-2')
    expect(resolved?.instance.tenant_id).toBe('tenant-2')
  })

  it('returns null for a WABA no tenant has connected', async () => {
    expect(await findInstanceByWabaId(createClient(), 'waba-unknown')).toBeNull()
  })
})

describe('processAccountUpdate', () => {
  beforeEach(() => {
    updates.length = 0
    broadcast.mockClear()
  })

  it.each(['PARTNER_REMOVED', 'ACCOUNT_OFFBOARDED'])('marks the instance disconnected on %s', async (event) => {
    const result = await processAccountUpdate(createClient(), instances[0], {
      event,
      disconnection_info: { reason: 'PRIMARY_INACTIVITY', initiated_by: 'CLIENT' },
    })

    expect(result).toMatchObject({ handled: true, status: 'disconnected' })
    expect(updates[0].status).toBe('disconnected')
    expect(updates[0].connection_state).toMatchObject({
      last_account_event: event,
      disconnection_reason: 'PRIMARY_INACTIVITY',
    })
    expect(broadcast).toHaveBeenCalledTimes(1)
  })

  it('reconnects the instance on ACCOUNT_RECONNECTED', async () => {
    const result = await processAccountUpdate(createClient(), instances[0], {
      event: 'ACCOUNT_RECONNECTED',
    })

    expect(result).toMatchObject({ handled: true, status: 'connected' })
    expect(updates[0].status).toBe('connected')
  })

  it('leaves the instance untouched for unrelated account events', async () => {
    const result = await processAccountUpdate(createClient(), instances[0], {
      event: 'ACCOUNT_VERIFIED',
    })

    expect(result).toEqual({ handled: false, event: 'ACCOUNT_VERIFIED' })
    expect(updates).toHaveLength(0)
  })
})
