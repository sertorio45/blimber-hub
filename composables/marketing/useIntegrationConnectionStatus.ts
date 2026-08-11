import type { MarketingProvider } from '~/types/marketing'

export type IntegrationConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'needs_setup'
  | 'expired'
  | 'error'

export interface IntegrationRowLike {
  provider?: string
  has_key?: boolean
  can_publish?: boolean
  google_ads_needs_account?: boolean
  google_analytics_needs_property?: boolean
  config?: Record<string, unknown> | null
}

const STATUS_LABELS: Record<IntegrationConnectionStatus, string> = {
  disconnected: 'Não conectado',
  connected: 'Conectado',
  needs_setup: 'Configuração pendente',
  expired: 'Expirado',
  error: 'Erro',
}

export function integrationStatusLabel(status: IntegrationConnectionStatus): string {
  return STATUS_LABELS[status]
}

function isTokenExpired(config?: Record<string, unknown> | null): boolean {
  const raw = config?.token_expires_at
  if (!raw || typeof raw !== 'string')
    return false
  const expiresAt = Date.parse(raw)
  if (Number.isNaN(expiresAt))
    return false
  return expiresAt <= Date.now()
}

/**
 * Derives a client-facing connection status from a marketing_integrations row.
 */
export function resolveIntegrationConnectionStatus(
  provider: MarketingProvider,
  row: IntegrationRowLike | undefined | null,
): IntegrationConnectionStatus {
  if (!row?.has_key)
    return 'disconnected'

  if (isTokenExpired(row.config))
    return 'expired'

  if (provider === 'google_ads' && row.google_ads_needs_account)
    return 'needs_setup'

  if (provider === 'google_analytics' && row.google_analytics_needs_property)
    return 'needs_setup'

  if (provider === 'meta' && !row.can_publish)
    return 'needs_setup'

  if (provider === 'linkedin') {
    const organizationId = row.config?.organization_id
    if (!organizationId)
      return 'needs_setup'
  }

  return 'connected'
}
