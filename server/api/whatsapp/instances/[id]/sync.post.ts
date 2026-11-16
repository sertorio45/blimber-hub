import { createError, getQuery, readBody } from 'h3'

import {
  buildEvolutionWebhookUrl,
  resolveWhatsAppTenantContext,
} from '~/server/utils/whatsapp/context'
import {
  evolutionEnsureWebhook,
  getEvolutionConfigFromIntegration,
  syncEvolutionInstanceRecord,
} from '~/server/utils/whatsapp/evolution-client'
import { syncEvolutionGroups } from '~/server/utils/whatsapp/group-sync'
import { getEvolutionInstanceName, loadInstanceWithIntegration } from '~/server/utils/whatsapp/instance-loader'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const query = getQuery(event)
  const body = await readBody<{ tenant_id?: string, sync_groups?: boolean }>(event).catch(() => ({} as any))
  const { tenantId } = await resolveWhatsAppTenantContext(
    event,
    body?.tenant_id || (query.tenant_id as string | undefined),
  )
  const { client, instance, integration } = await loadInstanceWithIntegration(event, id)

  if (instance.tenant_id !== tenantId)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  if (instance.provider !== 'evolution')
    throw createError({ statusCode: 400, statusMessage: 'Sync is only available for Evolution API' })

  if (!integration)
    throw createError({ statusCode: 400, statusMessage: 'Integration not configured' })

  const evoConfig = getEvolutionConfigFromIntegration(integration, getEvolutionInstanceName(instance))
  if (!evoConfig)
    throw createError({ statusCode: 400, statusMessage: 'Evolution API credentials missing' })

  const webhookUrl = buildEvolutionWebhookUrl(event, id)
  const shouldSyncGroups = body?.sync_groups !== false

  try {
    const webhookResult = await evolutionEnsureWebhook(evoConfig, webhookUrl, {
      webhookSecret: integration.webhook_secret,
    })
    const mapped = await syncEvolutionInstanceRecord(client, id, evoConfig, {
      currentQrCode: instance.qr_code,
    })

    let groups: { synced: number, total: number } | null = null
    if (shouldSyncGroups && mapped.status === 'connected') {
      try {
        groups = await syncEvolutionGroups(client, {
          tenantId,
          instanceId: id,
          evoConfig,
        })
      }
      catch (err: any) {
        console.warn('[WhatsApp] Group sync failed:', err?.message || err)
        groups = { synced: 0, total: 0 }
      }
    }

    return {
      success: true,
      webhookUrl,
      webhookSkipped: webhookResult.skipped,
      webhookEvents: webhookResult.events || null,
      groups,
      data: {
        status: mapped.status,
        phoneNumber: mapped.phoneNumber || instance.phone_number,
      },
    }
  }
  catch (error: any) {
    throw createError({
      statusCode: 400,
      statusMessage: error?.data?.message || error?.message || 'Failed to sync instance',
    })
  }
})
