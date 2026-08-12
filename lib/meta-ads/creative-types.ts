/**
 * Meta AdCreative type builders (Marketing API object_story_spec / asset_feed_spec).
 * Media must already exist as image_hash / video_id (or HTTPS picture URL) — no binary upload here.
 *
 * Official refs:
 * - object_story_spec: link_data | video_data | photo_data | template_data
 * - carousel: link_data.child_attachments
 * - Dynamic Creative: asset_feed_spec (+ adset is_dynamic_creative=true)
 */

import { MetaAdsToolError } from './types'
import type { MetaAdDestinationType } from './ad-destination'
import {
  buildWebsiteLinkData,
  buildWhatsAppLinkData,
  type BuildWebsiteLinkDataInput,
  type BuildWhatsAppLinkDataInput,
} from './ad-destination'

/** Canonical creative formats supported by Blimber createAd. */
export const META_AD_CREATIVE_TYPES = [
  'IMAGE',
  'VIDEO',
  'CAROUSEL',
  'DYNAMIC_CREATIVE',
] as const

export type MetaAdCreativeType = (typeof META_AD_CREATIVE_TYPES)[number]

/** Aliases accepted in API input (normalized to MetaAdCreativeType). */
export const META_AD_CREATIVE_TYPE_ALIASES: Record<string, MetaAdCreativeType> = {
  IMAGE: 'IMAGE',
  STATIC: 'IMAGE',
  static: 'IMAGE',
  image: 'IMAGE',
  VIDEO: 'VIDEO',
  video: 'VIDEO',
  CAROUSEL: 'CAROUSEL',
  carousel: 'CAROUSEL',
  DYNAMIC_CREATIVE: 'DYNAMIC_CREATIVE',
  DYNAMIC: 'DYNAMIC_CREATIVE',
  dynamic: 'DYNAMIC_CREATIVE',
  dynamic_creative: 'DYNAMIC_CREATIVE',
}

export const META_DYNAMIC_AD_FORMATS = [
  'SINGLE_IMAGE',
  'SINGLE_VIDEO',
  'CAROUSEL',
  'AUTOMATIC_FORMAT',
] as const

export type MetaDynamicAdFormat = (typeof META_DYNAMIC_AD_FORMATS)[number]

export type CarouselCardInput = {
  link: string
  name?: string
  description?: string
  imageHash?: string
  imageUrl?: string
  videoId?: string
}

export type AssetFeedSpecInput = {
  bodies?: Array<{ text: string }>
  titles?: Array<{ text: string }>
  descriptions?: Array<{ text: string }>
  images?: Array<{ hash: string }>
  videos?: Array<{
    videoId: string
    thumbnailUrl?: string
    thumbnailHash?: string
  }>
  linkUrls: Array<{ websiteUrl: string }>
  callToActionTypes: string[]
  adFormats: MetaDynamicAdFormat[]
}

export function normalizeMetaAdCreativeType(
  raw?: string | null,
): MetaAdCreativeType {
  if (raw == null || String(raw).trim() === '')
    return 'IMAGE'
  const key = String(raw).trim()
  const mapped = META_AD_CREATIVE_TYPE_ALIASES[key]
    ?? META_AD_CREATIVE_TYPE_ALIASES[key.toUpperCase()]
  if (!mapped) {
    throw new MetaAdsToolError(
      'CREATIVE_TYPE_INVALID',
      `creativeType inválido: ${raw}. Use IMAGE|VIDEO|CAROUSEL|DYNAMIC_CREATIVE (alias: static).`,
      400,
      { creativeType: raw, allowed: META_AD_CREATIVE_TYPES },
    )
  }
  return mapped
}

export function buildVideoData(input: {
  videoId: string
  message: string
  callToAction: string
  linkUrl?: string
  headline?: string
  description?: string
  imageHash?: string
  imageUrl?: string
  /** WHATSAPP destination uses messaging CTA without site link. */
  destinationType: MetaAdDestinationType
}): Record<string, unknown> {
  const videoData: Record<string, unknown> = {
    video_id: input.videoId,
    message: input.message,
  }
  if (input.headline)
    videoData.title = input.headline
  if (input.description)
    videoData.link_description = input.description
  if (input.imageHash)
    videoData.image_hash = input.imageHash
  if (input.imageUrl)
    videoData.image_url = input.imageUrl

  if (input.destinationType === 'WHATSAPP') {
    videoData.call_to_action = {
      type: 'WHATSAPP_MESSAGE',
      value: { app_destination: 'WHATSAPP' },
    }
  }
  else {
    if (!input.linkUrl) {
      throw new MetaAdsToolError(
        'WEBSITE_CREATIVE_INPUT_REQUIRED',
        'Criativo VIDEO WEBSITE exige linkUrl.',
        400,
      )
    }
    videoData.call_to_action = {
      type: input.callToAction,
      value: { link: input.linkUrl },
    }
  }
  return videoData
}

