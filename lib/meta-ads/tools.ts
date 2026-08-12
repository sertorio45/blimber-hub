import type { SupabaseLike } from './integration'

import type { MetaCampaignStatusUpdate, MetaGraphFetch, MetaInsightLevel } from './types'
import { z } from 'zod'
import { decryptSecret } from '../marketing-secrets'
import {
  actPath,
  buildMetaDateQuery,
  defaultMetaGraphFetch,
  enrichMetaGraphWriteError,
  metaGraphUrl,
  normalizeMetaAdAccountId,
} from './graph'
import {
  listMarketingIntegrations,
  resolveMetaAccessToken,
  resolveMetaCredentials,
} from './integration'
import { MetaAdsToolError } from './types'
import {
  assertWhatsAppAdsetCompatibility,
  buildMetaCreateAdCreativeBody,
  buildMetaCreateAdsetGraphBody,
  isMetaMessagingProtocolUrl,
  META_AD_DESTINATION_TYPES,
  normalizeWhatsappPhoneNumber,
  type MetaAdDestinationType,
} from './ad-destination'
import {
  META_ADSET_BILLING_EVENTS,
  META_ADSET_OPTIMIZATION_GOALS,
  META_ADSET_TARGETING_TEMPLATE_IDS,
  metaCustomTargetingSchema,
  refineTargetingXor,
  resolveAdsetTargeting,
} from './targeting-templates'
import {
  assertBulkDeletePreviewToken,
  issueBulkDeletePreviewToken,
  normalizeBulkDeleteIds,
  type BulkDeleteLevel,
} from './bulk-delete-preview'
import { logMetaWriteAudit } from './write-audit'
import {
  assertAdAccountOwnership,
  assertBudgetIncreaseAllowed,
  assertBulkItemLimit,
  assertCampaignBudgetWithinLimit,
  assertConfirmActive,
  assertConfirmDelete,
  assertMetaPageCreativeReady,
  assertMetaPageId,
  assertWriteConfirmation,
  metaWriteConfirmationFields,
  metaWriteDryRunField,
  resolveDryRun,
  withDryRun,
} from './write-guards'
import {
  getMetaGptBulkMax,
  getMetaGptBudgetDailyMaxCents,
  getMetaGptBudgetIncreaseMaxPercent,
} from './write-limits'

export type { SupabaseLike } from './integration'

const uuidLike = z.string().min(1)

export const tenantContextSchema = z.object({
  tenantId: uuidLike.describe('UUID do tenant (empresa). Obrigatório — nunca misturar tenants.'),
  adAccountId: z.string().optional().describe('Conta de anúncios Meta sem prefixo act_. Usa a da integração se omitido.'),
})

export const metaListIntegrationsSchema = tenantContextSchema.pick({ tenantId: true })

export const metaListAdAccountsSchema = tenantContextSchema.pick({ tenantId: true })

export const metaListCampaignsSchema = tenantContextSchema.extend({
  limit: z.number().int().min(1).max(200).optional().default(50),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED']).optional(),
})

export const metaGetCampaignSchema = tenantContextSchema.extend({
  campaignId: z.string().min(1),
})

export const metaListAdsetsSchema = tenantContextSchema.extend({
  campaignId: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50),
})

export const metaListAdsSchema = tenantContextSchema.extend({
  campaignId: z.string().optional(),
  adsetId: z.string().optional(),
  activeOnly: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(200).optional().default(50),
})

export const metaGetInsightsSchema = tenantContextSchema.extend({
  level: z.enum(['account', 'campaign', 'adset', 'ad']).optional().default('campaign'),
  datePreset: z
    .enum(['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'custom'])
    .optional()
    .default('last_7d'),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
  metrics: z.array(z.string()).optional(),
  objectId: z.string().optional().describe('Opcional: id da campanha/adset/ad para insights do nó.'),
  limit: z.number().int().min(1).max(200).optional().default(50),
})

/**
 * Optional dry-run for pause/activate tools.
 * Default false (retrocompatível na campanha; espelho em adset/ad).
 * Create/edit futuros (Etapa 2+) devem defaultar true.
 */
export const metaUpdateCampaignStatusSchema = tenantContextSchema.extend({
  campaignId: z.string().min(1),
  status: z.enum(['ACTIVE', 'PAUSED']),
  ...metaWriteConfirmationFields,
  ...metaWriteDryRunField,
})

export const metaUpdateAdsetStatusSchema = tenantContextSchema.extend({
  adsetId: z.string().min(1),
  status: z.enum(['ACTIVE', 'PAUSED']),
  ...metaWriteConfirmationFields,
  ...metaWriteDryRunField,
})

export const metaUpdateAdStatusSchema = tenantContextSchema.extend({
  adId: z.string().min(1),
  status: z.enum(['ACTIVE', 'PAUSED']),
  ...metaWriteConfirmationFields,
  ...metaWriteDryRunField,
})

/** Outcome objectives only (legacy CONVERSIONS / LINK_CLICKS etc. rejected). */
export const META_CAMPAIGN_OBJECTIVES = [
  'OUTCOME_AWARENESS',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS',
  'OUTCOME_SALES',
  'OUTCOME_TRAFFIC',
  'OUTCOME_APP_PROMOTION',
] as const

export type MetaCampaignObjective = (typeof META_CAMPAIGN_OBJECTIVES)[number]

/** Meta special_ad_categories whitelist (empty array = none). */
export const META_SPECIAL_AD_CATEGORIES = [
  'CREDIT',
  'EMPLOYMENT',
  'HOUSING',
  'ISSUES_ELECTIONS_POLITICS',
  'ONLINE_GAMBLING_AND_GAMING',
  'FINANCIAL_PRODUCTS_SERVICES',
] as const

export type MetaSpecialAdCategory = (typeof META_SPECIAL_AD_CATEGORIES)[number]

/**
 * Create campaign — dryRun defaults to true (spend potential).
 * Status defaults to PAUSED; ACTIVE requires confirmActive: true.
 */
export const metaCreateCampaignSchema = tenantContextSchema
  .extend({
    name: z.string().min(1).max(400).describe('Nome da campanha na Meta.'),
    objective: z
      .enum(META_CAMPAIGN_OBJECTIVES)
      .describe('Objetivo Outcome_* suportado. Legados (CONVERSIONS, LINK_CLICKS, etc.) são rejeitados.'),
    status: z
      .enum(['ACTIVE', 'PAUSED'])
      .optional()
      .default('PAUSED')
      .describe('Default PAUSED. ACTIVE exige confirmActive=true.'),
    dailyBudget: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Orçamento diário em centavos (minor units). Mutuamente exclusivo com lifetimeBudget.'),
    lifetimeBudget: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Orçamento vitalício em centavos. Mutuamente exclusivo com dailyBudget.'),
    specialAdCategories: z
      .array(z.enum(META_SPECIAL_AD_CATEGORIES))
      .optional()
      .default([])
      .describe('Categorias especiais Meta (vazio = nenhuma).'),
    confirmActive: z
      .literal(true)
      .optional()
      .describe('Obrigatório se status=ACTIVE (confirmação extra de gasto).'),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    if (data.dailyBudget != null && data.lifetimeBudget != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe dailyBudget OU lifetimeBudget, não ambos.',
        path: ['dailyBudget'],
      })
    }
  })

/**
 * Create adset — dryRun defaults to true.
 * Targeting via BR_* preset XOR custom `targeting` object (validated subset of Graph).
 * Status defaults to PAUSED; ACTIVE requires confirmActive: true.
 * destinationType=WHATSAPP → Click-to-WhatsApp (promoted_object.page_id + destination_type).
 */
export const metaCreateAdsetSchema = tenantContextSchema
  .extend({
    campaignId: z.string().min(1).describe('ID da campanha Meta (deve pertencer à ad account do tenant).'),
    name: z.string().min(1).max(400).describe('Nome do conjunto de anúncios (adset).'),
    targetingTemplate: z
      .enum(META_ADSET_TARGETING_TEMPLATE_IDS)
      .optional()
      .describe('Preset BR_* (geo+idade). XOR com targeting — não envie os dois.'),
    targeting: metaCustomTargetingSchema
      .optional()
      .describe('Targeting Graph customizado (geo/idade/gênero/interesses/audiences). XOR com targetingTemplate.'),
    billingEvent: z
      .enum(META_ADSET_BILLING_EVENTS)
      .describe('Evento de cobrança whitelisted (IMPRESSIONS|LINK_CLICKS). CTWA exige IMPRESSIONS.'),
    optimizationGoal: z
      .enum(META_ADSET_OPTIMIZATION_GOALS)
      .describe('Meta de otimização whitelisted. CTWA: CONVERSATIONS (ou matriz oficial × objective).'),
    destinationType: z
      .enum(META_AD_DESTINATION_TYPES)
      .optional()
      .default('WEBSITE')
      .describe('WEBSITE (default) ou WHATSAPP (Click-to-WhatsApp). Não é objective de campanha.'),
    campaignObjective: z
      .enum(META_CAMPAIGN_OBJECTIVES)
      .optional()
      .describe('Objective da campanha — usado p/ validar CTWA no dry-run; na execução a Graph confirma.'),
    whatsappPhoneNumber: z
      .string()
      .min(8)
      .max(20)
      .optional()
      .describe('Opcional: telefone WhatsApp do promoted_object (E.164). Page ligada é o principal.'),
    status: z
      .enum(['ACTIVE', 'PAUSED'])
      .optional()
      .default('PAUSED')
      .describe('Default PAUSED. ACTIVE exige confirmActive=true.'),
    dailyBudget: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Orçamento diário em centavos. XOR com lifetimeBudget; um dos dois é obrigatório.'),
    lifetimeBudget: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Orçamento vitalício em centavos. XOR com dailyBudget; exige endTime.'),
    startTime: z
      .string()
      .optional()
      .describe('Início ISO-8601 opcional (ex. 2026-08-12T00:00:00-0300).'),
    endTime: z
      .string()
      .optional()
      .describe('Fim ISO-8601. Obrigatório se lifetimeBudget for informado.'),
    confirmActive: z
      .literal(true)
      .optional()
      .describe('Obrigatório se status=ACTIVE (confirmação extra de gasto).'),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    refineTargetingXor(data, ctx)
    if (data.dailyBudget != null && data.lifetimeBudget != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe dailyBudget OU lifetimeBudget, não ambos.',
        path: ['dailyBudget'],
      })
    }
    if (data.dailyBudget == null && data.lifetimeBudget == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe dailyBudget ou lifetimeBudget (centavos).',
        path: ['dailyBudget'],
      })
    }
    if (data.lifetimeBudget != null && !data.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'lifetimeBudget exige endTime (ISO-8601).',
        path: ['endTime'],
      })
    }
    if (data.destinationType === 'WHATSAPP' && data.billingEvent !== 'IMPRESSIONS') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'destinationType=WHATSAPP exige billingEvent=IMPRESSIONS.',
        path: ['billingEvent'],
      })
    }
    if (data.destinationType === 'WHATSAPP' && data.whatsappPhoneNumber) {
      try {
        normalizeWhatsappPhoneNumber(data.whatsappPhoneNumber)
      }
      catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'whatsappPhoneNumber inválido.',
          path: ['whatsappPhoneNumber'],
        })
      }
    }
    if (data.destinationType === 'WHATSAPP' && data.campaignObjective) {
      try {
        assertWhatsAppAdsetCompatibility({
          destinationType: 'WHATSAPP',
          optimizationGoal: data.optimizationGoal,
          billingEvent: data.billingEvent,
          campaignObjective: data.campaignObjective,
        })
      }
      catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'Combinação CTWA inválida.',
          path: ['optimizationGoal'],
        })
      }
    }
  })

/** CTA whitelist for link creatives (Marketing API call_to_action.type). */
export const META_AD_CALL_TO_ACTIONS = [
  'LEARN_MORE',
  'SHOP_NOW',
  'SIGN_UP',
  'SUBSCRIBE',
  'CONTACT_US',
  'DOWNLOAD',
  'GET_OFFER',
  'BOOK_NOW',
  'BUY_NOW',
  'APPLY_NOW',
  'GET_QUOTE',
  'WHATSAPP_MESSAGE',
] as const

export type MetaAdCallToAction = (typeof META_AD_CALL_TO_ACTIONS)[number]

/**
 * Create ad + creative (object_story_spec) on the tenant ad account.
 * dryRun default true. Status default PAUSED. Requires page_id + page token.
 * destinationType=WEBSITE (default): linkUrl obrigatório.
 * destinationType=WHATSAPP: linkUrl de site NÃO obrigatório; CTA WHATSAPP_MESSAGE oficial.
 * Optional media: imageUrl (HTTPS) XOR imageHash — never invent URLs.
 */
