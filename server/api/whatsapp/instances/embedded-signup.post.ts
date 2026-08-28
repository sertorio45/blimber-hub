import { serverSupabaseServiceRole } from '#supabase/server'
import { createError, readBody } from 'h3'

import { WHATSAPP_CLOUD_API_ENABLED } from '~/constants/whatsapp'
import { encryptSecret } from '~/server/utils/marketing'
import {
  cloudApiDebugToken,
  cloudApiExchangeSignupCode,
  cloudApiGetPhoneNumber,
  cloudApiListPhoneNumbers,
  cloudApiRegisterPhoneNumber,
  cloudApiSetWebhookOverride,
  cloudApiSubscribeApp,
  extractWabaIdsFromDebug,
} from '~/server/utils/whatsapp/cloud-api-client'
import {
  buildCloudWebhookUrl,
  generateWebhookSecret,
  resolveWhatsAppTenantContext,
  sanitizeInstanceRow,
} from '~/server/utils/whatsapp/context'

interface EmbeddedSignupBody {
  tenant_id?: string
  code?: string
  waba_id?: string
  phone_number_id?: string
  coexistence?: boolean
  name?: string
  is_default?: boolean
  /** Two-step PIN, only used when registering a brand new number. */
  pin?: string
}

function graphErrorMessage(error: any, fallback: string): string {
  return error?.data?.error?.error_user_msg
    || error?.data?.error?.message
    || error?.message
    || fallback
}

export default defineEventHandler(async (event) => {
  if (!WHATSAPP_CLOUD_API_ENABLED)
    throw createError({ statusCode: 503, statusMessage: 'WhatsApp Cloud API indisponível.' })

  const body = await readBody<EmbeddedSignupBody>(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, body.tenant_id)

  const code = body.code?.trim()
  if (!code)
    throw createError({ statusCode: 400, statusMessage: 'Código de autorização ausente' })

  // Single-use, short-lived code: a retry after a timeout always fails.
  let accessToken: string
  try {
    const tokenResponse = await cloudApiExchangeSignupCode(code)
    accessToken = tokenResponse?.access_token
    if (!accessToken)
      throw new Error('Resposta da Meta sem access_token')
  }
  catch (error: any) {
    throw createError({
      statusCode: 400,
      statusMessage: graphErrorMessage(error, 'Não foi possível concluir a autorização com a Meta'),
    })
  }

  // debug_token is the source of truth: the popup often omits the WABA on Coexistence.
  let wabaId = body.waba_id?.trim() || ''
  try {
    const debug = await cloudApiDebugToken(accessToken)
    const grantedWabaIds = extractWabaIdsFromDebug(debug)
    if (!wabaId)
      wabaId = grantedWabaIds[0] || ''
    else if (grantedWabaIds.length && !grantedWabaIds.includes(wabaId))
      wabaId = grantedWabaIds[0]
  }
  catch {
    // Non-fatal: fall back to whatever the popup reported.
  }

  if (!wabaId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A Meta não retornou a conta do WhatsApp Business. Refaça a conexão.',
    })
  }

  let phoneNumberId = body.phone_number_id?.trim() || ''
  if (!phoneNumberId) {
    try {
      const numbers = await cloudApiListPhoneNumbers({ accessToken, wabaId })
      phoneNumberId = numbers?.data?.[0]?.id ? String(numbers.data[0].id) : ''
    }
    catch (error: any) {
      throw createError({ statusCode: 400, statusMessage: graphErrorMessage(error, 'Falha ao listar números do WhatsApp') })
    }
  }

  if (!phoneNumberId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Nenhum número encontrado nessa conta do WhatsApp Business.',
    })
  }

  let phone
  try {
    phone = await cloudApiGetPhoneNumber({ accessToken, phoneNumberId })
  }
  catch (error: any) {
    throw createError({ statusCode: 400, statusMessage: graphErrorMessage(error, 'Falha ao ler o número do WhatsApp') })
  }

  const client = serverSupabaseServiceRole(event)

  const { data: duplicate } = await client
    .from('whatsapp_integration')
    .select('instance_id')
    .eq('cloud_phone_id', phoneNumberId)
    .maybeSingle()

  if (duplicate?.instance_id) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Esse número já está conectado a uma instância no Blimber.',
    })
  }

  // Meta reports Coexistence on the number itself; the popup flag is only a hint.
  const isCoexistence = Boolean(phone.is_on_biz_app) || Boolean(body.coexistence)
  const webhookSecret = generateWebhookSecret()
  const instanceName = body.name?.trim()
    || phone.verified_name
    || phone.display_phone_number
    || 'WhatsApp oficial'

  const { data: instance, error: instanceError } = await client
    .from('whatsapp_instance')
    .insert({
      tenant_id: tenantId,
      name: instanceName,
      provider: 'cloud_api',
      status: 'disconnected',
      is_default: Boolean(body.is_default),
      phone_number: phone.display_phone_number || null,
      metadata: {
        onboarding: 'embedded_signup',
        is_on_biz_app: Boolean(phone.is_on_biz_app),
        platform_type: phone.platform_type || null,
      },
    })
    .select('*')
    .single()

  if (instanceError || !instance)
    throw createError({ statusCode: 400, statusMessage: instanceError?.message || 'Falha ao criar instância' })

  const { data: integration, error: integrationError } = await client
    .from('whatsapp_integration')
    .insert({
      tenant_id: tenantId,
      instance_id: instance.id,
      provider: 'cloud_api',
      webhook_secret: webhookSecret,
      settings: {},
      cloud_phone_id: phoneNumberId,
      cloud_business_id: wabaId,
      cloud_access_token_encrypted: encryptSecret(accessToken),
    })
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
    // Subscribe before overriding, otherwise Meta answers with error 100.
    await cloudApiSubscribeApp({ accessToken, wabaId })
    await cloudApiSetWebhookOverride({
      accessToken,
      wabaId,
      overrideCallbackUri: buildCloudWebhookUrl(event, instance.id),
      verifyToken: webhookSecret,
    })

    // Coexistence numbers are already registered; registering again fails.
    if (!isCoexistence && body.pin?.trim()) {
      await cloudApiRegisterPhoneNumber({
        accessToken,
        phoneNumberId,
        pin: body.pin.trim(),
      })
    }

    await client
      .from('whatsapp_instance')
      .update({ status: 'connected', updated_at: new Date().toISOString() })
      .eq('id', instance.id)
    instance.status = 'connected'
  }
  catch (error: any) {
    await client.from('whatsapp_integration').delete().eq('instance_id', instance.id)
    await client.from('whatsapp_instance').delete().eq('id', instance.id)
    throw createError({
      statusCode: 400,
      statusMessage: graphErrorMessage(error, 'Falha ao configurar o webhook na Meta'),
    })
  }

  return {
    data: sanitizeInstanceRow(instance, integration),
    webhookUrl: buildCloudWebhookUrl(event, instance.id),
    coexistence: isCoexistence,
  }
})
