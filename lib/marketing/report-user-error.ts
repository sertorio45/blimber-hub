/**
 * Map provider / fetch failures to short Portuguese copy.
 * Never surface Graph/Google raw payloads in the UI.
 */

const FALLBACK = 'Não foi possível carregar os relatórios. Tente novamente.'

function extractRawMessage(error: unknown): string {
  if (!error)
    return ''
  if (typeof error === 'string')
    return error.trim()

  const record = error as {
    data?: { statusMessage?: string, message?: string, error?: { message?: string } }
    statusMessage?: string
    message?: string
    statusCode?: number
  }

  const nested = record.data?.statusMessage
    || record.data?.message
    || record.data?.error?.message
    || record.statusMessage
    || record.message
    || ''

  return String(nested).trim()
}

function looksLikeProviderDump(raw: string): boolean {
  return /error_subcode|OAuthException|invalid_grant|invalid_token|www\.facebook\.com|#\d{3}\b|REQUEST_ERROR|PERMISSION_DENIED|UNAUTHENTICATED/i.test(raw)
    || /\{[\s\S]*"error"/.test(raw)
    || raw.length > 220
}

export function toUserFacingReportError(error: unknown): string {
  const raw = extractRawMessage(error)
  if (!raw)
    return FALLBACK

  const lower = raw.toLowerCase()

  if (looksLikeProviderDump(raw) || lower.includes('oauth') || lower.includes('access token') || lower.includes('invalid_token'))
    return 'A conexão com a plataforma expirou ou está incompleta. Reconecte em Integrações.'

  if (lower.includes('rate') || lower.includes('too many') || lower.includes('quota') || lower.includes('resource_exhausted'))
    return 'A plataforma limitou as consultas. Tente novamente em alguns minutos.'

  if (lower.includes('network') || lower.includes('fetch failed') || lower.includes('timeout') || lower.includes('econnreset'))
    return 'Falha de rede ao consultar os dados. Tente novamente.'

  if (/[áéíóúãõç]/i.test(raw) || raw.startsWith('Não ') || raw.startsWith('Selecione'))
    return raw.slice(0, 200)

  return FALLBACK
}
