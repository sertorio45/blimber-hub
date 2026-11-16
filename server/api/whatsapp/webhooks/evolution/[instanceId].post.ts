import { createError, getHeader, readBody } from 'h3'

import { processEvolutionWebhook } from '~/server/utils/whatsapp/webhook-processor'
import { loadInstanceWithIntegration } from '~/server/utils/whatsapp/instance-loader'

export default defineEventHandler(async (event) => {
  const instanceId = getRouterParam(event, 'instanceId')
  if (!instanceId)
    throw createError({ statusCode: 400, statusMessage: 'instanceId is required' })

  const { client, instance, integration } = await loadInstanceWithIntegration(event, instanceId)

  const body = await readBody<Record<string, unknown>>(event)

  const { data: logRow } = await client.from('whatsapp_webhook_log').insert({
    tenant_id: instance.tenant_id,
    instance_id: instanceId,
    provider: 'evolution',
    event_type: String(body.event || 'unknown'),
    payload: body,
    processed: false,
  }).select('id').single()

  const secret = integration?.webhook_secret
  const headerSecret = getHeader(event, 'x-webhook-secret') || getHeader(event, 'apikey')
  // When a secret is configured, require a matching header (Evolution sends x-webhook-secret).
  if (secret) {
    if (!headerSecret || headerSecret !== secret) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid webhook secret' })
    }
  }

  try {
    const result = await processEvolutionWebhook(client, instance, body, integration)
    if (logRow?.id) {
      await client
        .from('whatsapp_webhook_log')
        .update({ processed: true })
        .eq('id', logRow.id)
    }

    return { received: true, ...result }
  }
  catch (error: any) {
    if (logRow?.id) {
      await client
        .from('whatsapp_webhook_log')
        .update({ error: error?.message || 'Processing failed' })
        .eq('id', logRow.id)
    }

    return { received: true, handled: false, error: error?.message }
  }
})
