import { createError } from 'h3'

import { resolveMetaGraphVersion } from '~/lib/meta-ads/graph'
import { decryptSecret } from '~/server/utils/marketing'
import { buildCaptionWithHashtags } from '~/utils/social-hashtags'

interface MetaPublishInput {
  client: any
  tenantId: string
  account: any
  variant: any
  assets: any[]
}

interface MetaDeleteInput {
  client: any
  tenantId: string
  account: any
  externalPostId: string
  format?: string | null
  externalObjectType?: string | null
  externalContainerId?: string | null
  externalMediaId?: string | null
  externalPermalink?: string | null
  remoteIdentifiers?: Record<string, unknown> | null
}

interface MetaPublishResult {
  externalPostId: string
  externalPostUrl: string | null
  externalObjectType: string
  externalContainerId?: string
  externalMediaId?: string
  remoteIdentifiers?: Record<string, unknown>
}

/** Map Graph / $fetch failures into PT-BR h3 errors with fbtrace when available. */
export function throwMetaPublishError(error: unknown, fallbackMessage: string): never {
  const err = error as any
  if (err?.statusCode && err?.statusMessage && !err?.data?.error && !err?.response?._data?.error)
    throw err

  const graphError = err?.data?.error || err?.response?._data?.error || err?.data || {}
  const code = graphError.code ?? err?.statusCode
  const subcode = graphError.error_subcode
  const fbtrace = graphError.fbtrace_id
  const providerMessage = String(
    graphError.error_user_msg
    || graphError.message
    || err?.statusMessage
    || err?.message
    || fallbackMessage,
  ).slice(0, 400)

  const parts = [providerMessage]
  if (code != null && code !== '')
    parts.push(`código ${code}`)
  if (subcode != null && subcode !== '')
    parts.push(`subcódigo ${subcode}`)
  if (fbtrace)
    parts.push(`fbtrace ${fbtrace}`)

  throw createError({
    statusCode: Number(err?.statusCode) >= 400 ? Number(err.statusCode) : 502,
    statusMessage: parts.join(' · '),
    data: {
      meta: {
        code: code ?? null,
        error_subcode: subcode ?? null,
        fbtrace_id: fbtrace ?? null,
      },
    },
  })
}

async function metaFetch<T = any>(
  url: string,
  options?: Parameters<typeof $fetch>[1],
  fallbackMessage = 'Falha na API da Meta',
): Promise<T> {
  try {
    return await $fetch<T>(url, options)
  }
  catch (error) {
    throwMetaPublishError(error, fallbackMessage)
  }
}

async function waitForInstagramContainer(
  graphBase: string,
  containerId: string,
  accessToken: string,
  options?: { isVideo?: boolean },
) {
  // Images finish quickly; Reels/video often need 1–2+ minutes on Meta.
  const maxAttempts = options?.isVideo ? 40 : 10
  const pollMs = options?.isVideo ? 3_000 : 1_500
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await metaFetch<any>(
      `${graphBase}/${containerId}`,
      {
        query: { fields: 'status_code,status', access_token: accessToken },
        timeout: 8_000,
      },
      'Falha ao consultar status da mídia no Instagram',
    )
    if (response.status_code === 'FINISHED')
      return
    if (response.status_code === 'ERROR' || response.status_code === 'EXPIRED') {
      throw createError({
        statusCode: 502,
        statusMessage: response.status || 'Falha ao preparar mídia no Instagram',
      })
    }
    await new Promise(resolve => setTimeout(resolve, pollMs))
  }
  throw createError({ statusCode: 504, statusMessage: 'Instagram não terminou de processar a mídia' })
}

/**
 * Page Stories API: after hosted upload, poll video status before upload_phase=finish.
 * @see https://developers.facebook.com/documentation/video-api/page-stories-api
 */