export const metaCreateAdSchema = tenantContextSchema
  .extend({
    adsetId: z.string().min(1).describe('ID do adset Meta (deve pertencer à ad account do tenant).'),
    name: z.string().min(1).max(400).describe('Nome do anúncio na Meta.'),
    destinationType: z
      .enum(META_AD_DESTINATION_TYPES)
      .optional()
      .default('WEBSITE')
      .describe('WEBSITE (default, linkUrl obrigatório) ou WHATSAPP (Click-to-WhatsApp; sem linkUrl de site).'),
    linkUrl: z
      .string()
      .url()
      .optional()
      .describe('URL https de site (obrigatória só em WEBSITE). Nunca inventar; rejeita wa.me/api.whatsapp.com.'),
    message: z
      .string()
      .min(1)
      .max(2000)
      .describe('Texto principal (copy) do criativo — explícito do usuário.'),
    headline: z
      .string()
      .max(255)
      .optional()
      .describe('Título / headline (link_data.name).'),
    description: z
      .string()
      .max(500)
      .optional()
      .describe('Descrição do link (link_data.description).'),
    callToAction: z
      .enum(META_AD_CALL_TO_ACTIONS)
      .optional()
      .describe('CTA whitelist. WEBSITE default LEARN_MORE; WHATSAPP força WHATSAPP_MESSAGE.'),
    welcomeMessage: z
      .string()
      .min(1)
      .max(1000)
      .optional()
      .describe('Só WHATSAPP: saudação/autofill (page_welcome_message). Opcional.'),
    imageUrl: z
      .string()
      .url()
      .optional()
      .describe('URL HTTPS de imagem já hospedada (opcional). Nunca inventar. XOR com imageHash.'),
    imageHash: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe('image_hash já existente na ad account (opcional). XOR com imageUrl.'),
    creativeName: z
      .string()
      .min(1)
      .max(400)
      .optional()
      .describe('Nome do AdCreative (default: name + " Creative").'),
    status: z
      .enum(['ACTIVE', 'PAUSED'])
      .optional()
      .default('PAUSED')
      .describe('Default PAUSED. ACTIVE exige confirmActive=true.'),
    confirmActive: z
      .literal(true)
      .optional()
      .describe('Obrigatório se status=ACTIVE (confirmação extra de gasto).'),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    const destinationType = data.destinationType ?? 'WEBSITE'

    if (destinationType === 'WEBSITE') {
      if (!data.linkUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'destinationType=WEBSITE exige linkUrl https de site. Para WhatsApp use destinationType=WHATSAPP.',
          path: ['linkUrl'],
        })
      }
      else if (!data.linkUrl.startsWith('https://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'linkUrl deve usar https://.',
          path: ['linkUrl'],
        })
      }
      else if (isMetaMessagingProtocolUrl(data.linkUrl)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Não use wa.me/api.whatsapp.com como linkUrl de site. Use destinationType=WHATSAPP (estrutura oficial CTWA).',
          path: ['linkUrl'],
        })
      }
      if (data.callToAction === 'WHATSAPP_MESSAGE') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CTA WHATSAPP_MESSAGE exige destinationType=WHATSAPP (não WEBSITE).',
          path: ['callToAction'],
        })
      }
      if (data.welcomeMessage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'welcomeMessage só é válido com destinationType=WHATSAPP.',
          path: ['welcomeMessage'],
        })
      }
    }

    if (destinationType === 'WHATSAPP') {
      if (data.linkUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'destinationType=WHATSAPP não aceita linkUrl de site (nem wa.me fabricado). Omita linkUrl.',
          path: ['linkUrl'],
        })
      }
      if (data.callToAction && data.callToAction !== 'WHATSAPP_MESSAGE') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'destinationType=WHATSAPP usa CTA WHATSAPP_MESSAGE (oficial). Omita callToAction ou envie WHATSAPP_MESSAGE.',
          path: ['callToAction'],
        })
      }
    }

    if (data.imageUrl && data.imageHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe imageUrl OU imageHash, não ambos.',
        path: ['imageUrl'],
      })
    }
    if (data.imageUrl && !data.imageUrl.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'imageUrl deve usar https://. Nunca invente URLs de mídia.',
        path: ['imageUrl'],
      })
    }
  })

/**
 * Update adset budget — dryRun default true. Absolute ceiling + optional increase % flag.
 */
export const metaUpdateAdsetBudgetSchema = tenantContextSchema
  .extend({
    adsetId: z.string().min(1).describe('ID do adset Meta (mesma ad account do tenant).'),
    dailyBudget: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Novo orçamento diário em centavos. XOR com lifetimeBudget.'),
    lifetimeBudget: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Novo orçamento vitalício em centavos. XOR com dailyBudget.'),
    endTime: z
      .string()
      .optional()
      .describe('Fim ISO-8601. Recomendado/obrigatório ao definir lifetimeBudget sem end_time atual.'),
    confirmBudgetIncrease: z
      .literal(true)
      .optional()
      .describe('Obrigatório se o aumento % exceder META_GPT_BUDGET_INCREASE_MAX_PERCENT.'),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    if (data.dailyBudget != null && data.lifetimeBudget != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe dailyBudget OU lifetimeBudget, não ambos.',
        path: ['dailyBudget'],
      })
    }
    if (data.dailyBudget == null && data.lifetimeBudget == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe dailyBudget ou lifetimeBudget (centavos).',
        path: ['dailyBudget'],
      })
    }
  })

/**
 * Update adset targeting — BR_* preset XOR custom targeting. dryRun default true.
 */
export const metaUpdateAdsetTargetingSchema = tenantContextSchema
  .extend({
    adsetId: z.string().min(1).describe('ID do adset Meta.'),
    targetingTemplate: z
      .enum(META_ADSET_TARGETING_TEMPLATE_IDS)
      .optional()
      .describe('Preset BR_* (geo+idade). XOR com targeting.'),
    targeting: metaCustomTargetingSchema
      .optional()
      .describe('Targeting Graph customizado. XOR com targetingTemplate.'),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    refineTargetingXor(data, ctx)
  })

/**
 * Update ad creative copy via new AdCreative + swap on ad (Graph creatives are mostly immutable).
 * dryRun default true. At least one copy field required.
 */
export const metaUpdateAdCreativeCopySchema = tenantContextSchema
  .extend({
    adId: z.string().min(1).describe('ID do anúncio Meta.'),
    message: z.string().min(1).max(2000).optional().describe('Novo texto principal (link_data.message).'),
    headline: z.string().max(255).optional().describe('Novo título (link_data.name).'),
    description: z.string().max(500).optional().describe('Nova descrição (link_data.description).'),
    callToAction: z
      .enum(META_AD_CALL_TO_ACTIONS)
      .optional()
      .describe('Novo CTA whitelist.'),
    linkUrl: z
      .string()
      .url()
      .optional()
      .describe('Nova URL https de destino. Nunca inventar.'),
    creativeName: z
      .string()
      .min(1)
      .max(400)
      .optional()
      .describe('Nome do novo AdCreative (default derivado).'),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    if (
      data.message == null
      && data.headline == null
      && data.description == null
      && data.callToAction == null
      && data.linkUrl == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe ao menos um de: message, headline, description, callToAction, linkUrl.',
        path: ['message'],
      })
    }
    if (data.linkUrl && !data.linkUrl.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'linkUrl deve usar https://.',
        path: ['linkUrl'],
      })
    }
  })

/**
 * Update ad media via new AdCreative (imageUrl XOR imageHash) + swap on ad.
 * Preserves copy from existing creative. dryRun default true.
 * Gap: video_id, upload binário, carousel — fora do MVP.
 */
export const metaUpdateAdMediaSchema = tenantContextSchema
  .extend({
    adId: z.string().min(1).describe('ID do anúncio Meta.'),
    imageUrl: z
      .string()
      .url()
      .optional()
      .describe('URL HTTPS de imagem hospedada. XOR com imageHash. Nunca inventar.'),
    imageHash: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe('image_hash na ad account. XOR com imageUrl.'),
    creativeName: z
      .string()
      .min(1)
      .max(400)
      .optional()
      .describe('Nome do novo AdCreative (default derivado).'),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    if (!data.imageUrl && !data.imageHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe imageUrl ou imageHash.',
        path: ['imageUrl'],
      })
    }
    if (data.imageUrl && data.imageHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe imageUrl OU imageHash, não ambos.',
        path: ['imageUrl'],
      })
    }
    if (data.imageUrl && !data.imageUrl.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'imageUrl deve usar https://. Nunca invente URLs de mídia.',
        path: ['imageUrl'],
      })
    }
  })

/**
 * Bulk delete preview — validates ownership for explicit IDs only (never by name).
 * Returns table + previewToken (TTL). No Graph DELETE/POST.
 */
export const metaPreviewBulkDeleteSchema = tenantContextSchema.extend({
  level: z
    .enum(['campaign', 'adset', 'ad'])
    .describe('Nível explícito: campaign | adset | ad. Uma lista por nível.'),
  ids: z
    .array(z.string().min(1))
    .min(1)
    .describe('IDs Meta explícitos a validar (máx. META_GPT_BULK_MAX). Sem filtro por nome.'),
  deleteMode: z
    .enum(['DELETED', 'ARCHIVED'])
    .optional()
    .default('DELETED')
    .describe('DELETED = remoção marketing (padrão). ARCHIVED = arquivar (revertível com mais atrito).'),
})

/**
 * Bulk delete execute — requires recent previewToken + confirms + dryRun:false.
 * Processes sequentially; returns succeeded[] / failed[].
 */
export const metaExecuteBulkDeleteSchema = tenantContextSchema.extend({
  level: z.enum(['campaign', 'adset', 'ad']),
  ids: z
    .array(z.string().min(1))
    .min(1)
    .describe('Mesmos IDs do preview (explícitos). Nunca apagar por nome.'),
  previewToken: z
    .string()
    .min(1)
    .describe('Token retornado por meta_preview_bulk_delete (TTL curto).'),
  deleteMode: z
    .enum(['DELETED', 'ARCHIVED'])
    .optional()
    .default('DELETED'),
  confirmDelete: z
    .literal(true)
    .describe('Obrigatório: confirmação extra de exclusão após listar IDs no chat.'),
  ...metaWriteConfirmationFields,
  ...metaWriteDryRunField,
})

export type MetaToolName =
  | 'meta_list_integrations'
  | 'meta_list_ad_accounts'
  | 'meta_list_campaigns'
  | 'meta_get_campaign'
  | 'meta_list_adsets'
  | 'meta_list_ads'
  | 'meta_get_insights'
  | 'meta_update_campaign_status'
  | 'meta_update_adset_status'
  | 'meta_update_ad_status'
  | 'meta_create_campaign'
  | 'meta_create_adset'
  | 'meta_create_ad'
  | 'meta_update_adset_budget'
  | 'meta_update_adset_targeting'
  | 'meta_update_ad_creative_copy'
  | 'meta_update_ad_media'
  | 'meta_preview_bulk_delete'
  | 'meta_execute_bulk_delete'

export interface MetaToolContext {
  client: SupabaseLike
  graphFetch?: MetaGraphFetch
}

const DEFAULT_INSIGHT_FIELDS
  = 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,spend,reach,ctr,cpc,cpm,actions,purchase_roas'

function filteringForStatus(status?: string) {
  if (!status)
    return undefined
  return JSON.stringify([{ field: 'effective_status', operator: 'IN', value: [status] }])
}

async function withCreds(
  ctx: MetaToolContext,
  tenantId: string,
  adAccountId: string | undefined,
) {
  return resolveMetaCredentials(ctx.client, tenantId, adAccountId)
}

function fetchGraph(ctx: MetaToolContext): MetaGraphFetch {
  return ctx.graphFetch || defaultMetaGraphFetch
}

/**
 * Graph POST/DELETE for writes — on META_GRAPH_ERROR attaches sanitized request body
 * (never tokens) so GPT/Postman can debug Invalid parameter (100).
 */
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
    enrichMetaGraphWriteError(err, requestPayload ?? init.body ?? null)
  }
}

/**
 * Build POST body for act_{id}/campaigns aligned with current Marketing API.
 * - special_ad_categories always present (required since API 7.0; [] = none)
 * - without campaign budget: is_adset_budget_sharing_enabled=false (required v24+ ABO)
 * - with daily/lifetime budget: omit sharing flag (CBO; Meta forbids combining)
 */
