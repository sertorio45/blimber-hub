import { createHmac, timingSafeEqual } from 'node:crypto'
import { MetaAdsToolError } from './types'
import { normalizeMetaAdAccountId } from './graph'
import { getMetaGptBulkPreviewTtlMs } from './write-limits'

export type BulkDeleteLevel = 'campaign' | 'adset' | 'ad'

function getBulkDeletePreviewSecret(): string {
  const secret = process.env.MARKETING_ENCRYPTION_SECRET || process.env.BLIMBER_MCP_API_KEY
  if (!secret) {
    throw new MetaAdsToolError(
      'PREVIEW_TOKEN_SECRET_MISSING',
      'Configure MARKETING_ENCRYPTION_SECRET (ou BLIMBER_MCP_API_KEY) para emitir previewToken de bulk delete.',
      503,
    )
  }
  return secret
}

/** Deduplicated trimmed IDs preserving first-seen order. */
export function normalizeBulkDeleteIds(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of ids) {
    const id = String(raw || '').trim()
    if (!id || seen.has(id))
      continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Canonical payload for HMAC (IDs sorted for stable signature). */
export function buildBulkDeletePreviewPayload(params: {
  tenantId: string
  adAccountId: string
  level: BulkDeleteLevel
  ids: string[]
  deleteMode: 'DELETED' | 'ARCHIVED'
  expiresAtMs: number
}): string {
  const sortedIds = [...params.ids].sort()
  return [
    params.tenantId,
    normalizeMetaAdAccountId(params.adAccountId),
    params.level,
    params.deleteMode,
    sortedIds.join(','),
    String(params.expiresAtMs),
  ].join('|')
}

function signPayload(payload: string): string {
  return createHmac('sha256', getBulkDeletePreviewSecret()).update(payload).digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ba.length !== bb.length || ba.length === 0)
      return false
    return timingSafeEqual(ba, bb)
  }
  catch {
    return false
  }
}

export interface BulkDeletePreviewTokenIssued {
  previewToken: string
  expiresAt: string
  expiresAtMs: number
}

/**
 * Issues HMAC previewToken with TTL (META_GPT_BULK_PREVIEW_TTL_MS).
 * Format: `{expiresAtMs}.{hexSignature}`
 */
export function issueBulkDeletePreviewToken(params: {
  tenantId: string
  adAccountId: string
  level: BulkDeleteLevel
  ids: string[]
  deleteMode: 'DELETED' | 'ARCHIVED'
}): BulkDeletePreviewTokenIssued {
  const expiresAtMs = Date.now() + getMetaGptBulkPreviewTtlMs()
  const payload = buildBulkDeletePreviewPayload({ ...params, expiresAtMs })
  const sig = signPayload(payload)
  return {
    previewToken: `${expiresAtMs}.${sig}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
  }
}

/**
 * Validates previewToken matches tenant/account/level/ids/deleteMode and is not expired.
 */
export function assertBulkDeletePreviewToken(params: {
  previewToken: string
  tenantId: string
  adAccountId: string
  level: BulkDeleteLevel
  ids: string[]
  deleteMode: 'DELETED' | 'ARCHIVED'
}): void {
  const token = String(params.previewToken || '').trim()
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) {
    throw new MetaAdsToolError(
      'PREVIEW_TOKEN_INVALID',
      'previewToken inválido. Chame meta_preview_bulk_delete e use o token retornado.',
      400,
    )
  }
  const expiresAtMs = Number(token.slice(0, dot))
  const sig = token.slice(dot + 1)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < 1 || !/^[a-f0-9]{64}$/i.test(sig)) {
    throw new MetaAdsToolError(
      'PREVIEW_TOKEN_INVALID',
      'previewToken inválido. Chame meta_preview_bulk_delete e use o token retornado.',
      400,
    )
  }
  if (Date.now() > expiresAtMs) {
    throw new MetaAdsToolError(
      'PREVIEW_TOKEN_EXPIRED',
      'previewToken expirado. Refaça meta_preview_bulk_delete e peça confirmação novamente.',
      400,
      { expiresAt: new Date(expiresAtMs).toISOString() },
    )
  }

  const payload = buildBulkDeletePreviewPayload({
    tenantId: params.tenantId,
    adAccountId: params.adAccountId,
    level: params.level,
    ids: params.ids,
    deleteMode: params.deleteMode,
    expiresAtMs,
  })
  const expected = signPayload(payload)
  if (!safeEqualHex(sig.toLowerCase(), expected.toLowerCase())) {
    throw new MetaAdsToolError(
      'PREVIEW_TOKEN_MISMATCH',
      'previewToken não corresponde aos IDs/level/tenant desta exclusão. Refaça o preview com a mesma lista.',
      400,
    )
  }
}
