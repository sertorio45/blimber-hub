import type { BlimberMcpSupabaseLike } from '../types'
import { z } from 'zod'
import { COMMERCIAL_MODULE_SLUGS, LEGACY_MODULE_ALIASES, normalizeCommercialModuleSlug, resolveTenantModuleSlugs } from '../../../constants/modules'
import { BlimberMcpError } from '../errors'

const providers = ['meta', 'google_ads', 'google_analytics', 'linkedin', 'whatsapp'] as const
const BATCH_SIZE = 100
const MAX_SCAN = 500

export const listClientsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
  includeInactive: z.boolean().default(false),
  module: z.enum([...COMMERCIAL_MODULE_SLUGS, ...Object.keys(LEGACY_MODULE_ALIASES)] as [string, ...string[]]).optional(),
  integrationProvider: z.enum(providers).optional(),
  integrationStatus: z.enum(['active', 'ready', 'missing']).optional(),
}).refine(value => !value.integrationStatus || Boolean(value.integrationProvider), {
  message: 'integrationStatus exige integrationProvider',
})

interface TenantRow { id: string, name: string, slug: string, is_active: boolean | null }
interface ModuleRow { tenant_id: string, module_name: string, is_active: boolean }
interface IntegrationRow {
  tenant_id: string
  provider: string
  is_active: boolean
  config: Record<string, unknown> | null
}
interface WhatsAppInstanceRow { tenant_id: string, status: string }

function checked<T>(result: { data: T | null, error: { message?: string } | null }): T {
  if (result.error)
    throw new BlimberMcpError('QUERY_ERROR', 'Não foi possível listar clientes e integrações.', 500)
  return result.data as T
}

function integrationState(row: IntegrationRow) {
  const config = row.config || {}
  const hasToken = Boolean(config.access_token_enc || config.refresh_token_enc)
  const connected = Boolean(row.is_active && hasToken)
  const configured = row.provider === 'meta'
    ? Boolean(config.ad_account_id)
    : row.provider === 'google_ads'
      ? Boolean(config.customer_id)
      : row.provider === 'google_analytics'
        ? Boolean(config.property_id || config.analytics_account_id)
        : row.provider === 'linkedin'
          ? Boolean(config.organization_id)
          : false
  return { provider: row.provider, active: Boolean(row.is_active), connected, ready: connected && configured }
}

/** Administrative inventory. Only call through the globally authenticated MCP/API. */
export async function listClients(client: Pick<BlimberMcpSupabaseLike, 'from'>, rawArgs: unknown) {
  const args = listClientsSchema.parse(rawArgs)
  const requestedModule = normalizeCommercialModuleSlug(args.module)
  const clients: Array<{
    id: string
    name: string
    slug: string
    active: boolean
    activeModules: string[]
    integrations: Array<ReturnType<typeof integrationState>>
  }> = []
  let cursor = args.cursor
  let scanned = 0
  let exhausted = false

  while (clients.length < args.limit && scanned < MAX_SCAN && !exhausted) {
    const batchSize = Math.min(BATCH_SIZE, MAX_SCAN - scanned)
    let query = client.from('tenant')
      .select('id,name,slug,is_active')
      .order('id', { ascending: true })
      .limit(batchSize)
    if (cursor)
      query = query.gt('id', cursor)
    if (!args.includeInactive)
      query = query.or('is_active.is.null,is_active.eq.true')

    const rows = checked<TenantRow[]>(await query) || []
    if (!rows.length) {
      exhausted = true
      break
    }

    const ids = rows.map(row => row.id)
    const [modules, integrations, whatsappInstances] = await Promise.all([
      client.from('tenant_modules').select('tenant_id,module_name,is_active').in('tenant_id', ids).eq('is_active', true),
      client.from('marketing_integrations').select('tenant_id,provider,is_active,config').in('tenant_id', ids),
      client.from('whatsapp_instance').select('tenant_id,status').in('tenant_id', ids),
    ])
    const moduleRows = checked<ModuleRow[]>(modules) || []
    const integrationRows = checked<IntegrationRow[]>(integrations) || []
    const instanceRows = checked<WhatsAppInstanceRow[]>(whatsappInstances) || []

    const modulesByTenant = new Map<string, string[]>()
    for (const row of moduleRows)
      modulesByTenant.set(row.tenant_id, [...(modulesByTenant.get(row.tenant_id) || []), row.module_name])

    const integrationsByTenant = new Map<string, Array<ReturnType<typeof integrationState>>>()
    for (const row of integrationRows) {
      const list = integrationsByTenant.get(row.tenant_id) || []
      list.push(integrationState(row))
      integrationsByTenant.set(row.tenant_id, list)
    }
    for (const row of instanceRows) {
      const list = integrationsByTenant.get(row.tenant_id) || []
      let state = list.find(item => item.provider === 'whatsapp')
      if (!state) {
        state = { provider: 'whatsapp', active: false, connected: false, ready: false }
        list.push(state)
      }
      state.active = true
      state.connected ||= row.status === 'connected'
      state.ready = state.connected
      integrationsByTenant.set(row.tenant_id, list)
    }

    let consumed = 0
    for (const row of rows) {
      consumed++
      cursor = row.id
      scanned++
      const activeModules = resolveTenantModuleSlugs(modulesByTenant.get(row.id) || [])
      const states = integrationsByTenant.get(row.id) || []
      if (requestedModule && !activeModules.includes(requestedModule))
        continue
      if (args.integrationProvider) {
        const state = states.find(item => item.provider === args.integrationProvider)
        if (!args.integrationStatus && !state)
          continue
        if (args.integrationStatus === 'ready' && !state?.ready)
          continue
        if (args.integrationStatus === 'active' && !state?.active)
          continue
        if (args.integrationStatus === 'missing' && state?.connected)
          continue
      }
      clients.push({
        id: row.id,
        name: row.name,
        slug: row.slug,
        active: row.is_active !== false,
        activeModules,
        integrations: states.sort((a, b) => a.provider.localeCompare(b.provider)),
      })
      if (clients.length >= args.limit)
        break
    }
    if (rows.length < batchSize && consumed === rows.length)
      exhausted = true
  }

  return {
    clients,
    nextCursor: exhausted ? null : cursor || null,
    scanned,
    note: 'connected/ready refletem configuração armazenada, não teste de conexão em tempo real.',
  }
}