export function buildMetaCreateCampaignGraphBody(input: {
  name: string
  objective: MetaCampaignObjective
  status: 'ACTIVE' | 'PAUSED'
  dailyBudget?: number
  lifetimeBudget?: number
  specialAdCategories?: MetaSpecialAdCategory[]
}): Record<string, unknown> {
  const specialAdCategories = input.specialAdCategories ?? []
  const body: Record<string, unknown> = {
    name: input.name,
    objective: input.objective,
    status: input.status,
    special_ad_categories: specialAdCategories,
  }

  const hasCampaignBudget = input.dailyBudget != null || input.lifetimeBudget != null
  if (input.dailyBudget != null)
    body.daily_budget = input.dailyBudget
  if (input.lifetimeBudget != null)
    body.lifetime_budget = input.lifetimeBudget

  // Official Graph create example sends is_adset_budget_sharing_enabled=0 when no CBO.
  if (!hasCampaignBudget)
    body.is_adset_budget_sharing_enabled = false

  return body
}

export async function metaListIntegrations(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListIntegrationsSchema.parse(raw)
  const integrations = await listMarketingIntegrations(ctx.client, input.tenantId)
  return {
    tenantId: input.tenantId,
    integrations,
  }
}

export async function metaListAdAccounts(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListAdAccountsSchema.parse(raw)
  const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
  const graph = fetchGraph(ctx)
  const res = await graph(metaGraphUrl(tokenCtx.apiVersion, '/me/adaccounts'), {
    query: {
      fields: 'id,name,account_status,currency,timezone_name',
      limit: 100,
      access_token: tokenCtx.accessToken,
    },
  })

  return {
    tenantId: input.tenantId,
    configuredAdAccountId: tokenCtx.publicConfig.ad_account_id || null,
    adAccounts: (res?.data || []).map((row: any) => ({
      id: normalizeMetaAdAccountId(String(row.id || '')),
      name: row.name || row.id,
      account_status: row.account_status,
      currency: row.currency ?? null,
      timezone_name: row.timezone_name ?? null,
    })),
  }
}

export async function metaListCampaigns(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListCampaignsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const query: Record<string, string | number | undefined> = {
    fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,updated_time',
    limit: input.limit,
    access_token: creds.accessToken,
  }
  const filtering = filteringForStatus(input.status)
  if (filtering)
    query.filtering = filtering

  const res = await graph(metaGraphUrl(creds.apiVersion, `/${actPath(creds.adAccountId)}/campaigns`), {
    query,
  })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    campaigns: res?.data || [],
    paging: res?.paging || null,
  }
}

export async function metaGetCampaign(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaGetCampaignSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const campaign = await graph(metaGraphUrl(creds.apiVersion, `/${input.campaignId}`), {
    query: {
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,updated_time,account_id',
      access_token: creds.accessToken,
    },
  })

  assertAdAccountOwnership({
    objectAccountId: campaign?.account_id,
    tenantAdAccountId: creds.adAccountId,
    code: 'CAMPAIGN_TENANT_MISMATCH',
    message: 'Campanha não pertence à ad account do tenant.',
  })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    campaign,
  }
}

export async function metaListAdsets(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListAdsetsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const path = input.campaignId
    ? `/${input.campaignId}/adsets`
    : `/${actPath(creds.adAccountId)}/adsets`

  const res = await graph(metaGraphUrl(creds.apiVersion, path), {
    query: {
      fields: 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,billing_event',
      limit: input.limit,
      access_token: creds.accessToken,
    },
  })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    campaignId: input.campaignId || null,
    adsets: res?.data || [],
    paging: res?.paging || null,
  }
}

export async function metaListAds(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListAdsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)

  let path = `/${actPath(creds.adAccountId)}/ads`
  if (input.adsetId)
    path = `/${input.adsetId}/ads`
  else if (input.campaignId)
    path = `/${input.campaignId}/ads`

  const query: Record<string, string | number | undefined> = {
    fields: 'id,name,effective_status,status,campaign_id,adset_id,creative{id,name,thumbnail_url}',
    limit: input.limit,
    access_token: creds.accessToken,
  }
  if (input.activeOnly)
    query.filtering = filteringForStatus('ACTIVE')

  const res = await graph(metaGraphUrl(creds.apiVersion, path), { query })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    campaignId: input.campaignId || null,
    adsetId: input.adsetId || null,
    ads: res?.data || [],
    paging: res?.paging || null,
  }
}

export async function metaGetInsights(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaGetInsightsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const dateQ = buildMetaDateQuery(input.datePreset, input.dateStart, input.dateEnd)
  const fields = (input.metrics?.length ? input.metrics.join(',') : DEFAULT_INSIGHT_FIELDS)
  const level = input.level as MetaInsightLevel

  const path = input.objectId
    ? `/${input.objectId}/insights`
    : `/${actPath(creds.adAccountId)}/insights`

  const query: Record<string, string | number | undefined> = {
    fields,
    access_token: creds.accessToken,
    limit: input.limit,
    ...dateQ,
  }
  if (!input.objectId && level !== 'account')
    query.level = level

  const res = await graph(metaGraphUrl(creds.apiVersion, path), { query })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    level,
    datePreset: input.datePreset,
    dateStart: input.dateStart || null,
    dateEnd: input.dateEnd || null,
    objectId: input.objectId || null,
    insights: res?.data || [],
    paging: res?.paging || null,
  }
}

type StatusObjectKind = 'campaign' | 'adset' | 'ad'

const STATUS_OBJECT_META: Record<StatusObjectKind, {
  idKey: 'campaignId' | 'adsetId' | 'adId'
  entityType: string
  auditAction: string
  auditPreviewAction: string
  mismatchCode: string
  mismatchMessage: string
  label: string
}> = {
  campaign: {
    idKey: 'campaignId',
    entityType: 'meta_campaign',
    auditAction: 'meta.gpt.campaign.status',
    auditPreviewAction: 'meta.gpt.campaign.status.preview',
    mismatchCode: 'CAMPAIGN_TENANT_MISMATCH',
    mismatchMessage: 'Campanha não pertence à ad account do tenant.',
    label: 'Campanha',
  },
  adset: {
    idKey: 'adsetId',
    entityType: 'meta_adset',
    auditAction: 'meta.gpt.adset.status',
    auditPreviewAction: 'meta.gpt.adset.status.preview',
    mismatchCode: 'ADSET_TENANT_MISMATCH',
    mismatchMessage: 'Conjunto de anúncios (adset) não pertence à ad account do tenant.',
    label: 'Adset',
  },
  ad: {
    idKey: 'adId',
    entityType: 'meta_ad',
    auditAction: 'meta.gpt.ad.status',
    auditPreviewAction: 'meta.gpt.ad.status.preview',
    mismatchCode: 'AD_TENANT_MISMATCH',
    mismatchMessage: 'Anúncio não pertence à ad account do tenant.',
    label: 'Anúncio',
  },
}

/** GET object + ownership check (shared by pause/activate tools). */
async function fetchOwnedStatusObject(
  ctx: MetaToolContext,
  params: {
    tenantId: string
    adAccountId?: string
    objectId: string
    kind: StatusObjectKind
  },
) {
  const creds = await withCreds(ctx, params.tenantId, params.adAccountId)
  const graph = fetchGraph(ctx)
  const meta = STATUS_OBJECT_META[params.kind]
  const object = await graph(metaGraphUrl(creds.apiVersion, `/${params.objectId}`), {
    query: {
      fields: 'id,name,status,effective_status,account_id,campaign_id,adset_id',
      access_token: creds.accessToken,
    },
  })

  assertAdAccountOwnership({
    objectAccountId: object?.account_id,
    tenantAdAccountId: creds.adAccountId,
    code: meta.mismatchCode,
    message: meta.mismatchMessage,
  })

  return { creds, object }
}

async function mutateOwnedObjectStatus(
  ctx: MetaToolContext,
  params: {
    tenantId: string
    adAccountId?: string
    objectId: string
    status: MetaCampaignStatusUpdate
    dryRun?: boolean
    kind: StatusObjectKind
  },
) {
  const meta = STATUS_OBJECT_META[params.kind]
  const dryRun = resolveDryRun(params.dryRun, false)
  const { creds, object } = await fetchOwnedStatusObject(ctx, {
    tenantId: params.tenantId,
    adAccountId: params.adAccountId,
    objectId: params.objectId,
    kind: params.kind,
  })
  const graph = fetchGraph(ctx)
  const beforeStatus = object?.status ?? object?.effective_status ?? null
  const status = params.status

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path: `/${params.objectId}`,
      body: { status },
      notes: [
        `${meta.label} ${params.objectId}: ${beforeStatus || '?'} → ${status}`,
        'dryRun=true: nenhuma mutação enviada à Graph API.',
      ],
    },
    async () => {
      const updated = await graphWrite(graph, metaGraphUrl(creds.apiVersion, `/${params.objectId}`), {
        method: 'POST',
        query: {
          access_token: creds.accessToken,
        },
        body: { status },
      }, { status })
      return {
        tenantId: params.tenantId,
        adAccountId: creds.adAccountId,
        [meta.idKey]: params.objectId,
        status,
        success: Boolean(updated?.success ?? true),
        dryRun: false as const,
        warning: 'Mutação aplicada na Meta Graph API. Verifique o Ads Manager se necessário.',
      }
    },
  )

  if (run.dryRun) {
    await logMetaWriteAudit({
      tenantId: params.tenantId,
      action: meta.auditPreviewAction,
      entityType: meta.entityType,
      entityId: params.objectId,
      dryRun: true,
      before: { status: beforeStatus },
      after: { status, preview: run.preview },
    })
    return {
      tenantId: params.tenantId,
      adAccountId: creds.adAccountId,
      [meta.idKey]: params.objectId,
      status,
      success: true,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: nenhuma mutação enviada à Meta Graph API.',
    }
  }

  const result = run.result!
  await logMetaWriteAudit(
    {
      tenantId: params.tenantId,
      action: meta.auditAction,
      entityType: meta.entityType,
      entityId: params.objectId,
      dryRun: false,
      before: { status: beforeStatus },
      after: { status, success: (result as any).success, adAccountId: creds.adAccountId },
    },
    ctx.client,
  )
  return result
}

export async function metaUpdateCampaignStatus(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaUpdateCampaignStatusSchema.parse(raw)
  assertWriteConfirmation(input)
  return mutateOwnedObjectStatus(ctx, {
    tenantId: input.tenantId,
    adAccountId: input.adAccountId,
    objectId: input.campaignId,
    status: input.status,
    dryRun: input.dryRun,
    kind: 'campaign',
  })
}

export async function metaUpdateAdsetStatus(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaUpdateAdsetStatusSchema.parse(raw)
  assertWriteConfirmation(input)
  return mutateOwnedObjectStatus(ctx, {
    tenantId: input.tenantId,
    adAccountId: input.adAccountId,
    objectId: input.adsetId,
    status: input.status,
    dryRun: input.dryRun,
    kind: 'adset',
  })
}

export async function metaUpdateAdStatus(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaUpdateAdStatusSchema.parse(raw)
  assertWriteConfirmation(input)
  return mutateOwnedObjectStatus(ctx, {
    tenantId: input.tenantId,
    adAccountId: input.adAccountId,
    objectId: input.adId,
    status: input.status,
    dryRun: input.dryRun,
    kind: 'ad',
  })
}

function formatBudgetMinorUnits(cents: number, currency: string | null): string {
  const major = cents / 100
  if (currency)
    return `${major.toFixed(2)} ${currency} (${cents} minor units)`
  return `${cents} minor units (moeda desconhecida — use listAdAccounts)`
}

/**
 * Create a campaign on the tenant ad account (POST /act_{id}/campaigns).
 * dryRun default true — no Graph POST until dryRun: false + confirms.
 */