async function waitForFacebookVideoStoryReady(
  graphBase: string,
  videoId: string,
  accessToken: string,
) {
  const maxAttempts = 40
  const pollMs = 3_000
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await metaFetch<any>(
      `${graphBase}/${videoId}`,
      {
        query: { fields: 'status', access_token: accessToken },
        timeout: 8_000,
      },
      'Falha ao consultar status do vídeo do Stories no Facebook',
    )
    const status = response?.status || {}
    const uploading = String(status.uploading_phase?.status || '')
    const processing = String(status.processing_phase?.status || '')
    const videoStatus = String(status.video_status || '')
    const processingError = status.processing_phase?.error?.message
      || (typeof status.processing_phase?.error === 'string' ? status.processing_phase.error : null)

    if (processingError) {
      throw createError({
        statusCode: 502,
        statusMessage: String(processingError),
      })
    }

    // Finish when upload is done and processing finished (or Meta reports ready).
    if (uploading === 'complete' && (processing === 'complete' || videoStatus === 'ready'))
      return

    // Some accounts omit processing_phase after a successful hosted upload.
    if (uploading === 'complete' && !status.processing_phase && attempt >= 1)
      return

    await new Promise(resolve => setTimeout(resolve, pollMs))
  }
  throw createError({
    statusCode: 504,
    statusMessage: 'Facebook não terminou de processar o vídeo do Stories',
  })
}

async function fetchInstagramPermalink(
  graphBase: string,
  mediaId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await $fetch<any>(`${graphBase}/${mediaId}`, {
      query: { fields: 'permalink', access_token: accessToken },
      timeout: 8_000,
    })
    return response?.permalink ? String(response.permalink) : null
  }
  catch {
    return null
  }
}

async function fetchFacebookPermalink(
  graphBase: string,
  objectId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await $fetch<any>(`${graphBase}/${objectId}`, {
      query: { fields: 'permalink_url', access_token: accessToken },
      timeout: 8_000,
    })
    return response?.permalink_url ? String(response.permalink_url) : null
  }
  catch {
    return null
  }
}

async function fetchFacebookStoryUrl(
  graphBase: string,
  pageId: string,
  postId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await $fetch<any>(`${graphBase}/${pageId}/stories`, {
      query: { access_token: accessToken },
      timeout: 8_000,
    })
    const match = (response?.data || []).find((row: any) => String(row.post_id) === String(postId))
    return match?.url ? String(match.url) : null
  }
  catch {
    return null
  }
}

async function getSignedAssetUrls(client: any, assets: any[]) {
  const paths = assets.map(asset => asset.object_path).filter(Boolean)
  if (!paths.length)
    return []
  const { data, error } = await client.storage.from('marketing-assets').createSignedUrls(paths, 60 * 60)
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message })

  const byPath = new Map((data || []).map((row: any) => [row.path, row.signedUrl]))
  return assets.map(asset => ({
    ...asset,
    signedUrl: byPath.get(asset.object_path),
  }))
}

async function resolveMetaPageToken(client: any, tenantId: string, platform: string) {
  const { data: integration } = await client
    .from('marketing_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'meta')
    .eq('is_active', true)
    .maybeSingle()

  const config = integration?.config || {}
  const pageToken = decryptSecret(config.page_access_token_enc)
  const userToken = decryptSecret(config.access_token_enc)
  const token = pageToken || (platform === 'facebook' ? userToken : null)
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: platform === 'instagram'
        ? 'Integração Meta sem token da Página. Selecione novamente a Página do Facebook vinculada ao Instagram.'
        : 'Integração Meta sem token válido',
    })
  }
  return {
    token,
    pageId: String(config.page_id || ''),
    graphVersion: resolveMetaGraphVersion(),
  }
}

