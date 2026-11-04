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

interface LinkedinUploadInstruction {
  uploadUrl: string
  firstByte: number
  lastByte: number
}

/** Soft cap so publish workers stay under Vercel / pg_net timeouts. LinkedIn allows up to 500MB. */
const LINKEDIN_VIDEO_MAX_BYTES = 100 * 1024 * 1024
const LINKEDIN_VIDEO_MIN_BYTES = 75 * 1024

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

function mediaTitle(asset: any, caption: string) {
  const fromName = String(asset?.name || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .trim()
  const text = (fromName || caption || 'Vídeo').replace(/\s+/g, ' ').trim()
  return text.slice(0, 200)
}

function stripEtagQuotes(value: string | null | undefined) {
  return String(value || '').trim().replace(/^"|"$/g, '')
}

async function signedAssetUrl(client: any, asset: any) {
  const { data: signed } = await client.storage
    .from('marketing-assets')
    .createSignedUrl(asset.object_path, 60 * 60)
  if (!signed?.signedUrl)
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível preparar a mídia' })
  return signed.signedUrl as string
}

async function waitForImageAvailable(
  imageUrn: string,
  headers: Record<string, string>,
) {
  const url = `https://api.linkedin.com/rest/images/${encodeURIComponent(imageUrn)}`
  // Cap ~12s total so publication workers fit under Vercel maxDuration / pg_net.
  for (let attempt = 0; attempt < 10; attempt++) {
    const image = await $fetch<{ status?: string }>(url, {
      headers,
      timeout: 8_000,
    }).catch((err: unknown) => {
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
    await sleep(400 + attempt * 150)
  }
  throw createError({
    statusCode: 504,
    statusMessage: 'Timeout aguardando a imagem ficar disponível no LinkedIn',
  })
}

async function waitForVideoAvailable(
  videoUrn: string,
  headers: Record<string, string>,
) {
  const url = `https://api.linkedin.com/rest/videos/${encodeURIComponent(videoUrn)}`
  // Videos need longer processing than images; still capped for worker budgets.
  for (let attempt = 0; attempt < 20; attempt++) {
    const video = await $fetch<{ status?: string, processingFailureReason?: string }>(url, {
      headers,
      timeout: 8_000,
    }).catch((err: unknown) => {
      if (attempt < 6)
        return null
      throw linkedinFetchError(err, 'Falha ao verificar status do vídeo no LinkedIn')
    })
    const status = String(video?.status || '')
    if (status === 'AVAILABLE')
      return
    if (status === 'PROCESSING_FAILED') {
      const reason = String(video?.processingFailureReason || '').trim()
      throw createError({
        statusCode: 502,
        statusMessage: reason
          ? `LinkedIn falhou ao processar o vídeo (${reason})`
          : 'LinkedIn falhou ao processar o vídeo enviado',
      })
    }
    await sleep(700 + attempt * 200)
  }
  throw createError({
    statusCode: 504,
    statusMessage: 'Timeout aguardando o vídeo ficar disponível no LinkedIn',
  })
}

async function uploadImage(
  client: any,
  asset: any,
  token: string,
  headers: Record<string, string>,
  owner: string,
) {
  const signedUrl = await signedAssetUrl(client, asset)

  const initialization = await $fetch<any>('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    timeout: 15_000,
    body: {
      initializeUploadRequest: { owner },
    },
  }).catch((err: unknown) => {
    throw linkedinFetchError(err, 'LinkedIn não iniciou o upload da imagem')
  })
  const value = initialization?.value
  if (!value?.uploadUrl || !value?.image)
    throw createError({ statusCode: 502, statusMessage: 'LinkedIn não iniciou o upload da imagem' })

  const binary = await $fetch<ArrayBuffer>(signedUrl, {
    responseType: 'arrayBuffer',
    timeout: 20_000,
  })
  await $fetch(value.uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': asset.mime_type || 'application/octet-stream',
    },
    timeout: 30_000,
    body: binary,
  }).catch((err: unknown) => {
    throw linkedinFetchError(err, 'Falha ao enviar bytes da imagem ao LinkedIn')
  })

  const imageUrn = value.image as string
  // Images API is async — posting before AVAILABLE yields 422 Unprocessable Entity.
  await waitForImageAvailable(imageUrn, headers)
  return imageUrn
}

