/**
 * Meta Custom Audiences — friendly sourceType → Marketing API rule/lookalike.
 * Graph version follows resolveMetaGraphVersion (default v25.0). Do not bump here.
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { MetaGraphFetch } from './types'
import type { ResolvedMetaCredentials } from './types'
import type { SupabaseLike } from './integration'
import {
  actPath,
  defaultMetaGraphFetch,
  enrichMetaGraphWriteError,
  extractMetaGraphErrorFields,
  metaGraphUrl,
} from './graph'
import { resolveMetaCredentials } from './integration'
import { MetaAdsToolError } from './types'
import { logMetaWriteAudit, sanitizeMetaWriteAuditPayload } from './write-audit'
import {
  assertAdAccountOwnership,
  assertBulkItemLimit,
  assertConfirmDelete,
  assertMetaAdsManagementReady,
  assertWriteConfirmation,
  metaWriteConfirmationFields,
  metaWriteDryRunField,
  resolveDryRun,
  withDryRun,
} from './write-guards'

export const SECONDS_PER_DAY = 86400

/** Supported create sources (MCP-friendly). */
export const META_CUSTOM_AUDIENCE_SOURCE_TYPES = [
  'INSTAGRAM',
  'FACEBOOK_PAGE',
  'WEBSITE',
  'LEAD_FORM',
  'CUSTOMER_LIST',
  'LOOKALIKE',
] as const

export type MetaCustomAudienceSourceType = (typeof META_CUSTOM_AUDIENCE_SOURCE_TYPES)[number]

/** Reserved for future mapping — not accepted by create schema yet. */
export const META_CUSTOM_AUDIENCE_SOURCE_TYPES_FUTURE = [
  'APP',
  'INSTAGRAM_SHOP',
  'FACEBOOK_SHOP',
  'INSTANT_EXPERIENCE',
  'MARKETPLACE',
] as const

export type MetaCustomAudienceSourceTypeFuture
  = (typeof META_CUSTOM_AUDIENCE_SOURCE_TYPES_FUTURE)[number]

export const META_IG_AUDIENCE_EVENTS = [
  'ALL',
  'FOLLOWERS',
  'PROFILE_VISIT',
  'ENGAGED',
  'MESSAGED',
  'SAVED',
] as const

export const META_PAGE_AUDIENCE_EVENTS = [
  'FOLLOWERS',
  'ENGAGED',
  'PAGE_VISIT',
  'POST_ENGAGEMENT',
  'CTA_CLICK',
  'MESSAGED',
  'SAVED',
] as const

export const META_WEBSITE_AUDIENCE_EVENTS = [
  'ALL_VISITORS',
  'VISITORS_BY_URL',
  'ViewContent',
  'Lead',
  'AddToCart',
  'InitiateCheckout',
  'Purchase',
  'CompleteRegistration',
] as const

export const META_LEAD_FORM_AUDIENCE_EVENTS = ['OPENED', 'DROPOFF', 'SUBMITTED'] as const

export const META_AUDIENCE_DUPLICATE_STRATEGIES = ['ERROR', 'RETURN_EXISTING', 'CREATE_ANYWAY'] as const

export type MetaIgAudienceEvent = (typeof META_IG_AUDIENCE_EVENTS)[number]
export type MetaPageAudienceEvent = (typeof META_PAGE_AUDIENCE_EVENTS)[number]
export type MetaWebsiteAudienceEvent = (typeof META_WEBSITE_AUDIENCE_EVENTS)[number]
export type MetaLeadFormAudienceEvent = (typeof META_LEAD_FORM_AUDIENCE_EVENTS)[number]
export type MetaAudienceDuplicateStrategy = (typeof META_AUDIENCE_DUPLICATE_STRATEGIES)[number]

const IG_EVENT_TO_META: Record<MetaIgAudienceEvent, string> = {
  ALL: 'ig_business_profile_all',
  FOLLOWERS: 'INSTAGRAM_PROFILE_FOLLOW',
  PROFILE_VISIT: 'ig_business_profile_visit',
  ENGAGED: 'ig_business_profile_engaged',
  MESSAGED: 'ig_business_profile_user_messaged',
  SAVED: 'ig_business_profile_ad_saved',
}

const PAGE_EVENT_TO_META: Record<MetaPageAudienceEvent, string> = {
  FOLLOWERS: 'page_liked',
  ENGAGED: 'page_engaged',
  PAGE_VISIT: 'page_visited',
  POST_ENGAGEMENT: 'page_post_interaction',
  CTA_CLICK: 'page_cta_clicked',
  MESSAGED: 'page_messaged',
  SAVED: 'page_post_saved',
}

const LEAD_EVENT_TO_META: Record<MetaLeadFormAudienceEvent, string> = {
  OPENED: 'lead_generation_opened',
  DROPOFF: 'lead_generation_dropoff',
  SUBMITTED: 'lead_generation_submitted',
}

const IG_EVENT_LABELS: Record<MetaIgAudienceEvent, string> = {
  ALL: 'Engajamento',
  FOLLOWERS: 'Seguidores',
  PROFILE_VISIT: 'Visitou Perfil',
  ENGAGED: 'Interações',
  MESSAGED: 'Mensagem',
  SAVED: 'Salvamentos',
}

const PAGE_EVENT_LABELS: Record<MetaPageAudienceEvent, string> = {
  FOLLOWERS: 'Seguidores',
  ENGAGED: 'Engajamento',
  PAGE_VISIT: 'Visitou Página',
  POST_ENGAGEMENT: 'Posts',
  CTA_CLICK: 'CTA',
  MESSAGED: 'Mensagem',
  SAVED: 'Salvamentos',
}

/** Meta engagement (page/IG) window: 1–365 days. Followers/liked use retention 0. */
export const META_ENGAGEMENT_RETENTION_DAYS = { min: 1, max: 365 } as const
/** Pixel website audiences: Marketing API classic 1–180 days. */
export const META_WEBSITE_RETENTION_DAYS = { min: 1, max: 180 } as const
/** Instant form engagement: 1–90 days. */
export const META_LEAD_FORM_RETENTION_DAYS = { min: 1, max: 90 } as const

const tenantContextSchema = z.object({
  tenantId: z.string().min(1).describe('UUID do tenant (empresa). Obrigatório — nunca misturar tenants.'),
  adAccountId: z.string().optional().describe('Conta de anúncios Meta sem prefixo act_. Usa a da integração se omitido.'),
})

const hashedUsersSchema = z.object({
  emails: z.array(z.string().min(1)).max(500).optional(),
  phones: z.array(z.string().min(1)).max(500).optional(),
}).strict().optional()

