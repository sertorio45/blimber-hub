/**
 * Ad destination helpers for Meta Marketing API create flows.
 * Destination is NOT a campaign objective.
 *
 * Official refs (Graph v25):
 * - destination_type: WEBSITE | WHATSAPP | MESSENGER | INSTAGRAM_DIRECT | INSTAGRAM_PROFILE
 * - Ads that Click to WhatsApp — IMAGE, VIDEO, CAROUSEL, slideshow
 * - Ads that Click to Messenger / Instagram — IMAGE, VIDEO, CAROUSEL
 */

import { MetaAdsToolError } from './types'

export const META_AD_DESTINATION_TYPES = [
  'WEBSITE',
  'WHATSAPP',
  'MESSENGER',
  'INSTAGRAM_DIRECT',
  'INSTAGRAM_PROFILE',
] as const
export type MetaAdDestinationType = (typeof META_AD_DESTINATION_TYPES)[number]

export const META_MESSAGING_DESTINATION_TYPES = [
  'WHATSAPP',
  'MESSENGER',
  'INSTAGRAM_DIRECT',
] as const
export type MetaMessagingDestinationType = (typeof META_MESSAGING_DESTINATION_TYPES)[number]

export function isInstagramProfileDestination(
  raw: string | null | undefined,
): raw is 'INSTAGRAM_PROFILE' {
  return String(raw || '') === 'INSTAGRAM_PROFILE'
}

/**
 * Meta Marketing API protocol value for CTWA `link_data.link`.
 * This is NOT a user-facing website URL and must never be invented as `linkUrl` input.
 * Official docs: Ads that Click to WhatsApp (creative step).
 */
export const META_WHATSAPP_MESSAGING_LINK = 'https://api.whatsapp.com/send'

/** Official Messenger protocol link used in Click-to-Multidestination / CTM creatives. */
export const META_MESSENGER_MESSAGING_LINK = 'https://fb.com/messenger_doc/'

/** Campaign objectives supported for single-destination Click-to-WhatsApp adsets. */
export const META_CTWA_CAMPAIGN_OBJECTIVES = [
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS',
  'OUTCOME_SALES',
  'OUTCOME_TRAFFIC',
] as const

export type MetaCtwaCampaignObjective = (typeof META_CTWA_CAMPAIGN_OBJECTIVES)[number]

/**
 * Official CTWA optimization goals by campaign objective
 * (Meta Marketing API — Ads that Click to WhatsApp, ad set step).
 */
export const META_CTWA_OPTIMIZATION_GOALS_BY_OBJECTIVE: Record<
  MetaCtwaCampaignObjective,
  readonly string[]
> = {
  OUTCOME_ENGAGEMENT: ['CONVERSATIONS', 'LINK_CLICKS'],
  OUTCOME_LEADS: ['CONVERSATIONS'],
  OUTCOME_SALES: [
    'CONVERSATIONS',
    'OFFSITE_CONVERSIONS',
    'LINK_CLICKS',
    'IMPRESSIONS',
    'REACH',
  ],
  OUTCOME_TRAFFIC: [
    'CONVERSATIONS',
    'LANDING_PAGE_VIEWS',
    'LINK_CLICKS',
    'IMPRESSIONS',
    'REACH',
    'POST_ENGAGEMENT',
  ],
}

/** Click-to-Messenger objectives (destination_type table + Messenger ads guide). */
export const META_MESSENGER_CAMPAIGN_OBJECTIVES = [
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_SALES',
  'OUTCOME_TRAFFIC',
  'OUTCOME_AWARENESS',
] as const

/** Click-to-Instagram Direct objectives (Ads that Click to Instagram guide). */
export const META_INSTAGRAM_DIRECT_CAMPAIGN_OBJECTIVES = [
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_SALES',
  'OUTCOME_TRAFFIC',
] as const

/** Profile visit campaigns currently exposed by Meta's create-ad-set contract. */
export const META_INSTAGRAM_PROFILE_OPTIMIZATION_BY_OBJECTIVE = {
  OUTCOME_TRAFFIC: ['PROFILE_VISIT'],
  OUTCOME_ENGAGEMENT: ['PROFILE_AND_PAGE_ENGAGEMENT'],
} as const

export type MetaMessagingCtaSpec = {
  type: string
  appDestination: string
  /** Parent/child `link` when the official example requires a protocol URL. */
  link: string | null
}

export const META_MESSAGING_CTA_BY_DESTINATION: Record<
  MetaMessagingDestinationType,
  MetaMessagingCtaSpec
