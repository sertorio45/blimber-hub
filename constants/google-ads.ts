/**
 * Shared Google Ads platform messages (client + server).
 * Platform developer token lives in GOOGLE_ADS_DEVELOPER_TOKEN — never expose its value.
 */

/** Official Google Ads API Center (apply for Basic / Standard access). */
export const GOOGLE_ADS_API_CENTER_URL = 'https://ads.google.com/aw/apicenter'

/**
 * Shown when the platform developer token is still at Test access level
 * and the API rejects a non-test (production) account.
 */
export const GOOGLE_ADS_TEST_TOKEN_USER_MESSAGE
  = 'O token da plataforma Google Ads está em modo teste. Contas reais exigem acesso Basic ou Standard no API Center.'

/** Warning when listing accounts under Test token (IDs only / no names). */
export const GOOGLE_ADS_TEST_TOKEN_ACCOUNTS_WARNING
  = 'O token da plataforma Google Ads está em modo teste: contas de produção podem aparecer só com ID, '
    + 'e relatórios de contas reais falham até a aprovação Basic ou Standard no API Center.'

/** Raw API strings / codes that indicate Test-level developer token. */
export function isGoogleAdsTestAccessLimitation(message: string): boolean {
  return /TEST_ACCOUNT|only approved for use with test accounts|developer token.*test|TEST_ACCESS|not yet approved|DEVELOPER_TOKEN_NOT_APPROVED|modo teste|Basic ou Standard/i.test(
    message,
  )
}

export function isGoogleAdsTestTokenUserMessage(message?: string | null): boolean {
  if (!message)
    return false
  return isGoogleAdsTestAccessLimitation(message)
}