export const metaCreateCustomAudienceFields = {
  name: z.string().min(1).max(200).optional().describe('Nome. Se omitido, gera padrão (ex.: IG | Engajamento | 365d).'),
  description: z.string().max(500).optional(),
  sourceType: z.enum(META_CUSTOM_AUDIENCE_SOURCE_TYPES),
  event: z.string().min(1).optional().describe(
    'INSTAGRAM: ALL|FOLLOWERS|PROFILE_VISIT|ENGAGED|MESSAGED|SAVED. '
    + 'FACEBOOK_PAGE: FOLLOWERS|ENGAGED|PAGE_VISIT|POST_ENGAGEMENT|CTA_CLICK|MESSAGED|SAVED. '
    + 'WEBSITE: ALL_VISITORS|VISITORS_BY_URL|ViewContent|Lead|AddToCart|InitiateCheckout|Purchase|CompleteRegistration. '
    + 'LEAD_FORM: OPENED|DROPOFF|SUBMITTED.',
  ),
  retentionDays: z.number().int().min(0).max(365).optional(),
  instagramAccountId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  pixelId: z.string().min(1).optional(),
  leadFormId: z.string().min(1).optional(),
  urlContains: z.string().max(500).optional(),
  originAudienceId: z.string().min(1).optional(),
  lookalikeRatio: z.number().optional(),
  lookalikeCountry: z.string().length(2).optional().describe('ISO-2 do lookalike (default BR).'),
  prefill: z.boolean().optional().describe('Incluir histórico na janela (default true; irrelevante para LOOKALIKE/CUSTOMER_LIST).'),
  duplicateStrategy: z.enum(META_AUDIENCE_DUPLICATE_STRATEGIES).optional().default('ERROR'),
  users: hashedUsersSchema.describe('CUSTOMER_LIST opcional. E-mails/telefones hasheados SHA-256. Nunca logados.'),
} as const

export const metaCreateCustomAudienceSchema = tenantContextSchema.extend({
  ...metaCreateCustomAudienceFields,
  ...metaWriteConfirmationFields,
  ...metaWriteDryRunField,
}).superRefine(refineCreateAudienceInput)

export const metaCreateCustomAudienceItemSchema = z.object({
  ...metaCreateCustomAudienceFields,
}).superRefine(refineCreateAudienceInput)

export const metaCreateCustomAudiencesBatchSchema = tenantContextSchema.extend({
  items: z.array(metaCreateCustomAudienceItemSchema).min(1).max(20),
  duplicateStrategy: z.enum(META_AUDIENCE_DUPLICATE_STRATEGIES).optional().default('ERROR'),
  ...metaWriteConfirmationFields,
  ...metaWriteDryRunField,
})

export const metaUpdateCustomAudienceSchema = tenantContextSchema.extend({
  audienceId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  rule: z.record(z.unknown()).optional().describe('Rule Graph completa (avançado). Omita se só nome/descrição.'),
  ...metaWriteConfirmationFields,
  ...metaWriteDryRunField,
}).refine(data => Boolean(data.name || data.description || data.rule), {
  message: 'Informe name, description ou rule para atualizar.',
})

export const metaDeleteCustomAudienceSchema = tenantContextSchema.extend({
  audienceId: z.string().min(1),
  confirmDelete: z.literal(true).describe('Confirmação extra de exclusão após checar uso.'),
  ...metaWriteConfirmationFields,
  ...metaWriteDryRunField,
})

export const metaGetCustomAudienceUsageSchema = tenantContextSchema.extend({
  audienceId: z.string().min(1),
})

export type MetaCreateCustomAudienceInput = z.infer<typeof metaCreateCustomAudienceSchema>
export type MetaCreateCustomAudienceItemInput = z.infer<typeof metaCreateCustomAudienceItemSchema>

function refineCreateAudienceInput(
  data: {
    sourceType: MetaCustomAudienceSourceType
    event?: string
    retentionDays?: number
    urlContains?: string
    originAudienceId?: string
    lookalikeRatio?: number
    leadFormId?: string
  },
  ctx: z.RefinementCtx,
) {
  const source = data.sourceType
  if (source === 'INSTAGRAM') {
    if (!data.event || !isIgEvent(data.event)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'INSTAGRAM exige event ALL|FOLLOWERS|PROFILE_VISIT|ENGAGED|MESSAGED|SAVED.',
        path: ['event'],
      })
    }
  }
  else if (source === 'FACEBOOK_PAGE') {
    if (!data.event || !isPageEvent(data.event)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'FACEBOOK_PAGE exige event FOLLOWERS|ENGAGED|PAGE_VISIT|POST_ENGAGEMENT|CTA_CLICK|MESSAGED|SAVED.',
        path: ['event'],
      })
    }
  }
  else if (source === 'WEBSITE') {
    if (!data.event || !isWebsiteEvent(data.event)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'WEBSITE exige event ALL_VISITORS|VISITORS_BY_URL ou um pixel event (ViewContent, Lead, …).',
        path: ['event'],
      })
    }
    if (data.event === 'VISITORS_BY_URL' && !String(data.urlContains || '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'VISITORS_BY_URL exige urlContains.',
        path: ['urlContains'],
      })
    }
  }
  else if (source === 'LEAD_FORM') {
    if (!data.event || !isLeadEvent(data.event)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LEAD_FORM exige event OPENED|DROPOFF|SUBMITTED.',
        path: ['event'],
      })
    }
    if (!data.leadFormId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LEAD_FORM exige leadFormId.',
        path: ['leadFormId'],
      })
    }
  }
  else if (source === 'LOOKALIKE') {
    if (!data.originAudienceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LOOKALIKE exige originAudienceId.',
        path: ['originAudienceId'],
      })
    }
    if (data.lookalikeRatio == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LOOKALIKE exige lookalikeRatio entre 0.01 e 0.20.',
        path: ['lookalikeRatio'],
      })
    }
  }
}

function isIgEvent(value: string): value is MetaIgAudienceEvent {
  return (META_IG_AUDIENCE_EVENTS as readonly string[]).includes(value)
}
function isPageEvent(value: string): value is MetaPageAudienceEvent {
  return (META_PAGE_AUDIENCE_EVENTS as readonly string[]).includes(value)
}
function isWebsiteEvent(value: string): value is MetaWebsiteAudienceEvent {
  return (META_WEBSITE_AUDIENCE_EVENTS as readonly string[]).includes(value)
}
function isLeadEvent(value: string): value is MetaLeadFormAudienceEvent {
  return (META_LEAD_FORM_AUDIENCE_EVENTS as readonly string[]).includes(value)
}

export function isCurrentFollowersEvent(sourceType: MetaCustomAudienceSourceType, event?: string): boolean {
  return (sourceType === 'INSTAGRAM' && event === 'FOLLOWERS')
    || (sourceType === 'FACEBOOK_PAGE' && event === 'FOLLOWERS')
}