export async function metaCreateCampaign(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaCreateCampaignSchema.parse(raw)
  assertWriteConfirmation(input)
  const status = input.status ?? 'PAUSED'
  assertConfirmActive({ status, confirmActive: input.confirmActive })
  assertCampaignBudgetWithinLimit({
    dailyBudgetCents: input.dailyBudget,
    lifetimeBudgetCents: input.lifetimeBudget,
  })

  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)

  // Currency only on execute (GET). Dry-run stays Graph-free except credentials from DB.
  let currency: string | null = null
  if (!dryRun) {
    try {
      const account = await graph(
        metaGraphUrl(creds.apiVersion, `/${actPath(creds.adAccountId)}`),
        {
          query: {
            fields: 'id,name,currency,account_id',
            access_token: creds.accessToken,
          },
        },
      )
      currency = account?.currency ? String(account.currency) : null
      assertAdAccountOwnership({
        objectAccountId: account?.account_id || account?.id,
        tenantAdAccountId: creds.adAccountId,
        code: 'AD_ACCOUNT_TENANT_MISMATCH',
        message: 'Ad account não corresponde à conta do tenant.',
      })
    }
    catch (err) {
      if (err instanceof MetaAdsToolError && err.code === 'AD_ACCOUNT_TENANT_MISMATCH')
        throw err
      // Keep create usable when currency GET fails.
    }
  }

  const specialAdCategories = input.specialAdCategories ?? []
  const graphBody = buildMetaCreateCampaignGraphBody({
    name: input.name,
    objective: input.objective,
    status,
    dailyBudget: input.dailyBudget,
    lifetimeBudget: input.lifetimeBudget,
    specialAdCategories,
  })

  const path = `/${actPath(creds.adAccountId)}/campaigns`
  const budgetNotes: string[] = []
  if (input.dailyBudget != null) {
    budgetNotes.push(`daily_budget: ${formatBudgetMinorUnits(input.dailyBudget, currency)}`)
  }
  else if (input.lifetimeBudget != null) {
    budgetNotes.push(`lifetime_budget: ${formatBudgetMinorUnits(input.lifetimeBudget, currency)}`)
  }
  else {
    budgetNotes.push(
      'Sem budget no nível campanha (ABO): is_adset_budget_sharing_enabled=false; budget no adset.',
    )
  }
  budgetNotes.push(
    `Teto daily: ${getMetaGptBudgetDailyMaxCents()} centavos (META_GPT_BUDGET_DAILY_MAX_CENTS).`,
  )
  if (status === 'ACTIVE')
    budgetNotes.push('ATENÇÃO: criando ACTIVE — gasto potencial imediato após adsets/ads.')
  if (dryRun)
    budgetNotes.push('Moeda da conta não consultada no dry-run (sem Graph). Use listAdAccounts se precisar.')

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path,
      body: graphBody,
      notes: [
        `Campanha "${input.name}" → ${status} / ${input.objective}`,
        `ad_account: ${creds.adAccountId}${currency ? ` (${currency})` : ''}`,
        ...budgetNotes,
        'dryRun=true (default): nenhuma mutação enviada à Graph API.',
      ],
    },
    async () => {
      let created: any
      try {
        created = await graphWrite(
          graph,
          metaGraphUrl(creds.apiVersion, path),
          {
            method: 'POST',
            query: { access_token: creds.accessToken },
            body: graphBody,
          },
          graphBody,
        )
      }
      catch (err) {
        await logMetaWriteAudit({
          tenantId: input.tenantId,
          action: 'meta.gpt.campaign.create.failed',
          entityType: 'meta_campaign',
          entityId: null,
          dryRun: false,
          before: null,
          after: {
            request_payload: graphBody,
            graph_error: err instanceof MetaAdsToolError ? err.details : null,
            message: err instanceof Error ? err.message : String(err),
            adAccountId: creds.adAccountId,
            apiVersion: creds.apiVersion,
          },
        }).catch(() => {})
        throw err
      }
      const campaignId = created?.id ? String(created.id) : null
      if (!campaignId) {
        throw new MetaAdsToolError(
          'META_CREATE_CAMPAIGN_FAILED',
          'Meta não retornou id da campanha criada.',
          502,
          { response: created, request_payload: graphBody },
        )
      }
      return {
        tenantId: input.tenantId,
        adAccountId: creds.adAccountId,
        campaignId,
        name: input.name,
        objective: input.objective,
        status,
        dailyBudget: input.dailyBudget ?? null,
        lifetimeBudget: input.lifetimeBudget ?? null,
        specialAdCategories,
        currency,
        success: true as const,
        dryRun: false as const,
        warning: 'Campanha criada na Meta Graph API. Verifique no Ads Manager.',
      }
    },
  )

  if (run.dryRun) {
    await logMetaWriteAudit({
      tenantId: input.tenantId,
      action: 'meta.gpt.campaign.create.preview',
      entityType: 'meta_campaign',
      entityId: null,
      dryRun: true,
      before: null,
      after: {
        preview: run.preview,
        adAccountId: creds.adAccountId,
        currency,
        budgetLimitCents: getMetaGptBudgetDailyMaxCents(),
      },
    })
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      campaignId: null,
      name: input.name,
      objective: input.objective,
      status,
      dailyBudget: input.dailyBudget ?? null,
      lifetimeBudget: input.lifetimeBudget ?? null,
      specialAdCategories,
      currency,
      success: true as const,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: nenhuma campanha criada na Meta Graph API. Reenvie com dryRun: false para executar.',
    }
  }

  const result = run.result!
  await logMetaWriteAudit(
    {
      tenantId: input.tenantId,
      action: 'meta.gpt.campaign.create',
      entityType: 'meta_campaign',
      entityId: result.campaignId,
      dryRun: false,
      before: null,
      after: {
        campaignId: result.campaignId,
        name: result.name,
        objective: result.objective,
        status: result.status,
        dailyBudget: result.dailyBudget,
        lifetimeBudget: result.lifetimeBudget,
        specialAdCategories: result.specialAdCategories,
        adAccountId: creds.adAccountId,
        currency,
      },
    },
    ctx.client,
  )
  return result
}

/**
 * Create an adset on the tenant ad account (POST /act_{id}/adsets).
 * dryRun default true — no Graph until dryRun: false.
 * On execute: validates campaign ownership against tenant ad account.
 * WHATSAPP: destination_type + promoted_object.page_id (+ optional phone).
 */
export async function metaCreateAdset(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaCreateAdsetSchema.parse(raw)
  assertWriteConfirmation(input)
  const status = input.status ?? 'PAUSED'
  assertConfirmActive({ status, confirmActive: input.confirmActive })
  assertCampaignBudgetWithinLimit({
    dailyBudgetCents: input.dailyBudget,
    lifetimeBudgetCents: input.lifetimeBudget,
  })

  const dryRun = resolveDryRun(input.dryRun, true)
  const destinationType: MetaAdDestinationType = input.destinationType ?? 'WEBSITE'
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const resolved = resolveAdsetTargeting({
    targetingTemplate: input.targetingTemplate,
    targeting: input.targeting,
  })

  let pageId: string | null = null
  let whatsappPhone: string | undefined
  if (destinationType === 'WHATSAPP') {
    const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
    pageId = assertMetaPageId(tokenCtx.publicConfig.page_id)
    whatsappPhone = normalizeWhatsappPhoneNumber(input.whatsappPhoneNumber)
  }

  // Ownership + currency + objective only on execute (GET). Dry-run stays Graph-free except credentials from DB.
  let currency: string | null = null
  let campaignName: string | null = null
  let campaignObjective: string | null = input.campaignObjective ?? null
  if (!dryRun) {
    const campaign = await graph(metaGraphUrl(creds.apiVersion, `/${input.campaignId}`), {
      query: {
        fields: 'id,name,account_id,status,effective_status,objective',
        access_token: creds.accessToken,
      },
    })
    assertAdAccountOwnership({
      objectAccountId: campaign?.account_id,
      tenantAdAccountId: creds.adAccountId,
      code: 'CAMPAIGN_TENANT_MISMATCH',
      message: 'Campanha não pertence à ad account do tenant.',
    })
    campaignName = campaign?.name ? String(campaign.name) : null
    campaignObjective = campaign?.objective ? String(campaign.objective) : campaignObjective

    try {
      const account = await graph(
        metaGraphUrl(creds.apiVersion, `/${actPath(creds.adAccountId)}`),
        {
          query: {
            fields: 'id,name,currency,account_id',
            access_token: creds.accessToken,
          },
        },
      )
      currency = account?.currency ? String(account.currency) : null
    }
    catch {
      // Keep create usable when currency GET fails.
    }
  }

  if (destinationType === 'WHATSAPP') {
    assertWhatsAppAdsetCompatibility({
      destinationType,
      optimizationGoal: input.optimizationGoal,
      billingEvent: input.billingEvent,
      // dry-run: use explicit campaignObjective when provided; execute: Graph objective
      campaignObjective: dryRun ? (input.campaignObjective ?? null) : campaignObjective,
    })
  }

  const graphBody = buildMetaCreateAdsetGraphBody({
    name: input.name,
    campaignId: input.campaignId,
    billingEvent: input.billingEvent,
    optimizationGoal: input.optimizationGoal,
    status,
    targeting: resolved.targeting,
    destinationType,
    pageId: pageId ?? undefined,
    whatsappPhoneNumber: whatsappPhone,
    dailyBudget: input.dailyBudget,
    lifetimeBudget: input.lifetimeBudget,
    startTime: input.startTime,
    endTime: input.endTime,
  })

  const path = `/${actPath(creds.adAccountId)}/adsets`
  const budgetNotes: string[] = []
  if (input.dailyBudget != null)
    budgetNotes.push(`daily_budget: ${formatBudgetMinorUnits(input.dailyBudget, currency)}`)
  else if (input.lifetimeBudget != null)
    budgetNotes.push(`lifetime_budget: ${formatBudgetMinorUnits(input.lifetimeBudget, currency)}`)
  budgetNotes.push(
    `Teto daily: ${getMetaGptBudgetDailyMaxCents()} centavos (META_GPT_BUDGET_DAILY_MAX_CENTS).`,
  )
  if (status === 'ACTIVE')
    budgetNotes.push('ATENÇÃO: criando ACTIVE — gasto potencial imediato após ads.')
  if (dryRun) {
    budgetNotes.push('Moeda da conta não consultada no dry-run (sem Graph). Use listAdAccounts se precisar.')
    budgetNotes.push('Ownership da campanha será validado na execução (dryRun: false).')
  }
  if (destinationType === 'WHATSAPP') {
    budgetNotes.push(`destination_type=WHATSAPP · promoted_object.page_id=${pageId}`)
    if (whatsappPhone)
      budgetNotes.push(`whatsapp_phone_number=${whatsappPhone}`)
    if (campaignObjective)
      budgetNotes.push(`campaign.objective=${campaignObjective}`)
    else if (dryRun)
      budgetNotes.push('Informe campaignObjective no dry-run para validar matriz CTWA; na execução a Graph confirma.')
  }

  const targetingNote = resolved.source === 'template'
    ? `targetingTemplate: ${resolved.targetingTemplate} — ${resolved.summary}`
    : `targeting: custom — ${resolved.summary}`

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path,
      body: graphBody,
      notes: [
        `Adset "${input.name}" → ${status}`,
        `campaign_id: ${input.campaignId}${campaignName ? ` (${campaignName})` : ''}`,
        `destinationType: ${destinationType}`,
        targetingNote,
        `billing_event=${input.billingEvent} · optimization_goal=${input.optimizationGoal}`,
        `ad_account: ${creds.adAccountId}${currency ? ` (${currency})` : ''}`,
        ...budgetNotes,
        'dryRun=true (default): nenhuma mutação enviada à Graph API.',
      ],
    },
    async () => {
      const created = await graphWrite(graph, metaGraphUrl(creds.apiVersion, path), {
        method: 'POST',
        query: { access_token: creds.accessToken },
        body: graphBody,
      }, graphBody)
      const adsetId = created?.id ? String(created.id) : null
      if (!adsetId) {
        throw new MetaAdsToolError(
          'META_CREATE_ADSET_FAILED',
          'Meta não retornou id do adset criado.',
          502,
          { response: created, request_payload: graphBody },
        )
      }
      return {
        tenantId: input.tenantId,
        adAccountId: creds.adAccountId,
        campaignId: input.campaignId,
        campaignName,
        campaignObjective,
        adsetId,
        name: input.name,
        status,
        billingEvent: input.billingEvent,
        optimizationGoal: input.optimizationGoal,
        destinationType,
        pageId,
        whatsappPhoneNumber: whatsappPhone ?? null,
        targetingTemplate: resolved.targetingTemplate,
        targeting: resolved.targeting,
        targetingSummary: resolved.summary,
        targetingSource: resolved.source,
        dailyBudget: input.dailyBudget ?? null,
        lifetimeBudget: input.lifetimeBudget ?? null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        currency,
        success: true as const,
        dryRun: false as const,
        warning: 'Adset criado na Meta Graph API. Verifique targeting no Ads Manager.',
      }
    },
  )

  if (run.dryRun) {
    await logMetaWriteAudit({
      tenantId: input.tenantId,
      action: 'meta.gpt.adset.create.preview',
      entityType: 'meta_adset',
      entityId: null,
      dryRun: true,
      before: null,
      after: {
        preview: run.preview,
        campaignId: input.campaignId,
        targetingTemplate: resolved.targetingTemplate,
        targeting: resolved.targeting,
        targetingSource: resolved.source,
        destinationType,
        pageId,
        adAccountId: creds.adAccountId,
        currency,
        budgetLimitCents: getMetaGptBudgetDailyMaxCents(),
      },
    })
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      campaignId: input.campaignId,
      campaignName: null,
      campaignObjective,
      adsetId: null,
      name: input.name,
      status,
      billingEvent: input.billingEvent,
      optimizationGoal: input.optimizationGoal,
      destinationType,
      pageId,
      whatsappPhoneNumber: whatsappPhone ?? null,
      targetingTemplate: resolved.targetingTemplate,
      targeting: resolved.targeting,
      targetingSummary: resolved.summary,
      targetingSource: resolved.source,
      dailyBudget: input.dailyBudget ?? null,
      lifetimeBudget: input.lifetimeBudget ?? null,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      currency,
      success: true as const,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: nenhum adset criado na Meta Graph API. Reenvie com dryRun: false para executar.',
    }
  }

  const result = run.result!
  await logMetaWriteAudit(
    {
      tenantId: input.tenantId,
      action: 'meta.gpt.adset.create',
      entityType: 'meta_adset',
      entityId: result.adsetId,
      dryRun: false,
      before: null,
      after: {
        adsetId: result.adsetId,
        campaignId: result.campaignId,
        name: result.name,
        status: result.status,
        billingEvent: result.billingEvent,
        optimizationGoal: result.optimizationGoal,
        destinationType: result.destinationType,
        pageId: result.pageId,
        targetingTemplate: result.targetingTemplate,
        targeting: result.targeting,
        targetingSource: result.targetingSource,
        dailyBudget: result.dailyBudget,
        lifetimeBudget: result.lifetimeBudget,
        startTime: result.startTime,
        endTime: result.endTime,
        adAccountId: creds.adAccountId,
        currency,
      },
    },
    ctx.client,
  )
  return result
}

