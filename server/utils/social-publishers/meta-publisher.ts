import process from 'node:process'

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

async function waitForInstagramContainer(
  graphBase: string,
  containerId: string,
  accessToken: string,
) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await $fetch<any>(`${graphBase}/${containerId}`, {
      query: { fields: 'status_code,status', access_token: accessToken },
    })
    if (response.status_code === 'FINISHED')
      return
    if (response.status_code === 'ERROR' || response.status_code === 'EXPIRED')
      throw createError({ statusCode: 502, statusMessage: response.status || 'Falha ao preparar mídia no Instagram' })
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  throw createError({ statusCode: 504, statusMessage: 'Instagram não terminou de processar a mídia' })
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

async function publishInstagramStory(input: MetaPublishInput, token: string, graphBase: string) {
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

  const container = await $fetch<any>(
    `${graphBase}/${input.account.external_account_id}/media`,
    { method: 'POST', body },
  )
  await waitForInstagramContainer(graphBase, container.id, token)
  const published = await $fetch<any>(
    `${graphBase}/${input.account.external_account_id}/media_publish`,
    {
      method: 'POST',
      body: { creation_id: container.id, access_token: token },
    },
  )
  return {
    externalPostId: String(published.id),
    externalPostUrl: null,
    externalObjectType: 'instagram_story' as const,
    externalContainerId: String(container.id),
    externalMediaId: String(published.id),
    remoteIdentifiers: {
      publishedMediaId: String(published.id),
      containerId: String(container.id),
    },
  }
}

async function publishInstagram(input: MetaPublishInput, token: string, graphBase: string) {
  if (input.variant.format === 'story')
    return publishInstagramStory(input, token, graphBase)

  const media = await getSignedAssetUrls(input.client, input.assets)
  if (!media.length)
    throw createError({ statusCode: 400, statusMessage: 'Instagram exige ao menos uma mídia' })

  const caption = buildCaptionWithHashtags(input.variant.caption, input.variant.hashtags)

  const children: string[] = []
  for (const asset of media) {
    const isVideo = String(asset.mime_type).startsWith('video/')
    const body: Record<string, unknown> = {
      access_token: token,
      is_carousel_item: media.length > 1,
    }
    if (isVideo) {
      body.media_type = 'REELS'
      body.video_url = asset.signedUrl
    }
    else {
      body.image_url = asset.signedUrl
    }
    if (media.length === 1)
      body.caption = caption

    const container = await $fetch<any>(
      `${graphBase}/${input.account.external_account_id}/media`,
      { method: 'POST', body },
    )
    await waitForInstagramContainer(graphBase, container.id, token)
    children.push(container.id)
  }

  let creationId = children[0]
  if (children.length > 1) {
    const carousel = await $fetch<any>(
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
    )
    await waitForInstagramContainer(graphBase, carousel.id, token)
    creationId = carousel.id
  }

  const published = await $fetch<any>(
    `${graphBase}/${input.account.external_account_id}/media_publish`,
    {
      method: 'POST',
      body: { creation_id: creationId, access_token: token },
    },
  )

  const isVideo = String(media[0]?.mime_type || '').startsWith('video/')
  const objectType = children.length > 1
    ? 'instagram_carousel'
    : (isVideo ? 'instagram_reel' : 'instagram_media')
  return {
    externalPostId: String(published.id),
    externalPostUrl: null,
    externalObjectType: objectType as 'instagram_carousel' | 'instagram_reel' | 'instagram_media',
    externalContainerId: String(creationId),
    externalMediaId: String(published.id),
    remoteIdentifiers: {
      publishedMediaId: String(published.id),
      containerId: String(creationId),
      childContainers: children,
    },
  }
}

