import process from 'node:process'

import { serverSupabaseServiceRole } from '#supabase/server'
import { createError, getQuery, readRawBody } from 'h3'

import { findInstanceByWabaId, processAccountUpdate } from '~/server/utils/whatsapp/account-events'
import { verifyCloudWebhookSignature } from '~/server/utils/whatsapp/cloud-api-client'
import { processCloudWebhook } from '~/server/utils/whatsapp/webhook-processor'

/**
 * App-level Meta callback. Message webhooks are routed per-instance through the
 * subscription override, but account management events (`account_update`) always land
 * here, where the WABA id in `entry.id` is the only routing key available.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token']) {
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN
    if (verifyToken && query['hub.verify_token'] === verifyToken)
      return query['hub.challenge']
    throw createError({ statusCode: 403, statusMessage: 'Invalid verify token' })
  }

  const rawBody = await readRawBody(event, 'utf8')
  const signature = getHeader(event, 'x-hub-signature-256')
  const appSecret = process.env.META_APP_SECRET

  if (appSecret && rawBody && !verifyCloudWebhookSignature(rawBody, signature, appSecret))
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })

  const body = rawBody ? JSON.parse(rawBody) : {}
  const client = serverSupabaseServiceRole(event)
  const entries = Array.isArray(body.entry) ? body.entry : []

  let handled = 0
  let unmatched = 0

  for (const entry of entries) {
    const wabaId = entry?.id ? String(entry.id) : ''
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    if (!wabaId || !changes.length)
      continue

    const resolved = await findInstanceByWabaId(client, wabaId)
    if (!resolved) {
      unmatched += 1
      continue
    }

    const { instance } = resolved

    await client.from('whatsapp_webhook_log').insert({
      tenant_id: instance.tenant_id,
      instance_id: instance.id,
      provider: 'cloud_api',
      event_type: String(body.object || 'whatsapp'),
      payload: { object: body.object, entry: [entry] },
      processed: false,
    })

    const accountChanges = changes.filter((change: any) => change?.field === 'account_update')
    const otherChanges = changes.filter((change: any) => change?.field !== 'account_update')

    for (const change of accountChanges) {
      const result = await processAccountUpdate(client, instance, change?.value || {})
      if (result.handled)
        handled += 1
    }

    // Safety net: if a field ever escapes the per-WABA override, still process it.
    if (otherChanges.length) {
      try {
        await processCloudWebhook(client, instance, {
          object: body.object,
          entry: [{ ...entry, changes: otherChanges }],
        })
        handled += 1
      }
      catch {
        // Meta retries on non-2xx; swallowing keeps one bad change from blocking the batch.
      }
    }
  }

  return { received: true, handled, unmatched }
})