> = {
  WHATSAPP: {
    type: 'WHATSAPP_MESSAGE',
    appDestination: 'WHATSAPP',
    link: META_WHATSAPP_MESSAGING_LINK,
  },
  MESSENGER: {
    type: 'MESSAGE_PAGE',
    appDestination: 'MESSENGER',
    link: META_MESSENGER_MESSAGING_LINK,
  },
  INSTAGRAM_DIRECT: {
    type: 'INSTAGRAM_MESSAGE',
    appDestination: 'INSTAGRAM_DIRECT',
    // Official IG image/carousel examples omit `link` on link_data / children.
    link: null,
  },
}

const MESSAGING_HOST_RE = /^(?:www\.)?(?:api\.whatsapp\.com|wa\.me|chat\.whatsapp\.com)$/i

export function isMessagingDestination(
  raw: string | null | undefined,
): raw is MetaMessagingDestinationType {
  return (META_MESSAGING_DESTINATION_TYPES as readonly string[]).includes(String(raw || ''))
}

export function forcedCallToActionForDestination(
  destinationType: MetaAdDestinationType,
  websiteFallback = 'LEARN_MORE',
): string {
  if (isMessagingDestination(destinationType))
    return META_MESSAGING_CTA_BY_DESTINATION[destinationType].type
  return websiteFallback
}

export function buildMessagingCallToAction(
  destinationType: MetaMessagingDestinationType,
): { type: string, value: Record<string, unknown> } {
  const spec = META_MESSAGING_CTA_BY_DESTINATION[destinationType]
  return {
    type: spec.type,
    value: { app_destination: spec.appDestination },
  }
}

/**
 * True when URL hostname is a WhatsApp/messaging protocol host.
 * Used to reject fake wa.me / api.whatsapp.com as WEBSITE `linkUrl`.
 */
export function isMetaMessagingProtocolUrl(raw: string): boolean {
  try {
    const host = new URL(String(raw || '').trim()).hostname
    return MESSAGING_HOST_RE.test(host)
  }
  catch {
    return false
  }
}

export function isCtwaCampaignObjective(
  objective: string,
): objective is MetaCtwaCampaignObjective {
  return (META_CTWA_CAMPAIGN_OBJECTIVES as readonly string[]).includes(objective)
}

/**
 * IMAGE|VIDEO|CAROUSEL work with WEBSITE and messaging destinations (official Meta guides).
 * DYNAMIC_CREATIVE_LEGACY and CATALOG remain WEBSITE-only in this Blimber flow.
 */
export function assertCreativeDestinationCompatibility(params: {
  creativeType: string
  destinationType: MetaAdDestinationType
}): void {
  const { creativeType, destinationType } = params
  if (destinationType === 'WEBSITE')
    return

  if (destinationType === 'INSTAGRAM_PROFILE') {
    if (creativeType === 'DYNAMIC_CREATIVE_LEGACY' || creativeType === 'CATALOG') {
      throw new MetaAdsToolError(
        'INSTAGRAM_PROFILE_CREATIVE_UNSUPPORTED',
        `${creativeType} não combina com destinationType=INSTAGRAM_PROFILE. Use IMAGE, VIDEO ou CAROUSEL.`,
        400,
        { creativeType, destinationType },
      )
    }
    return
  }

  if (creativeType === 'DYNAMIC_CREATIVE_LEGACY') {
    throw new MetaAdsToolError(
      'DYNAMIC_MESSAGING_UNSUPPORTED',
      `DYNAMIC_CREATIVE_LEGACY não combina com destinationType=${destinationType}. Use WEBSITE.`,
      400,
      { creativeType, destinationType },
    )
  }
  if (creativeType === 'CATALOG') {
    throw new MetaAdsToolError(
      'CATALOG_MESSAGING_UNSUPPORTED',
      `CATALOG não combina com destinationType=${destinationType} neste fluxo. Use WEBSITE.`,
      400,
      { creativeType, destinationType },
    )
  }
}

/**
 * Validate campaign objective × destination × optimization_goal for messaging adsets.
 * `campaignObjective` may be omitted on dry-run; when present, full matrix is checked.
 */
export function assertWhatsAppAdsetCompatibility(params: {
  destinationType: MetaAdDestinationType
  optimizationGoal: string
  billingEvent: string
  campaignObjective?: string | null
}): void {
  assertMessagingAdsetCompatibility(params)
}

