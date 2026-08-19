/**
 * Meta AdCreative type builders (Marketing API object_story_spec / asset_feed_spec /
 * degrees_of_freedom_spec).
 *
 * Official refs:
 * - object_story_spec: link_data | video_data | photo_data | template_data
 * - carousel: link_data.child_attachments (mixed image/video allowed by Marketing API)
 * - Dynamic Creative (LEGACY): asset_feed_spec + adset is_dynamic_creative=true
 * - Advantage+ Creative: degrees_of_freedom_spec.creative_features_spec
 * - Ads Manager "Mídia flexível" = pac_relaxation (NOT Dynamic Creative / NOT Flexible Ad Format)
 *
 * NOT implemented here (uses separate tools):
 * - Flexible Ad Format (creative_asset_groups_spec) → meta_create_flexible_ad (separate module)
 * - Collection / Instant Experience canvas
 */

import { MetaAdsToolError } from './types'
import type { MetaAdDestinationType } from './ad-destination'
import {
  assertCreativeDestinationCompatibility,
  buildMessagingCallToAction,
  buildMessagingLinkData,
  buildWebsiteLinkData,
  isMessagingDestination,
  META_MESSAGING_CTA_BY_DESTINATION,
  type BuildWebsiteLinkDataInput,
  type BuildWhatsAppLinkDataInput,
} from './ad-destination'

/** Canonical creative formats supported by Blimber createAd. */
export const META_AD_CREATIVE_TYPES = [
  'IMAGE',
  'VIDEO',
  'CAROUSEL',
  'DYNAMIC_CREATIVE_LEGACY',
  'CATALOG',
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
  DYNAMIC_CREATIVE_LEGACY: 'DYNAMIC_CREATIVE_LEGACY',
  DYNAMIC_CREATIVE: 'DYNAMIC_CREATIVE_LEGACY',
  DYNAMIC: 'DYNAMIC_CREATIVE_LEGACY',
  dynamic: 'DYNAMIC_CREATIVE_LEGACY',
  dynamic_creative: 'DYNAMIC_CREATIVE_LEGACY',
  dynamic_creative_legacy: 'DYNAMIC_CREATIVE_LEGACY',
  CATALOG: 'CATALOG',
  catalog: 'CATALOG',
  PRODUCT_CATALOG: 'CATALOG',
}

/** Explicitly rejected — Flexible Ad Format is not a createAd creativeType. */
const BLOCKED_CREATIVE_TYPES = new Set([
  'FLEXIBLE',
  'FLEXIBLE_MEDIA',
  'FLEXIBLE_AD_FORMAT',
  'flexible',
  'flexible_media',
  'flexible_ad_format',
  'COLLECTION',
  'collection',
])

export const META_DYNAMIC_AD_FORMATS = [
  'SINGLE_IMAGE',
  'SINGLE_VIDEO',
  'CAROUSEL',
  'AUTOMATIC_FORMAT',
] as const

export type MetaDynamicAdFormat = (typeof META_DYNAMIC_AD_FORMATS)[number]

/** Closed set of Advantage+ Creative feature keys (Marketing API creative_features_spec). */
export const META_ADVANTAGE_PLUS_FEATURES = [
  'image_touchups',
  'inline_comment',
  'image_template',
  'text_optimizations',
  'image_brightness_and_contrast',
  'enhance_cta',
  'pac_relaxation',
  'adapt_to_placement',
  'media_type_automation',
] as const

export type MetaAdvantagePlusFeature = (typeof META_ADVANTAGE_PLUS_FEATURES)[number]

export const META_ADVANTAGE_ENROLL_STATUS = ['OPT_IN', 'OPT_OUT'] as const
export type MetaAdvantageEnrollStatus = (typeof META_ADVANTAGE_ENROLL_STATUS)[number]

