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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Surface LinkedIn REST error body instead of opaque "Unprocessable Entity". */
function linkedinFetchError(err: unknown, fallback: string) {
  const candidate = err as {
    statusCode?: number
    statusMessage?: string
    message?: string
    data?: Record<string, unknown> | string
  }
  const data = candidate?.data
  const payload = typeof data === 'object' && data ? data : null
  const detail = String(
    payload?.message
    || payload?.errorDetails
    || payload?.code
    || candidate?.statusMessage
    || candidate?.message
    || '',
  ).trim()
  const statusCode = Number(candidate?.statusCode || 502)
  return createError({
    statusCode: statusCode >= 400 && statusCode < 600 ? statusCode : 502,
    statusMessage: detail
      ? `LinkedIn: ${detail}`.slice(0, 400)
      : fallback,
    data: payload || undefined,
  })
}

function mediaAltText(asset: any, caption: string) {
  const fromName = String(asset?.name || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .trim()
  const text = (fromName || caption || 'Imagem').replace(/\s+/g, ' ').trim()
  return text.slice(0, 120)
}

async function waitForImageAvailable(
  imageUrn: string,
  headers: Record<string, string>,
) {
  const url = `https://api.linkedin.com/rest/images/${encodeURIComponent(imageUrn)}`
  for (let attempt = 0; attempt < 24; attempt++) {
    const image = await $fetch<{ status?: string }>(url, { headers }).catch((err: unknown) => {
      // Read may lag briefly after PUT; retry a few times before failing hard.
      if (attempt < 5)
        return null
      throw linkedinFetchError(err, 'Falha ao verificar status da imagem no LinkedIn')
    })
    const status = String(image?.status || '')
    if (status === 'AVAILABLE')
      return
    if (status === 'PROCESSING_FAILED') {
      throw createError({
        statusCode: 502,
        statusMessage: 'LinkedIn falhou ao processar a imagem enviada',
      })
    }
    await sleep(400 + attempt * 200)
  }
  throw createError({
    statusCode: 504,
    statusMessage: 'Timeout aguardando a imagem ficar disponível no LinkedIn',
  })
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
  }).catch((err: unknown) => {
    throw linkedinFetchError(err, 'LinkedIn não iniciou o upload da imagem')
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
  }).catch((err: unknown) => {
    throw linkedinFetchError(err, 'Falha ao enviar bytes da imagem ao LinkedIn')
  })

  const imageUrn = value.image as string
  // Images API is async — posting before AVAILABLE yields 422 Unprocessable Entity.
  await waitForImageAvailable(imageUrn, headers)
  return imageUrn
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
  if (images.length === 1) {
    // Image posts use altText (accessibility). `title` is for video/document media.
    body.content = {
      media: {
        id: images[0],
        altText: mediaAltText(input.assets[0], commentary),
      },
    }
  }
  if (images.length > 1) {
    body.content = {
      multiImage: {
        images: images.map((id, index) => ({
          id,
          altText: mediaAltText(input.assets[index], commentary),
        })),
      },
    }
  }

  const response = await $fetch.raw('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body,
  }).catch((err: unknown) => {
    throw linkedinFetchError(err, 'Falha ao criar publicação no LinkedIn')
  })
  const externalPostId = response.headers.get('x-restli-id')
  if (!externalPostId)
    throw createError({ statusCode: 502, statusMessage: 'LinkedIn não retornou o ID da publicação' })

  return {
    externalPostId,
    externalPostUrl: null,
  }
}