async function uploadVideo(
  client: any,
  asset: any,
  headers: Record<string, string>,
  owner: string,
) {
  const mime = String(asset.mime_type || '').toLowerCase()
  if (mime && mime !== 'video/mp4' && !mime.includes('mp4')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'O LinkedIn aceita apenas vídeo MP4 nesta publicação',
    })
  }

  const signedUrl = await signedAssetUrl(client, asset)
  const binary = await $fetch<ArrayBuffer>(signedUrl, {
    responseType: 'arrayBuffer',
    timeout: 60_000,
  })
  const fileSizeBytes = binary.byteLength
  if (fileSizeBytes < LINKEDIN_VIDEO_MIN_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Vídeo LinkedIn deve ter pelo menos 75 KB',
    })
  }
  if (fileSizeBytes > LINKEDIN_VIDEO_MAX_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Vídeo LinkedIn limitado a 100 MB por publicação automática',
    })
  }

  const initialization = await $fetch<{
    value?: {
      video?: string
      uploadToken?: string
      uploadInstructions?: LinkedinUploadInstruction[]
    }
  }>('https://api.linkedin.com/rest/videos?action=initializeUpload', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    timeout: 20_000,
    body: {
      initializeUploadRequest: {
        owner,
        fileSizeBytes,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    },
  }).catch((err: unknown) => {
    throw linkedinFetchError(err, 'LinkedIn não iniciou o upload do vídeo')
  })

  const value = initialization?.value
  const videoUrn = value?.video
  const instructions = value?.uploadInstructions || []
  if (!videoUrn || !instructions.length) {
    throw createError({ statusCode: 502, statusMessage: 'LinkedIn não iniciou o upload do vídeo' })
  }

  const uploadedPartIds: string[] = []
  for (const instruction of instructions) {
    const firstByte = Number(instruction.firstByte)
    const lastByte = Number(instruction.lastByte)
    if (!instruction.uploadUrl || !Number.isFinite(firstByte) || !Number.isFinite(lastByte) || lastByte < firstByte) {
      throw createError({ statusCode: 502, statusMessage: 'Instrução de upload de vídeo inválida no LinkedIn' })
    }
    // Ranges from LinkedIn are inclusive on both ends.
    const chunk = binary.slice(firstByte, lastByte + 1)
    const partResponse = await $fetch.raw(instruction.uploadUrl, {
      method: 'PUT',
      // Signed DMS upload URLs must not receive the OAuth bearer (unlike Images API).
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      timeout: 60_000,
      body: chunk,
    }).catch((err: unknown) => {
      throw linkedinFetchError(err, 'Falha ao enviar bytes do vídeo ao LinkedIn')
    })
    const etag = stripEtagQuotes(partResponse.headers.get('etag'))
    if (!etag) {
      throw createError({
        statusCode: 502,
        statusMessage: 'LinkedIn não retornou ETag da parte do vídeo',
      })
    }
    uploadedPartIds.push(etag)
  }

  await $fetch('https://api.linkedin.com/rest/videos?action=finalizeUpload', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    timeout: 30_000,
    body: {
      finalizeUploadRequest: {
        video: videoUrn,
        uploadToken: value?.uploadToken ?? '',
        uploadedPartIds,
      },
    },
  }).catch((err: unknown) => {
    throw linkedinFetchError(err, 'LinkedIn não finalizou o upload do vídeo')
  })

  await waitForVideoAvailable(videoUrn, headers)
  return videoUrn
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

  const videoAssets = input.assets.filter(asset => String(asset.mime_type || '').startsWith('video/'))
  const imageAssets = input.assets.filter(asset => String(asset.mime_type || '').startsWith('image/'))
  if (videoAssets.length && imageAssets.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Publique vídeo e imagens em posts separados no LinkedIn',
    })
  }
  if (videoAssets.length > 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'O LinkedIn aceita somente um vídeo por publicação',
    })
  }
  if (input.assets.some(asset => !String(asset.mime_type || '').startsWith('image/') && !String(asset.mime_type || '').startsWith('video/'))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'O envio LinkedIn desta versão suporta texto, imagens e vídeo MP4',
    })
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

  if (videoAssets.length === 1) {
    const videoUrn = await uploadVideo(input.client, videoAssets[0], headers, owner)
    body.content = {
      media: {
        id: videoUrn,
        title: mediaTitle(videoAssets[0], commentary),
      },
    }
  }
  else {
    const images = []
    for (const asset of imageAssets)
      images.push(await uploadImage(input.client, asset, token, headers, owner))

    if (images.length === 1) {
      // Image posts use altText (accessibility). `title` is for video/document media.
      body.content = {
        media: {
          id: images[0],
          altText: mediaAltText(imageAssets[0], commentary),
        },
      }
    }
    if (images.length > 1) {
      body.content = {
        multiImage: {
          images: images.map((id, index) => ({
            id,
            altText: mediaAltText(imageAssets[index], commentary),
          })),
        },
      }
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
