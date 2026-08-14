import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { metaCreateCustomAudience, metaListCustomAudiences, setMetaWriteAuditSink } from '~/lib/meta-ads'

const LIVE_TENANT_ID = 'e18dda57-ec27-4c42-9dd1-f7222b8d9383'
const LIVE_AD_ACCOUNT_ID = '1520081329440494'

function loadLocalEnvFiles() {
  for (const relative of ['.env', 'server/.env']) {
    const path = resolve(process.cwd(), relative)
    if (!existsSync(path))
      continue
    const text = readFileSync(path, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#'))
        continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0)
        continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
        value = value.slice(1, -1)
      if (process.env[key] == null || process.env[key] === '')
        process.env[key] = value
    }
  }
}

loadLocalEnvFiles()

const hasLiveCreds = Boolean(
  process.env.SUPABASE_URL
  && process.env.SUPABASE_SERVICE_KEY
  && process.env.MARKETING_ENCRYPTION_SECRET,
)

describe.skipIf(!hasLiveCreds)('meta custom audience live Graph (one create)', () => {
  it('creates IM | Instagram | Engajamento | 30d with RETURN_EXISTING', async () => {
    setMetaWriteAuditSink(() => {})
    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
    const result = await metaCreateCustomAudience(
      { client: client as any },
      {
        tenantId: LIVE_TENANT_ID,
        confirmTenantId: LIVE_TENANT_ID,
        confirm: true,
        adAccountId: LIVE_AD_ACCOUNT_ID,
        name: 'IM | Instagram | Engajamento | 30d',
        description: 'Pessoas que interagiram com o Instagram do Instituto Movimente nos últimos 30 dias.',
        sourceType: 'INSTAGRAM',
        event: 'ENGAGED',
        retentionDays: 30,
        prefill: true,
        duplicateStrategy: 'RETURN_EXISTING',
        dryRun: false,
      },
    )

    expect((result as any).dryRun).toBe(false)
    expect((result as any).id).toBeTruthy()
    expect((result as any).name).toBe('IM | Instagram | Engajamento | 30d')
    expect(JSON.stringify(result)).not.toMatch(/EA[A-Za-z0-9]+/)

    const listed = await metaListCustomAudiences(
      { client: client as any },
      { tenantId: LIVE_TENANT_ID, adAccountId: LIVE_AD_ACCOUNT_ID },
    )
    const matches = (listed as { customAudiences?: Array<{ id: string, name: string, subtype?: string | null }> }).customAudiences?.filter(row => row.name === 'IM | Instagram | Engajamento | 30d') || []
    expect(matches.length).toBe(1)
    expect(matches[0].id).toBe((result as any).id)
  }, 60_000)
})