export function retentionDaysToSeconds(params: {
  sourceType: MetaCustomAudienceSourceType
  event?: string
  retentionDays?: number
}): { retentionDays: number, retentionSeconds: number, forcedZero: boolean } {
  if (isCurrentFollowersEvent(params.sourceType, params.event)) {
    if (params.retentionDays != null && params.retentionDays !== 0) {
      // Followers must track current state — Meta uses retention_seconds=0.
    }
    return { retentionDays: 0, retentionSeconds: 0, forcedZero: true }
  }

  if (params.sourceType === 'LOOKALIKE' || params.sourceType === 'CUSTOMER_LIST') {
    return { retentionDays: 0, retentionSeconds: 0, forcedZero: false }
  }

  const limits = params.sourceType === 'WEBSITE'
    ? META_WEBSITE_RETENTION_DAYS
    : params.sourceType === 'LEAD_FORM'
      ? META_LEAD_FORM_RETENTION_DAYS
      : META_ENGAGEMENT_RETENTION_DAYS

  const fallback = params.sourceType === 'WEBSITE'
    ? 180
    : params.sourceType === 'LEAD_FORM'
      ? 90
      : 365

  const days = params.retentionDays == null ? fallback : params.retentionDays
  if (days < limits.min || days > limits.max) {
    throw new MetaAdsToolError(
      'META_AUDIENCE_INVALID_RETENTION',
      `retentionDays para ${params.sourceType} deve estar entre ${limits.min} e ${limits.max} (recebido: ${days}).`,
      400,
      { min: limits.min, max: limits.max, retentionDays: days, sourceType: params.sourceType },
    )
  }

  return {
    retentionDays: days,
    retentionSeconds: days * SECONDS_PER_DAY,
    forcedZero: false,
  }
}

export function suggestCustomAudienceName(params: {
  sourceType: MetaCustomAudienceSourceType
  event?: string
  retentionDays?: number
  lookalikeRatio?: number
  originName?: string | null
}): string {
  const { sourceType, event, lookalikeRatio } = params
  if (sourceType === 'LOOKALIKE') {
    const pct = lookalikeRatio != null ? Math.round(lookalikeRatio * 100) : 1
    const origin = params.originName ? ` | ${params.originName}` : ''
    return `LAL ${pct}%${origin}`
  }
  if (sourceType === 'CUSTOMER_LIST')
    return 'Lista de clientes'
  if (sourceType === 'WEBSITE') {
    const days = params.retentionDays ?? 180
    const label = event === 'ALL_VISITORS'
      ? 'Visitantes'
      : event === 'VISITORS_BY_URL'
        ? 'URL'
        : (event || 'Pixel')
    return `Site | ${label} | ${days}d`
  }
  if (sourceType === 'LEAD_FORM') {
    const days = params.retentionDays ?? 90
    const label = event === 'OPENED' ? 'Abriu' : event === 'DROPOFF' ? 'Abandono' : 'Enviou'
    return `Lead | ${label} | ${days}d`
  }
  if (sourceType === 'INSTAGRAM' && isIgEvent(event || '')) {
    const days = isCurrentFollowersEvent(sourceType, event) ? null : (params.retentionDays ?? 365)
    const label = IG_EVENT_LABELS[event as MetaIgAudienceEvent]
    return days == null ? `IG | ${label}` : `IG | ${label} | ${days}d`
  }
  if (sourceType === 'FACEBOOK_PAGE' && isPageEvent(event || '')) {
    const days = isCurrentFollowersEvent(sourceType, event) ? null : (params.retentionDays ?? 365)
    const label = PAGE_EVENT_LABELS[event as MetaPageAudienceEvent]
    return days == null ? `FB | ${label}` : `FB | ${label} | ${days}d`
  }
  return 'Público personalizado'
}

export function buildEngagementFilter(metaEvent: string) {
  return {
    operator: 'and' as const,
    filters: [{ field: 'event', operator: 'eq', value: metaEvent }],
  }
}

export function buildEngagementRule(params: {
  eventSourceType: 'ig_business' | 'page'
  sourceId: string
  metaEvent: string
  retentionSeconds: number
}) {
  return {
    inclusions: {
      operator: 'or',
      rules: [
        {
          event_sources: [{ type: params.eventSourceType, id: params.sourceId }],
          retention_seconds: params.retentionSeconds,
          filter: buildEngagementFilter(params.metaEvent),
        },
      ],
    },
  }
}

export function buildWebsiteRule(params: {
  pixelId: string
  event: MetaWebsiteAudienceEvent
  retentionSeconds: number
  urlContains?: string
}) {
  const filters: Array<{ field: string, operator: string, value: string }>
    = params.event === 'ALL_VISITORS'
      ? [{ field: 'url', operator: 'i_contains', value: '' }]
      : params.event === 'VISITORS_BY_URL'
        ? [{ field: 'url', operator: 'i_contains', value: String(params.urlContains || '').trim() }]
        : [{ field: 'event', operator: 'eq', value: params.event }]

  return {
    inclusions: {
      operator: 'or',
      rules: [
        {
          event_sources: [{ type: 'pixel', id: params.pixelId }],
          retention_seconds: params.retentionSeconds,
          filter: { operator: 'and', filters },
        },
      ],
    },
  }
}

/**
 * Meta documents `rule` and `lookalike_spec` as JSON-encoded strings on
 * POST /act_{id}/customaudiences (not nested JSON objects).
 * defaultMetaGraphFetch also JSON.stringifies objects, but we stringify here
 * so the Graph body / dry-run preview match the wire format exactly.
 */
export function serializeCustomAudienceGraphJsonFields(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...body }
  if (next.rule != null && typeof next.rule !== 'string')
    next.rule = JSON.stringify(next.rule)
  if (next.lookalike_spec != null && typeof next.lookalike_spec !== 'string')
    next.lookalike_spec = JSON.stringify(next.lookalike_spec)
  return next
}

