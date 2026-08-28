import process from 'node:process'

import { createError, getQuery, readRawBody } from 'h3'

import { processCloudWebhook } from '~/server/utils/whatsapp/webhook-processor'
import { verifyCloudWebhookSignature } from '~/server/utils/whatsapp/cloud-api-client'
import { loadInstanceWithIntegration } from '~/server/utils/whatsapp/instance-loader'

export default defineEventHandler(async (event) => {
  const instanceId = getRouterParam(event, 'instanceId')
  if (!instanceId)
    throw createError({ statusCode: 400, statusMessage: 'instanceId is required' })

  const query = getQuery(event)

  // Meta webhook verification (GET-like params on POST setup)
  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token']) {
    const { integration } = await loadInstanceWithIntegration(event, instanceId)
    const verifyToken = integration?.webhook_secret
    if (verifyToken && query['hub.verify_token'] === verifyToken) {
      return query['hub.challenge']
    }
    throw createError({ statusCode: 403, statusMessage: 'Invalid verify token' })
  }

  const { client, instance, integration } = await loadInstanceWithIntegration(event, instanceId)
  const rawBody = await readRawBody(event, 'utf8')
  const signature = getHeader(event, 'x-hub-signature-256')

  // Payloads are signed with the Blimber app secret; the per-instance value is only
  // an override for tenants onboarded under a different Meta app.
  const appSecret = (integration?.settings?.app_secret as string | undefined)
    || process.env.META_APP_SECRET
  if (appSecret && rawBody && !verifyCloudWebhookSignature(rawBody, signature, appSecret)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  const body = rawBody ? JSON.parse(rawBody) : {}

  await client.from('whatsapp_webhook_log').insert({
    tenant_id: instance.tenant_id,
    instance_id: instanceId,
    provider: 'cloud_api',
    event_type: String(body.object || 'whatsapp'),
    payload: body,
    processed: false,
  })

  try {
    const result = await processCloudWebhook(client, instance, body)
    return { received: true, ...result }
  }
  catch (error: any) {
    return { received: true, handled: false, error: error?.message }
  }
})