/**
 * Create AdCreative (object_story_spec) + Ad on the tenant ad account.
 * dryRun default true. Validates adset ownership on execute. Requires page_id + page token.
 * WEBSITE: link_data com linkUrl do usuário. WHATSAPP: CTWA oficial (sem linkUrl de site).
 */
export async function metaCreateAd(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaCreateAdSchema.parse(raw)
  assertWriteConfirmation(input)
  const status = input.status ?? 'PAUSED'
  assertConfirmActive({ status, confirmActive: input.confirmActive })

  const dryRun = resolveDryRun(input.dryRun, true)
  const destinationType: MetaAdDestinationType = input.destinationType ?? 'WEBSITE'
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)

  // Page readiness from integration config (DB) — required even on dry-run.
  const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
  const pageToken = decryptSecret(tokenCtx.config.page_access_token_enc)
  const pageId = assertMetaPageCreativeReady({
    pageId: tokenCtx.publicConfig.page_id,
    pageAccessToken: pageToken,
  })

  const callToAction = destinationType === 'WHATSAPP'
    ? 'WHATSAPP_MESSAGE'
    : (input.callToAction ?? 'LEARN_MORE')
  const creativeName = input.creativeName || `${input.name} Creative`

  const creativeBody = buildMetaCreateAdCreativeBody({
    creativeName,
    pageId,
    destinationType,
    website: destinationType === 'WEBSITE'
      ? {
          message: input.message,
          linkUrl: input.linkUrl!,
          callToAction,
          headline: input.headline,
          description: input.description,
          imageUrl: input.imageUrl,
          imageHash: input.imageHash,
        }
      : undefined,
    whatsapp: destinationType === 'WHATSAPP'
      ? {
          message: input.message,
          headline: input.headline,
          description: input.description,
          imageUrl: input.imageUrl,
          imageHash: input.imageHash,
          welcomeMessage: input.welcomeMessage,
        }
      : undefined,
  })

  // Ownership only on execute (GET). Dry-run stays Graph-free except credentials from DB.
  let adsetName: string | null = null
  let campaignId: string | null = null
  let adsetDestinationType: string | null = null
  if (!dryRun) {
    const adset = await graph(metaGraphUrl(creds.apiVersion, `/${input.adsetId}`), {
      query: {
        fields: 'id,name,account_id,campaign_id,status,effective_status,destination_type',
        access_token: creds.accessToken,
      },
    })
    assertAdAccountOwnership({
      objectAccountId: adset?.account_id,
      tenantAdAccountId: creds.adAccountId,
      code: 'ADSET_TENANT_MISMATCH',
      message: 'Adset não pertence à ad account do tenant.',
    })
    adsetName = adset?.name ? String(adset.name) : null
    campaignId = adset?.campaign_id ? String(adset.campaign_id) : null
    adsetDestinationType = adset?.destination_type != null
      ? String(adset.destination_type)
      : null

    if (destinationType === 'WHATSAPP' && adsetDestinationType && adsetDestinationType !== 'WHATSAPP') {
      throw new MetaAdsToolError(
        'ADSET_DESTINATION_MISMATCH',
        `Criativo WHATSAPP exige adset com destination_type=WHATSAPP (adset atual: ${adsetDestinationType}).`,
        400,
        { adsetId: input.adsetId, adsetDestinationType, destinationType },
      )
    }
  }

  const creativePath = `/${actPath(creds.adAccountId)}/adcreatives`
  const adPath = `/${actPath(creds.adAccountId)}/ads`
  const previewBody = {
    creative: creativeBody,
    ad: {
      name: input.name,
      adset_id: input.adsetId,
      creative: { creative_id: '(após create creative)' },
      status,
    },
  }

  const mediaNotes: string[] = []
  if (input.imageHash)
    mediaNotes.push(`mídia: image_hash=${input.imageHash}`)
  else if (input.imageUrl)
    mediaNotes.push(`mídia: imageUrl=${input.imageUrl}`)
  else
    mediaNotes.push('mídia: sem imagem (Meta pode exigir mídia conforme objetivo/placement).')
  if (status === 'ACTIVE')
    mediaNotes.push('ATENÇÃO: criando ACTIVE — gasto potencial imediato.')
  if (dryRun)
    mediaNotes.push('Ownership do adset será validado na execução (dryRun: false).')
  if (destinationType === 'WHATSAPP') {
    mediaNotes.push('CTWA: link_data oficial (CTA WHATSAPP_MESSAGE + app_destination=WHATSAPP). Sem linkUrl de site.')
    if (input.welcomeMessage)
      mediaNotes.push('page_welcome_message: saudação customizada.')
  }

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path: `${creativePath} then ${adPath}`,
      body: previewBody,
      notes: [
        `Anúncio "${input.name}" → ${status}`,
        `destinationType: ${destinationType}`,
        `adset_id: ${input.adsetId}${adsetName ? ` (${adsetName})` : ''}`,
        `page_id: ${pageId}${tokenCtx.publicConfig.page_name ? ` (${tokenCtx.publicConfig.page_name})` : ''}`,
        destinationType === 'WEBSITE'
          ? `link: ${input.linkUrl}`
          : 'link: (protocolo messaging Meta — sem linkUrl de site do usuário)',
        `message: ${input.message.slice(0, 120)}${input.message.length > 120 ? '…' : ''}`,
        input.headline ? `headline: ${input.headline}` : 'headline: (omitido)',
        `CTA: ${callToAction}`,
        `ad_account: ${creds.adAccountId}`,
        ...mediaNotes,
        'dryRun=true (default): nenhuma mutação enviada à Graph API.',
        'Nunca inventar URLs de mídia ou link de site / wa.me.',
      ],
    },
    async () => {
      const createdCreative = await graphWrite(graph, metaGraphUrl(creds.apiVersion, creativePath), {
        method: 'POST',
        query: { access_token: creds.accessToken },
        body: creativeBody,
      }, creativeBody)
      const creativeId = createdCreative?.id ? String(createdCreative.id) : null
      if (!creativeId) {
        throw new MetaAdsToolError(
          'META_CREATE_CREATIVE_FAILED',
          'Meta não retornou id do AdCreative criado.',
          502,
          { response: createdCreative, request_payload: creativeBody },
        )
      }

      const adBody: Record<string, unknown> = {
        name: input.name,
        adset_id: input.adsetId,
        creative: { creative_id: creativeId },
        status,
      }

      let createdAd: any
      try {
        createdAd = await graphWrite(graph, metaGraphUrl(creds.apiVersion, adPath), {
          method: 'POST',
          query: { access_token: creds.accessToken },
          body: adBody,
        }, adBody)
      }
      catch (err) {
        throw new MetaAdsToolError(
          'META_CREATE_AD_FAILED',
          'Criativo foi criado, mas falhou ao criar o anúncio. Verifique o creativeId no Ads Manager.',
          502,
          {
            creativeId,
            cause: err instanceof Error ? err.message : err,
          },
        )
      }

      const adId = createdAd?.id ? String(createdAd.id) : null
      if (!adId) {
        throw new MetaAdsToolError(
          'META_CREATE_AD_FAILED',
          'Criativo criado, mas Meta não retornou id do anúncio.',
          502,
          { creativeId, response: createdAd },
        )
      }

      return {
        tenantId: input.tenantId,
        adAccountId: creds.adAccountId,
        adsetId: input.adsetId,
        adsetName,
        campaignId,
        adId,
        creativeId,
        name: input.name,
        creativeName,
        status,
        pageId,
        destinationType,
        linkUrl: destinationType === 'WEBSITE' ? (input.linkUrl ?? null) : null,
        message: input.message,
        headline: input.headline ?? null,
        description: input.description ?? null,
        callToAction,
        welcomeMessage: input.welcomeMessage ?? null,
        imageUrl: input.imageUrl ?? null,
        imageHash: input.imageHash ?? null,
        success: true as const,
        dryRun: false as const,
        warning: 'Anúncio + criativo criados na Meta Graph API. Verifique thumbnail/políticas no Ads Manager.',
      }
    },
  )

  if (run.dryRun) {
    await logMetaWriteAudit({
      tenantId: input.tenantId,
      action: 'meta.gpt.ad.create.preview',
      entityType: 'meta_ad',
      entityId: null,
      dryRun: true,
      before: null,
      after: {
        preview: run.preview,
        adsetId: input.adsetId,
        pageId,
        destinationType,
        linkUrl: destinationType === 'WEBSITE' ? (input.linkUrl ?? null) : null,
        adAccountId: creds.adAccountId,
      },
    })
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      adsetId: input.adsetId,
      adsetName: null,
      campaignId: null,
      adId: null,
      creativeId: null,
      name: input.name,
      creativeName,
      status,
      pageId,
      destinationType,
      linkUrl: destinationType === 'WEBSITE' ? (input.linkUrl ?? null) : null,
      message: input.message,
      headline: input.headline ?? null,
      description: input.description ?? null,
      callToAction,
      welcomeMessage: input.welcomeMessage ?? null,
      imageUrl: input.imageUrl ?? null,
      imageHash: input.imageHash ?? null,
      success: true as const,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: nenhum anúncio/criativo criado na Meta Graph API. Reenvie com dryRun: false para executar.',
    }
  }

  const result = run.result!
  await logMetaWriteAudit(
    {
      tenantId: input.tenantId,
      action: 'meta.gpt.ad.create',
      entityType: 'meta_ad',
      entityId: result.adId,
      dryRun: false,
      before: null,
      after: {
        adId: result.adId,
        creativeId: result.creativeId,
        adsetId: result.adsetId,
        campaignId: result.campaignId,
        name: result.name,
        status: result.status,
        pageId: result.pageId,
        destinationType: result.destinationType,
        linkUrl: result.linkUrl,
        message: result.message,
        headline: result.headline,
        description: result.description,
        callToAction: result.callToAction,
        imageUrl: result.imageUrl,
        imageHash: result.imageHash,
        adAccountId: creds.adAccountId,
      },
    },
    ctx.client,
  )
  return result
}

function parseCentsField(value: unknown): number | null {
  if (value == null || value === '')
    return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1)
    return null
  return Math.trunc(n)
}

type LinkCreativeSnapshot = {
  creativeId: string | null
  creativeName: string | null
  pageId: string | null
  message: string | null
  headline: string | null
  description: string | null
  linkUrl: string | null
  callToAction: string | null
  imageHash: string | null
  imageUrl: string | null
}

function extractLinkCreativeSnapshot(ad: any): LinkCreativeSnapshot {
  const creative = ad?.creative || {}
  const spec = creative?.object_story_spec || {}
  const linkData = spec?.link_data || {}
  const cta = linkData?.call_to_action
  return {
    creativeId: creative?.id ? String(creative.id) : null,
    creativeName: creative?.name ? String(creative.name) : null,
    pageId: spec?.page_id ? String(spec.page_id) : null,
    message: linkData?.message != null ? String(linkData.message) : null,
    headline: linkData?.name != null ? String(linkData.name) : null,
    description: linkData?.description != null ? String(linkData.description) : null,
    linkUrl: linkData?.link != null ? String(linkData.link) : null,
    callToAction: cta?.type != null ? String(cta.type) : null,
    imageHash: linkData?.image_hash != null ? String(linkData.image_hash) : null,
    imageUrl: linkData?.picture != null ? String(linkData.picture) : null,
  }
}

