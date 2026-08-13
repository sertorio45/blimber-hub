/**
 * Ad destination helpers for Meta Marketing API create flows.
 * WEBSITE = classic link ads; WHATSAPP = Click-to-WhatsApp / messaging destination.
 * Destination is NOT a campaign objective.
 */

import { MetaAdsToolError } from './types'

export const META_AD_DESTINATION_TYPES = ['WEBSITE', 'WHATSAPP'] as const
export type MetaAdDestinationType = (typeof META_AD_DESTINATION_TYPES)[number]

/**
 * Meta Marketing API protocol value for CTWA `link_data.link`.
 * This is NOT a user-facing website URL and must never be invented as `linkUrl` input.
 * Official docs: Ads that Click to WhatsApp (creative step).
 */
export const META_WHATSAPP_MESSAGING_LINK = 'https://api.whatsapp.com/send'

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

const MESSAGING_HOST_RE = /^(?:www\.)?(?:api\.whatsapp\.com|wa\.me|chat\.whatsapp\.com)$/i

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
 * Validate campaign objective × destination × optimization_goal for CTWA adsets.
 * `campaignObjective` may be omitted on dry-run; when present, full matrix is checked.
 */
export function assertWhatsAppAdsetCompatibility(params: {
  destinationType: MetaAdDestinationType
  optimizationGoal: string
  billingEvent: string
  campaignObjective?: string | null
}): void {
  if (params.destinationType !== 'WHATSAPP')
    return

  if (params.billingEvent !== 'IMPRESSIONS') {
    throw new MetaAdsToolError(
      'WHATSAPP_BILLING_EVENT_INVALID',
      'Adsets Click-to-WhatsApp exigem billingEvent=IMPRESSIONS (doc Meta CTWA).',
      400,
      { billingEvent: params.billingEvent },
    )
  }

  const objective = params.campaignObjective ? String(params.campaignObjective).trim() : ''
  if (!objective)
    return

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
  if (input.headline)
    linkData.name = input.headline
  if (input.description)
    linkData.description = input.description
  if (input.imageHash)
    linkData.image_hash = input.imageHash
  if (input.imageUrl)
    linkData.picture = input.imageUrl
  return linkData
}

/**
 * Click-to-WhatsApp creative link_data (official messaging destination).
 * Uses Meta protocol link + WHATSAPP_MESSAGE CTA — never reuses WEBSITE value.link.
 */
export function buildWhatsAppLinkData(input: BuildWhatsAppLinkDataInput): Record<string, unknown> {
  const linkData: Record<string, unknown> = {
    message: input.message,
    // Official Meta CTWA protocol (not a user website linkUrl)
    link: META_WHATSAPP_MESSAGING_LINK,
    call_to_action: {
      type: 'WHATSAPP_MESSAGE',
      value: { app_destination: 'WHATSAPP' },
    },
  }
  if (input.headline)
    linkData.name = input.headline
  if (input.description)
    linkData.description = input.description
  if (input.imageHash)
    linkData.image_hash = input.imageHash
  if (input.imageUrl)
    linkData.picture = input.imageUrl
  if (input.welcomeMessage) {
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

export function buildAdObjectStorySpec(params: {
  pageId: string
  destinationType: MetaAdDestinationType
  website?: BuildWebsiteLinkDataInput
  whatsapp?: BuildWhatsAppLinkDataInput
}): { page_id: string, link_data: Record<string, unknown> } {
  if (params.destinationType === 'WHATSAPP') {
    if (!params.whatsapp) {
      throw new MetaAdsToolError(
        'WHATSAPP_CREATIVE_INPUT_REQUIRED',
        'Criativo WHATSAPP exige campos de messaging (message, etc.).',
        400,
      )
    }
    return {
      page_id: params.pageId,
      link_data: buildWhatsAppLinkData(params.whatsapp),
    }
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
}): Record<string, unknown> {
  return {
    name: params.creativeName,
    object_story_spec: buildAdObjectStorySpec({
      pageId: params.pageId,
      destinationType: params.destinationType,
      website: params.website,
      whatsapp: params.whatsapp,
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

  if (destinationType === 'WHATSAPP') {
    // Required for single-destination Click-to-WhatsApp (Meta CTWA ad set).
    body.destination_type = 'WHATSAPP'
    if (!input.pageId) {
      throw new MetaAdsToolError(
        'META_PAGE_ID_REQUIRED',
        'Adset WHATSAPP exige page_id na integração Meta (promoted_object.page_id).',
        400,
      )
    }
    const promotedObject: Record<string, unknown> = { page_id: input.pageId }
    if (input.whatsappPhoneNumber)
      promotedObject.whatsapp_phone_number = input.whatsappPhoneNumber
    body.promoted_object = promotedObject
  }

  // Official Marketing API field for Dynamic Creative (Ads Manager legado).
  if (input.isDynamicCreative === true) {
    if (destinationType === 'WHATSAPP') {
      throw new MetaAdsToolError(
        'DYNAMIC_CREATIVE_WHATSAPP_UNSUPPORTED',
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