export function buildLeadFormRule(params: {
  pageId: string
  instagramAccountId?: string | null
  leadFormId: string
  metaEvent: string
  retentionSeconds: number
}) {
  const eventSources: Array<Record<string, string>> = [
    { type: 'lead', id: params.pageId },
  ]
  if (params.instagramAccountId) {
    eventSources.push({
      type: 'ig_lead_generation',
      id: params.instagramAccountId,
      owner_id: params.pageId,
    })
  }

  return {
    inclusions: {
      operator: 'or',
      rules: [
        {
          event_sources: eventSources,
          retention_seconds: params.retentionSeconds,
          filter: {
            operator: 'and',
            filters: [
              { field: 'event', operator: 'eq', value: params.metaEvent },
              { field: 'leadgen.form_id', operator: 'eq', value: params.leadFormId },
            ],
          },
        },
      ],
    },
  }
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function hashCustomerListUsers(users?: { emails?: string[], phones?: string[] } | null): {
  schema: string[]
  data: string[][]
  count: number
} {
  const emails = (users?.emails || []).map(e => sha256Hex(e.trim().toLowerCase())).filter(Boolean)
  const phones = (users?.phones || []).map(p => sha256Hex(p.replace(/\D/g, ''))).filter(Boolean)
  if (!emails.length && !phones.length)
    return { schema: [], data: [], count: 0 }

  if (emails.length && !phones.length)
    return { schema: ['EMAIL'], data: emails.map(e => [e]), count: emails.length }
  if (phones.length && !emails.length)
    return { schema: ['PHONE'], data: phones.map(p => [p]), count: phones.length }

  const max = Math.max(emails.length, phones.length)
  const data: string[][] = []
  for (let i = 0; i < max; i++)
    data.push([emails[i] || '', phones[i] || ''])
  return { schema: ['EMAIL', 'PHONE'], data, count: max }
}

export interface MetaToolContextLike {
  client: SupabaseLike
  graphFetch?: MetaGraphFetch
}

function audienceError(code: string, message: string, statusCode = 400, details?: unknown): never {
  throw new MetaAdsToolError(code, message, statusCode, details)
}

export function mapAudienceGraphError(error: unknown): never {
  if (error instanceof MetaAdsToolError) {
    if (error.code.startsWith('META_AUDIENCE_') || error.code === 'META_PERMISSION_MISSING')
      throw error
    if (error.code === 'META_GRAPH_ERROR') {
      const fields = extractMetaGraphErrorFields(error.details, error.statusCode)
      const graphCode = fields.code != null ? Number(fields.code) : null
      if (graphCode === 190 || graphCode === 10 || graphCode === 200) {
        throw new MetaAdsToolError(
          'META_AUDIENCE_PERMISSION_DENIED',
          'A Meta recusou a operação por permissão. Reconecte o OAuth com ads_management.',
          403,
          { ...fields, mappedFrom: 'META_GRAPH_ERROR' },
        )
      }
      if (graphCode === 803 || error.statusCode === 404) {
        throw new MetaAdsToolError(
          'META_AUDIENCE_NOT_FOUND',
          'Público ou origem não encontrado na Meta.',
          404,
          { ...fields, mappedFrom: 'META_GRAPH_ERROR' },
        )
      }
      throw new MetaAdsToolError(
        'META_AUDIENCE_GRAPH_ERROR',
        fields.message || error.message,
        error.statusCode,
        { ...fields, mappedFrom: 'META_GRAPH_ERROR' },
      )
    }
    throw error
  }
  throw error
}

async function graphWrite(
  graph: MetaGraphFetch,
  url: string,
  init: {
    method?: string
    query?: Record<string, string | number | undefined>
    body?: Record<string, unknown>
  },
  requestPayload?: Record<string, unknown> | null,
) {
  try {
    return await graph(url, init)
  }
  catch (err) {
    try {
      enrichMetaGraphWriteError(err, requestPayload ?? init.body ?? null)
    }
    catch (enriched) {
      mapAudienceGraphError(enriched)
    }
  }
}

function uniqueTrimmed(value?: string | null): string | null {
  const trimmed = value ? String(value).trim() : ''
  return trimmed || null
}

export interface ResolvedAudienceSources {
  pageId: string | null
  pageName: string | null
  instagramAccountId: string | null
  instagramUsername: string | null
  pixelId: string | null
  warnings: string[]
}

async function discoverPages(
  graph: MetaGraphFetch,
  creds: ResolvedMetaCredentials,
): Promise<Array<{ id: string, name: string, instagramAccountId: string | null }>> {
  const res = await graph(metaGraphUrl(creds.apiVersion, '/me/accounts'), {
    query: {
      fields: 'id,name,instagram_business_account',
      limit: 50,
      access_token: creds.accessToken,
    },
  }).catch(mapAudienceGraphError)

  const rows = Array.isArray(res?.data) ? res.data : []
  return rows.map((row: Record<string, unknown>) => {
    const ig = row.instagram_business_account && typeof row.instagram_business_account === 'object'
      ? (row.instagram_business_account as Record<string, unknown>).id
      : null
    return {
      id: String(row.id || ''),
      name: String(row.name || row.id || ''),
      instagramAccountId: ig ? String(ig) : null,
    }
  }).filter((row: { id: string }) => Boolean(row.id))
}

async function discoverPixels(
  graph: MetaGraphFetch,
  creds: ResolvedMetaCredentials,
): Promise<Array<{ id: string, name: string }>> {
  const res = await graph(metaGraphUrl(creds.apiVersion, `/${actPath(creds.adAccountId)}/adspixels`), {
    query: {
      fields: 'id,name',
      limit: 50,
      access_token: creds.accessToken,
    },
  }).catch(mapAudienceGraphError)

  const rows = Array.isArray(res?.data) ? res.data : []
  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.id || ''),
    name: String(row.name || row.id || ''),
  })).filter((row: { id: string }) => Boolean(row.id))
}

