import type { MetaDatePreset, MetaGraphFetch } from './types'

import process from 'node:process'
import { MetaAdsToolError } from './types'

export function normalizeMetaAdAccountId(raw: string) {
  return String(raw || '').replace(/^act_/i, '').trim()
}

export function actPath(adAccountId: string) {
  const id = normalizeMetaAdAccountId(adAccountId)
  if (!id)
    throw new MetaAdsToolError('AD_ACCOUNT_REQUIRED', 'adAccountId é obrigatório')
  return `act_${id}`
}

export function resolveMetaGraphVersion(explicit?: string | null) {
  return String(explicit || process.env.META_GRAPH_VERSION || 'v20.0').replace(/^\/*/, '')
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

/** Default fetch used outside Nuxt ($fetch). Never logs the access token. */
export const defaultMetaGraphFetch: MetaGraphFetch = async (url, init = {}) => {
  const method = (init.method || 'GET').toUpperCase()
  // Meta Marketing API prefers query/form fields over JSON bodies for status updates.
  const mergedQuery: Record<string, string | number | undefined> = { ...(init.query || {}) }
  if (init.body && method !== 'GET' && method !== 'HEAD') {
    for (const [key, value] of Object.entries(init.body)) {
      if (value === undefined || value === null)
        continue
      mergedQuery[key] = typeof value === 'string' || typeof value === 'number'
        ? value
        : JSON.stringify(value)
    }
  }
  const fullUrl = `${url}${toQueryString(mergedQuery)}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  const response = await fetch(fullUrl, { method, headers })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message
      = payload?.error?.message
        || payload?.message
        || `Meta Graph error ${response.status}`
    throw new MetaAdsToolError('META_GRAPH_ERROR', message, response.status >= 500 ? 502 : response.status, {
      type: payload?.error?.type,
      code: payload?.error?.code,
      fbtrace_id: payload?.error?.fbtrace_id,
    })
  }
  return payload
}

export function metaGraphUrl(apiVersion: string, path: string) {
  const version = resolveMetaGraphVersion(apiVersion)
  const clean = path.startsWith('/') ? path : `/${path}`
  return `https://graph.facebook.com/${version}${clean}`
}
