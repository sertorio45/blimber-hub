import { serverSupabaseServiceRole } from '#supabase/server'
import { createError, getQuery, readBody } from 'h3'

import { encryptSecret } from '~/server/utils/marketing'
import {
  buildCloudWebhookUrl,
  buildEvolutionWebhookUrl,
  generateWebhookSecret,
  resolveWhatsAppTenantContext,
  sanitizeInstanceRow,
} from '~/server/utils/whatsapp/context'
import { WHATSAPP_CLOUD_API_ENABLED } from '~/constants/whatsapp'
import {
  evolutionCreateInstance,
  evolutionEnsureWebhook,
  getEvolutionConfigFromIntegration,
  resolveEvolutionRemoteInstance,
  syncEvolutionInstanceRecord,
} from '~/server/utils/whatsapp/evolution-client'
import {
  cloudApiGetPhoneNumber,
  cloudApiSetWebhookOverride,
  cloudApiSubscribeApp,
} from '~/server/utils/whatsapp/cloud-api-client'

interface CreateInstanceBody {
  tenant_id?: string
  name: string
  provider: 'evolution' | 'cloud_api'
  is_default?: boolean
  api_url?: string
  api_token?: string
  evolution_instance_name?: string
  link_existing?: boolean
  cloud_phone_id?: string
  cloud_business_id?: string
  cloud_access_token?: string
  cloud_app_secret?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateInstanceBody>(event)
  const query = getQuery(event)
  const { tenantId } = await resolveWhatsAppTenantContext(
    event,
    body.tenant_id || (query.tenant_id as string | undefined),
  )

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }

  if (!['evolution', 'cloud_api'].includes(body.provider)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid provider' })
  }

  if (body.provider === 'cloud_api' && !WHATSAPP_CLOUD_API_ENABLED) {
    throw createError({
      statusCode: 503,
      statusMessage: 'WhatsApp Cloud API oficial estará disponível em breve.',
    })
  }

  const linkExisting = body.provider === 'evolution' && Boolean(body.link_existing)
  const customEvolutionName = body.evolution_instance_name?.trim()

  if (linkExisting && !customEvolutionName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'evolution_instance_name is required when linking an existing instance',
    })
  }

  const client = serverSupabaseServiceRole(event)
  const webhookSecret = generateWebhookSecret()
  const evolutionInstanceName = linkExisting
    ? customEvolutionName!
    : `blimber_${tenantId.slice(0, 8)}_${Date.now()}`

  const { data: instance, error: instanceError } = await client
    .from('whatsapp_instance')
    .insert({
      tenant_id: tenantId,
      name: body.name.trim(),
      provider: body.provider,
      status: 'disconnected',
      is_default: Boolean(body.is_default),
      metadata: {
        evolution_instance_name: evolutionInstanceName,
        evolution_link_existing: linkExisting,
      },
    })
    .select('*')
    .single()

  if (instanceError || !instance) {
    throw createError({ statusCode: 400, statusMessage: instanceError?.message || 'Failed to create instance' })
  }

  const integrationPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    instance_id: instance.id,
    provider: body.provider,
    webhook_secret: webhookSecret,
    settings: {},
  }

  if (body.provider === 'evolution') {
    if (!body.api_url?.trim() || !body.api_token?.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'api_url and api_token are required for Evolution API' })
    }
    integrationPayload.api_url = body.api_url.trim()
    integrationPayload.api_token_encrypted = encryptSecret(body.api_token.trim())
  }
  else {
    if (!body.cloud_phone_id?.trim() || !body.cloud_access_token?.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'cloud_phone_id and cloud_access_token are required for Cloud API',
      })
    }
    // WABA id is required: it drives the webhook override and the CAPI business_messaging payload.
    if (!body.cloud_business_id?.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'cloud_business_id (WABA ID) é obrigatório para Cloud API',
      })
    }
    integrationPayload.cloud_phone_id = body.cloud_phone_id.trim()
    integrationPayload.cloud_business_id = body.cloud_business_id.trim()
    integrationPayload.cloud_access_token_encrypted = encryptSecret(body.cloud_access_token.trim())
    if (body.cloud_app_secret?.trim())
      integrationPayload.settings = { app_secret: body.cloud_app_secret.trim() }
  }

  const { data: integration, error: integrationError } = await client
    .from('whatsapp_integration')
    .insert(integrationPayload)
    .select('*')
    .single()

  if (integrationError) {
    await client.from('whatsapp_instance').delete().eq('id', instance.id)
    throw createError({ statusCode: 400, statusMessage: integrationError.message })
  }

  if (body.is_default) {
    await client
      .from('whatsapp_instance')
      .update({ is_default: false })
      .eq('tenant_id', tenantId)
      .neq('id', instance.id)
  }

  try {
    if (body.provider === 'evolution' && integration) {
      const webhookUrl = buildEvolutionWebhookUrl(event, instance.id)
      const evoConfig = getEvolutionConfigFromIntegration(integration, evolutionInstanceName)
      if (!evoConfig)
        throw new Error('Evolution API credentials missing')

      const evolutionCredentials = {
        baseUrl: evoConfig.baseUrl,
        apiToken: evoConfig.apiToken,
      }

      if (linkExisting) {
        const remote = await resolveEvolutionRemoteInstance(evolutionCredentials, evolutionInstanceName)
        await evolutionEnsureWebhook(evoConfig, webhookUrl, { webhookSecret })
        const mapped = await syncEvolutionInstanceRecord(client, instance.id, evoConfig)
        instance.status = mapped.status
        instance.phone_number = mapped.phoneNumber || remote.phoneNumber || null
        instance.qr_code = mapped.status === 'connected' ? null : instance.qr_code
      }
      else {
        await evolutionCreateInstance(
          { ...evoConfig, instanceName: evolutionInstanceName },
          webhookUrl,
          webhookSecret,
        )
        try {
          const mapped = await syncEvolutionInstanceRecord(client, instance.id, evoConfig)
          instance.status = mapped.status
          instance.phone_number = mapped.phoneNumber || null
        }
        catch {
          /* new instance may still be disconnected */
        }
      }
    }

    if (body.provider === 'cloud_api' && integration) {
      const cloudAccessToken = body.cloud_access_token!.trim()
      const phone = await cloudApiGetPhoneNumber({
        accessToken: cloudAccessToken,
        phoneNumberId: body.cloud_phone_id!.trim(),
      })

      // Subscribe first: Meta rejects an override on an unsubscribed WABA (error 100).
      const wabaId = body.cloud_business_id!.trim()
      await cloudApiSubscribeApp({ accessToken: cloudAccessToken, wabaId })
      await cloudApiSetWebhookOverride({
        accessToken: cloudAccessToken,
        wabaId,
        overrideCallbackUri: buildCloudWebhookUrl(event, instance.id),
        verifyToken: webhookSecret,
      })

      await client
        .from('whatsapp_instance')
        .update({
          phone_number: phone.display_phone_number || null,
          status: 'connected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', instance.id)
      instance.phone_number = phone.display_phone_number
      instance.status = 'connected'
    }
  }
  catch (providerError: any) {
    await client.from('whatsapp_integration').delete().eq('instance_id', instance.id)
    await client.from('whatsapp_instance').delete().eq('id', instance.id)
    throw createError({
      statusCode: 400,
      statusMessage: providerError?.data?.error?.error_user_msg
        || providerError?.data?.error?.message
        || providerError?.data?.message
        || providerError?.message
        || 'Provider connection failed',
    })
  }

  const { data: refreshedInstance } = await client
    .from('whatsapp_instance')
    .select('*')
    .eq('id', instance.id)
    .single()

  return {
    data: sanitizeInstanceRow(refreshedInstance || instance, integration),
    webhookUrl:
      body.provider === 'evolution'
        ? buildEvolutionWebhookUrl(event, instance.id)
        : buildCloudWebhookUrl(event, instance.id),
  }
})