export async function resolveAudienceSources(params: {
  graph: MetaGraphFetch
  creds: ResolvedMetaCredentials
  sourceType: MetaCustomAudienceSourceType
  pageId?: string
  instagramAccountId?: string
  pixelId?: string
  allowGraphDiscovery: boolean
}): Promise<ResolvedAudienceSources> {
  const warnings: string[] = []
  const cfg = params.creds.publicConfig
  let pageId = uniqueTrimmed(params.pageId) || uniqueTrimmed(cfg.page_id)
  let instagramAccountId = uniqueTrimmed(params.instagramAccountId)
    || uniqueTrimmed(cfg.instagram_business_account_id)
  let pixelId = uniqueTrimmed(params.pixelId) || uniqueTrimmed(cfg.pixel_id)
  let pageName = uniqueTrimmed(cfg.page_name)
  let instagramUsername = uniqueTrimmed(cfg.instagram_username) || uniqueTrimmed(cfg.instagram_name)

  const needsPage = params.sourceType === 'FACEBOOK_PAGE'
    || params.sourceType === 'LEAD_FORM'
    || (params.sourceType === 'INSTAGRAM' && !instagramAccountId)
  const needsIg = params.sourceType === 'INSTAGRAM' || params.sourceType === 'LEAD_FORM'
  const needsPixel = params.sourceType === 'WEBSITE'

  if (params.allowGraphDiscovery && (needsPage || needsIg) && (!pageId || (needsIg && !instagramAccountId))) {
    const pages = await discoverPages(params.graph, params.creds)
    if (!pageId) {
      const pool = needsIg && !instagramAccountId
        ? pages.filter(p => Boolean(p.instagramAccountId))
        : pages
      if (pool.length === 0) {
        audienceError(
          'META_AUDIENCE_SOURCE_NOT_FOUND',
          needsIg
            ? 'Nenhuma Page/Instagram acessível. Informe instagramAccountId ou conecte a Page na integração.'
            : 'Nenhuma Page acessível. Informe pageId ou conecte a Page na integração.',
          404,
        )
      }
      if (pool.length > 1) {
        audienceError(
          'META_AUDIENCE_MULTIPLE_SOURCES',
          'Há várias Pages/Instagram. Informe pageId ou instagramAccountId explicitamente.',
          409,
          { options: pool },
        )
      }
      pageId = pool[0]!.id
      pageName = pool[0]!.name
      if (!instagramAccountId && pool[0]!.instagramAccountId)
        instagramAccountId = pool[0]!.instagramAccountId
    }
    else if (needsIg && !instagramAccountId) {
      const match = pages.find(p => p.id === pageId)
      if (match?.instagramAccountId)
        instagramAccountId = match.instagramAccountId
    }
  }

  if (params.allowGraphDiscovery && needsPixel && !pixelId) {
    const pixels = await discoverPixels(params.graph, params.creds)
    if (pixels.length === 0) {
      audienceError(
        'META_AUDIENCE_SOURCE_NOT_FOUND',
        'Pixel não encontrado. Informe pixelId ou configure pixel_id na integração Meta.',
        404,
      )
    }
    if (pixels.length > 1) {
      audienceError(
        'META_AUDIENCE_MULTIPLE_SOURCES',
        'Há vários pixels. Informe pixelId explicitamente.',
        409,
        { options: pixels },
      )
    }
    pixelId = pixels[0]!.id
  }

  if (params.sourceType === 'INSTAGRAM' && !instagramAccountId) {
    audienceError(
      'META_AUDIENCE_SOURCE_NOT_FOUND',
      'Instagram Business não resolvido. Informe instagramAccountId ou conecte o Instagram na Page da integração.',
      404,
    )
  }
  if ((params.sourceType === 'FACEBOOK_PAGE' || params.sourceType === 'LEAD_FORM') && !pageId) {
    audienceError(
      'META_AUDIENCE_SOURCE_NOT_FOUND',
      'Page não resolvida. Informe pageId ou configure page_id na integração Meta.',
      404,
    )
  }
  if (params.sourceType === 'WEBSITE' && !pixelId) {
    audienceError(
      'META_AUDIENCE_SOURCE_NOT_FOUND',
      'Pixel não resolvido. Informe pixelId ou configure pixel_id na integração Meta.',
      404,
    )
  }

  if (params.sourceType === 'LEAD_FORM' && !instagramAccountId)
    warnings.push('Instagram não resolvido — rule usará apenas event_sources type=lead (Page).')

  if (params.allowGraphDiscovery && uniqueTrimmed(params.instagramAccountId) && instagramAccountId) {
    try {
      const ig = await params.graph(metaGraphUrl(params.creds.apiVersion, `/${instagramAccountId}`), {
        query: { fields: 'id,username', access_token: params.creds.accessToken },
      })
      if (!ig?.id) {
        audienceError(
          'META_AUDIENCE_SOURCE_NOT_FOUND',
          'Instagram informado não está acessível com o token do tenant.',
          404,
          { instagramAccountId },
        )
      }
      instagramUsername = ig.username != null ? String(ig.username) : instagramUsername
    }
    catch (error) {
      if (error instanceof MetaAdsToolError && error.code.startsWith('META_AUDIENCE_'))
        throw error
      audienceError(
        'META_AUDIENCE_SOURCE_NOT_FOUND',
        'Instagram informado não está acessível com o token do tenant.',
        404,
        { instagramAccountId },
      )
    }
  }

  if (params.allowGraphDiscovery && uniqueTrimmed(params.pageId) && pageId) {
    try {
      const page = await params.graph(metaGraphUrl(params.creds.apiVersion, `/${pageId}`), {
        query: { fields: 'id,name', access_token: params.creds.accessToken },
      })
      if (!page?.id) {
        audienceError(
          'META_AUDIENCE_SOURCE_NOT_FOUND',
          'Page informada não está acessível com o token do tenant.',
          404,
          { pageId },
        )
      }
      pageName = page.name != null ? String(page.name) : pageName
    }
    catch (error) {
      if (error instanceof MetaAdsToolError && error.code.startsWith('META_AUDIENCE_'))
        throw error
      audienceError(
        'META_AUDIENCE_SOURCE_NOT_FOUND',
        'Page informada não está acessível com o token do tenant.',
        404,
        { pageId },
      )
    }
  }

  return {
    pageId,
    pageName,
    instagramAccountId,
    instagramUsername,
    pixelId,
    warnings,
  }
}

function audienceGraphResult(
  subtype: string,
  metaEvent: string | null,
  body: Record<string, unknown>,
): { subtype: string, body: Record<string, unknown>, metaEvent: string | null } {
  return {
    subtype,
    metaEvent,
    body: serializeCustomAudienceGraphJsonFields(body),
  }
}

export function buildCreateAudienceGraphBody(params: {
  name: string
  description?: string
  sourceType: MetaCustomAudienceSourceType
  event?: string
  retentionSeconds: number
  sources: ResolvedAudienceSources
  leadFormId?: string
  urlContains?: string
  originAudienceId?: string
  lookalikeRatio?: number
  lookalikeCountry?: string
  prefill?: boolean
}): { subtype: string, body: Record<string, unknown>, metaEvent: string | null } {
  const prefill = params.prefill !== false
  const base: Record<string, unknown> = {
    name: params.name,
  }
  if (params.description)
    base.description = params.description

  if (params.sourceType === 'INSTAGRAM') {
    if (!params.event || !isIgEvent(params.event)) {
      audienceError('META_AUDIENCE_INVALID_EVENT', 'Evento Instagram inválido.', 400, { event: params.event })
    }
    const metaEvent = IG_EVENT_TO_META[params.event]
    const igId = params.sources.instagramAccountId
    if (!igId)
      audienceError('META_AUDIENCE_SOURCE_NOT_FOUND', 'instagramAccountId ausente após resolução.', 404)
    return audienceGraphResult('ENGAGEMENT', metaEvent, {
      ...base,
      subtype: 'ENGAGEMENT',
      prefill,
      rule: buildEngagementRule({
        eventSourceType: 'ig_business',
        sourceId: igId,
        metaEvent,
        retentionSeconds: params.retentionSeconds,
      }),
    })
  }

  if (params.sourceType === 'FACEBOOK_PAGE') {
    if (!params.event || !isPageEvent(params.event)) {
      audienceError('META_AUDIENCE_INVALID_EVENT', 'Evento Facebook Page inválido.', 400, { event: params.event })
    }
    const metaEvent = PAGE_EVENT_TO_META[params.event]
    const pageId = params.sources.pageId
    if (!pageId)
      audienceError('META_AUDIENCE_SOURCE_NOT_FOUND', 'pageId ausente após resolução.', 404)
    return audienceGraphResult('ENGAGEMENT', metaEvent, {
      ...base,
      subtype: 'ENGAGEMENT',
      prefill,
      rule: buildEngagementRule({
        eventSourceType: 'page',
        sourceId: pageId,
        metaEvent,
        retentionSeconds: params.retentionSeconds,
      }),
    })
  }

  if (params.sourceType === 'WEBSITE') {
    if (!params.event || !isWebsiteEvent(params.event)) {
      audienceError('META_AUDIENCE_INVALID_EVENT', 'Evento Website inválido.', 400, { event: params.event })
    }
    const pixelId = params.sources.pixelId
    if (!pixelId)
      audienceError('META_AUDIENCE_SOURCE_NOT_FOUND', 'pixelId ausente após resolução.', 404)
    return audienceGraphResult('WEBSITE', params.event, {
      ...base,
      subtype: 'WEBSITE',
      prefill,
      rule: buildWebsiteRule({
        pixelId,
        event: params.event,
        retentionSeconds: params.retentionSeconds,
        urlContains: params.urlContains,
      }),
    })
  }

  if (params.sourceType === 'LEAD_FORM') {
    if (!params.event || !isLeadEvent(params.event)) {
      audienceError('META_AUDIENCE_INVALID_EVENT', 'Evento Lead Form inválido.', 400, { event: params.event })
    }
    const pageId = params.sources.pageId
    const leadFormId = params.leadFormId
    if (!pageId || !leadFormId)
      audienceError('META_AUDIENCE_SOURCE_NOT_FOUND', 'Page ou leadFormId ausente.', 404)
    const metaEvent = LEAD_EVENT_TO_META[params.event]
    return audienceGraphResult('ENGAGEMENT', metaEvent, {
      ...base,
      subtype: 'ENGAGEMENT',
      prefill,
      rule: buildLeadFormRule({
        pageId,
        instagramAccountId: params.sources.instagramAccountId,
        leadFormId,
        metaEvent,
        retentionSeconds: params.retentionSeconds,
      }),
    })
  }

  if (params.sourceType === 'CUSTOMER_LIST') {
    return audienceGraphResult('CUSTOM', null, {
      ...base,
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
    })
  }

  if (params.sourceType === 'LOOKALIKE') {
    const ratio = params.lookalikeRatio
    if (ratio == null || ratio < 0.01 || ratio > 0.20) {
      audienceError(
        'META_AUDIENCE_LOOKALIKE_INVALID_RATIO',
        'lookalikeRatio deve estar entre 0.01 e 0.20 (1% a 20%).',
        400,
        { lookalikeRatio: ratio },
      )
    }
    const origin = params.originAudienceId
    if (!origin)
      audienceError('META_AUDIENCE_ORIGIN_NOT_FOUND', 'originAudienceId é obrigatório para LOOKALIKE.', 400)
    const country = (params.lookalikeCountry || 'BR').toUpperCase()
    return audienceGraphResult('LOOKALIKE', null, {
      ...base,
      subtype: 'LOOKALIKE',
      origin_audience_id: origin,
      lookalike_spec: {
        type: 'similarity',
        country,
        ratio,
      },
    })
  }

  audienceError('META_AUDIENCE_INVALID_SOURCE', `sourceType não suportado: ${params.sourceType}.`, 400)
}