async function publishFacebookStory(input: MetaPublishInput, token: string, graphBase: string) {
  const media = await getSignedAssetUrls(input.client, input.assets)
  if (media.length !== 1)
    throw createError({ statusCode: 400, statusMessage: 'Stories do Facebook aceitam exatamente uma peça' })

  const asset = media[0]
  const isVideo = String(asset.mime_type).startsWith('video/')
  const pageId = input.account.external_account_id

  if (isVideo) {
    const session = await $fetch<any>(`${graphBase}/${pageId}/video_stories`, {
      method: 'POST',
      body: { upload_phase: 'start', access_token: token },
    })
    if (!session?.video_id || !session?.upload_url) {
      throw createError({ statusCode: 502, statusMessage: 'Não foi possível iniciar o upload do story de vídeo' })
    }

    await $fetch(session.upload_url, {
      method: 'POST',
      headers: { file_url: String(asset.signedUrl) },
    })

    const published = await $fetch<any>(`${graphBase}/${pageId}/video_stories`, {
      method: 'POST',
      body: {
        upload_phase: 'finish',
        video_id: session.video_id,
        access_token: token,
      },
    })
    return {
      externalPostId: String(published.post_id || session.video_id),
      externalPostUrl: null,
      externalObjectType: 'facebook_story' as const,
      externalMediaId: String(published.post_id || session.video_id),
      remoteIdentifiers: {
        storyPostId: published.post_id || null,
        videoId: session.video_id,
      },
    }
  }

  // Facebook Stories cannot reuse a photo already published to feed.
  // Always upload a fresh unpublished photo, then publish as story.
  const uploaded = await $fetch<any>(`${graphBase}/${pageId}/photos`, {
    method: 'POST',
    body: {
      url: asset.signedUrl,
      published: false,
      access_token: token,
    },
  })
  const published = await $fetch<any>(`${graphBase}/${pageId}/photo_stories`, {
    method: 'POST',
    body: {
      photo_id: uploaded.id,
      access_token: token,
    },
  })
  return {
    externalPostId: String(published.post_id || uploaded.id),
    externalPostUrl: null,
    externalObjectType: 'facebook_story' as const,
    externalMediaId: String(published.post_id || uploaded.id),
    remoteIdentifiers: {
      storyPostId: published.post_id || null,
      photoId: uploaded.id,
    },
  }
}

async function publishFacebook(input: MetaPublishInput, token: string, graphBase: string) {
  if (input.variant.format === 'story')
    return publishFacebookStory(input, token, graphBase)

  const media = await getSignedAssetUrls(input.client, input.assets)
  const message = buildCaptionWithHashtags(input.variant.caption, input.variant.hashtags)

  if (!media.length) {
    const post = await $fetch<any>(`${graphBase}/${input.account.external_account_id}/feed`, {
      method: 'POST',
      body: {
        message,
        link: input.variant.link_url || undefined,
        access_token: token,
      },
    })
    return { externalPostId: String(post.id), externalPostUrl: null, externalObjectType: 'facebook_feed_post' as const, externalMediaId: String(post.id), remoteIdentifiers: { pagePostId: String(post.id) } }
  }

  if (media.length > 1) {
    const attachedMedia: Array<{ media_fbid: string }> = []
    for (const asset of media) {
      if (String(asset.mime_type).startsWith('video/'))
        throw createError({ statusCode: 400, statusMessage: 'Carrossel do Facebook aceita apenas imagens neste fluxo' })
      const uploaded = await $fetch<any>(
        `${graphBase}/${input.account.external_account_id}/photos`,
        {
          method: 'POST',
          body: {
            url: asset.signedUrl,
            published: false,
            access_token: token,
          },
        },
      )
      attachedMedia.push({ media_fbid: String(uploaded.id) })
    }
    const post = await $fetch<any>(
      `${graphBase}/${input.account.external_account_id}/feed`,
      {
        method: 'POST',
        body: {
          message,
          attached_media: attachedMedia,
          access_token: token,
        },
      },
    )
    return {
      externalPostId: String(post.id),
      externalPostUrl: null,
      externalObjectType: 'facebook_feed_post' as const,
      externalMediaId: String(post.id),
      remoteIdentifiers: { pagePostId: String(post.id), attachedMedia },
    }
  }

  const first = media[0]
  const isVideo = String(first.mime_type).startsWith('video/')
  const endpoint = isVideo ? 'videos' : 'photos'
  const body = isVideo
    ? { file_url: first.signedUrl, description: message, access_token: token }
    : { url: first.signedUrl, caption: message, access_token: token }
  const post = await $fetch<any>(
    `${graphBase}/${input.account.external_account_id}/${endpoint}`,
    { method: 'POST', body },
  )

  const publishedId = String(post.post_id || post.id)
  const objectType = isVideo ? 'facebook_video' : 'facebook_photo'
  return {
    externalPostId: publishedId,
    externalPostUrl: null,
    externalObjectType: objectType as 'facebook_video' | 'facebook_photo',
    externalMediaId: publishedId,
    remoteIdentifiers: {
      pagePostId: post.post_id ? String(post.post_id) : null,
      mediaId: String(post.id),
      publishedMediaId: publishedId,
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