async function fetchOwnedAdWithCreative(
  ctx: MetaToolContext,
  params: { tenantId: string, adAccountId?: string, adId: string },
) {
  const creds = await withCreds(ctx, params.tenantId, params.adAccountId)
  const graph = fetchGraph(ctx)
  const ad = await graph(metaGraphUrl(creds.apiVersion, `/${params.adId}`), {
    query: {
      fields: 'id,name,status,effective_status,account_id,campaign_id,adset_id,creative{id,name,object_story_spec,thumbnail_url}',
      access_token: creds.accessToken,
    },
  })
  assertAdAccountOwnership({
    objectAccountId: ad?.account_id,
    tenantAdAccountId: creds.adAccountId,
    code: 'AD_TENANT_MISMATCH',
    message: 'Anúncio não pertence à ad account do tenant.',
  })
  return { creds, ad, before: extractLinkCreativeSnapshot(ad) }
}

/**
 * Update adset daily/lifetime budget. dryRun default true. GET before always (ownership + snapshot).
 */
export async function metaUpdateAdsetBudget(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaUpdateAdsetBudgetSchema.parse(raw)
  assertWriteConfirmation(input)
  assertCampaignBudgetWithinLimit({
    dailyBudgetCents: input.dailyBudget,
    lifetimeBudgetCents: input.lifetimeBudget,
  })

  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)

  const adset = await graph(metaGraphUrl(creds.apiVersion, `/${input.adsetId}`), {
    query: {
      fields: 'id,name,status,effective_status,account_id,campaign_id,daily_budget,lifetime_budget,end_time',
      access_token: creds.accessToken,
    },
  })
  assertAdAccountOwnership({
    objectAccountId: adset?.account_id,
    tenantAdAccountId: creds.adAccountId,
    code: 'ADSET_TENANT_MISMATCH',
    message: 'Adset não pertence à ad account do tenant.',
  })

  const beforeDaily = parseCentsField(adset?.daily_budget)
  const beforeLifetime = parseCentsField(adset?.lifetime_budget)
  const beforeEndTime = adset?.end_time ? String(adset.end_time) : null

  if (input.dailyBudget != null) {
    assertBudgetIncreaseAllowed({
      previousCents: beforeDaily,
      nextCents: input.dailyBudget,
      confirmBudgetIncrease: input.confirmBudgetIncrease,
    })
  }
  if (input.lifetimeBudget != null) {
    assertBudgetIncreaseAllowed({
      previousCents: beforeLifetime,
      nextCents: input.lifetimeBudget,
      confirmBudgetIncrease: input.confirmBudgetIncrease,
    })
    if (!input.endTime && !beforeEndTime) {
      throw new MetaAdsToolError(
        'END_TIME_REQUIRED',
        'lifetimeBudget exige endTime quando o adset ainda não tem end_time.',
        400,
      )
    }
  }

  const graphBody: Record<string, unknown> = {}
  if (input.dailyBudget != null)
    graphBody.daily_budget = input.dailyBudget
  if (input.lifetimeBudget != null)
    graphBody.lifetime_budget = input.lifetimeBudget
  if (input.endTime)
    graphBody.end_time = input.endTime

  const beforeBudget = {
    dailyBudget: beforeDaily,
    lifetimeBudget: beforeLifetime,
    endTime: beforeEndTime,
  }
  const afterBudget = {
    dailyBudget: input.dailyBudget ?? null,
    lifetimeBudget: input.lifetimeBudget ?? null,
    endTime: input.endTime ?? beforeEndTime,
  }

  const notes = [
    `Adset ${input.adsetId}${adset?.name ? ` (${adset.name})` : ''}`,
    `before: daily=${beforeDaily ?? '—'} lifetime=${beforeLifetime ?? '—'}`,
    `after: daily=${afterBudget.dailyBudget ?? '—'} lifetime=${afterBudget.lifetimeBudget ?? '—'}`,
    `Teto abs: ${getMetaGptBudgetDailyMaxCents()} centavos · aumento max sem flag: ${getMetaGptBudgetIncreaseMaxPercent()}%`,
    dryRun
      ? 'dryRun=true (default): nenhuma mutação enviada à Graph API.'
      : 'Mutação será enviada à Graph.',
  ]

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path: `/${input.adsetId}`,
      body: graphBody,
      notes,
    },
    async () => {
      const updated = await graphWrite(graph, metaGraphUrl(creds.apiVersion, `/${input.adsetId}`), {
        method: 'POST',
        query: { access_token: creds.accessToken },
        body: graphBody,
      }, graphBody)
      return {
        tenantId: input.tenantId,
        adAccountId: creds.adAccountId,
        adsetId: input.adsetId,
        adsetName: adset?.name ? String(adset.name) : null,
        before: beforeBudget,
        after: afterBudget,
        success: Boolean(updated?.success ?? true),
        dryRun: false as const,
        warning: 'Budget do adset atualizado na Meta Graph API. Confira no Ads Manager.',
      }
    },
  )

  if (run.dryRun) {
    await logMetaWriteAudit({
      tenantId: input.tenantId,
      action: 'meta.gpt.adset.budget.preview',
      entityType: 'meta_adset',
      entityId: input.adsetId,
      dryRun: true,
      before: beforeBudget,
      after: { after: afterBudget, preview: run.preview },
    })
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      adsetId: input.adsetId,
      adsetName: adset?.name ? String(adset.name) : null,
      before: beforeBudget,
      after: afterBudget,
      success: true as const,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: nenhum budget alterado. Reenvie com dryRun: false para executar.',
    }
  }

  const result = run.result!
  await logMetaWriteAudit(
    {
      tenantId: input.tenantId,
      action: 'meta.gpt.adset.budget',
      entityType: 'meta_adset',
      entityId: input.adsetId,
      dryRun: false,
      before: beforeBudget,
      after: {
        ...afterBudget,
        success: result.success,
        adAccountId: creds.adAccountId,
      },
    },
    ctx.client,
  )
  return result
}

/**
 * Update adset targeting via BR_* preset or custom targeting. dryRun default true.
 */
export async function metaUpdateAdsetTargeting(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaUpdateAdsetTargetingSchema.parse(raw)
  assertWriteConfirmation(input)

  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const resolved = resolveAdsetTargeting({
    targetingTemplate: input.targetingTemplate,
    targeting: input.targeting,
  })

  const adset = await graph(metaGraphUrl(creds.apiVersion, `/${input.adsetId}`), {
    query: {
      fields: 'id,name,status,effective_status,account_id,campaign_id,targeting',
      access_token: creds.accessToken,
    },
  })
  assertAdAccountOwnership({
    objectAccountId: adset?.account_id,
    tenantAdAccountId: creds.adAccountId,
    code: 'ADSET_TENANT_MISMATCH',
    message: 'Adset não pertence à ad account do tenant.',
  })

  const beforeTargeting = adset?.targeting ?? null
  const graphBody = { targeting: resolved.targeting }
  const targetingNote = resolved.source === 'template'
    ? `targetingTemplate: ${resolved.targetingTemplate} — ${resolved.summary}`
    : `targeting: custom — ${resolved.summary}`

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path: `/${input.adsetId}`,
      body: graphBody,
      notes: [
        `Adset ${input.adsetId}${adset?.name ? ` (${adset.name})` : ''}`,
        targetingNote,
        'before: snapshot em `before.targeting` (pode não mapear a um template BR_*)',
        dryRun
          ? 'dryRun=true (default): nenhuma mutação enviada à Graph API.'
          : 'Mutação será enviada à Graph.',
      ],
    },
    async () => {
      const updated = await graphWrite(graph, metaGraphUrl(creds.apiVersion, `/${input.adsetId}`), {
        method: 'POST',
        query: { access_token: creds.accessToken },
        body: graphBody,
      }, graphBody)
      return {
        tenantId: input.tenantId,
        adAccountId: creds.adAccountId,
        adsetId: input.adsetId,
        adsetName: adset?.name ? String(adset.name) : null,
        targetingTemplate: resolved.targetingTemplate,
        targeting: resolved.targeting,
        targetingSummary: resolved.summary,
        targetingSource: resolved.source,
        before: { targeting: beforeTargeting },
        after: {
          targetingTemplate: resolved.targetingTemplate,
          targeting: resolved.targeting,
          targetingSource: resolved.source,
        },
        success: Boolean(updated?.success ?? true),
        dryRun: false as const,
        warning: 'Targeting do adset atualizado. Confira alcance no Ads Manager.',
      }
    },
  )

  if (run.dryRun) {
    await logMetaWriteAudit({
      tenantId: input.tenantId,
      action: 'meta.gpt.adset.targeting.preview',
      entityType: 'meta_adset',
      entityId: input.adsetId,
      dryRun: true,
      before: { targeting: beforeTargeting },
      after: {
        targetingTemplate: resolved.targetingTemplate,
        targeting: resolved.targeting,
        targetingSource: resolved.source,
        preview: run.preview,
      },
    })
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      adsetId: input.adsetId,
      adsetName: adset?.name ? String(adset.name) : null,
      targetingTemplate: resolved.targetingTemplate,
      targeting: resolved.targeting,
      targetingSummary: resolved.summary,
      targetingSource: resolved.source,
      before: { targeting: beforeTargeting },
      after: {
        targetingTemplate: resolved.targetingTemplate,
        targeting: resolved.targeting,
        targetingSource: resolved.source,
      },
      success: true as const,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: targeting não alterado. Reenvie com dryRun: false para executar.',
    }
  }

  const result = run.result!
  await logMetaWriteAudit(
    {
      tenantId: input.tenantId,
      action: 'meta.gpt.adset.targeting',
      entityType: 'meta_adset',
      entityId: input.adsetId,
      dryRun: false,
      before: { targeting: beforeTargeting },
      after: {
        targetingTemplate: resolved.targetingTemplate,
        targeting: resolved.targeting,
        targetingSource: resolved.source,
        success: result.success,
        adAccountId: creds.adAccountId,
      },
    },
    ctx.client,
  )
  return result
}

/**
 * Update ad creative copy: create new AdCreative (merged with before) + swap creative on ad.
 */
