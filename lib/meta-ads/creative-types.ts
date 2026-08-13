/**
 * Meta AdCreative type builders (Marketing API object_story_spec).
 * Media must already exist as image_hash / video_id (or HTTPS picture URL) — no binary upload here.
 *
 * Official refs:
 * - object_story_spec: link_data | video_data | photo_data | template_data
 * - carousel: link_data.child_attachments
 *
 * NOT supported (and intentionally out of MCP):
 * - Dynamic Creative (asset_feed_spec + adset is_dynamic_creative) — still in Marketing API
 *   but largely hidden in Ads Manager; requires special adset; no WhatsApp; createAdset
 *   cannot set the flag. Prefer multiple IMAGE/VIDEO ads in the same adset for competition.
 * - Flexible Ad Format (creative_asset_groups_spec) — OUTCOME_SALES / OUTCOME_APP_PROMOTION only.
 * - Ads Manager "Mídia flexível" — Advantage+ Creative `pac_relaxation` (degrees_of_freedom_spec),
 *   not a creative type.
 * - "Teste de criativo" — Ad Studies / SPLIT_TEST_V2 + creative_test_config (Experiments API).
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
}

/** Removed creative types — reject with a clear migration message. */
const REMOVED_CREATIVE_TYPES = new Set([
  'DYNAMIC_CREATIVE',
  'DYNAMIC',
  'dynamic',
  'dynamic_creative',
  'FLEXIBLE',
  'FLEXIBLE_MEDIA',
  'flexible',
  'flexible_media',
])

export type CarouselCardInput = {
  link: string
  name?: string
  description?: string
  imageHash?: string
  imageUrl?: string
  videoId?: string
}

export function normalizeMetaAdCreativeType(
  raw?: string | null,
): MetaAdCreativeType {
  if (raw == null || String(raw).trim() === '')
    return 'IMAGE'
  const key = String(raw).trim()
  if (REMOVED_CREATIVE_TYPES.has(key) || REMOVED_CREATIVE_TYPES.has(key.toUpperCase())) {
    throw new MetaAdsToolError(
      'CREATIVE_TYPE_REMOVED',
      'DYNAMIC_CREATIVE / Flexible Media não são creativeType no Blimber. '
      + 'Para criativos competindo: vários ads IMAGE|VIDEO no mesmo adset. '
      + 'Mídia flexível no Ads Manager = Advantage+ pac_relaxation (fora do MCP). '
      + 'Teste de criativo = Experiments / Ad Studies (fora do MCP). '
      + 'Use IMAGE|VIDEO|CAROUSEL.',
      400,
      { creativeType: raw, allowed: META_AD_CREATIVE_TYPES },
    )
  }
  const mapped = META_AD_CREATIVE_TYPE_ALIASES[key]
    ?? META_AD_CREATIVE_TYPE_ALIASES[key.toUpperCase()]
  if (!mapped) {
    throw new MetaAdsToolError(
      'CREATIVE_TYPE_INVALID',
      `creativeType inválido: ${raw}. Use IMAGE|VIDEO|CAROUSEL (alias: static).`,
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

export type BuildCreativeGraphBodyInput = {
  creativeName: string
  pageId: string
  creativeType: MetaAdCreativeType
  destinationType: MetaAdDestinationType
  website?: BuildWebsiteLinkDataInput
  whatsapp?: BuildWhatsAppLinkDataInput
  videoId?: string
  childAttachments?: CarouselCardInput[]
}

/**
 * Builds POST /adcreatives body for IMAGE | VIDEO | CAROUSEL.
 */
export function buildMetaCreateAdCreativeBodyByType(
  params: BuildCreativeGraphBodyInput,
): Record<string, unknown> {
  const { creativeType, destinationType, pageId, creativeName } = params

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
