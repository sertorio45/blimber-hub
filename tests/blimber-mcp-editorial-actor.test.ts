import { describe, expect, it } from 'vitest'
import {
  mcpActorIsPlatformStaff,
  resolveMcpEditorialActor,
} from '../lib/blimber-mcp/marketing-editorial'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'
const ACTOR_ID = '22222222-2222-2222-2222-222222222222'

describe('mcpActorIsPlatformStaff', () => {
  it('treats Hub JWT staff (app_metadata.role admin) as platform staff', () => {
    expect(mcpActorIsPlatformStaff({ id: ACTOR_ID, app_metadata: { role: 'admin' } })).toBe(true)
    expect(mcpActorIsPlatformStaff({ id: ACTOR_ID, app_metadata: { role: 'funcionario' } })).toBe(true)
  })

  it('does not treat tenant cliente or user_metadata-only admin as platform staff', () => {
    expect(mcpActorIsPlatformStaff({ id: ACTOR_ID, app_metadata: { role: 'cliente' } })).toBe(false)
    expect(mcpActorIsPlatformStaff({
      id: ACTOR_ID,
      app_metadata: {},
      user_metadata: { role: 'admin' },
    })).toBe(false)
  })
})

describe('resolveMcpEditorialActor', () => {
  it('skips org membership for app_metadata admin', async () => {
    const client = {
      from: () => {
        throw new Error('membership must not be queried for platform staff')
      },
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: { id: ACTOR_ID, app_metadata: { role: 'admin' } } },
            error: null,
          }),
        },
      },
    }

    const actor = await resolveMcpEditorialActor(
      { client: client as any, actorUserId: ACTOR_ID },
      TENANT_ID,
    )
    expect(actor.isPlatformStaff).toBe(true)
    expect(actor.userId).toBe(ACTOR_ID)
  })
})
