import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import process from 'node:process'

import { requireSocialContext } from '~/server/utils/social-context'

const KEY_SEPARATOR = ':'

type TenantRole = 'admin' | 'funcionario' | 'cliente' | string | null

function getEncryptionKey() {
  const secret
    = process.env.MARKETING_ENCRYPTION_SECRET
      || process.env.DASHBOARD_ENCRYPTION_SECRET
      || process.env.SUPABASE_SERVICE_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret)
    throw new Error('MARKETING_ENCRYPTION_SECRET não configurado')
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(value: string) {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}${KEY_SEPARATOR}${tag.toString('base64')}${KEY_SEPARATOR}${encrypted.toString('base64')}`
}

export function decryptSecret(value?: string | null) {
  if (!value)
    return null

  const [ivB64, tagB64, encryptedB64] = value.split(KEY_SEPARATOR)
  if (!ivB64 || !tagB64 || !encryptedB64)
    return null

  const key = getEncryptionKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

export async function resolveMarketingTenantContext(event: any, requestedTenantId?: string) {
  const context = await requireSocialContext(
    event,
    'marketing.social.read',
    requestedTenantId,
  )
  return {
    user: context.user,
    tenantId: context.tenantId,
    role: context.role as TenantRole,
  }
}

export function maskSensitiveValue(value?: string | null) {
  if (!value)
    return null
  if (value.length <= 6)
    return '******'
  return `${value.slice(0, 2)}******${value.slice(-2)}`
}

export async function getCachedMarketingData(
  client: any,
  tenantId: string,
  provider: 'google' | 'meta' | 'all',
  cacheKey: string,
) {
  const { data } = await client
    .from('marketing_campaign_cache')
    .select('payload, expires_at')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  return data?.payload ?? null
}

export async function setCachedMarketingData(
  client: any,
  tenantId: string,
  provider: 'google' | 'meta' | 'all',
  cacheKey: string,
  payload: any,
  ttlMinutes = 30,
) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()
  await client
    .from('marketing_campaign_cache')
    .upsert(
      {
        tenant_id: tenantId,
        provider,
        cache_key: cacheKey,
        payload,
        expires_at: expiresAt,
      },
      { onConflict: 'tenant_id,provider,cache_key' },
    )
}

function fingerprintToken(enc?: string | null) {
  if (!enc)
    return '0'
  return createHash('sha256').update(enc).digest('hex').slice(0, 16)
}

export function buildMarketingOverviewCacheKey(
  source: string,
  googleTemplate: string,
  periodKey: string,
  metaAdsActiveOnly: boolean,
  integrationRows: Array<{ provider: string, config?: Record<string, any> | null, updated_at?: string | null }>,
  reportTemplates?: { meta?: string, analytics?: string },
) {
  const meta = integrationRows.find(r => r.provider === 'meta')
  const google = integrationRows.find(r => r.provider === 'google_ads' || r.provider === 'google')
  const analytics = integrationRows.find(r => r.provider === 'google_analytics')
  const metaEnc = meta?.config?.access_token_enc as string | undefined
  const googleEnc = google?.config?.access_token_enc as string | undefined
  const analyticsEnc = analytics?.config?.access_token_enc as string | undefined
  const metaPart = meta
    ? `m:${meta.updated_at || ''}:${meta.config?.ad_account_id || ''}:${fingerprintToken(metaEnc)}`
    : 'm:none'
  const googlePart = google
    ? `g:${google.updated_at || ''}:${google.config?.customer_id || ''}:${fingerprintToken(googleEnc)}`
    : 'g:none'
  const analyticsPart = analytics
    ? `a:${analytics.updated_at || ''}:${analytics.config?.property_id || analytics.config?.analytics_account_id || ''}:${fingerprintToken(analyticsEnc)}`
    : 'a:none'
  const ads = metaAdsActiveOnly ? 'ads1' : 'ads0'
  const tpl = `mt:${reportTemplates?.meta || 'overview'}:at:${reportTemplates?.analytics || 'overview'}`
  return `${source}:${googleTemplate}:${periodKey}:${ads}:${tpl}:${metaPart}:${googlePart}:${analyticsPart}`
}

export async function clearMarketingCampaignCacheForTenant(client: any, tenantId: string) {
  await client.from('marketing_campaign_cache').delete().eq('tenant_id', tenantId)
}