async function publishInstagramStory(
  input: MetaPublishInput,
  token: string,
  graphBase: string,
): Promise<MetaPublishResult> {
  const media = await getSignedAssetUrls(input.client, input.assets)
  if (media.length !== 1)
    throw createError({ statusCode: 400, statusMessage: 'Stories do Instagram aceitam exatamente uma peça' })

  const asset = media[0]
  const isVideo = String(asset.mime_type).startsWith('video/')
  const body: Record<string, unknown> = {
    access_token: token,
    media_type: 'STORIES',
  }
  if (isVideo)
    body.video_url = asset.signedUrl
  else
    body.image_url = asset.signedUrl

  const container = await metaFetch<any>(
    `${graphBase}/${input.account.external_account_id}/media`,
    { method: 'POST', body },
    'Não foi possível criar o container do Stories no Instagram',
  )
  await waitForInstagramContainer(graphBase, container.id, token, { isVideo })
  const published = await metaFetch<any>(
    `${graphBase}/${input.account.external_account_id}/media_publish`,
    {
      method: 'POST',
      body: { creation_id: container.id, access_token: token },
    },
    'Não foi possível publicar o Stories no Instagram',
  )
  const permalink = await fetchInstagramPermalink(graphBase, String(published.id), token)
  return {
    externalPostId: String(published.id),
    externalPostUrl: permalink,
    externalObjectType: 'instagram_story',
    externalContainerId: String(container.id),
    externalMediaId: String(published.id),
    remoteIdentifiers: {
      publishedMediaId: String(published.id),
      containerId: String(container.id),
      permalink,
    },
  }
}

async function publishInstagram(
  input: MetaPublishInput,
  token: string,
  graphBase: string,
): Promise<MetaPublishResult> {
  if (input.variant.format === 'story')
    return publishInstagramStory(input, token, graphBase)

  const media = await getSignedAssetUrls(input.client, input.assets)
  if (!media.length)
    throw createError({ statusCode: 400, statusMessage: 'Instagram exige ao menos uma mídia' })

  const caption = buildCaptionWithHashtags(input.variant.caption, input.variant.hashtags)
  const isCarousel = media.length > 1

  const children: string[] = []
  for (const asset of media) {
    const isVideo = String(asset.mime_type).startsWith('video/')
    const body: Record<string, unknown> = {
      access_token: token,
    }
    if (isCarousel)
      body.is_carousel_item = true

    if (isVideo) {
      body.media_type = isCarousel ? 'VIDEO' : 'REELS'
      body.video_url = asset.signedUrl
    }
    else {
      body.media_type = 'IMAGE'
      body.image_url = asset.signedUrl
    }
    // Caption only on the final single-item container or the CAROUSEL parent — never on children.
    if (!isCarousel)
      body.caption = caption

    const container = await metaFetch<any>(
      `${graphBase}/${input.account.external_account_id}/media`,
      { method: 'POST', body },
      'Não foi possível criar o container de mídia no Instagram',
    )
    await waitForInstagramContainer(graphBase, container.id, token, { isVideo })
    children.push(container.id)
  }

  let creationId = children[0]
  if (isCarousel) {
    const carousel = await metaFetch<any>(
      `${graphBase}/${input.account.external_account_id}/media`,
      {
        method: 'POST',
        body: {
          media_type: 'CAROUSEL',
          children: children.join(','),
          caption,
          access_token: token,
        },
      },
      'Não foi possível criar o carrossel no Instagram',
    )
    await waitForInstagramContainer(graphBase, carousel.id, token, {
      isVideo: media.some(asset => String(asset.mime_type).startsWith('video/')),
    })
    creationId = carousel.id
  }

  const published = await metaFetch<any>(
    `${graphBase}/${input.account.external_account_id}/media_publish`,
    {
      method: 'POST',
      body: { creation_id: creationId, access_token: token },
    },
    'Não foi possível publicar no Instagram',
  )

  const isVideo = String(media[0]?.mime_type || '').startsWith('video/')
  const objectType = children.length > 1
    ? 'instagram_carousel'
    : (isVideo ? 'instagram_reel' : 'instagram_media')
  const permalink = await fetchInstagramPermalink(graphBase, String(published.id), token)
  return {
    externalPostId: String(published.id),
    externalPostUrl: permalink,
    externalObjectType: objectType,
    externalContainerId: String(creationId),
    externalMediaId: String(published.id),
    remoteIdentifiers: {
      publishedMediaId: String(published.id),
      containerId: String(creationId),
      childContainers: children,
      permalink,
    },
  }
}

