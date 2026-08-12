import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}))

describe('createBlimberServiceRoleClient', () => {
  const prevUrl = process.env.SUPABASE_URL
  const prevKey = process.env.SUPABASE_SERVICE_KEY
  const prevRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  const prevPublic = process.env.NUXT_PUBLIC_SUPABASE_URL

  afterEach(() => {
    if (prevUrl === undefined)
      delete process.env.SUPABASE_URL
    else
      process.env.SUPABASE_URL = prevUrl
    if (prevKey === undefined)
      delete process.env.SUPABASE_SERVICE_KEY
    else
      process.env.SUPABASE_SERVICE_KEY = prevKey
    if (prevRole === undefined)
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else
      process.env.SUPABASE_SERVICE_ROLE_KEY = prevRole
    if (prevPublic === undefined)
      delete process.env.NUXT_PUBLIC_SUPABASE_URL
    else
      process.env.NUXT_PUBLIC_SUPABASE_URL = prevPublic
    vi.clearAllMocks()
  })

  it('returns null without service env', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.NUXT_PUBLIC_SUPABASE_URL
    const { createBlimberServiceRoleClient } = await import('../server/utils/blimber-service-client')
    expect(createBlimberServiceRoleClient()).toBeNull()
  })

  it('passes global.fetch into createClient', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'service-role-key'
    const { createClient } = await import('@supabase/supabase-js')
    const { createBlimberServiceRoleClient } = await import('../server/utils/blimber-service-client')
    const client = createBlimberServiceRoleClient()
    expect(client).toBeTruthy()
    expect(createClient).toHaveBeenCalled()
    const [, key, opts] = (createClient as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!
    expect(key).toBe('service-role-key')
    expect(opts.auth).toMatchObject({ persistSession: false, autoRefreshToken: false })
    expect(typeof opts.global?.fetch).toBe('function')
  })
})