export async function metaUpdateAdCreativeCopy(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaUpdateAdCreativeCopySchema.parse(raw)
  assertWriteConfirmation(input)

  const dryRun = resolveDryRun(input.dryRun, true)
  const { creds, ad, before } = await fetchOwnedAdWithCreative(ctx, {
    tenantId: input.tenantId,
    adAccountId: input.adAccountId,
    adId: input.adId,
  })
  const graph = fetchGraph(ctx)

  const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
  const pageToken = decryptSecret(tokenCtx.config.page_access_token_enc)
  const pageId = assertMetaPageCreativeReady({
    pageId: before.pageId || tokenCtx.publicConfig.page_id,
    pageAccessToken: pageToken,
  })

  const message = input.message ?? before.message
  const linkUrl = input.linkUrl ?? before.linkUrl
  if (!message || !linkUrl) {
    throw new MetaAdsToolError(
      'CREATIVE_COPY_INCOMPLETE',
      'Criativo atual não tem message/link suficientes e os campos não foram informados. Informe message e linkUrl.',
      400,
      { before },
    )
  }
  if (!linkUrl.startsWith('https://')) {
    throw new MetaAdsToolError(
      'LINK_URL_HTTPS_REQUIRED',
      'linkUrl efetivo deve usar https://.',
      400,
    )
  }

  const headline = input.headline !== undefined ? input.headline : before.headline
  const description = input.description !== undefined ? input.description : before.description
  const callToAction = input.callToAction
    ?? before.callToAction
    ?? 'LEARN_MORE'
  const creativeName = input.creativeName
    || `${ad?.name || input.adId} Creative copy ${Date.now()}`

  const linkData: Record<string, unknown> = {
    message,
    link: linkUrl,
    call_to_action: {
      type: callToAction,
      value: { link: linkUrl },
    },
  }
  if (headline)
    linkData.name = headline
  if (description)
    linkData.description = description
  if (before.imageHash)
    linkData.image_hash = before.imageHash
  else if (before.imageUrl)
    linkData.picture = before.imageUrl

  const creativeBody: Record<string, unknown> = {
    name: creativeName,
    object_story_spec: {
      page_id: pageId,
      link_data: linkData,
    },
  }

  const afterCopy = {
    message,
    headline: headline ?? null,
    description: description ?? null,
    callToAction,
    linkUrl,
    pageId,
    imageHash: before.imageHash,
    imageUrl: before.imageUrl,
  }

  const creativePath = `/${actPath(creds.adAccountId)}/adcreatives`
  const previewBody = {
    creative: creativeBody,
    ad: { creative: { creative_id: '(após create creative)' } },
  }

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path: `${creativePath} then /${input.adId}`,
      body: previewBody,
      notes: [
        `Ad ${input.adId}${ad?.name ? ` (${ad.name})` : ''}`,
        `before creative: ${before.creativeId || '—'}`,
        `message: ${(message || '').slice(0, 100)}${(message || '').length > 100 ? '…' : ''}`,
        `link: ${linkUrl} · CTA: ${callToAction}`,
        'Graph: AdCreative costuma ser imutável — cria novo + troca no ad.',
        dryRun
          ? 'dryRun=true (default): nenhuma mutação enviada à Graph API.'
          : 'Mutação será enviada à Graph.',
        'Nunca inventar URLs.',
      ],
    },
    async () => {
      const createdCreative = await graphWrite(graph, metaGraphUrl(creds.apiVersion, creativePath), {
        method: 'POST',
        query: { access_token: creds.accessToken },
        body: creativeBody,
      }, creativeBody)
      const creativeId = createdCreative?.id ? String(createdCreative.id) : null
      if (!creativeId) {
        throw new MetaAdsToolError(
          'META_CREATE_CREATIVE_FAILED',
          'Meta não retornou id do AdCreative criado (update copy).',
          502,
          { response: createdCreative, request_payload: creativeBody },
        )
      }

      const swapBody = { creative: { creative_id: creativeId } }
      const updated = await graphWrite(graph, metaGraphUrl(creds.apiVersion, `/${input.adId}`), {
        method: 'POST',
        query: { access_token: creds.accessToken },
        body: swapBody,
      }, swapBody)

      return {
        tenantId: input.tenantId,
        adAccountId: creds.adAccountId,
        adId: input.adId,
        adName: ad?.name ? String(ad.name) : null,
        previousCreativeId: before.creativeId,
        creativeId,
        before,
        after: afterCopy,
        success: Boolean(updated?.success ?? true),
        dryRun: false as const,
        warning: 'Copy atualizada via novo criativo. Confira no Ads Manager.',
      }
    },
  )

  if (run.dryRun) {
    await logMetaWriteAudit({
      tenantId: input.tenantId,
      action: 'meta.gpt.ad.creative_copy.preview',
      entityType: 'meta_ad',
      entityId: input.adId,
      dryRun: true,
      before,
      after: { after: afterCopy, preview: run.preview },
    })
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      adId: input.adId,
      adName: ad?.name ? String(ad.name) : null,
      previousCreativeId: before.creativeId,
      creativeId: null,
      before,
      after: afterCopy,
      success: true as const,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: copy não alterada. Reenvie com dryRun: false para executar.',
    }
  }

  const result = run.result!
  await logMetaWriteAudit(
    {
      tenantId: input.tenantId,
      action: 'meta.gpt.ad.creative_copy',
      entityType: 'meta_ad',
      entityId: input.adId,
      dryRun: false,
      before,
      after: {
        ...afterCopy,
        previousCreativeId: before.creativeId,
        creativeId: result.creativeId,
        adAccountId: creds.adAccountId,
      },
    },
    ctx.client,
  )
  return result
}

/**
 * Update ad media (imageUrl|imageHash) via new AdCreative + swap. Preserves existing copy.
 */
export async function metaUpdateAdMedia(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaUpdateAdMediaSchema.parse(raw)
  assertWriteConfirmation(input)

  const dryRun = resolveDryRun(input.dryRun, true)
  const { creds, ad, before } = await fetchOwnedAdWithCreative(ctx, {
    tenantId: input.tenantId,
    adAccountId: input.adAccountId,
    adId: input.adId,
  })
  const graph = fetchGraph(ctx)

  const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
  const pageToken = decryptSecret(tokenCtx.config.page_access_token_enc)
  const pageId = assertMetaPageCreativeReady({
    pageId: before.pageId || tokenCtx.publicConfig.page_id,
    pageAccessToken: pageToken,
  })

  if (!before.message || !before.linkUrl) {
    throw new MetaAdsToolError(
      'CREATIVE_MEDIA_BASE_REQUIRED',
      'Criativo atual sem message/link — use meta_update_ad_creative_copy (ou recriem o ad) antes de trocar mídia.',
      400,
      { before },
    )
  }

  const callToAction = before.callToAction || 'LEARN_MORE'
  const creativeName = input.creativeName
    || `${ad?.name || input.adId} Creative media ${Date.now()}`

  const linkData: Record<string, unknown> = {
    message: before.message,
    link: before.linkUrl,
    call_to_action: {
      type: callToAction,
      value: { link: before.linkUrl },
    },
  }
  if (before.headline)
    linkData.name = before.headline
  if (before.description)
    linkData.description = before.description
  if (input.imageHash)
    linkData.image_hash = input.imageHash
  if (input.imageUrl)
    linkData.picture = input.imageUrl

  const creativeBody: Record<string, unknown> = {
    name: creativeName,
    object_story_spec: {
      page_id: pageId,
      link_data: linkData,
    },
  }

  const afterMedia = {
    ...before,
    pageId,
    imageHash: input.imageHash ?? null,
    imageUrl: input.imageUrl ?? null,
  }

  const creativePath = `/${actPath(creds.adAccountId)}/adcreatives`
  const previewBody = {
    creative: creativeBody,
    ad: { creative: { creative_id: '(após create creative)' } },
  }

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path: `${creativePath} then /${input.adId}`,
      body: previewBody,
      notes: [
        `Ad ${input.adId}${ad?.name ? ` (${ad.name})` : ''}`,
        `before creative: ${before.creativeId || '—'}`,
        input.imageHash
          ? `mídia: image_hash=${input.imageHash}`
          : `mídia: imageUrl=${input.imageUrl}`,
        'Copy preservada do criativo atual. Sem video_id / upload binário neste MVP.',
        dryRun
          ? 'dryRun=true (default): nenhuma mutação enviada à Graph API.'
          : 'Mutação será enviada à Graph.',
        'Nunca inventar URLs de mídia.',
      ],
    },
    async () => {
      const createdCreative = await graphWrite(graph, metaGraphUrl(creds.apiVersion, creativePath), {
        method: 'POST',
        query: { access_token: creds.accessToken },
        body: creativeBody,
      }, creativeBody)
      const creativeId = createdCreative?.id ? String(createdCreative.id) : null
      if (!creativeId) {
        throw new MetaAdsToolError(
          'META_CREATE_CREATIVE_FAILED',
          'Meta não retornou id do AdCreative criado (update media).',
          502,
          { response: createdCreative, request_payload: creativeBody },
        )
      }

      const swapBody = { creative: { creative_id: creativeId } }
      const updated = await graphWrite(graph, metaGraphUrl(creds.apiVersion, `/${input.adId}`), {
        method: 'POST',
        query: { access_token: creds.accessToken },
        body: swapBody,
      }, swapBody)

      return {
        tenantId: input.tenantId,
        adAccountId: creds.adAccountId,
        adId: input.adId,
        adName: ad?.name ? String(ad.name) : null,
        previousCreativeId: before.creativeId,
        creativeId,
        before,
        after: afterMedia,
        success: Boolean(updated?.success ?? true),
        dryRun: false as const,
        warning: 'Mídia atualizada via novo criativo. Confira thumbnail no Ads Manager.',
      }
    },
  )

  if (run.dryRun) {
    await logMetaWriteAudit({
      tenantId: input.tenantId,
      action: 'meta.gpt.ad.media.preview',
      entityType: 'meta_ad',
      entityId: input.adId,
      dryRun: true,
      before,
      after: { after: afterMedia, preview: run.preview },
    })
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      adId: input.adId,
      adName: ad?.name ? String(ad.name) : null,
      previousCreativeId: before.creativeId,
      creativeId: null,
      before,
      after: afterMedia,
      success: true as const,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: mídia não alterada. Reenvie com dryRun: false para executar.',
    }
  }

  const result = run.result!
  await logMetaWriteAudit(
    {
      tenantId: input.tenantId,
      action: 'meta.gpt.ad.media',
      entityType: 'meta_ad',
      entityId: input.adId,
      dryRun: false,
      before,
      after: {
        ...afterMedia,
        previousCreativeId: before.creativeId,
        creativeId: result.creativeId,
        adAccountId: creds.adAccountId,
      },
    },
    ctx.client,
  )
  return result
}

const BULK_DELETE_LEVEL_META: Record<BulkDeleteLevel, {
  entityType: string
  mismatchCode: string
  mismatchMessage: string
  label: string
}> = {
  campaign: {
    entityType: 'meta_campaign',
    mismatchCode: 'CAMPAIGN_TENANT_MISMATCH',
    mismatchMessage: 'Campanha não pertence à ad account do tenant.',
    label: 'Campanha',
  },
  adset: {
    entityType: 'meta_adset',
    mismatchCode: 'ADSET_TENANT_MISMATCH',
    mismatchMessage: 'Conjunto de anúncios (adset) não pertence à ad account do tenant.',
    label: 'Adset',
  },
  ad: {
    entityType: 'meta_ad',
    mismatchCode: 'AD_TENANT_MISMATCH',
    mismatchMessage: 'Anúncio não pertence à ad account do tenant.',
    label: 'Anúncio',
  },
}

function parseOptionalBudget(value: unknown): number | null {
  if (value == null || value === '')
    return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

async function loadBulkDeleteCandidates(
  ctx: MetaToolContext,
  params: {
    tenantId: string
    adAccountId?: string
    level: BulkDeleteLevel
    ids: string[]
  },
) {
  const creds = await withCreds(ctx, params.tenantId, params.adAccountId)
  const graph = fetchGraph(ctx)
  const meta = BULK_DELETE_LEVEL_META[params.level]
  const items: Array<{
    id: string
    name: string | null
    status: string | null
    effectiveStatus: string | null
    dailyBudget: number | null
    lifetimeBudget: number | null
    campaignId: string | null
    adsetId: string | null
  }> = []
  const failed: Array<{ id: string; code: string; message: string }> = []

  for (const id of params.ids) {
    try {
      const object = await graph(metaGraphUrl(creds.apiVersion, `/${id}`), {
        query: {
          fields: 'id,name,status,effective_status,account_id,campaign_id,adset_id,daily_budget,lifetime_budget',
          access_token: creds.accessToken,
        },
      })
      assertAdAccountOwnership({
        objectAccountId: object?.account_id,
        tenantAdAccountId: creds.adAccountId,
        code: meta.mismatchCode,
        message: meta.mismatchMessage,
      })
      items.push({
        id: String(object?.id || id),
        name: object?.name != null ? String(object.name) : null,
        status: object?.status != null ? String(object.status) : null,
        effectiveStatus: object?.effective_status != null ? String(object.effective_status) : null,
        dailyBudget: parseOptionalBudget(object?.daily_budget),
        lifetimeBudget: parseOptionalBudget(object?.lifetime_budget),
        campaignId: object?.campaign_id != null ? String(object.campaign_id) : null,
        adsetId: object?.adset_id != null ? String(object.adset_id) : null,
      })
    }
    catch (err) {
      if (err instanceof MetaAdsToolError) {
        failed.push({ id, code: err.code, message: err.message })
        continue
      }
      failed.push({
        id,
        code: 'GRAPH_FETCH_FAILED',
        message: err instanceof Error ? err.message : 'Falha ao ler objeto na Graph.',
      })
    }
  }

  return { creds, items, failed, meta }
}

/**
 * Preview bulk delete: ownership + table (name/status/budget). Issues previewToken.
 * Never POST/DELETE on Graph.
 */
export async function metaPreviewBulkDelete(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaPreviewBulkDeleteSchema.parse(raw)
  const ids = normalizeBulkDeleteIds(input.ids)
  if (ids.length < 1) {
    throw new MetaAdsToolError(
      'BULK_IDS_REQUIRED',
      'Informe ao menos 1 ID explícito. Nunca apague por nome/filtro.',
      400,
    )
  }
  assertBulkItemLimit(ids.length, 'IDs para exclusão')

  const deleteMode = input.deleteMode ?? 'DELETED'
  const { creds, items, failed, meta } = await loadBulkDeleteCandidates(ctx, {
    tenantId: input.tenantId,
    adAccountId: input.adAccountId,
    level: input.level,
    ids,
  })

  if (items.length < 1) {
    throw new MetaAdsToolError(
      'BULK_DELETE_NONE_OWNED',
      'Nenhum ID passou na validação de ownership. Confira IDs e ad account do tenant.',
      400,
      { failed, level: input.level },
    )
  }

  const deletableIds = items.map(i => i.id)
  const token = issueBulkDeletePreviewToken({
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    level: input.level,
    ids: deletableIds,
    deleteMode,
  })

  await logMetaWriteAudit({
    tenantId: input.tenantId,
    action: 'meta.gpt.bulk.delete.preview',
    entityType: meta.entityType,
    entityId: deletableIds[0] || null,
    dryRun: true,
    before: { items, failed },
    after: {
      level: input.level,
      deleteMode,
      count: deletableIds.length,
      deletableIds,
      previewTokenExpiresAt: token.expiresAt,
      bulkMax: getMetaGptBulkMax(),
    },
  })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    level: input.level,
    deleteMode,
    items,
    failed,
    deletableIds,
    previewToken: token.previewToken,
    expiresAt: token.expiresAt,
    bulkMax: getMetaGptBulkMax(),
    notes: [
      'Nunca apague por nome — use apenas IDs listados em deletableIds.',
      deleteMode === 'DELETED'
        ? 'DELETED: objeto fica inacessível para edição normal na Marketing API (padrão Blimber).'
        : 'ARCHIVED: arquivamento; diferente de DELETED — menos destrutivo, ainda assim exige cuidado.',
      'Próximo passo: mostre a tabela ao usuário → peça confirmação → meta_execute_bulk_delete com os mesmos IDs, previewToken, confirmDelete=true, confirm=true, confirmTenantId, dryRun=false.',
    ],
  }
}