async function listAudiencesByName(
  graph: MetaGraphFetch,
  creds: ResolvedMetaCredentials,
  name: string,
): Promise<Array<{ id: string, name: string, subtype: string | null }>> {
  const res = await graph(
    metaGraphUrl(creds.apiVersion, `/${actPath(creds.adAccountId)}/customaudiences`),
    {
      query: {
        fields: 'id,name,subtype',
        limit: 200,
        access_token: creds.accessToken,
      },
    },
  ).catch(mapAudienceGraphError)

  const rows = Array.isArray(res?.data) ? res.data : []
  return rows
    .map((row: Record<string, unknown>) => ({
      id: String(row.id || ''),
      name: String(row.name || ''),
      subtype: row.subtype != null ? String(row.subtype) : null,
    }))
    .filter((row: { id: string, name: string }) => row.id && row.name === name)
}

async function assertOwnedAudience(
  graph: MetaGraphFetch,
  creds: ResolvedMetaCredentials,
  audienceId: string,
  extraFields = '',
): Promise<Record<string, unknown>> {
  const fields = ['id', 'name', 'account_id', 'subtype', extraFields].filter(Boolean).join(',')
  const audience = await graph(metaGraphUrl(creds.apiVersion, `/${audienceId}`), {
    query: {
      fields,
      access_token: creds.accessToken,
    },
  }).catch(mapAudienceGraphError)

  if (!audience?.id) {
    audienceError('META_AUDIENCE_NOT_FOUND', 'Público não encontrado.', 404, { audienceId })
  }

  assertAdAccountOwnership({
    objectAccountId: audience.account_id != null ? String(audience.account_id) : null,
    tenantAdAccountId: creds.adAccountId,
    code: 'META_AUDIENCE_ORIGIN_NOT_FOUND',
    message: 'Público não pertence à ad account do tenant.',
  })

  return audience as Record<string, unknown>
}

export interface PreparedCreateAudience {
  name: string
  description?: string
  sourceType: MetaCustomAudienceSourceType
  event?: string
  retentionDays: number
  retentionSeconds: number
  sources: ResolvedAudienceSources
  subtype: string
  metaEvent: string | null
  graphBody: Record<string, unknown>
  hashedUserCount: number
  hashedUsers: { schema: string[], data: string[][], count: number }
  notes: string[]
}

export async function prepareCreateCustomAudience(params: {
  graph: MetaGraphFetch
  creds: ResolvedMetaCredentials
  input: MetaCreateCustomAudienceItemInput
  allowGraphDiscovery: boolean
}): Promise<PreparedCreateAudience> {
  const { input, creds, graph } = params
  if (input.sourceType === 'LOOKALIKE') {
    const ratio = input.lookalikeRatio
    if (ratio == null || ratio < 0.01 || ratio > 0.20) {
      audienceError(
        'META_AUDIENCE_LOOKALIKE_INVALID_RATIO',
        'lookalikeRatio deve estar entre 0.01 e 0.20 (1% a 20%).',
        400,
        { lookalikeRatio: ratio },
      )
    }
  }

  const retention = retentionDaysToSeconds({
    sourceType: input.sourceType,
    event: input.event,
    retentionDays: input.retentionDays,
  })

  const sources = await resolveAudienceSources({
    graph,
    creds,
    sourceType: input.sourceType,
    pageId: input.pageId,
    instagramAccountId: input.instagramAccountId,
    pixelId: input.pixelId,
    allowGraphDiscovery: params.allowGraphDiscovery,
  })

  let originName: string | null = null
  if (input.sourceType === 'LOOKALIKE' && input.originAudienceId && params.allowGraphDiscovery) {
    const origin = await assertOwnedAudience(graph, creds, input.originAudienceId, 'lookalike_spec')
    originName = origin.name != null ? String(origin.name) : null
    const subtype = origin.subtype != null ? String(origin.subtype).toUpperCase() : ''
    if (subtype === 'LOOKALIKE') {
      audienceError(
        'META_AUDIENCE_INVALID_SOURCE',
        'Não é permitido criar lookalike a partir de outro lookalike.',
        400,
        { originAudienceId: input.originAudienceId, subtype },
      )
    }
  }

  const name = input.name?.trim() || suggestCustomAudienceName({
    sourceType: input.sourceType,
    event: input.event,
    retentionDays: retention.retentionDays,
    lookalikeRatio: input.lookalikeRatio,
    originName,
  })

  const built = buildCreateAudienceGraphBody({
    name,
    description: input.description,
    sourceType: input.sourceType,
    event: input.event,
    retentionSeconds: retention.retentionSeconds,
    sources,
    leadFormId: input.leadFormId,
    urlContains: input.urlContains,
    originAudienceId: input.originAudienceId,
    lookalikeRatio: input.lookalikeRatio,
    lookalikeCountry: input.lookalikeCountry,
    prefill: input.prefill,
  })

  const hashedUsers = hashCustomerListUsers(input.users)
  const notes: string[] = [...sources.warnings]
  if (retention.forcedZero)
    notes.push('Seguidores/curtidores atuais: retention_seconds=0 (público dinâmico).')
  if (hashedUsers.count)
    notes.push(`CUSTOMER_LIST: enviaria ${hashedUsers.count} identificador(es) com hash SHA-256 (PII omitida).`)

  return {
    name,
    description: input.description,
    sourceType: input.sourceType,
    event: input.event,
    retentionDays: retention.retentionDays,
    retentionSeconds: retention.retentionSeconds,
    sources,
    subtype: built.subtype,
    metaEvent: built.metaEvent,
    graphBody: built.body,
    hashedUserCount: hashedUsers.count,
    hashedUsers,
    notes,
  }
}

