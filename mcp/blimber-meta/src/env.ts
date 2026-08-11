import type { SupabaseClient } from '@supabase/supabase-js'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'

/**
 * Load repo-root .env when running the MCP as a child process (Cursor/Claude Desktop).
 * Does not override already-set env vars.
 */
export function loadRepoEnv() {
  const here = dirname(fileURLToPath(import.meta.url))
  const repoRoot = resolve(here, '../../..')
  loadDotenv({ path: resolve(repoRoot, '.env') })
  loadDotenv({ path: resolve(repoRoot, '.env.local'), override: false })
}

export function createServiceSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key
    = process.env.SUPABASE_SERVICE_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required for blimber-meta MCP',
    )
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