export function buildCarouselLinkData(input: {
  message: string
  linkUrl: string
  callToAction: string
  headline?: string
  description?: string
  childAttachments: CarouselCardInput[]
}): Record<string, unknown> {
  if (input.childAttachments.length < 2 || input.childAttachments.length > 10) {
    throw new MetaAdsToolError(
      'CAROUSEL_CARDS_INVALID',
      'CAROUSEL exige childAttachments com 2–10 cards (doc Meta).',
      400,
      { count: input.childAttachments.length },
    )
  }

  const child_attachments = input.childAttachments.map((card, index) => {
    const hasImage = Boolean(card.imageHash || card.imageUrl)
    const hasVideo = Boolean(card.videoId)
    if (!hasImage && !hasVideo) {
      throw new MetaAdsToolError(
        'CAROUSEL_CARD_MEDIA_REQUIRED',
        `Card ${index}: informe imageHash, imageUrl ou videoId.`,
        400,
        { index },
      )
    }
    if (card.imageHash && card.imageUrl) {
      throw new MetaAdsToolError(
        'CAROUSEL_CARD_MEDIA_XOR',
        `Card ${index}: use imageHash OU imageUrl, não ambos.`,
        400,
        { index },
      )
    }
    const attachment: Record<string, unknown> = {
      link: card.link,
    }
    if (card.name)
      attachment.name = card.name
    if (card.description)
      attachment.description = card.description
    if (card.imageHash)
      attachment.image_hash = card.imageHash
    if (card.imageUrl)
      attachment.picture = card.imageUrl
    if (card.videoId)
      attachment.video_id = card.videoId
    return attachment
  })

  const linkData: Record<string, unknown> = {
    message: input.message,
    link: input.linkUrl,
    child_attachments,
    multi_share_optimized: true,
    call_to_action: {
      type: input.callToAction,
      value: { link: input.linkUrl },
    },
  }
  if (input.headline)
    linkData.name = input.headline
  if (input.description)
    linkData.description = input.description
  return linkData
}

export function buildAssetFeedSpec(input: AssetFeedSpecInput): Record<string, unknown> {
  const images = input.images ?? []
  const videos = input.videos ?? []
  if (images.length === 0 && videos.length === 0) {
    throw new MetaAdsToolError(
      'DYNAMIC_MEDIA_REQUIRED',
      'DYNAMIC_CREATIVE exige assetFeed.images[].hash e/ou assetFeed.videos[].videoId (mídia já na Meta).',
      400,
    )
  }
  if (!input.linkUrls?.length) {
    throw new MetaAdsToolError(
      'DYNAMIC_LINK_REQUIRED',
      'DYNAMIC_CREATIVE exige assetFeed.linkUrls com websiteUrl https.',
      400,
    )
  }
  if (!input.callToActionTypes?.length) {
    throw new MetaAdsToolError(
      'DYNAMIC_CTA_REQUIRED',
      'DYNAMIC_CREATIVE exige assetFeed.callToActionTypes (ex. LEARN_MORE).',
      400,
    )
  }
  if (!input.adFormats?.length) {
    throw new MetaAdsToolError(
      'DYNAMIC_AD_FORMAT_REQUIRED',
      'DYNAMIC_CREATIVE exige assetFeed.adFormats (SINGLE_IMAGE|SINGLE_VIDEO|CAROUSEL|AUTOMATIC_FORMAT).',
      400,
    )
  }

  const bodies = input.bodies?.length
    ? input.bodies.map(b => ({ text: b.text }))
    : undefined
  const titles = input.titles?.length
    ? input.titles.map(t => ({ text: t.text }))
    : undefined
  if (!bodies?.length && !titles?.length) {
    throw new MetaAdsToolError(
      'DYNAMIC_COPY_REQUIRED',
      'DYNAMIC_CREATIVE exige ao menos bodies[] ou titles[] no assetFeed (ou message/headline no createAd).',
      400,
    )
  }

  const spec: Record<string, unknown> = {
    ad_formats: input.adFormats,
    call_to_action_types: input.callToActionTypes,
    link_urls: input.linkUrls.map(u => ({ website_url: u.websiteUrl })),
  }
  if (bodies)
    spec.bodies = bodies
  if (titles)
    spec.titles = titles
  if (input.descriptions?.length)
    spec.descriptions = input.descriptions.map(d => ({ text: d.text }))
  if (images.length)
    spec.images = images.map(i => ({ hash: i.hash }))
  if (videos.length) {
    spec.videos = videos.map((v) => {
      const entry: Record<string, unknown> = { video_id: v.videoId }
      if (v.thumbnailUrl)
        entry.thumbnail_url = v.thumbnailUrl
      if (v.thumbnailHash)
        entry.thumbnail_hash = v.thumbnailHash
      return entry
    })
  }
  return spec
}

export type BuildCreativeGraphBodyInput = {
  creativeName: string
  pageId: string
  creativeType: MetaAdCreativeType
  destinationType: MetaAdDestinationType
  website?: BuildWebsiteLinkDataInput
  whatsapp?: BuildWhatsAppLinkDataInput
  videoId?: string
  childAttachments?: CarouselCardInput[]
  assetFeed?: AssetFeedSpecInput
}

