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

export function resolveGoogleAdsLoginCustomerId(config?: Record<string, any> | null): string | null {
  const fromConfig = normalizeGoogleCustomerId(config?.login_customer_id)
  if (fromConfig)
    return fromConfig
  const fromEnv = normalizeGoogleCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
  return fromEnv || null
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

function buildGoogleAdsHeaders(
  accessToken: string,
  developerToken: string,
  loginCustomerId?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  }
  const loginId = normalizeGoogleCustomerId(loginCustomerId)
  if (loginId)
    headers['login-customer-id'] = loginId
  return headers
}

function extractGoogleAdsErrorMessage(error: any): string {
  const status = error?.statusCode || error?.status
  const details = error?.data?.error?.details
    || error?.data?.error?.message
    || error?.data?.message
    || error?.message

  if (
    status === 404
    || /Not Found/i.test(String(details || ''))
    || /UNSUPPORTED_VERSION|API_VERSION|version has been sunset/i.test(String(details || ''))
  ) {
    return `Versão da API do Google Ads indisponível (${GOOGLE_ADS_API_VERSION}). Atualize a integração ou tente novamente mais tarde.`
  }

  if (typeof details === 'string') {
    // Avoid dumping raw $fetch URL noise like: [GET] "https://...": 404 Not Found
    if (/^\[(GET|POST|PUT|PATCH|DELETE)\]\s+"/i.test(details))
      return 'Falha ao consultar a API do Google Ads. Verifique a conexão da conta e o developer token.'
    return details
  }
  if (Array.isArray(details)) {
    const texts = details
      .flatMap((d: any) => d?.errors || [d])
      .map((e: any) => e?.message || e?.errorCode || '')
      .filter(Boolean)
    if (texts.length)
      return texts.join('; ')
  }
  return 'Falha ao consultar a API do Google Ads'
}

function isTestAccessLimitation(message: string): boolean {
  return /TEST_ACCOUNT|only approved for use with test accounts|developer token.*test|TEST_ACCESS|not yet approved/i.test(message)
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
  login_customer_id: string | null
  /** True when customer.descriptive_name (or customer_client) was resolved. */
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

async function searchGoogleAds(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string | null | undefined,
  query: string,
): Promise<{ results?: any[], errorMessage: string | null }> {
  const headers = buildGoogleAdsHeaders(accessToken, developerToken, loginCustomerId)
  try {
    const response = await $fetch<{ results?: any[] }>(
      googleAdsApiUrl(`customers/${customerId}/googleAds:search`),
      {
        method: 'POST',
        headers,
        body: { query },
      },
    )
    return { results: response?.results || [], errorMessage: null }
  }
  catch (error: any) {
    return { results: undefined, errorMessage: extractGoogleAdsErrorMessage(error) }
  }
}

async function fetchCustomerProfile(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId?: string | null,
): Promise<ProfileAttempt> {
  const { results, errorMessage } = await searchGoogleAds(
    customerId,
    accessToken,
    developerToken,
    loginCustomerId,
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
 * One GAQL against an MCC returns every linked client with descriptive_name —
 * avoids O(n) per-customer searches when a manager is available.
 */
async function fetchCustomerClientsUnderManager(
  managerId: string,
  accessToken: string,
  developerToken: string,
): Promise<{ clients: CustomerProfile[], errorMessage: string | null }> {
  const { results, errorMessage } = await searchGoogleAds(
    managerId,
    accessToken,
    developerToken,
    managerId,
    `SELECT
      customer_client.client_customer,
      customer_client.descriptive_name,
      customer_client.manager,
      customer_client.id,
      customer_client.status
    FROM customer_client
    WHERE customer_client.status != 'CANCELED'`,
  )

  if (!results) {
    return { clients: [], errorMessage }
  }

  const clients: CustomerProfile[] = []
  for (const row of results) {
    const client = row?.customerClient
    if (!client)
      continue
    const id = normalizeGoogleCustomerId(
      String(client.id || String(client.clientCustomer || '').split('/').pop() || ''),
    )
    if (!id)
      continue
    const descriptiveName = String(client.descriptiveName || '').trim()
    clients.push({
      id,
      name: descriptiveName || fallbackAccountName(id),
      isManager: Boolean(client.manager),
      hasName: Boolean(descriptiveName),
    })
  }

  return { clients, errorMessage: null }
}

/**
 * Lists OAuth-accessible Google Ads customers and resolves descriptive names.
 * When a client account requires an MCC, attaches the working login-customer-id.
 *
 * Enrichment strategy (keeps ~dozens of accounts in seconds, not O(n²)):
 * 1. Probe each ID with preferred MCC / direct access (concurrency 5)
 * 2. Bulk-pull names via customer_client on each confirmed manager
 * 3. Fill remaining gaps only against known managers (not every peer)
 */
export async function listGoogleAdsAccounts(
  accessToken: string,
  developerToken: string,
  preferredLoginCustomerId?: string | null,
): Promise<GoogleAdsAccountListResult> {
  const preferredLogin = preferredLoginCustomerId
    ? normalizeGoogleCustomerId(preferredLoginCustomerId)
    : null
  const listHeaders = buildGoogleAdsHeaders(
    accessToken,
    developerToken,
    preferredLogin,
  )

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
  catch (error: any) {
    const message = extractGoogleAdsErrorMessage(error)
    const status = error?.statusCode || error?.status || 502
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
  const accessibleIds = new Set(ids)

  if (!ids.length)
    return { accounts: [], warning: null }

  const byId = new Map<string, GoogleAdsAccountOption>()
  const enrichmentErrors: string[] = []

  const assign = (
    id: string,
    profile: CustomerProfile,
    loginCustomerId: string | null,
  ) => {
    const existing = byId.get(id)
    // Never overwrite a resolved descriptive name with a fallback.
    if (existing?.has_name && !profile.hasName)
      return

    byId.set(id, {
      id: profile.id,
      name: profile.name,
      is_manager: profile.isManager,
      login_customer_id: loginCustomerId || existing?.login_customer_id || null,
      has_name: Boolean(existing?.has_name || profile.hasName),
    })
  }

  // Phase 1: preferred MCC (if any), then direct access — bounded concurrency.
  await mapWithConcurrency(ids, PROFILE_FETCH_CONCURRENCY, async (id) => {
    if (preferredLogin) {
      const withPreferred = await fetchCustomerProfile(id, accessToken, developerToken, preferredLogin)
      if (withPreferred.profile) {
        assign(id, withPreferred.profile, preferredLogin)
        return
      }
      if (withPreferred.errorMessage)
        enrichmentErrors.push(withPreferred.errorMessage)
    }

    const direct = await fetchCustomerProfile(id, accessToken, developerToken, null)
    if (direct.profile) {
      assign(id, direct.profile, null)
      return
    }
    if (direct.errorMessage)
      enrichmentErrors.push(direct.errorMessage)
  })

  const managerIds = [
    ...new Set([
      ...(preferredLogin ? [preferredLogin] : []),
      ...[...byId.values()].filter(row => row.is_manager).map(row => row.id),
    ]),
  ]

  // Phase 2: bulk names from each MCC via customer_client (1 request per manager).
  await mapWithConcurrency(managerIds, PROFILE_FETCH_CONCURRENCY, async (managerId) => {
    const { clients, errorMessage } = await fetchCustomerClientsUnderManager(
      managerId,
      accessToken,
      developerToken,
    )
    if (errorMessage) {
      enrichmentErrors.push(errorMessage)
      return
    }
    for (const client of clients) {
      if (!accessibleIds.has(client.id))
        continue
      const loginId = client.isManager && client.id === managerId ? null : managerId
      assign(client.id, client, loginId)
    }
  })

  // Phase 3: still-pending IDs only against confirmed managers (not every peer).
  for (const managerId of managerIds) {
    const stillPending = ids.filter((id) => {
      const row = byId.get(id)
      return id !== managerId && (!row || !row.has_name)
    })
    if (!stillPending.length)
      break

    await mapWithConcurrency(stillPending, PROFILE_FETCH_CONCURRENCY, async (id) => {
      const attempt = await fetchCustomerProfile(id, accessToken, developerToken, managerId)
      if (attempt.profile) {
        assign(id, attempt.profile, managerId)
        return
      }
      if (attempt.errorMessage)
        enrichmentErrors.push(attempt.errorMessage)
    })
  }

  for (const id of ids) {
    if (byId.has(id))
      continue
    byId.set(id, {
      id,
      name: fallbackAccountName(id),
      is_manager: false,
      login_customer_id: preferredLogin,
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
    if (isTestAccessLimitation(sample) || enrichmentErrors.some(isTestAccessLimitation)) {
      warning
        = 'Algumas contas aparecem só com ID: o developer token em modo Test só consulta detalhes de contas de teste. '
          + 'Para ver o nome de contas de produção, use um token Basic/Standard no API Center. '
          + 'Opcional: defina GOOGLE_ADS_LOGIN_CUSTOMER_ID com o ID do MCC.'
    }
    else if (unnamedCount === accounts.length) {
      warning
        = 'Não foi possível obter o nome das contas. Confira o developer token e, se as contas forem de um MCC, '
          + 'defina GOOGLE_ADS_LOGIN_CUSTOMER_ID (login-customer-id do gerente).'
    }
    else {
      warning
        = `${unnamedCount} conta(s) sem nome descritivo. Se forem clientes de um MCC, configure GOOGLE_ADS_LOGIN_CUSTOMER_ID.`
    }
  }

  return { accounts, warning }
}

export function googleAdsSearchHeaders(
  accessToken: string,
  developerToken: string,
  loginCustomerId?: string | null,
) {
  return buildGoogleAdsHeaders(accessToken, developerToken, loginCustomerId)
}