/**
 * Execute bulk delete after previewToken. dryRun default true (no Graph mutate until false).
 */
export async function metaExecuteBulkDelete(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaExecuteBulkDeleteSchema.parse(raw)
  assertWriteConfirmation(input)
  assertConfirmDelete(input.confirmDelete)

  const ids = normalizeBulkDeleteIds(input.ids)
  if (ids.length < 1) {
    throw new MetaAdsToolError(
      'BULK_IDS_REQUIRED',
      'Informe ao menos 1 ID explícito. Nunca apague por nome/filtro.',
      400,
    )
  }
  assertBulkItemLimit(ids.length, 'IDs para exclusão')

  const deleteMode = input.deleteMode ?? 'DELETED'
  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)

  assertBulkDeletePreviewToken({
    previewToken: input.previewToken,
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    level: input.level,
    ids,
    deleteMode,
  })

  const { items, failed: loadFailed, meta } = await loadBulkDeleteCandidates(ctx, {
    tenantId: input.tenantId,
    adAccountId: input.adAccountId,
    level: input.level,
    ids,
  })

  // Token already matched the ID set; reject if any ID is no longer owned.
  if (loadFailed.length > 0 || items.length !== ids.length) {
    throw new MetaAdsToolError(
      'BULK_DELETE_OWNERSHIP_CHANGED',
      'Um ou mais IDs falharam na revalidação de ownership. Refaça o preview.',
      403,
      { failed: loadFailed, items },
    )
  }

  const graph = fetchGraph(ctx)
  const succeeded: Array<{
    id: string
    name: string | null
    beforeStatus: string | null
    status: string
  }> = []
  const failed: Array<{ id: string; code: string; message: string }> = []

  if (dryRun) {
    await logMetaWriteAudit({
      tenantId: input.tenantId,
      action: 'meta.gpt.bulk.delete.preview',
      entityType: meta.entityType,
      entityId: ids[0] || null,
      dryRun: true,
      before: { items },
      after: {
        level: input.level,
        deleteMode,
        dryRun: true,
        wouldMutate: true,
        count: ids.length,
        ids,
      },
    })
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      level: input.level,
      deleteMode,
      dryRun: true as const,
      items,
      succeeded: [],
      failed: [],
      warning: 'Dry-run: nenhuma exclusão enviada à Graph. Reenvie com dryRun: false para executar.',
      notes: [
        `Seriam afetados ${ids.length} objeto(s) (${meta.label}) → status=${deleteMode}.`,
        'Confirme IDs com o usuário antes do execute real.',
      ],
    }
  }

  for (const item of items) {
    try {
      const updated = await graphWrite(graph, metaGraphUrl(creds.apiVersion, `/${item.id}`), {
        method: 'POST',
        query: { access_token: creds.accessToken },
        body: { status: deleteMode },
      }, { status: deleteMode })
      succeeded.push({
        id: item.id,
        name: item.name,
        beforeStatus: item.status || item.effectiveStatus,
        status: deleteMode,
      })
      await logMetaWriteAudit(
        {
          tenantId: input.tenantId,
          action: 'meta.gpt.bulk.delete',
          entityType: meta.entityType,
          entityId: item.id,
          dryRun: false,
          before: {
            name: item.name,
            status: item.status,
            effectiveStatus: item.effectiveStatus,
            dailyBudget: item.dailyBudget,
            lifetimeBudget: item.lifetimeBudget,
          },
          after: {
            status: deleteMode,
            success: Boolean(updated?.success ?? true),
            level: input.level,
            adAccountId: creds.adAccountId,
            batchSize: ids.length,
          },
        },
        ctx.client,
      )
    }
    catch (err) {
      if (err instanceof MetaAdsToolError) {
        failed.push({ id: item.id, code: err.code, message: err.message })
      }
      else {
        failed.push({
          id: item.id,
          code: 'GRAPH_DELETE_FAILED',
          message: err instanceof Error ? err.message : 'Falha ao deletar na Graph.',
        })
      }
    }
  }

  await logMetaWriteAudit(
    {
      tenantId: input.tenantId,
      action: 'meta.gpt.bulk.delete',
      entityType: 'meta_bulk_delete',
      entityId: ids[0] || null,
      dryRun: false,
      before: { ids, count: ids.length },
      after: {
        level: input.level,
        deleteMode,
        succeeded: succeeded.map(s => s.id),
        failed,
        adAccountId: creds.adAccountId,
      },
    },
    ctx.client,
  )

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    level: input.level,
    deleteMode,
    dryRun: false as const,
    succeeded,
    failed,
    warning: failed.length
      ? `Exclusão parcial: ${succeeded.length} ok, ${failed.length} falha(s). Confira Ads Manager.`
      : `Exclusão aplicada (${deleteMode}) em ${succeeded.length} objeto(s). Confira Ads Manager.`,
  }
}

type ToolHandler = (ctx: MetaToolContext, raw: unknown) => Promise<unknown>

export const META_TOOL_HANDLERS: Record<MetaToolName, ToolHandler> = {
  meta_list_integrations: metaListIntegrations,
  meta_list_ad_accounts: metaListAdAccounts,
  meta_list_campaigns: metaListCampaigns,
  meta_get_campaign: metaGetCampaign,
  meta_list_adsets: metaListAdsets,
  meta_list_ads: metaListAds,
  meta_get_insights: metaGetInsights,
  meta_update_campaign_status: metaUpdateCampaignStatus,
  meta_update_adset_status: metaUpdateAdsetStatus,
  meta_update_ad_status: metaUpdateAdStatus,
  meta_create_campaign: metaCreateCampaign,
  meta_create_adset: metaCreateAdset,
  meta_create_ad: metaCreateAd,
  meta_update_adset_budget: metaUpdateAdsetBudget,
  meta_update_adset_targeting: metaUpdateAdsetTargeting,
  meta_update_ad_creative_copy: metaUpdateAdCreativeCopy,
  meta_update_ad_media: metaUpdateAdMedia,
  meta_preview_bulk_delete: metaPreviewBulkDelete,
  meta_execute_bulk_delete: metaExecuteBulkDelete,
}

export const META_TOOL_SCHEMAS: Record<MetaToolName, z.ZodTypeAny> = {
  meta_list_integrations: metaListIntegrationsSchema,
  meta_list_ad_accounts: metaListAdAccountsSchema,
  meta_list_campaigns: metaListCampaignsSchema,
  meta_get_campaign: metaGetCampaignSchema,
  meta_list_adsets: metaListAdsetsSchema,
  meta_list_ads: metaListAdsSchema,
  meta_get_insights: metaGetInsightsSchema,
  meta_update_campaign_status: metaUpdateCampaignStatusSchema,
  meta_update_adset_status: metaUpdateAdsetStatusSchema,
  meta_update_ad_status: metaUpdateAdStatusSchema,
  meta_create_campaign: metaCreateCampaignSchema,
  meta_create_adset: metaCreateAdsetSchema,
  meta_create_ad: metaCreateAdSchema,
  meta_update_adset_budget: metaUpdateAdsetBudgetSchema,
  meta_update_adset_targeting: metaUpdateAdsetTargetingSchema,
  meta_update_ad_creative_copy: metaUpdateAdCreativeCopySchema,
  meta_update_ad_media: metaUpdateAdMediaSchema,
  meta_preview_bulk_delete: metaPreviewBulkDeleteSchema,
  meta_execute_bulk_delete: metaExecuteBulkDeleteSchema,
}

export const META_TOOL_DESCRIPTIONS: Record<MetaToolName, string> = {
  meta_list_integrations:
    'Lista marketing_integrations do tenant (status, write_readiness ads_management/page token, sem tokens).',
  meta_list_ad_accounts:
    'Lista ad accounts acessíveis pelo token Meta OAuth do tenant.',
  meta_list_campaigns:
    'Lista campanhas Meta Ads da ad account do tenant (leitura).',
  meta_get_campaign:
    'Obtém detalhe de uma campanha Meta. Valida ownership da ad account.',
  meta_list_adsets:
    'Lista conjuntos de anúncios (adsets) da conta ou de uma campanha.',
  meta_list_ads:
    'Lista anúncios Meta (conta, campanha ou adset).',
  meta_get_insights:
    'Consulta insights/métricas Meta (nível account|campaign|adset|ad + período).',
  meta_update_campaign_status:
    'PAUSA ou ATIVA campanha (ACTIVE|PAUSED). Exige confirm=true e confirmTenantId=tenantId. dryRun opcional (default false).',
  meta_update_adset_status:
    'PAUSA ou ATIVA adset (ACTIVE|PAUSED). Exige confirm=true e confirmTenantId=tenantId. dryRun opcional (default false).',
  meta_update_ad_status:
    'PAUSA ou ATIVA anúncio (ACTIVE|PAUSED). Exige confirm=true e confirmTenantId=tenantId. dryRun opcional (default false).',
  meta_create_campaign:
    'Cria campanha (Outcome_*). Default PAUSED + dryRun=true. Exige confirm+confirmTenantId. ACTIVE exige confirmActive. Budget opcional com teto env.',
  meta_create_adset:
    'Cria adset (BR_* ou targeting custom). PAUSED+dryRun. destinationType WEBSITE|WHATSAPP (CTWA). Exige confirm+budget+campaignId.',
  meta_create_ad:
    'Cria AdCreative+Ad. WEBSITE: linkUrl. WHATSAPP: CTWA oficial (sem linkUrl/wa.me). PAUSED+dryRun. Exige page token, confirm, adsetId.',
  meta_update_adset_budget:
    'Atualiza budget do adset (daily|lifetime). dryRun default true. Teto META_GPT_BUDGET_* + confirmBudgetIncrease se aumento % alto.',
  meta_update_adset_targeting:
    'Atualiza targeting do adset (BR_* ou targeting custom). dryRun default true. XOR targetingTemplate|targeting.',
  meta_update_ad_creative_copy:
    'Atualiza copy do ad (message/headline/description/CTA/link) via novo AdCreative + swap. dryRun default true. Exige Page.',
  meta_update_ad_media:
    'Atualiza mídia do ad (imageUrl|imageHash) via novo AdCreative + swap; preserva copy. dryRun default true. Sem video/upload binário.',
  meta_preview_bulk_delete:
    'Preview de exclusão em massa (IDs explícitos, level campaign|adset|ad). Ownership + previewToken (TTL). Sem Graph POST. Nunca por nome.',
  meta_execute_bulk_delete:
    'Executa exclusão em massa após preview. Exige previewToken + confirm + confirmTenantId + confirmDelete + dryRun=false. Sequencial; succeeded/failed.',
}

export async function invokeMetaTool(
  name: MetaToolName,
  ctx: MetaToolContext,
  args: unknown,
) {
  const handler = META_TOOL_HANDLERS[name]
  if (!handler)
    throw new MetaAdsToolError('UNKNOWN_TOOL', `Tool desconhecida: ${name}`, 404)
  return handler(ctx, args)
}

export function formatToolError(error: unknown) {
  if (error instanceof MetaAdsToolError) {
    return {
      ok: false as const,
      error: {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        details: error.details,
      },
    }
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false as const,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input inválido',
        statusCode: 400,
        details: error.flatten(),
      },
    }
  }
  return {
    ok: false as const,
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
      statusCode: 500,
    },
  }
}