export function assertMessagingAdsetCompatibility(params: {
  destinationType: MetaAdDestinationType
  optimizationGoal: string
  billingEvent: string
  campaignObjective?: string | null
}): void {
  if (!isMessagingDestination(params.destinationType))
    return

  if (params.billingEvent !== 'IMPRESSIONS') {
    throw new MetaAdsToolError(
      'MESSAGING_BILLING_EVENT_INVALID',
      `Adsets ${params.destinationType} exigem billingEvent=IMPRESSIONS (docs Meta Click-to-Message).`,
      400,
      { billingEvent: params.billingEvent, destinationType: params.destinationType },
    )
  }

  const objective = params.campaignObjective ? String(params.campaignObjective).trim() : ''
  if (!objective)
    return

  if (params.destinationType === 'WHATSAPP') {
    if (!isCtwaCampaignObjective(objective)) {
      throw new MetaAdsToolError(
        'WHATSAPP_OBJECTIVE_INCOMPATIBLE',
        `Objetivo ${objective} não suporta destinationType=WHATSAPP. Use OUTCOME_ENGAGEMENT|LEADS|SALES|TRAFFIC (WHATSAPP não é objective).`,
        400,
        {
          campaignObjective: objective,
          allowedObjectives: META_CTWA_CAMPAIGN_OBJECTIVES,
        },
      )
    }
    const allowed = META_CTWA_OPTIMIZATION_GOALS_BY_OBJECTIVE[objective]
    if (!allowed.includes(params.optimizationGoal)) {
      throw new MetaAdsToolError(
        'WHATSAPP_OPTIMIZATION_INCOMPATIBLE',
        `optimizationGoal=${params.optimizationGoal} incompatível com ${objective} + destination WHATSAPP. Permitidos: ${allowed.join(', ')}.`,
        400,
        {
          campaignObjective: objective,
          optimizationGoal: params.optimizationGoal,
          allowedOptimizationGoals: allowed,
        },
      )
    }
    return
  }

  const allowedObjectives = params.destinationType === 'MESSENGER'
    ? META_MESSENGER_CAMPAIGN_OBJECTIVES
    : META_INSTAGRAM_DIRECT_CAMPAIGN_OBJECTIVES
  if (!(allowedObjectives as readonly string[]).includes(objective)) {
    throw new MetaAdsToolError(
      'MESSAGING_OBJECTIVE_INCOMPATIBLE',
      `Objetivo ${objective} não suporta destinationType=${params.destinationType}. Permitidos: ${allowedObjectives.join(', ')}.`,
      400,
      { campaignObjective: objective, destinationType: params.destinationType, allowedObjectives },
    )
  }
}

export function assertInstagramProfileAdsetCompatibility(params: {
  destinationType: MetaAdDestinationType
  optimizationGoal: string
  billingEvent: string
  campaignObjective?: string | null
}): void {
  if (!isInstagramProfileDestination(params.destinationType))
    return

  if (params.billingEvent !== 'IMPRESSIONS') {
    throw new MetaAdsToolError(
      'INSTAGRAM_PROFILE_BILLING_EVENT_INVALID',
      'Adsets com destino ao perfil do Instagram exigem billingEvent=IMPRESSIONS.',
      400,
      { billingEvent: params.billingEvent },
    )
  }

  const objective = String(params.campaignObjective || '').trim()
  if (!objective)
    return

  const allowed = META_INSTAGRAM_PROFILE_OPTIMIZATION_BY_OBJECTIVE[
    objective as keyof typeof META_INSTAGRAM_PROFILE_OPTIMIZATION_BY_OBJECTIVE
  ]
  if (!allowed || !(allowed as readonly string[]).includes(params.optimizationGoal)) {
    throw new MetaAdsToolError(
      'INSTAGRAM_PROFILE_OBJECTIVE_INCOMPATIBLE',
      `Combinação inválida para perfil do Instagram: objective=${objective}, optimizationGoal=${params.optimizationGoal}. `
      + 'Use OUTCOME_TRAFFIC + PROFILE_VISIT ou OUTCOME_ENGAGEMENT + PROFILE_AND_PAGE_ENGAGEMENT.',
      400,
      {
        campaignObjective: objective,
        optimizationGoal: params.optimizationGoal,
        allowed: META_INSTAGRAM_PROFILE_OPTIMIZATION_BY_OBJECTIVE,
      },
    )
  }
}

