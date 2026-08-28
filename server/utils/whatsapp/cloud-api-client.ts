import { createHmac } from 'node:crypto'
import process from 'node:process'

import { decryptSecret } from '~/server/utils/marketing'

export interface CloudApiClientConfig {
  accessToken: string
  phoneNumberId: string
  apiVersion?: string
}

const DEFAULT_API_VERSION = 'v21.0'

export function resolveCloudApiVersion(version?: string): string {
  return version || process.env.META_GRAPH_VERSION || DEFAULT_API_VERSION
}

function graphUrl(path: string, version?: string): string {
  return `https://graph.facebook.com/${resolveCloudApiVersion(version)}${path}`
}

/**
 * Meta recommends appsecret_proof on every call made with a customer token:
 * without it a leaked token is usable by anyone who holds it.
 */
function appSecretProof(accessToken: string): string | undefined {
  const secret = process.env.META_APP_SECRET
  if (!secret)
    return undefined
  return createHmac('sha256', secret).update(accessToken).digest('hex')
}

function graphRequest<T>(
  path: string,
  options: {
    accessToken: string
    apiVersion?: string
    method?: 'GET' | 'POST'
    query?: Record<string, string | undefined>
    body?: Record<string, unknown>
  },
): Promise<T> {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined)
      query[key] = value
  }

  const proof = appSecretProof(options.accessToken)
  if (proof)
    query.appsecret_proof = proof

  return $fetch<T>(graphUrl(path, options.apiVersion), {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    query: Object.keys(query).length ? query : undefined,
    body: options.body,
  })
}

export interface CloudApiPhoneNumber {
  id: string
  display_phone_number?: string
  verified_name?: string
  /** Present on Coexistence numbers: true when the number also runs the WhatsApp Business app. */
  is_on_biz_app?: boolean
  /** CLOUD_API once the number is usable by Cloud API. */
  platform_type?: string
}

export async function cloudApiGetPhoneNumber(config: CloudApiClientConfig) {
  return graphRequest<CloudApiPhoneNumber>(`/${config.phoneNumberId}`, {
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type' },
  })
}

export async function cloudApiSendText(
  config: CloudApiClientConfig,
  payload: { to: string, text: string },
) {
  return graphRequest(`/${config.phoneNumberId}/messages`, {
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      to: payload.to.replace(/\D/g, ''),
      type: 'text',
      text: { body: payload.text },
    },
  })
}

/**
 * Subscribes the app to a WABA. Must run before any webhook override: Meta rejects
 * an override on an unsubscribed WABA with error 100 ("Before override the current
 * callback uri").
 */
export async function cloudApiSubscribeApp(
  config: { accessToken: string, apiVersion?: string, wabaId: string },
) {
  return graphRequest(`/${config.wabaId}/subscribed_apps`, {
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    method: 'POST',
  })
}

/**
 * Routes this WABA's message-path webhooks to our per-instance endpoint instead of
 * the app-level callback, which is what makes multi-tenant routing work.
 */
export async function cloudApiSetWebhookOverride(
  config: {
    accessToken: string
    apiVersion?: string
    wabaId: string
    overrideCallbackUri: string
    verifyToken: string
  },
) {
  return graphRequest(`/${config.wabaId}/subscribed_apps`, {
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    method: 'POST',
    body: {
      override_callback_uri: config.overrideCallbackUri,
      verify_token: config.verifyToken,
    },
  })
}

/**
 * Registers a business phone number for Cloud API. Skip this on Coexistence
 * onboarding: the number is already registered and the call fails.
 */
export async function cloudApiRegisterPhoneNumber(
  config: CloudApiClientConfig & { pin: string },
) {
  return graphRequest(`/${config.phoneNumberId}/register`, {
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    method: 'POST',
    body: { messaging_product: 'whatsapp', pin: config.pin },
  })
}

export async function cloudApiListPhoneNumbers(
  config: { accessToken: string, apiVersion?: string, wabaId: string },
) {
  return graphRequest<{ data?: CloudApiPhoneNumber[] }>(`/${config.wabaId}/phone_numbers`, {
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type' },
  })
}

/**
 * Trades the Embedded Signup authorization code for a Business Integration System
 * User token. Codes are single-use and short-lived, so a retry after a timeout fails.
 * No appsecret_proof here — there is no token yet.
 */
export async function cloudApiExchangeSignupCode(
  code: string,
  apiVersion?: string,
): Promise<{ access_token: string, expires_in?: number }> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret)
    throw new Error('META_APP_ID/META_APP_SECRET não configurados')

  return $fetch(graphUrl('/oauth/access_token', apiVersion), {
    query: { client_id: appId, client_secret: appSecret, code },
  })
}

export interface CloudApiTokenDebug {
  data?: {
    expires_at?: number
    granular_scopes?: { scope: string, target_ids?: string[] }[]
    scopes?: string[]
  }
}

/**
 * Ground truth for which WABAs the customer actually granted. Needed when the
 * Embedded Signup postMessage never arrives or omits the WABA id.
 */
export async function cloudApiDebugToken(
  inputToken: string,
  apiVersion?: string,
): Promise<CloudApiTokenDebug> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret)
    throw new Error('META_APP_ID/META_APP_SECRET não configurados')

  return $fetch(graphUrl('/debug_token', apiVersion), {
    query: { input_token: inputToken, access_token: `${appId}|${appSecret}` },
  })
}

export function extractWabaIdsFromDebug(debug: CloudApiTokenDebug): string[] {
  const ids = new Set<string>()
  for (const scope of debug.data?.granular_scopes || []) {
    if (!scope.scope.startsWith('whatsapp_business_'))
      continue
    for (const target of scope.target_ids || [])
      ids.add(String(target))
  }
  return [...ids]
}

export function getCloudApiConfigFromIntegration(
  integration: Record<string, any>,
): CloudApiClientConfig | null {
  const accessToken = decryptSecret(integration.cloud_access_token_encrypted)
  const phoneNumberId = integration.cloud_phone_id as string | undefined
  if (!accessToken || !phoneNumberId)
    return null

  return { accessToken, phoneNumberId }
}

export function verifyCloudWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  appSecret: string,
): boolean {
  if (!signature || !appSecret)
    return false

  const expected = `sha256=${createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')}`

  return signature === expected
}
