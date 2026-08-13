import type { MetaDatePreset, MetaGraphFetch } from './types'

import process from 'node:process'
import { MetaAdsToolError } from './types'
import { sanitizeMetaWriteAuditPayload } from './write-audit'

export function normalizeMetaAdAccountId(raw: string) {
  return String(raw || '').replace(/^act_/i, '').trim()
}

export function actPath(adAccountId: string) {
  const id = normalizeMetaAdAccountId(adAccountId)
  if (!id)
    throw new MetaAdsToolError('AD_ACCOUNT_REQUIRED', 'adAccountId é obrigatório')
  return `act_${id}`
}

/**
 * Resolve Marketing / Ads Graph API version.
 * Order: explicit (e.g. config.api_version) → META_ADS_GRAPH_VERSION → META_GRAPH_VERSION → v25.0
 * WhatsApp Cloud API keeps its own hardcoded version and must not use this helper.
 */
export function resolveMetaGraphVersion(explicit?: string | null) {
  return String(
    explicit
    || process.env.META_ADS_GRAPH_VERSION
    || process.env.META_GRAPH_VERSION
    || 'v25.0',
  ).replace(/^\/*/, '')
}

export function buildMetaDateQuery(
  datePreset: MetaDatePreset | string,
  dateStart?: string,
  dateEnd?: string,
): Record<string, string> {
  const preset = String(datePreset || 'last_7d')
  if (preset === 'custom') {
    const start = String(dateStart || '').trim()
    const end = String(dateEnd || '').trim()
    const iso = /^\d{4}-\d{2}-\d{2}$/
    if (!iso.test(start) || !iso.test(end) || start > end) {
      throw new MetaAdsToolError(
        'INVALID_DATE_RANGE',
        'Para datePreset=custom, informe dateStart e dateEnd válidos (YYYY-MM-DD)',
      )
    }
    return {
      time_range: JSON.stringify({ since: start, until: end }),
    }
  }
  return { date_preset: preset }
}

/**
 * Encode a body field for Meta Graph form/query POST.
 * Booleans → 0/1 (Marketing API create examples use is_adset_budget_sharing_enabled=0).
 * Objects/arrays → JSON string. Skip undefined/null (never send "undefined").
 */
export function encodeMetaGraphBodyValue(value: unknown): string | number | undefined {
  if (value === undefined || value === null)
    return undefined
  if (typeof value === 'string' || typeof value === 'number')
    return value
  if (typeof value === 'boolean')
    return value ? 1 : 0
  return JSON.stringify(value)
}

function toQueryString(query?: Record<string, string | number | undefined>) {
  if (!query)
    return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '')
      continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Fields Meta returns inside `error` — expose all that help debug Invalid parameter (100). */
export interface MetaGraphErrorFields {
  message: string
  type?: string | null
  code?: number | string | null
  error_subcode?: number | string | null
  error_user_title?: string | null
  error_user_msg?: string | null
  fbtrace_id?: string | null
  is_transient?: boolean | null
}

export function extractMetaGraphErrorFields(payload: unknown, httpStatus?: number): MetaGraphErrorFields {
  const root = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {}
  const err = (root.error && typeof root.error === 'object')
    ? root.error as Record<string, unknown>
    : root

  const message
    = (typeof err.message === 'string' && err.message)
      || (typeof root.message === 'string' && root.message)
      || (httpStatus ? `Meta Graph error ${httpStatus}` : 'Meta Graph error')

  return {
    message,
    type: err.type != null ? String(err.type) : null,
    code: err.code != null ? err.code as number | string : null,
    error_subcode: err.error_subcode != null ? err.error_subcode as number | string : null,
    error_user_title: typeof err.error_user_title === 'string' ? err.error_user_title : null,
    error_user_msg: typeof err.error_user_msg === 'string' ? err.error_user_msg : null,
    fbtrace_id: typeof err.fbtrace_id === 'string' ? err.fbtrace_id : null,
    is_transient: typeof err.is_transient === 'boolean' ? err.is_transient : null,
  }
}

/**
 * Re-throw META_GRAPH_ERROR with sanitized request payload attached for writes.
 * Non-graph errors pass through unchanged.
 */
export function enrichMetaGraphWriteError(
  error: unknown,
  requestPayload?: Record<string, unknown> | null,
): never {
  if (!(error instanceof MetaAdsToolError) || error.code !== 'META_GRAPH_ERROR')
    throw error

  const previous = (error.details && typeof error.details === 'object')
    ? error.details as Record<string, unknown>
    : {}

  throw new MetaAdsToolError(
    error.code,
    error.message,
    error.statusCode,
    {
      ...previous,
      request_payload: requestPayload == null
        ? null
        : sanitizeMetaWriteAuditPayload(requestPayload),
    },
  )
}

/** Default fetch used outside Nuxt ($fetch). Never logs the access token. */
export const defaultMetaGraphFetch: MetaGraphFetch = async (url, init = {}) => {
  const method = (init.method || 'GET').toUpperCase()
  // Meta Marketing API prefers query/form fields over JSON bodies for status updates.
  const mergedQuery: Record<string, string | number | undefined> = { ...(init.query || {}) }
  if (init.body && method !== 'GET' && method !== 'HEAD') {
    for (const [key, value] of Object.entries(init.body)) {
      const encoded = encodeMetaGraphBodyValue(value)
      if (encoded === undefined)
        continue
      mergedQuery[key] = encoded
    }
  }
  const fullUrl = `${url}${toQueryString(mergedQuery)}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  const response = await fetch(fullUrl, { method, headers })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const fields = extractMetaGraphErrorFields(payload, response.status)
    throw new MetaAdsToolError(
      'META_GRAPH_ERROR',
      fields.message,
      response.status >= 500 ? 502 : response.status,
      fields,
    )
  }
  return payload
}

export function metaGraphUrl(apiVersion: string, path: string) {
  const version = resolveMetaGraphVersion(apiVersion)
  const clean = path.startsWith('/') ? path : `/${path}`
  return `https://graph.facebook.com/${version}${clean}`
}
