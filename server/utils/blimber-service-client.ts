import process from 'node:process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function resolveServiceUrl(): string {
  return (
    process.env.SUPABASE_URL
    || process.env.NUXT_PUBLIC_SUPABASE_URL
    || ''
  ).trim()
}

function resolveServiceKey(): string {
  return (
    process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || ''
  ).trim()
}

function resolveFetch(): typeof fetch | undefined {
  const impl = globalThis.fetch
  return typeof impl === 'function' ? impl.bind(globalThis) : undefined
}

/**
 * Dedicated service-role client for GPT/MCP writes (same pattern as admin /
 * tenant-team). Passes `global.fetch` so PostgREST and Auth Admin do not crash
 * with "Cannot read properties of undefined (reading 'fetch')" on Vercel.
 */
export function createBlimberServiceRoleClient(): SupabaseClient | null {
  const url = resolveServiceUrl()
  const key = resolveServiceKey()
  if (!url || !key)
    return null

  const fetchImpl = resolveFetch()
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  })
}