export type CarouselCardInput = {
  /** Required for WEBSITE; omitted/injected for messaging destinations. */
  link?: string
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

export type DegreesOfFreedomSpecInput = {
  creativeFeaturesSpec: Partial<Record<MetaAdvantagePlusFeature, { enrollStatus: MetaAdvantageEnrollStatus }>>
}

export function normalizeMetaAdCreativeType(
  raw?: string | null,
): MetaAdCreativeType {
  if (raw == null || String(raw).trim() === '')
    return 'IMAGE'
  const key = String(raw).trim()
  if (BLOCKED_CREATIVE_TYPES.has(key) || BLOCKED_CREATIVE_TYPES.has(key.toUpperCase())) {
    throw new MetaAdsToolError(
      'CREATIVE_TYPE_UNSUPPORTED',
      'FLEXIBLE_AD_FORMAT / COLLECTION não são creativeType no Blimber. '
      + 'Mídia flexível (Ads Manager) = Advantage+ pac_relaxation via degreesOfFreedomSpec. '
      + 'Flexible Ad Format (creative_asset_groups_spec) está capability=false nesta Graph version. '
      + 'Use IMAGE|VIDEO|CAROUSEL|DYNAMIC_CREATIVE_LEGACY|CATALOG.',
      400,
      { creativeType: raw, allowed: META_AD_CREATIVE_TYPES },
    )
  }
  const mapped = META_AD_CREATIVE_TYPE_ALIASES[key]
    ?? META_AD_CREATIVE_TYPE_ALIASES[key.toUpperCase()]
  if (!mapped) {
    throw new MetaAdsToolError(
      'CREATIVE_TYPE_INVALID',
      `creativeType inválido: ${raw}. Use IMAGE|VIDEO|CAROUSEL|DYNAMIC_CREATIVE_LEGACY|CATALOG.`,
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
  welcomeMessage?: string
  /** Messaging destinations use official CTA without site link. */
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
  if (input.welcomeMessage && isMessagingDestination(input.destinationType)) {
    videoData.page_welcome_message = {
      type: 'VISUAL_EDITOR',
      version: 2,
      landing_screen_type: 'welcome_message',
      media_type: 'text',
      text_format: {
        customer_action_type: 'autofill_message',
        message: {
          text: input.welcomeMessage,
          autofill_message: { content: input.welcomeMessage },
        },
      },
    }
  }

  if (isMessagingDestination(input.destinationType)) {
    videoData.call_to_action = buildMessagingCallToAction(input.destinationType)
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
  destinationType: MetaAdDestinationType
  linkUrl?: string
  callToAction: string
  headline?: string
  description?: string
  welcomeMessage?: string
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

  const messaging = isMessagingDestination(input.destinationType)
  const messagingSpec = messaging
    ? META_MESSAGING_CTA_BY_DESTINATION[input.destinationType]
    : null
  const messagingCta = messaging
    ? buildMessagingCallToAction(input.destinationType)
    : null

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
    if (!messaging && !card.link) {
      throw new MetaAdsToolError(
        'CAROUSEL_CARD_LINK_REQUIRED',
        `Card ${index}: CAROUSEL WEBSITE exige link https em cada card.`,
        400,
        { index },
      )
    }
    const attachment: Record<string, unknown> = {}
    if (messaging) {
      if (messagingSpec?.link)
        attachment.link = messagingSpec.link
      if (messagingCta)
        attachment.call_to_action = messagingCta
    }
    else {
      attachment.link = card.link
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
    child_attachments,
    multi_share_optimized: true,
  }

  if (messaging && messagingCta) {
    if (messagingSpec?.link)
      linkData.link = messagingSpec.link
    linkData.call_to_action = messagingCta
  }
  else {
    if (!input.linkUrl) {
      throw new MetaAdsToolError(
        'WEBSITE_CREATIVE_INPUT_REQUIRED',
        'CAROUSEL WEBSITE exige linkUrl + message + childAttachments.',
        400,
      )
    }
    linkData.link = input.linkUrl
    linkData.call_to_action = {
      type: input.callToAction,
      value: { link: input.linkUrl },
    }
  }

  if (input.headline)
    linkData.name = input.headline
  if (input.description)
    linkData.description = input.description
  if (input.welcomeMessage && messaging) {
    linkData.page_welcome_message = {
      type: 'VISUAL_EDITOR',
      version: 2,
      landing_screen_type: 'welcome_message',
      media_type: 'text',
      text_format: {
        customer_action_type: 'autofill_message',
        message: {
          text: input.welcomeMessage,
          autofill_message: { content: input.welcomeMessage },
        },
      },
    }
  }
  return linkData
}

/**
 * Typed builder for asset_feed_spec (Dynamic Creative legacy).
 */
export function buildAssetFeedSpec(input: AssetFeedSpecInput): Record<string, unknown> {
  const images = input.images ?? []
  const videos = input.videos ?? []
  if (images.length === 0 && videos.length === 0) {
    throw new MetaAdsToolError(
      'DYNAMIC_MEDIA_REQUIRED',
      'DYNAMIC_CREATIVE_LEGACY exige assetFeed.images[].hash e/ou assetFeed.videos[].videoId.',
      400,
    )
  }
  if (!input.linkUrls?.length) {
    throw new MetaAdsToolError(
      'DYNAMIC_LINK_REQUIRED',
      'DYNAMIC_CREATIVE_LEGACY exige assetFeed.linkUrls com websiteUrl https.',
      400,
    )
  }
  if (!input.callToActionTypes?.length) {
    throw new MetaAdsToolError(
      'DYNAMIC_CTA_REQUIRED',
      'DYNAMIC_CREATIVE_LEGACY exige assetFeed.callToActionTypes (ex. LEARN_MORE).',
      400,
    )
  }
  if (!input.adFormats?.length) {
    throw new MetaAdsToolError(
      'DYNAMIC_AD_FORMAT_REQUIRED',
      'DYNAMIC_CREATIVE_LEGACY exige assetFeed.adFormats (SINGLE_IMAGE|SINGLE_VIDEO|CAROUSEL|AUTOMATIC_FORMAT).',
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
      'DYNAMIC_CREATIVE_LEGACY exige bodies[] ou titles[] no assetFeed (ou message/headline no createAd).',
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

/**
 * Typed builder for degrees_of_freedom_spec (Advantage+ Creative).
 * Closed feature keys only — no raw passthrough.
 */
export function buildDegreesOfFreedomSpec(
  input: DegreesOfFreedomSpecInput,
): Record<string, unknown> {
  const entries = Object.entries(input.creativeFeaturesSpec || {})
  if (!entries.length) {
    throw new MetaAdsToolError(
      'ADVANTAGE_FEATURES_REQUIRED',
      'degreesOfFreedomSpec.creativeFeaturesSpec exige ao menos uma feature OPT_IN|OPT_OUT.',
      400,
    )
  }

  const creative_features_spec: Record<string, { enroll_status: string }> = {}
  for (const [key, value] of entries) {
    if (!(META_ADVANTAGE_PLUS_FEATURES as readonly string[]).includes(key)) {
      throw new MetaAdsToolError(
        'ADVANTAGE_FEATURE_INVALID',
        `Feature Advantage+ inválida: ${key}.`,
        400,
        { feature: key, allowed: META_ADVANTAGE_PLUS_FEATURES },
      )
    }
    if (!value?.enrollStatus || !(META_ADVANTAGE_ENROLL_STATUS as readonly string[]).includes(value.enrollStatus)) {
      throw new MetaAdsToolError(
        'ADVANTAGE_ENROLL_INVALID',
        `enrollStatus de ${key} deve ser OPT_IN ou OPT_OUT.`,
        400,
      )
    }
    creative_features_spec[key] = { enroll_status: value.enrollStatus }
  }

  return { creative_features_spec }
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
  degreesOfFreedom?: DegreesOfFreedomSpecInput
  /** CATALOG only */
  productSetId?: string
  /** INSTAGRAM_DIRECT — instagram_actor_id (Page-connected IG). */
  instagramActorId?: string
}

/**
 * Builds POST /adcreatives body for IMAGE | VIDEO | CAROUSEL | DYNAMIC_CREATIVE_LEGACY | CATALOG.
 * Optional Advantage+ degrees_of_freedom_spec on IMAGE|VIDEO|CAROUSEL|CATALOG.
 */
export function buildMetaCreateAdCreativeBodyByType(
  params: BuildCreativeGraphBodyInput,
): Record<string, unknown> {
  const { creativeType, destinationType, pageId, creativeName } = params
  assertCreativeDestinationCompatibility({ creativeType, destinationType })

  const objectStoryBase: Record<string, unknown> = { page_id: pageId }
  if (destinationType === 'INSTAGRAM_DIRECT') {
    if (!params.instagramActorId) {
      throw new MetaAdsToolError(
        'META_INSTAGRAM_ACTOR_REQUIRED',
        'destinationType=INSTAGRAM_DIRECT exige instagram_business_account_id na integração (instagram_actor_id).',
        400,
      )
    }
    objectStoryBase.instagram_actor_id = params.instagramActorId
  }

  let body: Record<string, unknown>

  if (creativeType === 'DYNAMIC_CREATIVE_LEGACY') {
    if (!params.assetFeed) {
      throw new MetaAdsToolError(
        'DYNAMIC_ASSET_FEED_REQUIRED',
        'creativeType=DYNAMIC_CREATIVE_LEGACY exige assetFeed (asset_feed_spec).',
        400,
      )
    }
    body = {
      name: creativeName,
      object_story_spec: { page_id: pageId },
      asset_feed_spec: buildAssetFeedSpec(params.assetFeed),
    }
  }
  else if (creativeType === 'CATALOG') {
    if (!params.productSetId) {
      throw new MetaAdsToolError(
        'CATALOG_PRODUCT_SET_REQUIRED',
        'creativeType=CATALOG exige productSetId (ownership validada no execute).',
        400,
      )
    }
    if (!params.website) {
      throw new MetaAdsToolError(
        'WEBSITE_CREATIVE_INPUT_REQUIRED',
        'CATALOG exige linkUrl + message.',
        400,
      )
    }
    const templateData: Record<string, unknown> = {
      message: params.website.message,
      link: params.website.linkUrl,
      call_to_action: {
        type: params.website.callToAction,
        value: { link: params.website.linkUrl },
      },
    }
    if (params.website.headline)
      templateData.name = params.website.headline
    if (params.website.description)
      templateData.description = params.website.description

    body = {
      name: creativeName,
      product_set_id: params.productSetId,
      object_story_spec: {
        page_id: pageId,
        template_data: templateData,
      },
    }
  }
  else if (creativeType === 'CAROUSEL') {
    if (!params.childAttachments?.length) {
      throw new MetaAdsToolError(
        'CAROUSEL_ATTACHMENTS_REQUIRED',
        'creativeType=CAROUSEL exige childAttachments (2–10 cards).',
        400,
      )
    }
    const message = isMessagingDestination(destinationType)
      ? params.whatsapp?.message
      : params.website?.message
    if (!message) {
      throw new MetaAdsToolError(
        'CAROUSEL_MESSAGE_REQUIRED',
        'Criativo CAROUSEL exige message.',
        400,
      )
    }
    body = {
      name: creativeName,
      object_story_spec: {
        ...objectStoryBase,
        link_data: buildCarouselLinkData({
          message,
          destinationType,
          linkUrl: params.website?.linkUrl,
          callToAction: params.website?.callToAction ?? 'LEARN_MORE',
          headline: isMessagingDestination(destinationType)
            ? params.whatsapp?.headline
            : params.website?.headline,
          description: isMessagingDestination(destinationType)
            ? params.whatsapp?.description
            : params.website?.description,
          welcomeMessage: params.whatsapp?.welcomeMessage,
          childAttachments: params.childAttachments,
        }),
      },
    }
  }
  else if (creativeType === 'VIDEO') {
    if (!params.videoId) {
      throw new MetaAdsToolError(
        'VIDEO_ID_REQUIRED',
        'creativeType=VIDEO exige videoId (já na Meta ou via meta_upload_video).',
        400,
      )
    }
    const message = isMessagingDestination(destinationType)
      ? params.whatsapp?.message
      : params.website?.message
    if (!message) {
      throw new MetaAdsToolError(
        'VIDEO_MESSAGE_REQUIRED',
        'Criativo VIDEO exige message.',
        400,
      )
    }
    const callToAction = isMessagingDestination(destinationType)
      ? META_MESSAGING_CTA_BY_DESTINATION[destinationType].type
      : (params.website?.callToAction ?? 'LEARN_MORE')
    body = {
      name: creativeName,
      object_story_spec: {
        ...objectStoryBase,
        video_data: buildVideoData({
          videoId: params.videoId,
          message,
          callToAction,
          linkUrl: params.website?.linkUrl,
          headline: isMessagingDestination(destinationType)
            ? params.whatsapp?.headline
            : params.website?.headline,
          description: isMessagingDestination(destinationType)
            ? params.whatsapp?.description
            : params.website?.description,
          imageHash: isMessagingDestination(destinationType)
            ? params.whatsapp?.imageHash
            : params.website?.imageHash,
          imageUrl: isMessagingDestination(destinationType)
            ? params.whatsapp?.imageUrl
            : params.website?.imageUrl,
          welcomeMessage: params.whatsapp?.welcomeMessage,
          destinationType,
        }),
      },
    }
  }
  else if (isMessagingDestination(destinationType)) {
    // IMAGE default
    if (!params.whatsapp) {
      throw new MetaAdsToolError(
        'MESSAGING_CREATIVE_INPUT_REQUIRED',
        `Criativo ${destinationType} exige campos de messaging (message, etc.).`,
        400,
      )
    }
    body = {
      name: creativeName,
      object_story_spec: {
        ...objectStoryBase,
        link_data: buildMessagingLinkData(destinationType, params.whatsapp),
      },
    }
  }
  else {
    if (!params.website) {
      throw new MetaAdsToolError(
        'WEBSITE_CREATIVE_INPUT_REQUIRED',
        'Criativo IMAGE WEBSITE exige linkUrl + message.',
        400,
      )
    }
    body = {
      name: creativeName,
      object_story_spec: {
        ...objectStoryBase,
        link_data: buildWebsiteLinkData(params.website),
      },
    }
  }

  if (params.degreesOfFreedom) {
    if (creativeType === 'DYNAMIC_CREATIVE_LEGACY') {
      throw new MetaAdsToolError(
        'ADVANTAGE_DYNAMIC_XOR',
        'degreesOfFreedomSpec (Advantage+) não combina com DYNAMIC_CREATIVE_LEGACY no mesmo criativo.',
        400,
      )
    }
    body.degrees_of_freedom_spec = buildDegreesOfFreedomSpec(params.degreesOfFreedom)
  }

  return body
}
