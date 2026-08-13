import { createError, defineEventHandler, getQuery } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

import {
  decryptSecret,
  getCachedMarketingData,
  resolveMarketingTenantContext,
  setCachedMarketingData,
} from '~/server/utils/marketing'
import {
  fetchMetaOrganicReport,
  parseOrganicReportsQuery,
  resolveMetaPageAccessToken,
} from '~/server/utils/meta-organic-insights'
import {
  filterConnectedOrganicPlatforms,
  findAccountForPlatform,
} from '~/server/utils/organic-report-platforms'
import { syncSocialAccountsFromIntegrations } from '~/server/utils/social-accounts'
import type { OrganicReportsPayload } from '~/types/marketing-organic-reports'

const ORGANIC_REPORTS_CALC_VERSION = 'organic_v2'

function buildOrganicCacheKey(
  platform: string,
  period: OrganicReportsPayload['period'],
  accountIds: string[],
): string {
  return `organic:${platform}:${period.preset}:${period.meta_period}:${period.date_start || ''}:${period.date_end || ''}:${accountIds.join(',')}:${ORGANIC_REPORTS_CALC_VERSION}`
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { platform, period, forceRefresh } = parseOrganicReportsQuery(query as Record<string, unknown>)
  const { tenantId } = await resolveMarketingTenantContext(event, query.tenant_id as string | undefined)
  const client = await serverSupabaseServiceRole(event)

  const listAccounts = async () => {
    const { data, error } = await client
      .from('social_accounts')
      .select('id, platform, name, username, avatar_url, external_account_id, is_active, provider')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('platform')
      .order('name')

    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message })

    if (data?.length)
      return data

    await syncSocialAccountsFromIntegrations(client, tenantId)
    const { data: synced, error: syncedError } = await client
      .from('social_accounts')
      .select('id, platform, name, username, avatar_url, external_account_id, is_active, provider')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('platform')
      .order('name')

    if (syncedError)
      throw createError({ statusCode: 500, statusMessage: syncedError.message })

    return synced || []
  }

  const accounts = await listAccounts()
  const platforms = filterConnectedOrganicPlatforms(accounts)
  const accountIds = accounts.map(a => a.id)

  const cacheKey = buildOrganicCacheKey(platform, period, accountIds)

  if (!forceRefresh) {
    const cached = await getCachedMarketingData(client, tenantId, 'meta', cacheKey)
    if (cached)
      return { data: cached, cached: true }
  }

  const { data: metaIntegration } = await client
    .from('marketing_integrations')
    .select('config, is_active')
    .eq('tenant_id', tenantId)
    .eq('provider', 'meta')
    .eq('is_active', true)
    .maybeSingle()

  const metaConfig = metaIntegration?.config || {}
  const userAccessToken = decryptSecret(metaConfig.access_token_enc) || ''
  const storedPageAccessToken = decryptSecret(metaConfig.page_access_token_enc) || ''
  const configuredPageId = String(metaConfig.page_id || '')
  const apiVersion = metaConfig.api_version || process.env.META_GRAPH_VERSION || 'v20.0'

  async function resolveAccessTokenForAccount(externalAccountId: string): Promise<string> {
    if (!userAccessToken && !storedPageAccessToken)
      return ''
    return resolveMetaPageAccessToken({
      userAccessToken,
      storedPageAccessToken,
      configuredPageId,
      externalAccountId,
      apiVersion,
    })
  }

  const payload: OrganicReportsPayload = {
    platforms,
    accounts: accounts.map(a => ({
      id: a.id,
      platform: a.platform,
      name: a.name,
      username: a.username,
      avatar_url: a.avatar_url,
      external_account_id: a.external_account_id,
    })),
    period,
    facebook: null,
    instagram: null,
    linkedin: null,
  }

  const linkedinAccount = findAccountForPlatform(accounts, 'linkedin')
  if (linkedinAccount) {
    payload.linkedin = {
      connected: true,
      account: {
        id: linkedinAccount.id,
        external_account_id: linkedinAccount.external_account_id,
        name: linkedinAccount.name,
        username: linkedinAccount.username,
        avatar_url: linkedinAccount.avatar_url,
      },
      message: 'Relatórios orgânicos do LinkedIn em breve.',
    }
  }

  async function loadFacebook() {
    const account = findAccountForPlatform(accounts, 'facebook')
    if (!account)
      return null
    const accessToken = await resolveAccessTokenForAccount(account.external_account_id)
    if (!accessToken) {
      return {
        platform: 'facebook' as const,
        account: {
          id: account.id,
          external_account_id: account.external_account_id,
          name: account.name,
          username: account.username,
          avatar_url: account.avatar_url,
        },
        connected: false,
        metrics: {},
        series: [],
        meta_period: period.meta_period,
        error: 'Integração Meta sem token válido. Reconecte em Configurações → Integrações.',
      }
    }
    return fetchMetaOrganicReport({
      accessToken,
      apiVersion,
      externalAccountId: account.external_account_id,
      platform: 'facebook',
      account: {
        id: account.id,
        external_account_id: account.external_account_id,
        name: account.name,
        username: account.username,
        avatar_url: account.avatar_url,
      },
      period,
    })
  }

  async function loadInstagram() {
    const account = findAccountForPlatform(accounts, 'instagram')
    if (!account)
      return null
    const accessToken = await resolveAccessTokenForAccount(account.external_account_id)
    if (!accessToken) {
      return {
        platform: 'instagram' as const,
        account: {
          id: account.id,
          external_account_id: account.external_account_id,
          name: account.name,
          username: account.username,
          avatar_url: account.avatar_url,
        },
        connected: false,
        metrics: {},
        series: [],
        meta_period: period.meta_period,
        error: 'Integração Meta sem token válido. Reconecte em Configurações → Integrações.',
      }
    }
    return fetchMetaOrganicReport({
      accessToken,
      apiVersion,
      externalAccountId: account.external_account_id,
      platform: 'instagram',
      account: {
        id: account.id,
        external_account_id: account.external_account_id,
        name: account.name,
        username: account.username,
        avatar_url: account.avatar_url,
      },
      period,
    })
  }

  if (platform === 'all' || platform === 'facebook')
    payload.facebook = await loadFacebook()
  if (platform === 'all' || platform === 'instagram')
    payload.instagram = await loadInstagram()

  const hasApiError = Boolean(payload.facebook?.error || payload.instagram?.error)
  if (!hasApiError)
    await setCachedMarketingData(client, tenantId, 'meta', cacheKey, payload, 30)

  return { data: payload, cached: false }
})
