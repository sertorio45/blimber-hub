import { z } from 'zod'

// ── Types ──

export type PlacementAssetImageInput = {
  imageHash?: string
  imageUrl?: string
  assetId?: string
  label: string
}

export type PlacementAssetVideoInput = {
  videoId?: string
  videoUrl?: string
  label: string
}

export type PlacementAssetRule = {
  label: string
  platforms?: string[]
  facebookPositions?: string[]
  instagramPositions?: string[]
  messengerPositions?: string[]
  audienceNetworkPositions?: string[]
}

export type PlacementAssetsInput = {
  images: PlacementAssetImageInput[]
  videos?: PlacementAssetVideoInput[]
  rules: PlacementAssetRule[]
}

// ── Zod Schema ──

const placementAssetImageSchema = z.object({
  imageHash: z.string().min(1).optional(),
  imageUrl: z.string().url().optional(),
  assetId: z.string().uuid().optional(),
  label: z.string().min(1),
}).refine(
  d => [d.imageHash, d.imageUrl, d.assetId].filter(Boolean).length >= 1,
  { message: 'Informe imageHash, imageUrl ou assetId para cada imagem.' },
)

const placementAssetVideoSchema = z.object({
  videoId: z.string().min(1).optional(),
  videoUrl: z.string().url().optional(),
  label: z.string().min(1),
}).refine(
  d => Boolean(d.videoId) || Boolean(d.videoUrl),
  { message: 'Informe videoId ou videoUrl para cada vídeo.' },
)

const placementAssetRuleSchema = z.object({
  label: z.string().min(1),
  platforms: z.array(z.string()).optional(),
  facebookPositions: z.array(z.string()).optional(),
  instagramPositions: z.array(z.string()).optional(),
  messengerPositions: z.array(z.string()).optional(),
  audienceNetworkPositions: z.array(z.string()).optional(),
})

export const placementAssetsSchema = z.object({
  images: z.array(placementAssetImageSchema).min(1),
  videos: z.array(placementAssetVideoSchema).optional(),
  rules: z.array(placementAssetRuleSchema).min(1),
})

// ── Builder ──

export function buildPlacementAssetFeedSpec(params: {
  resolvedImages: Array<{ label: string, hash: string }>
  resolvedVideos?: Array<{ label: string, videoId: string }>
  rules: PlacementAssetRule[]
  bodies?: Array<{ text: string }>
  titles?: Array<{ text: string }>
  descriptions?: Array<{ text: string }>
  linkUrls?: Array<{ websiteUrl: string }>
  callToActionTypes?: string[]
}): Record<string, unknown> {
  const spec: Record<string, unknown> = {}

  spec.images = params.resolvedImages.map(img => ({
    hash: img.hash,
    adlabels: [{ name: img.label }],
  }))

  if (params.resolvedVideos?.length) {
    spec.videos = params.resolvedVideos.map(vid => ({
      video_id: vid.videoId,
      adlabels: [{ name: vid.label }],
    }))
  }

  if (params.bodies?.length)
    spec.bodies = params.bodies
  if (params.titles?.length)
    spec.titles = params.titles
  if (params.descriptions?.length)
    spec.descriptions = params.descriptions
  if (params.linkUrls?.length)
    spec.link_urls = params.linkUrls.map(u => ({ website_url: u.websiteUrl }))
  if (params.callToActionTypes?.length)
    spec.call_to_action_types = params.callToActionTypes

  const videoLabels = new Set(
    (params.resolvedVideos ?? []).map(v => v.label),
  )

  spec.asset_customization_rules = params.rules.map((rule) => {
    const customizationSpec: Record<string, unknown> = {}
    if (rule.platforms?.length)
      customizationSpec.publisher_platforms = rule.platforms
    if (rule.facebookPositions?.length)
      customizationSpec.facebook_positions = rule.facebookPositions
    if (rule.instagramPositions?.length)
      customizationSpec.instagram_positions = rule.instagramPositions
    if (rule.messengerPositions?.length)
      customizationSpec.messenger_positions = rule.messengerPositions
    if (rule.audienceNetworkPositions?.length)
      customizationSpec.audience_network_positions = rule.audienceNetworkPositions

    const entry: Record<string, unknown> = { customization_spec: customizationSpec }

    if (videoLabels.has(rule.label)) {
      entry.video_label = { name: rule.label }
    }
    else {
      entry.image_label = { name: rule.label }
    }

    return entry
  })

  return spec
}

// ── Placement Options Constant ──

export const PLACEMENT_OPTIONS = {
  platforms: ['facebook', 'instagram', 'messenger', 'audience_network'],
  facebook_positions: [
    'feed',
    'right_hand_column',
    'instant_article',
    'marketplace',
    'video_feeds',
    'story',
    'search',
    'reels',
    'profile_feed',
    'facebook_reels_overlay',
  ],
  instagram_positions: [
    'stream',
    'story',
    'explore',
    'explore_home',
    'reels',
    'profile_feed',
    'ig_search',
    'profile_reels',
  ],
  messenger_positions: [
    'messenger_home',
    'sponsored_messages',
    'story',
  ],
  audience_network_positions: [
    'classic',
    'rewarded_video',
  ],
} as const
