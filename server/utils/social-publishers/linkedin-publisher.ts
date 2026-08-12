import process from 'node:process'

import { createError } from 'h3'

import { decryptSecret } from '~/server/utils/marketing'
import { buildCaptionWithHashtags } from '~/utils/social-hashtags'

interface LinkedinPublishInput {
  client: any
  tenantId: string
  account: any
  variant: any
  assets: any[]
}

async function uploadImage(
  client: any,
  asset: any,
  token: string,
  headers: Record<string, string>,
  owner: string,
) {
  const { data: signed } = await client.storage
    .from('marketing-assets')
    .createSignedUrl(asset.object_path, 60 * 60)
  if (!signed?.signedUrl)
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível preparar a mídia' })

  const initialization = await $fetch<any>('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: {
      initializeUploadRequest: { owner },
    },
  })
  const value = initialization?.value
  if (!value?.uploadUrl || !value?.image)
    throw createError({ statusCode: 502, statusMessage: 'LinkedIn não iniciou o upload da imagem' })

  const binary = await $fetch<ArrayBuffer>(signed.signedUrl, { responseType: 'arrayBuffer' })
  await $fetch(value.uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': asset.mime_type || 'application/octet-stream',
    },
    body: binary,
  })

  return value.image as string
}

export async function publishToLinkedin(input: LinkedinPublishInput) {
  const { data: integration } = await input.client
    .from('marketing_integrations')
    .select('config')
    .eq('tenant_id', input.tenantId)
    .eq('provider', 'linkedin')
    .eq('is_active', true)
    .maybeSingle()

  const token = decryptSecret(integration?.config?.access_token_enc)
  if (!token)
    throw createError({ statusCode: 401, statusMessage: 'Integração LinkedIn sem token válido' })

  const version = process.env.LINKEDIN_VERSION || '202605'
  const headers = {
    'Authorization': `Bearer ${token}`,
    'LinkedIn-Version': version,
    'X-Restli-Protocol-Version': '2.0.0',
  }
  const owner = `urn:li:organization:${input.account.external_account_id}`
  const commentary = buildCaptionWithHashtags(input.variant.caption, input.variant.hashtags)

  const images = []
  for (const asset of input.assets) {
    if (!String(asset.mime_type).startsWith('image/')) {
      throw createError({
        statusCode: 400,
        statusMessage: 'O envio LinkedIn desta versão suporta texto e imagens',
      })
    }
    images.push(await uploadImage(input.client, asset, token, headers, owner))
  }

  const body: Record<string, unknown> = {
    author: owner,
    commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }
  if (images.length === 1)
    body.content = { media: { id: images[0], title: input.variant.caption || '' } }
  if (images.length > 1)
    body.content = { multiImage: { images: images.map(id => ({ id })) } }

  const response = await $fetch.raw('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body,
  })
  const externalPostId = response.headers.get('x-restli-id')
  if (!externalPostId)
    throw createError({ statusCode: 502, statusMessage: 'LinkedIn não retornou o ID da publicação' })

  return {
    externalPostId,
    externalPostUrl: null,
  }
}