function createPreviewNotes(prepared: PreparedCreateAudience): string[] {
  return [
    `sourceType=${prepared.sourceType}`,
    prepared.event ? `event=${prepared.event}` : null,
    prepared.metaEvent ? `metaEvent=${prepared.metaEvent}` : null,
    `subtype=${prepared.subtype}`,
    `retentionDays=${prepared.retentionDays}`,
    `retention_seconds=${prepared.retentionSeconds}`,
    prepared.sources.pageId ? `pageId=${prepared.sources.pageId}` : null,
    prepared.sources.instagramAccountId ? `instagramAccountId=${prepared.sources.instagramAccountId}` : null,
    prepared.sources.pixelId ? `pixelId=${prepared.sources.pixelId}` : null,
    typeof prepared.graphBody.rule === 'string' ? 'rule=JSON string (Graph)' : null,
    typeof prepared.graphBody.lookalike_spec === 'string' ? 'lookalike_spec=JSON string (Graph)' : null,
    ...prepared.notes,
  ].filter((row): row is string => Boolean(row))
}

async function executeCreateAudience(params: {
  graph: MetaGraphFetch
  creds: ResolvedMetaCredentials
  prepared: PreparedCreateAudience
  duplicateStrategy: MetaAudienceDuplicateStrategy
}): Promise<{
    id: string | null
    name: string
    reused: boolean
    uploadedUserCount: number
  }> {
  const { graph, creds, prepared, duplicateStrategy } = params
  if (duplicateStrategy !== 'CREATE_ANYWAY') {
    const existing = await listAudiencesByName(graph, creds, prepared.name)
    if (existing.length) {
      if (duplicateStrategy === 'RETURN_EXISTING') {
        return {
          id: existing[0]!.id,
          name: existing[0]!.name,
          reused: true,
          uploadedUserCount: 0,
        }
      }
      audienceError(
        'META_AUDIENCE_INVALID_SOURCE',
        `Já existe um público com o nome "${prepared.name}". Use duplicateStrategy RETURN_EXISTING ou CREATE_ANYWAY.`,
        409,
        { existing, duplicateStrategy: 'ERROR' },
      )
    }
  }

  const path = `/${actPath(creds.adAccountId)}/customaudiences`
  const created = await graphWrite(
    graph,
    metaGraphUrl(creds.apiVersion, path),
    {
      method: 'POST',
      query: { access_token: creds.accessToken },
      body: prepared.graphBody,
    },
    sanitizeMetaWriteAuditPayload(prepared.graphBody) as Record<string, unknown>,
  )

  const id = created?.id ? String(created.id) : null
  if (!id)
    audienceError('META_AUDIENCE_GRAPH_ERROR', 'A Meta não retornou id do público criado.', 502)

  let uploadedUserCount = 0
  if (prepared.hashedUsers.count && prepared.sourceType === 'CUSTOMER_LIST') {
    await graphWrite(
      graph,
      metaGraphUrl(creds.apiVersion, `/${id}/users`),
      {
        method: 'POST',
        query: { access_token: creds.accessToken },
        body: {
          payload: {
            schema: prepared.hashedUsers.schema,
            data: prepared.hashedUsers.data,
          },
        },
      },
      { payload: { schema: prepared.hashedUsers.schema, rows: prepared.hashedUsers.count } },
    )
    uploadedUserCount = prepared.hashedUsers.count
  }

  return { id, name: prepared.name, reused: false, uploadedUserCount }
}

export async function metaCreateCustomAudience(
  ctx: MetaToolContextLike,
  raw: unknown,
) {
  const input = metaCreateCustomAudienceSchema.parse(raw)
  assertWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await resolveMetaCredentials(ctx.client, input.tenantId, input.adAccountId)
  assertMetaAdsManagementReady({
    grantedScopes: creds.publicConfig.granted_scopes,
    hasAccessToken: Boolean(creds.accessToken),
  })
  const graphFn = ctx.graphFetch || defaultMetaGraphFetch

  const prepared = await prepareCreateCustomAudience({
    graph: graphFn,
    creds,
    input,
    allowGraphDiscovery: true,
  })

  const path = `/${actPath(creds.adAccountId)}/customaudiences`
  const notes = createPreviewNotes(prepared)
  const duplicateStrategy = input.duplicateStrategy ?? 'ERROR'

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path,
      body: sanitizeMetaWriteAuditPayload(prepared.graphBody) as Record<string, unknown>,
      notes,
    },
    async () => executeCreateAudience({
      graph: graphFn,
      creds,
      prepared,
      duplicateStrategy,
    }),
  )

  await logMetaWriteAudit({
    tenantId: input.tenantId,
    action: dryRun ? 'meta.gpt.audience.create.preview' : 'meta.gpt.audience.create',
    entityType: 'custom_audience',
    entityId: run.result?.id ?? null,
    dryRun,
    after: sanitizeMetaWriteAuditPayload({
      name: prepared.name,
      sourceType: prepared.sourceType,
      event: prepared.event,
      reused: run.result?.reused,
    }),
  }, ctx.client)

  if (run.dryRun) {
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      dryRun: true as const,
      wouldMutate: true,
      name: prepared.name,
      sourceType: prepared.sourceType,
      event: prepared.event ?? null,
      metaEvent: prepared.metaEvent,
      subtype: prepared.subtype,
      retentionDays: prepared.retentionDays,
      retentionSeconds: prepared.retentionSeconds,
      pageId: prepared.sources.pageId,
      instagramAccountId: prepared.sources.instagramAccountId,
      pixelId: prepared.sources.pixelId,
      duplicateStrategy,
      preview: run.preview,
      warning: 'Dry-run: nenhuma mutação enviada à Meta Graph API.',
    }
  }

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    dryRun: false as const,
    id: run.result!.id,
    name: run.result!.name,
    sourceType: prepared.sourceType,
    event: prepared.event ?? null,
    metaEvent: prepared.metaEvent,
    subtype: prepared.subtype,
    retentionDays: prepared.retentionDays,
    status: run.result!.reused ? 'existing' : 'processing',
    reused: run.result!.reused,
    uploadedUserCount: run.result!.uploadedUserCount,
  }
}

