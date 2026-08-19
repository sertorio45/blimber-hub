import process from 'node:process'

import { createError } from 'h3'
import { decryptSecret } from '~/server/utils/marketing'

/**
 * Current Google Ads REST major version.
 * Docs (auth + sunset timetable): use the latest released major (v25 as of Jul 2026).
 * v19 sunset Feb 11, 2026 — requests to sunset versions return 404 / fail.
 * @see https://developers.google.com/google-ads/api/docs/sunset-dates
 * @see https://developers.google.com/google-ads/api/rest/auth
 */
export const GOOGLE_ADS_API_VERSION = 'v25'

const PROFILE_FETCH_CONCURRENCY = 5

export function googleAdsApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path.slice(1) : path
  return `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/${normalized}`
}

export function normalizeGoogleCustomerId(value?: string | null): string {
  return String(value || '').replace(/-/g, '').trim()
}

/** Formats 10-digit customer IDs as XXX-XXX-XXXX for UI labels. */
export function formatGoogleAdsCustomerId(value?: string | null): string {
  const id = normalizeGoogleCustomerId(value)
  if (id.length !== 10 || !/^\d+$/.test(id))
    return id
  return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`
}

function fallbackAccountName(customerId: string): string {
  return `Conta ${formatGoogleAdsCustomerId(customerId)}`
}

/** Platform developer token (env) with legacy per-tenant encrypted fallback. */
export function resolveGoogleAdsDeveloperToken(config?: Record<string, any> | null): string | null {
  const fromEnv = (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim()
  if (fromEnv)
    return fromEnv
  return decryptSecret(config?.developer_token_enc)
}

export function googleOAuthClientCredentials() {
  const clientId
    = process.env.GOOGLE_CLIENT_ID
      || process.env.GOOGLE_OAUTH_CLIENT_ID
      || ''
  const clientSecret
    = process.env.GOOGLE_CLIENT_SECRET
      || process.env.GOOGLE_OAUTH_CLIENT_SECRET
      || ''
  return { clientId, clientSecret }
}

/**
 * Prefer a still-valid access token; otherwise refresh with platform OAuth
 * credentials (callback never stores client_id_enc in the tenant config).
 */
export async function getGoogleAccessToken(config: Record<string, any>): Promise<string | null> {
  const accessToken = decryptSecret(config.access_token_enc)
  const expiresAt = config.token_expires_at
    ? new Date(config.token_expires_at).getTime()
    : null
  const stillValid = Boolean(accessToken)
    && (!expiresAt || expiresAt > Date.now() + 60_000)

  if (stillValid && accessToken)
    return accessToken

  const refreshToken = decryptSecret(config.refresh_token_enc)
  const storedClientId = decryptSecret(config.client_id_enc)
  const storedClientSecret = decryptSecret(config.client_secret_enc)
  const { clientId: envClientId, clientSecret: envClientSecret } = googleOAuthClientCredentials()
  const clientId = storedClientId || envClientId
  const clientSecret = storedClientSecret || envClientSecret

  if (!refreshToken || !clientId || !clientSecret)
    return stillValid ? accessToken : null

  try {
    const tokenResponse = await $fetch<{ access_token?: string }>('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    })
    return tokenResponse?.access_token || accessToken || null
  }
  catch {
    return accessToken || null
  }
}

/**
 * Auth headers for Google Ads REST.
 * Intentionally omits `login-customer-id` — each tenant uses OAuth + selected
 * customer_id with direct access (no platform MCC / global manager header).
 */
function buildGoogleAdsHeaders(
  accessToken: string,
  developerToken: string,
): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  }
}

interface GoogleAdsErrorPayload {
  statusCode?: number
  status?: number
  message?: string
  data?: {
    error?: { message?: string, details?: unknown }
    message?: string
  }
}

/** Flatten Google Ads API error payloads into a single diagnostic string. */
function collectGoogleAdsErrorTexts(error: GoogleAdsErrorPayload | null | undefined): string {
  const topMessage
    = error?.data?.error?.message
      || error?.data?.message
      || error?.message
      || ''
  const details = error?.data?.error?.details

  const texts: string[] = []
  if (typeof topMessage === 'string' && topMessage.trim())
    texts.push(topMessage.trim())

  if (typeof details === 'string' && details.trim()) {
    texts.push(details.trim())
  }
  else if (Array.isArray(details)) {
    for (const detail of details) {
      const errors = detail?.errors || [detail]
      for (const entry of errors) {
        const message = entry?.message || entry?.errorCode || ''
        if (typeof message === 'string' && message.trim())
          texts.push(message.trim())
        else if (message && typeof message === 'object') {
          // e.g. { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" }
          texts.push(...Object.values(message).map(String).filter(Boolean))
        }
        const code = entry?.errorCode
        if (code && typeof code === 'object')
          texts.push(...Object.values(code).map(String).filter(Boolean))
      }
    }
  }

  return texts.join('; ')
}

export function extractGoogleAdsErrorMessage(error: GoogleAdsErrorPayload | null | undefined): string {
  const status = error?.statusCode || error?.status
  const raw = collectGoogleAdsErrorTexts(error)

  if (
    status === 404
    || /Not Found/i.test(raw)
    || /UNSUPPORTED_VERSION|API_VERSION|version has been sunset/i.test(raw)
  ) {
    return `Versão da API do Google Ads indisponível (${GOOGLE_ADS_API_VERSION}). Atualize a integração ou tente novamente mais tarde.`
  }

  if (/DEVELOPER_TOKEN_NOT_APPROVED|TEST_ACCOUNT|only approved for use with test accounts|not yet approved/i.test(raw)) {
    return 'Developer token do Google Ads sem aprovação. Solicite acesso Basic ou Standard no API Center do Google Ads.'
  }

  if (raw) {
    // Avoid dumping raw $fetch URL noise like: [GET] "https://...": 404 Not Found
    if (/^\[(GET|POST|PUT|PATCH|DELETE)\]\s+"/i.test(raw))
      return 'Falha ao consultar a API do Google Ads. Verifique a conexão da conta e o developer token.'
    return raw
  }

  return 'Falha ao consultar a API do Google Ads'
}

function isManagerOnlyAccessError(message: string): boolean {
  return /login.?customer.?id|CUSTOMER_NOT_ENABLED|USER_PERMISSION_DENIED|NOT_ADS_USER|authorization.?error|PERMISSION_DENIED/i.test(message)
    && /manager|login.?customer|acting.?user|client.?customer/i.test(message)
}

export function throwGoogleAdsConfigError(developerToken: string | null): never {
  if (!developerToken) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'Google Ads não está configurado no servidor (GOOGLE_ADS_DEVELOPER_TOKEN). Peça ao administrador da plataforma para definir o developer token no API Center do Google Ads.',
    })
  }
  throw createError({
    statusCode: 502,
    statusMessage: 'Falha na API do Google Ads',
  })
}

export type GoogleAdsAccountOption = {
  id: string
  name: string
  is_manager: boolean
  /** True when customer.descriptive_name was resolved via direct access. */
  has_name: boolean
}

export type GoogleAdsAccountListResult = {
  accounts: GoogleAdsAccountOption[]
  warning: string | null
}

type CustomerProfile = {
  id: string
  name: string
  isManager: boolean
  hasName: boolean
}

type ProfileAttempt = {
  profile: CustomerProfile | null
  errorMessage: string | null
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length)
    return []
  const results = new Array<R>(items.length)
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= items.length)
        return
      results[index] = await mapper(items[index])
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: poolSize }, () => worker()))
  return results
}

interface GoogleAdsSearchResult {
  customer?: Record<string, unknown>
  [key: string]: unknown
}

async function searchGoogleAds(
  customerId: string,
  accessToken: string,
  developerToken: string,
  query: string,
): Promise<{ results?: GoogleAdsSearchResult[], errorMessage: string | null }> {
  const headers = buildGoogleAdsHeaders(accessToken, developerToken)
  try {
    const response = await $fetch<{ results?: GoogleAdsSearchResult[] }>(
      googleAdsApiUrl(`customers/${customerId}/googleAds:search`),
      {
        method: 'POST',
        headers,
        body: { query },
      },
    )
    return { results: response?.results || [], errorMessage: null }
  }
  catch (error: unknown) {
    return { results: undefined, errorMessage: extractGoogleAdsErrorMessage(error as GoogleAdsErrorPayload) }
  }
}

async function fetchCustomerProfile(
  customerId: string,
  accessToken: string,
  developerToken: string,
): Promise<ProfileAttempt> {
  const { results, errorMessage } = await searchGoogleAds(
    customerId,
    accessToken,
    developerToken,
    'SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1',
  )

  if (!results) {
    return { profile: null, errorMessage }
  }

  const row = results[0]?.customer
  if (!row && !customerId)
    return { profile: null, errorMessage }

  const id = normalizeGoogleCustomerId(String(row?.id || customerId))
  const descriptiveName = String(row?.descriptiveName || '').trim()
  return {
    profile: {
      id,
      name: descriptiveName || fallbackAccountName(id),
      isManager: Boolean(row?.manager),
      hasName: Boolean(descriptiveName),
    },
    errorMessage: null,
  }
}

/**
 * Lists OAuth-accessible Google Ads customers and resolves descriptive names
 * via direct access only (no login-customer-id / MCC header).
 *
 * Limitation: client accounts that Google only allows to query through a
 * manager account will appear in listAccessibleCustomers but may lack names
 * and fail report GAQL — those setups are not supported without MCC.
 */
export async function listGoogleAdsAccounts(
  accessToken: string,
  developerToken: string,
): Promise<GoogleAdsAccountListResult> {
  const listHeaders = buildGoogleAdsHeaders(accessToken, developerToken)

  if (!developerToken?.trim()) {
    throwGoogleAdsConfigError(null)
  }

  let resourceNames: string[] = []
  try {
    const response = await $fetch<{ resourceNames?: string[] }>(
      googleAdsApiUrl('customers:listAccessibleCustomers'),
      {
        method: 'GET',
        headers: listHeaders,
      },
    )
    resourceNames = response.resourceNames || []
  }
  catch (error: unknown) {
    const err = error as GoogleAdsErrorPayload
    const message = extractGoogleAdsErrorMessage(err)
    const status = err?.statusCode || err?.status || 502
    if (status === 401 || /UNAUTHENTICATED|invalid.?authentication|access.?token/i.test(message)) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Sessão Google expirada. Desconecte e conecte novamente o Google Ads.',
      })
    }
    if (/DEVELOPER_TOKEN|developer.?token|PERMISSION_DENIED/i.test(message)) {
      throw createError({
        statusCode: 403,
        statusMessage:
          'Developer token do Google Ads inválido ou sem acesso. Verifique GOOGLE_ADS_DEVELOPER_TOKEN e se a API Google Ads está habilitada no Google Cloud.',
      })
    }
    if (status === 404) {
      throw createError({
        statusCode: 502,
        statusMessage: message,
      })
    }
    throw createError({
      statusCode: status >= 400 && status < 600 ? status : 502,
      statusMessage: message,
    })
  }

  const ids = resourceNames
    .map(name => normalizeGoogleCustomerId(name.split('/').pop() || name))
    .filter(Boolean)

  if (!ids.length)
    return { accounts: [], warning: null }

  const byId = new Map<string, GoogleAdsAccountOption>()
  const enrichmentErrors: string[] = []

  await mapWithConcurrency(ids, PROFILE_FETCH_CONCURRENCY, async (id) => {
    const direct = await fetchCustomerProfile(id, accessToken, developerToken)
    if (direct.profile) {
      byId.set(id, {
        id: direct.profile.id,
        name: direct.profile.name,
        is_manager: direct.profile.isManager,
        has_name: direct.profile.hasName,
      })
      return
    }
    if (direct.errorMessage)
      enrichmentErrors.push(direct.errorMessage)
  })

  for (const id of ids) {
    if (byId.has(id))
      continue
    byId.set(id, {
      id,
      name: fallbackAccountName(id),
      is_manager: false,
      has_name: false,
    })
  }

  const accounts = [...byId.values()].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    if (byName !== 0)
      return byName
    return a.id.localeCompare(b.id)
  })

  const unnamedCount = accounts.filter(a => !a.has_name).length
  let warning: string | null = null
  if (unnamedCount > 0) {
    const sample = enrichmentErrors.find(Boolean) || ''
    const managerOnly = enrichmentErrors.some(isManagerOnlyAccessError)
      || isManagerOnlyAccessError(sample)

    if (managerOnly || unnamedCount === accounts.length) {
      warning
        = 'Não foi possível obter o nome de algumas contas com acesso direto. '
          + 'Contas acessíveis apenas via conta gerente (MCC) não são suportadas neste fluxo — '
          + 'conecte um usuário Google com acesso direto à conta de anúncios.'
    }
    else {
      warning
        = `${unnamedCount} conta(s) sem nome descritivo. Confira o developer token e o acesso direto do usuário OAuth à conta.`
    }
  }

  return { accounts, warning }
}

export function googleAdsSearchHeaders(
  accessToken: string,
  developerToken: string,
) {
  return buildGoogleAdsHeaders(accessToken, developerToken)
}