async function publishFacebookStory(
  input: MetaPublishInput,
  token: string,
  graphBase: string,
): Promise<MetaPublishResult> {
  const media = await getSignedAssetUrls(input.client, input.assets)
  if (media.length !== 1)
    throw createError({ statusCode: 400, statusMessage: 'Stories do Facebook aceitam exatamente uma peça' })

  const asset = media[0]
  const isVideo = String(asset.mime_type).startsWith('video/')
  const pageId = input.account.external_account_id

  if (isVideo) {
    const session = await metaFetch<any>(
      `${graphBase}/${pageId}/video_stories`,
      {
        method: 'POST',
        body: { upload_phase: 'start', access_token: token },
      },
      'Não foi possível iniciar o upload do story de vídeo',
    )
    if (!session?.video_id || !session?.upload_url) {
      throw createError({ statusCode: 502, statusMessage: 'Não foi possível iniciar o upload do story de vídeo' })
    }

    await metaFetch(
      session.upload_url,
      {
        method: 'POST',
        headers: { file_url: String(asset.signedUrl) },
      },
      'Falha ao enviar o vídeo do Stories para a Meta',
    )

    await waitForFacebookVideoStoryReady(graphBase, String(session.video_id), token)

    const published = await metaFetch<any>(
      `${graphBase}/${pageId}/video_stories`,
      {
        method: 'POST',
        body: {
          upload_phase: 'finish',
          video_id: session.video_id,
          access_token: token,
        },
      },
      'Não foi possível publicar o Stories de vídeo no Facebook',
    )
    const postId = String(published.post_id || session.video_id)
    const storyUrl = published.post_id
      ? await fetchFacebookStoryUrl(graphBase, pageId, String(published.post_id), token)
      : null
    return {
      externalPostId: postId,
      externalPostUrl: storyUrl,
      externalObjectType: 'facebook_story',
      externalMediaId: postId,
      remoteIdentifiers: {
        storyPostId: published.post_id || null,
        videoId: session.video_id,
        permalink: storyUrl,
      },
    }
  }

  // Facebook Stories cannot reuse a photo already published to feed.
  // Always upload a fresh unpublished photo, then publish as story.
  const uploaded = await metaFetch<any>(
    `${graphBase}/${pageId}/photos`,
    {
      method: 'POST',
      body: {
        url: asset.signedUrl,
        published: false,
        access_token: token,
      },
    },
    'Não foi possível enviar a foto do Stories no Facebook',
  )
  const published = await metaFetch<any>(
    `${graphBase}/${pageId}/photo_stories`,
    {
      method: 'POST',
      body: {
        photo_id: uploaded.id,
        access_token: token,
      },
    },
    'Não foi possível publicar o Stories no Facebook',
  )
  const postId = String(published.post_id || uploaded.id)
  const storyUrl = published.post_id
    ? await fetchFacebookStoryUrl(graphBase, pageId, String(published.post_id), token)
    : null
  return {
    externalPostId: postId,
    externalPostUrl: storyUrl,
    externalObjectType: 'facebook_story',
    externalMediaId: postId,
    remoteIdentifiers: {
      storyPostId: published.post_id || null,
      photoId: uploaded.id,
      permalink: storyUrl,
    },
  }
}