/**
 * Builds POST /adcreatives body for IMAGE | VIDEO | CAROUSEL | DYNAMIC_CREATIVE.
 * DYNAMIC: object_story_spec.page_id + asset_feed_spec (adset must have is_dynamic_creative=true).
 */
export function buildMetaCreateAdCreativeBodyByType(
  params: BuildCreativeGraphBodyInput,
): Record<string, unknown> {
  const { creativeType, destinationType, pageId, creativeName } = params

  if (creativeType === 'DYNAMIC_CREATIVE') {
    if (destinationType === 'WHATSAPP') {
      throw new MetaAdsToolError(
        'DYNAMIC_WHATSAPP_UNSUPPORTED',
        'DYNAMIC_CREATIVE não combina com destinationType=WHATSAPP neste fluxo. Use WEBSITE.',
        400,
      )
    }
    if (!params.assetFeed) {
      throw new MetaAdsToolError(
        'DYNAMIC_ASSET_FEED_REQUIRED',
        'creativeType=DYNAMIC_CREATIVE exige assetFeed (bodies/titles/images|videos/linkUrls/CTAs/adFormats).',
        400,
      )
    }
    return {
      name: creativeName,
      object_story_spec: { page_id: pageId },
      asset_feed_spec: buildAssetFeedSpec(params.assetFeed),
    }
  }

  if (creativeType === 'CAROUSEL') {
    if (destinationType === 'WHATSAPP') {
      throw new MetaAdsToolError(
        'CAROUSEL_WHATSAPP_UNSUPPORTED',
        'CAROUSEL não combina com destinationType=WHATSAPP neste fluxo. Use WEBSITE.',
        400,
      )
    }
    if (!params.website) {
      throw new MetaAdsToolError(
        'WEBSITE_CREATIVE_INPUT_REQUIRED',
        'CAROUSEL WEBSITE exige linkUrl + message + childAttachments.',
        400,
      )
    }
    if (!params.childAttachments?.length) {
      throw new MetaAdsToolError(
        'CAROUSEL_ATTACHMENTS_REQUIRED',
        'creativeType=CAROUSEL exige childAttachments (2–10 cards).',
        400,
      )
    }
    return {
      name: creativeName,
      object_story_spec: {
        page_id: pageId,
        link_data: buildCarouselLinkData({
          message: params.website.message,
          linkUrl: params.website.linkUrl,
          callToAction: params.website.callToAction,
          headline: params.website.headline,
          description: params.website.description,
          childAttachments: params.childAttachments,
        }),
      },
    }
  }

  if (creativeType === 'VIDEO') {
    if (!params.videoId) {
      throw new MetaAdsToolError(
        'VIDEO_ID_REQUIRED',
        'creativeType=VIDEO exige videoId (vídeo já na biblioteca da ad account / Page). Sem upload binário neste endpoint.',
        400,
      )
    }
    const message = destinationType === 'WHATSAPP'
      ? params.whatsapp?.message
      : params.website?.message
    if (!message) {
      throw new MetaAdsToolError(
        'VIDEO_MESSAGE_REQUIRED',
        'Criativo VIDEO exige message.',
        400,
      )
    }
    const callToAction = destinationType === 'WHATSAPP'
      ? 'WHATSAPP_MESSAGE'
      : (params.website?.callToAction ?? 'LEARN_MORE')
    return {
      name: creativeName,
      object_story_spec: {
        page_id: pageId,
        video_data: buildVideoData({
          videoId: params.videoId,
          message,
          callToAction,
          linkUrl: params.website?.linkUrl,
          headline: destinationType === 'WHATSAPP'
            ? params.whatsapp?.headline
            : params.website?.headline,
          description: destinationType === 'WHATSAPP'
            ? params.whatsapp?.description
            : params.website?.description,
          imageHash: destinationType === 'WHATSAPP'
            ? params.whatsapp?.imageHash
            : params.website?.imageHash,
          imageUrl: destinationType === 'WHATSAPP'
            ? params.whatsapp?.imageUrl
            : params.website?.imageUrl,
          destinationType,
        }),
      },
    }
  }

  // IMAGE (default) — classic link_data
  if (destinationType === 'WHATSAPP') {
    if (!params.whatsapp) {
      throw new MetaAdsToolError(
        'WHATSAPP_CREATIVE_INPUT_REQUIRED',
        'Criativo WHATSAPP exige campos de messaging (message, etc.).',
        400,
      )
    }
    return {
      name: creativeName,
      object_story_spec: {
        page_id: pageId,
        link_data: buildWhatsAppLinkData(params.whatsapp),
      },
    }
  }
  if (!params.website) {
    throw new MetaAdsToolError(
      'WEBSITE_CREATIVE_INPUT_REQUIRED',
      'Criativo IMAGE WEBSITE exige linkUrl + message.',
      400,
    )
  }
  return {
    name: creativeName,
    object_story_spec: {
      page_id: pageId,
      link_data: buildWebsiteLinkData(params.website),
    },
  }
}
