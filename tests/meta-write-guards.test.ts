import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MetaAdsToolError,
  assertAdAccountOwnership,
  assertBudgetIncreaseAllowed,
  assertBulkItemLimit,
  assertCampaignBudgetWithinLimit,
  assertConfirmActive,
  assertConfirmDelete,
  assertMetaPageCreativeReady,
  assertWriteConfirmation,
  buildMetaWriteReadiness,
  getMetaGptBulkMax,
  getMetaWriteLimits,
  hasGrantedMetaScope,
  issueBulkDeletePreviewToken,
  assertBulkDeletePreviewToken,
  logMetaWriteAudit,
  resolveDryRun,
  sanitizeMetaWriteAuditPayload,
  setMetaWriteAuditSink,
  withDryRun,
} from '~/lib/meta-ads'

describe('meta write guards (etapa 0)', () => {
  afterEach(() => {
    setMetaWriteAuditSink(null)
    vi.unstubAllEnvs()
  })

  it('assertWriteConfirmation accepts matching tenant + confirm true', () => {
    expect(() => assertWriteConfirmation({
      tenantId: 't1',
      confirmTenantId: 't1',
      confirm: true,
    })).not.toThrow()
  })

  it('assertWriteConfirmation rejects confirmTenantId mismatch', () => {
    try {
      assertWriteConfirmation({
        tenantId: 't1',
        confirmTenantId: 'other',
        confirm: true,
      })
      expect.unreachable()
    }
    catch (error) {
      expect(error).toBeInstanceOf(MetaAdsToolError)
      expect((error as MetaAdsToolError).code).toBe('CONFIRM_TENANT_MISMATCH')
    }
  })

  it('assertWriteConfirmation rejects missing confirm', () => {
    try {
      assertWriteConfirmation({
        tenantId: 't1',
        confirmTenantId: 't1',
        confirm: false,
      })
      expect.unreachable()
    }
    catch (error) {
      expect((error as MetaAdsToolError).code).toBe('CONFIRM_REQUIRED')
    }
  })

  it('assertAdAccountOwnership accepts matching act_ prefix variants', () => {
    expect(assertAdAccountOwnership({
      objectAccountId: 'act_999',
      tenantAdAccountId: '999',
    })).toBe('999')
  })

  it('assertAdAccountOwnership throws 403 on mismatch', () => {
    try {
      assertAdAccountOwnership({
        objectAccountId: '111',
        tenantAdAccountId: '222',
        code: 'CAMPAIGN_TENANT_MISMATCH',
      })
      expect.unreachable()
    }
    catch (error) {
      expect(error).toBeInstanceOf(MetaAdsToolError)
      expect((error as MetaAdsToolError).code).toBe('CAMPAIGN_TENANT_MISMATCH')
      expect((error as MetaAdsToolError).statusCode).toBe(403)
    }
  })

  it('assertAdAccountOwnership skips when object account is missing', () => {
    expect(assertAdAccountOwnership({
      objectAccountId: null,
      tenantAdAccountId: '999',
    })).toBeNull()
  })

  it('assertBulkItemLimit enforces META_GPT_BULK_MAX', () => {
    vi.stubEnv('META_GPT_BULK_MAX', '3')
    expect(getMetaGptBulkMax()).toBe(3)
    expect(() => assertBulkItemLimit(3)).not.toThrow()
    expect(() => assertBulkItemLimit(4)).toThrow(/Máximo de 3/)
  })

  it('assertConfirmDelete requires literal true', () => {
    expect(() => assertConfirmDelete(true)).not.toThrow()
    try {
      assertConfirmDelete(false)
      expect.unreachable()
    }
    catch (error) {
      expect((error as MetaAdsToolError).code).toBe('CONFIRM_DELETE_REQUIRED')
    }
  })

  it('bulk delete previewToken issues and validates TTL payload', () => {
    process.env.MARKETING_ENCRYPTION_SECRET = process.env.MARKETING_ENCRYPTION_SECRET
      || 'test-marketing-encryption-secret-for-mcp'
    const issued = issueBulkDeletePreviewToken({
      tenantId: 'tenant-1',
      adAccountId: '555',
      level: 'ad',
      ids: ['b', 'a'],
      deleteMode: 'DELETED',
    })
    expect(issued.previewToken).toMatch(/^\d+\.[a-f0-9]{64}$/)
    expect(() => assertBulkDeletePreviewToken({
      previewToken: issued.previewToken,
      tenantId: 'tenant-1',
      adAccountId: 'act_555',
      level: 'ad',
      ids: ['a', 'b'],
      deleteMode: 'DELETED',
    })).not.toThrow()
    try {
      assertBulkDeletePreviewToken({
        previewToken: issued.previewToken,
        tenantId: 'tenant-1',
        adAccountId: '555',
        level: 'ad',
        ids: ['a', 'c'],
        deleteMode: 'DELETED',
      })
      expect.unreachable()
    }
    catch (error) {
      expect((error as MetaAdsToolError).code).toBe('PREVIEW_TOKEN_MISMATCH')
    }
  })

  it('getMetaWriteLimits includes bulkPreviewTtlMs', () => {
    expect(getMetaWriteLimits().bulkPreviewTtlMs).toBeGreaterThan(0)
  })
  it('assertCampaignBudgetWithinLimit enforces daily XOR and ceiling', () => {
    vi.stubEnv('META_GPT_BUDGET_DAILY_MAX_CENTS', '5000')
    expect(() => assertCampaignBudgetWithinLimit({ dailyBudgetCents: 5000 })).not.toThrow()
    expect(() => assertCampaignBudgetWithinLimit({ dailyBudgetCents: 5001 })).toThrow(/BUDGET|teto|5000/)
    try {
      assertCampaignBudgetWithinLimit({ dailyBudgetCents: 100, lifetimeBudgetCents: 100 })
      expect.unreachable()
    }
    catch (error) {
      expect((error as MetaAdsToolError).code).toBe('BUDGET_XOR_REQUIRED')
    }
  })

  it('assertBudgetIncreaseAllowed requires flag above percent ceiling', () => {
    vi.stubEnv('META_GPT_BUDGET_INCREASE_MAX_PERCENT', '50')
    expect(() => assertBudgetIncreaseAllowed({
      previousCents: 10_000,
      nextCents: 15_000,
    })).not.toThrow()
    expect(() => assertBudgetIncreaseAllowed({
      previousCents: 10_000,
      nextCents: 8_000,
    })).not.toThrow()
    try {
      assertBudgetIncreaseAllowed({
        previousCents: 10_000,
        nextCents: 16_000,
      })
      expect.unreachable()
    }
    catch (error) {
      expect((error as MetaAdsToolError).code).toBe('CONFIRM_BUDGET_INCREASE_REQUIRED')
    }
    expect(() => assertBudgetIncreaseAllowed({
      previousCents: 10_000,
      nextCents: 16_000,
      confirmBudgetIncrease: true,
    })).not.toThrow()
  })

  it('assertConfirmActive requires confirmActive for ACTIVE', () => {
    expect(() => assertConfirmActive({ status: 'PAUSED' })).not.toThrow()
    expect(() => assertConfirmActive({ status: 'ACTIVE', confirmActive: true })).not.toThrow()
    try {
      assertConfirmActive({ status: 'ACTIVE' })
      expect.unreachable()
    }
    catch (error) {
      expect((error as MetaAdsToolError).code).toBe('CONFIRM_ACTIVE_REQUIRED')
    }
  })

  it('assertMetaPageCreativeReady requires page_id and page token', () => {
    expect(assertMetaPageCreativeReady({
      pageId: 'page_1',
      pageAccessToken: 'ptok',
    })).toBe('page_1')
    try {
      assertMetaPageCreativeReady({ pageId: null, pageAccessToken: 'ptok' })
      expect.unreachable()
    }
    catch (error) {
      expect((error as MetaAdsToolError).code).toBe('META_PAGE_ID_REQUIRED')
    }
    try {
      assertMetaPageCreativeReady({ pageId: 'page_1', pageAccessToken: null })
      expect.unreachable()
    }
    catch (error) {
      expect((error as MetaAdsToolError).code).toBe('META_PAGE_TOKEN_REQUIRED')
    }
  })

  it('getMetaWriteLimits returns defaults', () => {
    const limits = getMetaWriteLimits()
    expect(limits.bulkMax).toBe(20)
    expect(limits.budgetDailyMaxCents).toBe(500_000)
    expect(limits.budgetIncreaseMaxPercent).toBe(50)
    expect(limits.writesPerMinute).toBe(30)
  })

  it('resolveDryRun uses default when undefined', () => {
    expect(resolveDryRun(undefined, false)).toBe(false)
    expect(resolveDryRun(undefined, true)).toBe(true)
    expect(resolveDryRun(true, false)).toBe(true)
    expect(resolveDryRun(false, true)).toBe(false)
  })

  it('withDryRun skips execute when dryRun is true', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const result = await withDryRun(
      true,
      { method: 'POST', path: '/x', body: { status: 'PAUSED' } },
      execute,
    )
    expect(execute).not.toHaveBeenCalled()
    expect(result.dryRun).toBe(true)
    expect(result.preview?.wouldMutate).toBe(true)
    expect(result.preview?.body).toEqual({ status: 'PAUSED' })
  })

  it('withDryRun runs execute when dryRun is false', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const result = await withDryRun(false, { method: 'POST', path: '/x' }, execute)
    expect(execute).toHaveBeenCalledOnce()
    expect(result.dryRun).toBe(false)
    expect(result.result).toEqual({ ok: true })
  })

  it('sanitizeMetaWriteAuditPayload strips tokens', () => {
    const sanitized = sanitizeMetaWriteAuditPayload({
      status: 'PAUSED',
      access_token: 'secret',
      nested: { page_access_token: 'x', name: 'ok' },
    }) as Record<string, unknown>
    expect(sanitized.status).toBe('PAUSED')
    expect(sanitized).not.toHaveProperty('access_token')
    expect((sanitized.nested as any).name).toBe('ok')
    expect(sanitized.nested).not.toHaveProperty('page_access_token')
  })

  it('logMetaWriteAudit emits structured sink without tokens and skips DB on dryRun', async () => {
    const records: unknown[] = []
    setMetaWriteAuditSink((r) => {
      records.push(r)
    })

    const insert = vi.fn()
    const client = {
      from: () => ({ insert }),
    }

    await logMetaWriteAudit(
      {
        tenantId: 'tenant-1',
        action: 'meta.gpt.campaign.status.preview',
        entityType: 'meta_campaign',
        entityId: 'cmp_1',
        dryRun: true,
        before: { status: 'ACTIVE' },
        after: { status: 'PAUSED', access_token: 'leak' },
      },
      client as any,
    )

    expect(records).toHaveLength(1)
    const record = records[0] as any
    expect(record.source).toBe('gpt-meta')
    expect(record.dryRun).toBe(true)
    expect(JSON.stringify(record)).not.toContain('leak')
    expect(insert).not.toHaveBeenCalled()
  })

  it('logMetaWriteAudit persists to audit_events when not dryRun', async () => {
    setMetaWriteAuditSink(() => {})
    const insert = vi.fn(async () => ({ error: null }))
    const client = {
      from: (table: string) => {
        expect(table).toBe('audit_events')
        return { insert }
      },
    }

    await logMetaWriteAudit(
      {
        tenantId: 'tenant-1',
        action: 'meta.gpt.campaign.status',
        entityType: 'meta_campaign',
        entityId: 'cmp_1',
        dryRun: false,
        after: { status: 'PAUSED' },
      },
      client as any,
    )

    expect(insert).toHaveBeenCalledOnce()
    const payload = insert.mock.calls[0]![0]
    expect(payload.tenant_id).toBe('tenant-1')
    expect(payload.actor_id).toBeNull()
    expect(payload.action).toBe('meta.gpt.campaign.status')
    expect(payload.after_data.source).toBe('gpt-meta')
  })

  it('hasGrantedMetaScope parses array and string scopes', () => {
    expect(hasGrantedMetaScope(['ads_management', 'ads_read'], 'ads_management')).toBe(true)
    expect(hasGrantedMetaScope('ads_read,ads_management', 'ads_management')).toBe(true)
    expect(hasGrantedMetaScope('ads_read', 'ads_management')).toBe(false)
  })

  it('buildMetaWriteReadiness reports ads_management and page token', () => {
    const ready = buildMetaWriteReadiness({
      hasAccessToken: true,
      hasPageToken: true,
      grantedScopes: ['ads_management'],
    })
    expect(ready.ads_management).toBe(true)
    expect(ready.has_page_token).toBe(true)
    expect(ready.scopes_unknown).toBe(false)

    const unknown = buildMetaWriteReadiness({
      hasAccessToken: true,
      hasPageToken: false,
      grantedScopes: null,
    })
    expect(unknown.scopes_unknown).toBe(true)
    expect(unknown.ads_management).toBe(true)
    expect(unknown.has_page_token).toBe(false)
  })
})