async function publishFacebook(
  input: MetaPublishInput,
  token: string,
  graphBase: string,
): Promise<MetaPublishResult> {
  if (input.variant.format === 'story')
    return publishFacebookStory(input, token, graphBase)

  const media = await getSignedAssetUrls(input.client, input.assets)
  const message = buildCaptionWithHashtags(input.variant.caption, input.variant.hashtags)

  if (!media.length) {
    const post = await metaFetch<any>(
      `${graphBase}/${input.account.external_account_id}/feed`,
      {
        method: 'POST',
        body: {
          message,
          link: input.variant.link_url || undefined,
          access_token: token,
        },
      },
      'Não foi possível publicar no feed do Facebook',
    )
    const permalink = await fetchFacebookPermalink(graphBase, String(post.id), token)
    return {
      externalPostId: String(post.id),
      externalPostUrl: permalink,
      externalObjectType: 'facebook_feed_post',
      externalMediaId: String(post.id),
      remoteIdentifiers: { pagePostId: String(post.id), permalink },
    }
  }

  if (media.length > 1) {
    const attachedMedia: Array<{ media_fbid: string }> = []
    for (const asset of media) {
      if (String(asset.mime_type).startsWith('video/')) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Carrossel do Facebook aceita apenas imagens neste fluxo',
        })
      }
      const uploaded = await metaFetch<any>(
        `${graphBase}/${input.account.external_account_id}/photos`,
        {
          method: 'POST',
          body: {
            url: asset.signedUrl,
            published: false,
            access_token: token,
          },
        },
        'Não foi possível enviar uma foto do carrossel no Facebook',
      )
      attachedMedia.push({ media_fbid: String(uploaded.id) })
    }
    const post = await metaFetch<any>(
      `${graphBase}/${input.account.external_account_id}/feed`,
      {
        method: 'POST',
        body: {
          message,
          attached_media: attachedMedia,
          access_token: token,
        },
      },
      'Não foi possível publicar o carrossel no Facebook',
    )
    const permalink = await fetchFacebookPermalink(graphBase, String(post.id), token)
    return {
      externalPostId: String(post.id),
      externalPostUrl: permalink,
      externalObjectType: 'facebook_feed_post',
      externalMediaId: String(post.id),
      remoteIdentifiers: { pagePostId: String(post.id), attachedMedia, permalink },
    }
  }

  const first = media[0]
  const isVideo = String(first.mime_type).startsWith('video/')
  const endpoint = isVideo ? 'videos' : 'photos'
  const body = isVideo
    ? { file_url: first.signedUrl, description: message, access_token: token }
    : { url: first.signedUrl, caption: message, access_token: token }
  const post = await metaFetch<any>(
    `${graphBase}/${input.account.external_account_id}/${endpoint}`,
    { method: 'POST', body },
    isVideo
      ? 'Não foi possível publicar o vídeo no Facebook'
      : 'Não foi possível publicar a foto no Facebook',
  )

  const publishedId = String(post.post_id || post.id)
  const objectType = isVideo ? 'facebook_video' : 'facebook_photo'
  const permalink = await fetchFacebookPermalink(graphBase, publishedId, token)
  return {
    externalPostId: publishedId,
    externalPostUrl: permalink,
    externalObjectType: objectType,
    externalMediaId: publishedId,
    remoteIdentifiers: {
      pagePostId: post.post_id ? String(post.post_id) : null,
      mediaId: String(post.id),
      publishedMediaId: publishedId,
      permalink,
    },
  }
}

export async function publishToMeta(input: MetaPublishInput) {
  const { token, graphVersion } = await resolveMetaPageToken(input.client, input.tenantId, input.account.platform)
  const graphBase = `https://graph.facebook.com/${graphVersion}`
  if (input.account.platform === 'instagram')
    return publishInstagram(input, token, graphBase)
  return publishFacebook(input, token, graphBase)
}

export async function deleteFromMeta(input: MetaDeleteInput) {
  const { deleteMetaRemoteObject } = await import('~/server/utils/social-publishers/meta-delete')
  return deleteMetaRemoteObject({
    client: input.client,
    tenantId: input.tenantId,
    account: input.account,
    format: input.format,
    externalPostId: input.externalPostId,
    externalObjectType: input.externalObjectType,
    externalContainerId: input.externalContainerId,
    externalMediaId: input.externalMediaId,
    externalPermalink: input.externalPermalink,
    remoteIdentifiers: input.remoteIdentifiers,
  })
}