export async function metaCreateCustomAudiencesBatch(
  ctx: MetaToolContextLike,
  raw: unknown,
) {
  const input = metaCreateCustomAudiencesBatchSchema.parse(raw)
  assertWriteConfirmation(input)
  assertBulkItemLimit(input.items.length, 'públicos')
  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await resolveMetaCredentials(ctx.client, input.tenantId, input.adAccountId)
  assertMetaAdsManagementReady({
    grantedScopes: creds.publicConfig.granted_scopes,
    hasAccessToken: Boolean(creds.accessToken),
  })

  const succeeded: Array<Record<string, unknown>> = []
  const failed: Array<Record<string, unknown>> = []

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i]!
    try {
      const result = await metaCreateCustomAudience(ctx, {
        ...item,
        tenantId: input.tenantId,
        adAccountId: input.adAccountId,
        confirm: true,
        confirmTenantId: input.confirmTenantId,
        dryRun,
        duplicateStrategy: item.duplicateStrategy ?? input.duplicateStrategy,
      })
      succeeded.push({ index: i, ...result as Record<string, unknown> })
    }
    catch (error) {
      const err = error instanceof MetaAdsToolError
        ? { code: error.code, message: error.message, details: error.details }
        : { code: 'META_AUDIENCE_GRAPH_ERROR', message: error instanceof Error ? error.message : 'Falha desconhecida' }
      failed.push({ index: i, name: item.name ?? null, sourceType: item.sourceType, ...err })
    }
  }

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    dryRun,
    succeeded,
    failed,
    warning: failed.length
      ? `Criação parcial: ${succeeded.length} ok, ${failed.length} falha(s). Sem transação — itens ok não são revertidos.`
      : undefined,
  }
}

export async function metaUpdateCustomAudience(
  ctx: MetaToolContextLike,
  raw: unknown,
) {
  const input = metaUpdateCustomAudienceSchema.parse(raw)
  assertWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await resolveMetaCredentials(ctx.client, input.tenantId, input.adAccountId)
  assertMetaAdsManagementReady({
    grantedScopes: creds.publicConfig.granted_scopes,
    hasAccessToken: Boolean(creds.accessToken),
  })
  const graph = ctx.graphFetch || defaultMetaGraphFetch

  await assertOwnedAudience(graph, creds, input.audienceId)

  const body: Record<string, unknown> = {}
  if (input.name)
    body.name = input.name
  if (input.description != null)
    body.description = input.description
  if (input.rule)
    body.rule = typeof input.rule === 'string' ? input.rule : JSON.stringify(input.rule)

  const path = `/${input.audienceId}`
  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path,
      body: sanitizeMetaWriteAuditPayload(body) as Record<string, unknown>,
      notes: ['Atualiza nome/descrição/rule se a Meta permitir no subtype.'],
    },
    async () => graphWrite(
      graph,
      metaGraphUrl(creds.apiVersion, path),
      { method: 'POST', query: { access_token: creds.accessToken }, body },
      body,
    ),
  )

  await logMetaWriteAudit({
    tenantId: input.tenantId,
    action: dryRun ? 'meta.gpt.audience.update.preview' : 'meta.gpt.audience.update',
    entityType: 'custom_audience',
    entityId: input.audienceId,
    dryRun,
    after: sanitizeMetaWriteAuditPayload(body),
  }, ctx.client)

  if (run.dryRun) {
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      audienceId: input.audienceId,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: nenhuma mutação enviada à Meta Graph API.',
    }
  }

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    audienceId: input.audienceId,
    dryRun: false as const,
    success: true,
  }
}

export async function metaGetCustomAudienceUsage(
  ctx: MetaToolContextLike,
  raw: unknown,
) {
  const input = metaGetCustomAudienceUsageSchema.parse(raw)
  const creds = await resolveMetaCredentials(ctx.client, input.tenantId, input.adAccountId)
  const graph = ctx.graphFetch || defaultMetaGraphFetch

  const audience = await assertOwnedAudience(
    graph,
    creds,
    input.audienceId,
    'ads.limit(50){id,name,effective_status},lookalike_audience_ids,delivery_status',
  )

  const adsRaw = audience.ads && typeof audience.ads === 'object'
    ? (audience.ads as { data?: Array<Record<string, unknown>> }).data
    : []
  const ads = Array.isArray(adsRaw)
    ? adsRaw.map(row => ({
        id: String(row.id || ''),
        name: row.name != null ? String(row.name) : null,
        effective_status: row.effective_status != null ? String(row.effective_status) : null,
      })).filter(row => row.id)
    : []

  const lookalikeIds = Array.isArray(audience.lookalike_audience_ids)
    ? audience.lookalike_audience_ids.map(String)
    : []

  const inUse = ads.length > 0 || lookalikeIds.length > 0

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    audienceId: input.audienceId,
    name: audience.name != null ? String(audience.name) : null,
    subtype: audience.subtype != null ? String(audience.subtype) : null,
    inUse,
    ads,
    lookalikeAudienceIds: lookalikeIds,
    delivery_status: audience.delivery_status ?? null,
  }
}

export async function metaDeleteCustomAudience(
  ctx: MetaToolContextLike,
  raw: unknown,
) {
  const input = metaDeleteCustomAudienceSchema.parse(raw)
  assertWriteConfirmation(input)
  assertConfirmDelete(input.confirmDelete)
  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await resolveMetaCredentials(ctx.client, input.tenantId, input.adAccountId)
  assertMetaAdsManagementReady({
    grantedScopes: creds.publicConfig.granted_scopes,
    hasAccessToken: Boolean(creds.accessToken),
  })
  const graph = ctx.graphFetch || defaultMetaGraphFetch

  const usage = await metaGetCustomAudienceUsage(ctx, {
    tenantId: input.tenantId,
    adAccountId: input.adAccountId,
    audienceId: input.audienceId,
  })

  if (usage.inUse) {
    audienceError(
      'META_AUDIENCE_IN_USE',
      'Público em uso por anúncios ou lookalikes. Remova do targeting antes de excluir.',
      409,
      { ads: usage.ads, lookalikeAudienceIds: usage.lookalikeAudienceIds },
    )
  }

  const path = `/${input.audienceId}`
  const run = await withDryRun(
    dryRun,
    {
      method: 'DELETE',
      path,
      notes: ['Público sem ads/lookalikes vinculados no momento da checagem.'],
    },
    async () => graphWrite(
      graph,
      metaGraphUrl(creds.apiVersion, path),
      { method: 'DELETE', query: { access_token: creds.accessToken } },
      { audienceId: input.audienceId },
    ),
  )

  await logMetaWriteAudit({
    tenantId: input.tenantId,
    action: dryRun ? 'meta.gpt.audience.delete.preview' : 'meta.gpt.audience.delete',
    entityType: 'custom_audience',
    entityId: input.audienceId,
    dryRun,
  }, ctx.client)

  if (run.dryRun) {
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      audienceId: input.audienceId,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: nenhuma exclusão enviada à Meta Graph API.',
    }
  }

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    audienceId: input.audienceId,
    dryRun: false as const,
    success: true,
  }
}