/** Optional E.164 / digits phone for promoted_object.whatsapp_phone_number. */
export function normalizeWhatsappPhoneNumber(raw?: string | null): string | undefined {
  if (raw == null)
    return undefined
  const trimmed = String(raw).trim()
  if (!trimmed)
    return undefined
  // Keep leading + and digits only
  const normalized = trimmed.replace(/[^\d+]/g, '')
  if (!/^\+?\d{8,15}$/.test(normalized)) {
    throw new MetaAdsToolError(
      'WHATSAPP_PHONE_INVALID',
      'whatsappPhoneNumber inválido. Use E.164 (ex. +5511999999999) ou só dígitos 8–15.',
      400,
    )
  }
  return normalized
}

export type BuildWebsiteLinkDataInput = {
  message: string
  linkUrl: string
  callToAction: string
  headline?: string
  description?: string
  imageUrl?: string
  imageHash?: string
}

export type BuildWhatsAppLinkDataInput = {
  message: string
  headline?: string
  description?: string
  imageUrl?: string
  imageHash?: string
  /** Optional greeting text — serialized into page_welcome_message (Meta CTWA). */
  welcomeMessage?: string
}

export type BuildMessagingLinkDataInput = BuildWhatsAppLinkDataInput

function applyOptionalLinkCreativeFields(
  target: Record<string, unknown>,
  input: {
    headline?: string
    description?: string
    imageUrl?: string
    imageHash?: string
    welcomeMessage?: string
  },
): void {
  if (input.headline)
    target.name = input.headline
  if (input.description)
    target.description = input.description
  if (input.imageHash)
    target.image_hash = input.imageHash
  if (input.imageUrl)
    target.picture = input.imageUrl
  if (input.welcomeMessage) {
    target.page_welcome_message = {
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
}

/**
 * Classic website/link creative link_data (call_to_action.value.link = site URL).
 */
export function buildWebsiteLinkData(input: BuildWebsiteLinkDataInput): Record<string, unknown> {
  const linkData: Record<string, unknown> = {
    message: input.message,
    link: input.linkUrl,
    call_to_action: {
      type: input.callToAction,
      value: { link: input.linkUrl },
    },
  }
  applyOptionalLinkCreativeFields(linkData, input)
  return linkData
}

export function buildMessagingLinkData(
  destinationType: MetaMessagingDestinationType,
  input: BuildMessagingLinkDataInput,
): Record<string, unknown> {
  const spec = META_MESSAGING_CTA_BY_DESTINATION[destinationType]
  const linkData: Record<string, unknown> = {
    message: input.message,
    call_to_action: buildMessagingCallToAction(destinationType),
  }
  if (spec.link)
    linkData.link = spec.link
  applyOptionalLinkCreativeFields(linkData, input)
  return linkData
}

/**
 * Click-to-WhatsApp creative link_data (official messaging destination).
 * Uses Meta protocol link + WHATSAPP_MESSAGE CTA — never reuses WEBSITE value.link.
 */
export function buildWhatsAppLinkData(input: BuildWhatsAppLinkDataInput): Record<string, unknown> {
  return buildMessagingLinkData('WHATSAPP', input)
}

export function buildAdObjectStorySpec(params: {
  pageId: string
  destinationType: MetaAdDestinationType
  website?: BuildWebsiteLinkDataInput
  whatsapp?: BuildWhatsAppLinkDataInput
  instagramUserId?: string
}): { page_id: string, link_data: Record<string, unknown>, instagram_user_id?: string } {
  if (isMessagingDestination(params.destinationType)) {
    if (!params.whatsapp) {
      throw new MetaAdsToolError(
        'MESSAGING_CREATIVE_INPUT_REQUIRED',
        `Criativo ${params.destinationType} exige campos de messaging (message, etc.).`,
        400,
      )
    }
    const spec: { page_id: string, link_data: Record<string, unknown>, instagram_user_id?: string } = {
      page_id: params.pageId,
      link_data: buildMessagingLinkData(params.destinationType, params.whatsapp),
    }
    if (params.destinationType === 'INSTAGRAM_DIRECT') {
      if (!params.instagramUserId) {
        throw new MetaAdsToolError(
          'META_INSTAGRAM_ACTOR_REQUIRED',
          'destinationType=INSTAGRAM_DIRECT exige instagram_business_account_id na integração (instagram_user_id).',
          400,
        )
      }
      spec.instagram_user_id = params.instagramUserId
    }
    return spec
  }
  if (!params.website) {
    throw new MetaAdsToolError(
      'WEBSITE_CREATIVE_INPUT_REQUIRED',
      'Criativo WEBSITE exige linkUrl + message.',
      400,
    )
  }
  return {
    page_id: params.pageId,
    link_data: buildWebsiteLinkData(params.website),
  }
}

export function buildMetaCreateAdCreativeBody(params: {
  creativeName: string
  pageId: string
  destinationType: MetaAdDestinationType
  website?: BuildWebsiteLinkDataInput
  whatsapp?: BuildWhatsAppLinkDataInput
  instagramUserId?: string
}): Record<string, unknown> {
  return {
    name: params.creativeName,
    object_story_spec: buildAdObjectStorySpec({
      pageId: params.pageId,
      destinationType: params.destinationType,
      website: params.website,
      whatsapp: params.whatsapp,
      instagramUserId: params.instagramUserId,
    }),
  }
}

export function buildMetaCreateAdsetGraphBody(input: {
  name: string
  campaignId: string
  billingEvent: string
  optimizationGoal: string
  status: 'ACTIVE' | 'PAUSED'
  targeting: Record<string, unknown>
  destinationType?: MetaAdDestinationType
  pageId?: string
  pixelId?: string
  customEventType?: string
  whatsappPhoneNumber?: string
  /** Dynamic Creative (legacy): ads must use asset_feed_spec / DYNAMIC_CREATIVE_LEGACY. */
  isDynamicCreative?: boolean
  dailyBudget?: number
  lifetimeBudget?: number
  startTime?: string
  endTime?: string
}): Record<string, unknown> {
  const destinationType = input.destinationType ?? 'WEBSITE'
  const body: Record<string, unknown> = {
    name: input.name,
    campaign_id: input.campaignId,
    billing_event: input.billingEvent,
    optimization_goal: input.optimizationGoal,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: input.targeting,
    status: input.status,
  }

  if (destinationType === 'WEBSITE') {
    body.destination_type = 'WEBSITE'
    if (input.optimizationGoal === 'OFFSITE_CONVERSIONS') {
      if (!input.pixelId || !input.customEventType) {
        throw new MetaAdsToolError(
          'META_WEBSITE_CONVERSION_REQUIRED',
          'WEBSITE + OFFSITE_CONVERSIONS exige pixelId e customEventType explícitos.',
          400,
        )
      }
      body.promoted_object = {
        pixel_id: input.pixelId,
        custom_event_type: input.customEventType,
      }
    }
  }

  if (isMessagingDestination(destinationType)) {
    body.destination_type = destinationType
    if (!input.pageId) {
      throw new MetaAdsToolError(
        'META_PAGE_ID_REQUIRED',
        `Adset ${destinationType} exige page_id na integração Meta (promoted_object.page_id).`,
        400,
      )
    }
    const promotedObject: Record<string, unknown> = { page_id: input.pageId }
    if (destinationType === 'WHATSAPP' && input.whatsappPhoneNumber)
      promotedObject.whatsapp_phone_number = input.whatsappPhoneNumber
    body.promoted_object = promotedObject
  }
  else if (isInstagramProfileDestination(destinationType)) {
    if (!input.pageId) {
      throw new MetaAdsToolError(
        'META_PAGE_ID_REQUIRED',
        'Adset INSTAGRAM_PROFILE exige page_id da Página vinculada ao Instagram na integração Meta.',
        400,
      )
    }
    body.destination_type = destinationType
    body.promoted_object = { page_id: input.pageId }
  }

  // Official Marketing API field for Dynamic Creative (Ads Manager legado).
  if (input.isDynamicCreative === true) {
    if (isMessagingDestination(destinationType)) {
      throw new MetaAdsToolError(
        'DYNAMIC_CREATIVE_MESSAGING_UNSUPPORTED',
        'isDynamicCreative=true só combina com destinationType=WEBSITE (DYNAMIC_CREATIVE_LEGACY).',
        400,
      )
    }
    body.is_dynamic_creative = true
  }

  if (input.dailyBudget != null)
    body.daily_budget = input.dailyBudget
  if (input.lifetimeBudget != null)
    body.lifetime_budget = input.lifetimeBudget
  if (input.startTime)
    body.start_time = input.startTime
  if (input.endTime)
    body.end_time = input.endTime

  return body
}

/** Treat Graph UNDEFINED / empty adset destination as WEBSITE for mismatch checks. */
export function normalizeAdsetDestinationType(
  raw?: string | null,
): MetaAdDestinationType | string {
  const value = String(raw || '').trim()
  if (!value || value === 'UNDEFINED' || value === 'WEBSITE')
    return 'WEBSITE'
  return value
}
