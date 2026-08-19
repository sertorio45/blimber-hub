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
  assertCreativeDestinationCompatibility,
  assertMessagingAdsetCompatibility,
  buildMetaCreateAdsetGraphBody,
  forcedCallToActionForDestination,
  isMessagingDestination,
  isMetaMessagingProtocolUrl,
  META_AD_DESTINATION_TYPES,
  META_MESSAGING_CTA_BY_DESTINATION,
  normalizeAdsetDestinationType,
  normalizeWhatsappPhoneNumber,
  type MetaAdDestinationType,
} from './ad-destination'
import { getMetaCapabilities } from './capabilities'
import {
  assertProductSetOwned,
  listProductCatalogs,
  listProductSets,
} from './catalog-service'
import {
  applyTrackingToAdGraphBody,
  assertTrackingSpecsOwned,
  compileAdTracking,
  hasAdTrackingInput,
  listAdAccountDatasets,
  listAdAccountPixels,
  mergeTrackingSpecs,
  metaAdTrackingFieldsSchema,
  summarizeTrackingForPreview,
} from './tracking-specs'
import {
  META_ADVANTAGE_ENROLL_STATUS,
  META_ADVANTAGE_PLUS_FEATURES,
  META_DYNAMIC_AD_FORMATS,
  buildMetaCreateAdCreativeBodyByType,
  normalizeMetaAdCreativeType,
  type DegreesOfFreedomSpecInput,
  type MetaAdCreativeType,
  type AssetFeedSpecInput,
} from './creative-types'
import {
  assertEligibleOrThrow,
  assertStudyOnAdAccount,
  assertCreativeTestVersionCount,
  assertUserAccessTokenForAdStudies,
  buildCopyAdGraphBody,
  buildCreateExperimentGraphBody,
  checkExperimentEligibility,
  copyAdForExperiment,
  deleteCopiedAdsForFailedStudy,
  evenTreatmentPercentages,
  getExperiment,
  listExperiments,
  postAdStudyWithOwnerFallback,
  resolveStudyCreateTargets,
  stopExperiment,
  variationHasMediaOverride,
  type ExperimentVariationInput,
  type StudyOwnerStrategy,
} from './experiment-service'
import {
  getVideoStatus,
  uploadImage,
  uploadVideo,
} from './media-service'
import {
  downloadLibraryImageBytes,
  loadLibraryImageAsset,
  type LibraryImageAsset,
} from './library-asset'
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
  metaCreateCustomAudience,
  metaCreateCustomAudiencesBatch,
  metaCreateCustomAudienceSchema,
  metaCreateCustomAudiencesBatchSchema,
  metaDeleteCustomAudience,
  metaDeleteCustomAudienceSchema,
  metaGetCustomAudienceUsage,
  metaGetCustomAudienceUsageSchema,
  metaUpdateCustomAudience,
  metaUpdateCustomAudienceSchema,
} from './custom-audiences'

export {
  metaCreateCustomAudience,
  metaCreateCustomAudiencesBatch,
  metaDeleteCustomAudience,
  metaGetCustomAudienceUsage,
  metaUpdateCustomAudience,
}

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
import {
  buildCreativeAssetGroupsSpec,
  buildFlexibleAdGraphBody,
  checkFlexibleAdEligibility,
  metaCheckFlexibleAdEligibilitySchema,
  metaCreateFlexibleAdSchema,
  metaGetFlexibleAdStructureSchema,
  readFlexibleAdStructure,
} from './flexible-ad-format'
import {
  generateAdPreview,
  generateAdPreviewsBatch,
  META_AD_PREVIEW_FORMATS,
  validateCreativeViaPreview,
} from './preview-service'

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

export const metaGetAdSchema = tenantContextSchema.extend({
  adId: z.string().min(1).describe('ID do anúncio Meta.'),
})

export const metaGetCreativeSchema = tenantContextSchema.extend({
  creativeId: z.string().min(1).describe('ID do AdCreative Meta.'),
})

export const metaListCreativesSchema = tenantContextSchema.extend({
  limit: z.number().int().min(1).max(200).optional().default(50),
  after: z.string().optional().describe('Cursor de paginação (paging.cursors.after).'),
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

/** Search Meta interest taxonomy (Graph `/search?type=adinterest`). */
export const metaSearchInterestsSchema = tenantContextSchema.pick({ tenantId: true }).extend({
  q: z.string().min(1).max(200).describe('Termo de busca (ex.: cosméticos, farmácia estética).'),
  limit: z.number().int().min(1).max(50).optional().default(25),
  locale: z
    .string()
    .min(2)
    .max(20)
    .optional()
    .default('pt_BR')
    .describe('Locale Meta (default pt_BR).'),
})

export const META_GEOLOCATION_TYPES = [
  'country',
  'country_group',
  'region',
  'city',
  'zip',
  'geo_market',
  'electoral_district',
] as const

export type MetaGeolocationType = (typeof META_GEOLOCATION_TYPES)[number]

/** Search Meta geo targeting (Graph `/search?type=adgeolocation`). */
export const metaSearchGeolocationsSchema = tenantContextSchema.pick({ tenantId: true }).extend({
  q: z.string().min(1).max(200).describe('Termo (ex.: São Paulo, Rio de Janeiro, SP).'),
  limit: z.number().int().min(1).max(50).optional().default(25),
  locationTypes: z
    .array(z.enum(META_GEOLOCATION_TYPES))
    .min(1)
    .max(5)
    .optional()
    .default(['city', 'region'])
    .describe('Tipos Meta location_types (default city+region).'),
  countryCode: z
    .string()
    .length(2)
    .optional()
    .describe('Filtro ISO-2 opcional (ex.: BR).'),
})

/** List custom audiences on the tenant ad account. */
export const metaListCustomAudiencesSchema = tenantContextSchema.extend({
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
 * destinationType=WHATSAPP|MESSENGER|INSTAGRAM_DIRECT → Click-to-Message
 * (promoted_object.page_id + destination_type).
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
    advantageAudience: z
      .union([z.literal(0), z.literal(1)])
      .optional()
      .describe(
        'targeting_automation.advantage_audience (Graph v23+). Default 0 (BAU com idade/geo). '
        + 'Use 1 só para optar em Advantage+ audience.',
      ),
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
      .describe('WEBSITE (default) ou destino de mensagem: WHATSAPP | MESSENGER | INSTAGRAM_DIRECT. Não é objective.'),
    isDynamicCreative: z
      .boolean()
      .optional()
      .describe(
        'Se true, cria adset com is_dynamic_creative=true (DYNAMIC_CREATIVE_LEGACY). '
        + 'Só WEBSITE; ads devem usar creativeType=DYNAMIC_CREATIVE_LEGACY + assetFeed.',
      ),
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
    if (data.isDynamicCreative === true && isMessagingDestination(data.destinationType ?? 'WEBSITE')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'isDynamicCreative=true exige destinationType=WEBSITE (não combina com destinos de mensagem).',
        path: ['isDynamicCreative'],
      })
    }
    if (isMessagingDestination(data.destinationType ?? 'WEBSITE') && data.billingEvent !== 'IMPRESSIONS') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `destinationType=${data.destinationType} exige billingEvent=IMPRESSIONS.`,
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
    if (isMessagingDestination(data.destinationType ?? 'WEBSITE') && data.campaignObjective) {
      try {
        assertMessagingAdsetCompatibility({
          destinationType: data.destinationType ?? 'WEBSITE',
          optimizationGoal: data.optimizationGoal,
          billingEvent: data.billingEvent,
          campaignObjective: data.campaignObjective,
        })
      }
      catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'Combinação de destino inválida.',
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
  'MESSAGE_PAGE',
  'INSTAGRAM_MESSAGE',
] as const

export type MetaAdCallToAction = (typeof META_AD_CALL_TO_ACTIONS)[number]

const metaCarouselCardSchema = z.object({
  link: z.string().url().optional().describe('URL https do card (WEBSITE). Omita em destinos de mensagem — protocolo Meta é injetado.'),
  name: z.string().max(255).optional().describe('Título do card.'),
  description: z.string().max(500).optional().describe('Descrição do card.'),
  imageHash: z.string().min(1).max(128).optional().describe('image_hash do card (XOR imageUrl).'),
  imageUrl: z.string().url().optional().describe('URL HTTPS da imagem do card (XOR imageHash).'),
  videoId: z.string().min(1).optional().describe('video_id já na Meta (opcional no card).'),
})

const metaAssetFeedSchema = z.object({
  bodies: z.array(z.object({ text: z.string().min(1).max(2000) })).optional(),
  titles: z.array(z.object({ text: z.string().min(1).max(255) })).optional(),
  descriptions: z.array(z.object({ text: z.string().min(1).max(500) })).optional(),
  images: z.array(z.object({ hash: z.string().min(1) })).optional(),
  videos: z.array(z.object({
    videoId: z.string().min(1),
    thumbnailUrl: z.string().url().optional(),
    thumbnailHash: z.string().min(1).optional(),
  })).optional(),
  linkUrls: z.array(z.object({ websiteUrl: z.string().url() })).min(1),
  callToActionTypes: z.array(z.string().min(1)).min(1),
  adFormats: z.array(z.enum(META_DYNAMIC_AD_FORMATS)).min(1),
}).describe('asset_feed_spec tipado (DYNAMIC_CREATIVE_LEGACY).')

const metaDegreesOfFreedomSchema = z.object({
  creativeFeaturesSpec: z.record(
    z.enum(META_ADVANTAGE_PLUS_FEATURES),
    z.object({
      enrollStatus: z.enum(META_ADVANTAGE_ENROLL_STATUS),
    }),
  ).describe('Advantage+ creative_features_spec (pac_relaxation = Mídia flexível no Ads Manager).'),
}).describe('degrees_of_freedom_spec tipado (Advantage+ Creative).')

/**
 * Create ad + creative on the tenant ad account.
 * creativeId XOR creative fields: reuse existing AdCreative OR build IMAGE|VIDEO|CAROUSEL|DYNAMIC_CREATIVE_LEGACY|CATALOG.
 * Optional Advantage+ degreesOfFreedomSpec. Optional upload via imageUrl/videoUrl (SSRF)
 * or library assetId (IMAGE, tenant-isolated download). dryRun default true.
 * Status default PAUSED. Requires page_id + page token (exceto creativeId-only).
 */
export const metaCreateAdSchema = tenantContextSchema
  .extend({
    adsetId: z.string().min(1).describe('ID do adset Meta (deve pertencer à ad account do tenant).'),
    name: z.string().min(1).max(400).describe('Nome do anúncio na Meta.'),
    creativeId: z
      .string()
      .min(1)
      .optional()
      .describe('Reusa AdCreative existente (XOR com creativeType/mídia/copy). Ownership validada no execute.'),
    creativeType: z
      .string()
      .optional()
      .default('IMAGE')
      .describe('IMAGE|VIDEO|CAROUSEL|DYNAMIC_CREATIVE_LEGACY|CATALOG (omitido se creativeId).'),
    destinationType: z
      .enum(META_AD_DESTINATION_TYPES)
      .optional()
      .default('WEBSITE')
      .describe('WEBSITE (default) ou WHATSAPP|MESSENGER|INSTAGRAM_DIRECT (Click-to-Message; IMAGE|VIDEO|CAROUSEL).'),
    linkUrl: z
      .string()
      .url()
      .optional()
      .describe('URL https de site (WEBSITE). Nunca inventar; rejeita wa.me.'),
    message: z
      .string()
      .min(1)
      .max(2000)
      .optional()
      .describe('Texto principal (obrigatório IMAGE|VIDEO|CAROUSEL|CATALOG sem creativeId).'),
    headline: z.string().max(255).optional(),
    description: z.string().max(500).optional(),
    callToAction: z
      .enum(META_AD_CALL_TO_ACTIONS)
      .optional()
      .describe('CTA whitelist. WEBSITE default LEARN_MORE; destinos de mensagem forçam CTA oficial.'),
    welcomeMessage: z
      .string()
      .min(1)
      .max(1000)
      .optional()
      .describe('Destinos de mensagem (IMAGE|VIDEO|CAROUSEL): page_welcome_message.'),
    imageUrl: z.string().url().optional().describe('URL HTTPS imagem (upload ou picture). XOR imageHash|assetId|sourceBase64.'),
    imageHash: z.string().min(1).max(128).optional().describe('image_hash existente. XOR imageUrl|assetId|sourceBase64.'),
    assetId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID do media_asset da Biblioteca (tenant). Download interno → imageHash. XOR imageUrl|imageHash|sourceBase64. Só IMAGE.'),
    sourceBase64: z
      .string()
      .min(1)
      .optional()
      .describe('Imagem base64 (PNG/JPEG/WebP). Normalizada → imageHash. XOR imageUrl|imageHash|assetId. Só IMAGE.'),
    videoId: z.string().min(1).optional().describe('video_id existente (VIDEO). XOR videoUrl.'),
    videoUrl: z.string().url().optional().describe('HTTPS para upload Advideo (não dryRun). XOR videoId.'),
    childAttachments: z
      .array(metaCarouselCardSchema)
      .min(2)
      .max(10)
      .optional()
      .describe('CAROUSEL: 2–10 cards (imageHash|imageUrl|videoId; link só WEBSITE).'),
    assetFeed: metaAssetFeedSchema.optional().describe('Obrigatório em DYNAMIC_CREATIVE_LEGACY.'),
    degreesOfFreedomSpec: metaDegreesOfFreedomSchema
      .optional()
      .describe('Advantage+ Creative (pac_relaxation = Mídia flexível). Não usar com DYNAMIC_CREATIVE_LEGACY.'),
    catalogId: z.string().min(1).optional().describe('CATALOG: id do product catalog (ownership).'),
    productSetId: z.string().min(1).optional().describe('CATALOG: product_set_id.'),
    ...metaAdTrackingFieldsSchema.shape,
    creativeName: z.string().min(1).max(400).optional(),
    status: z.enum(['ACTIVE', 'PAUSED']).optional().default('PAUSED'),
    confirmActive: z.literal(true).optional(),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    const hasCreativeId = Boolean(data.creativeId)
    if (hasCreativeId) {
      const conflicting = [
        data.message,
        data.linkUrl,
        data.imageUrl,
        data.imageHash,
        data.assetId,
        data.videoId,
        data.videoUrl,
        data.childAttachments,
        data.assetFeed,
        data.productSetId,
        data.degreesOfFreedomSpec,
      ].some(Boolean)
      // creativeType default IMAGE always present — only flag if user sent non-default media/copy
      if (conflicting) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'creativeId é XOR: não envie mídia/copy/assetFeed/productSet junto com creativeId.',
          path: ['creativeId'],
        })
      }
      return
    }

    let creativeType: MetaAdCreativeType = 'IMAGE'
    try {
      creativeType = normalizeMetaAdCreativeType(data.creativeType)
    }
    catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'creativeType inválido.',
        path: ['creativeType'],
      })
      return
    }

    const destinationType = data.destinationType ?? 'WEBSITE'

    if (destinationType === 'WEBSITE') {
      const needsLink = creativeType !== 'DYNAMIC_CREATIVE_LEGACY'
        || !data.assetFeed?.linkUrls?.length
      if (needsLink && creativeType !== 'DYNAMIC_CREATIVE_LEGACY' && !data.linkUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'destinationType=WEBSITE exige linkUrl https de site. Para WhatsApp/Messenger/IG use destinationType correspondente.',
          path: ['linkUrl'],
        })
      }
      if (data.linkUrl && !data.linkUrl.startsWith('https://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'linkUrl deve usar https://.',
          path: ['linkUrl'],
        })
      }
      else if (data.linkUrl && isMetaMessagingProtocolUrl(data.linkUrl)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Não use wa.me/api.whatsapp.com como linkUrl de site. Use destinationType=WHATSAPP.',
          path: ['linkUrl'],
        })
      }
      if (data.callToAction && (data.callToAction === 'WHATSAPP_MESSAGE' || data.callToAction === 'MESSAGE_PAGE' || data.callToAction === 'INSTAGRAM_MESSAGE')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `CTA ${data.callToAction} exige destinationType de mensagem correspondente.`,
          path: ['callToAction'],
        })
      }
      if (data.welcomeMessage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'welcomeMessage só é válido com destinos de mensagem (WHATSAPP|MESSENGER|INSTAGRAM_DIRECT).',
          path: ['welcomeMessage'],
        })
      }
    }

    if (isMessagingDestination(destinationType)) {
      if (data.linkUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `destinationType=${destinationType} não aceita linkUrl de site. Omita linkUrl.`,
          path: ['linkUrl'],
        })
      }
      const forcedCta = META_MESSAGING_CTA_BY_DESTINATION[destinationType].type
      if (data.callToAction && data.callToAction !== forcedCta) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `destinationType=${destinationType} usa CTA ${forcedCta}.`,
          path: ['callToAction'],
        })
      }
      try {
        assertCreativeDestinationCompatibility({ creativeType, destinationType })
      }
      catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'Combinação creativeType × destinationType inválida.',
          path: ['creativeType'],
        })
      }
    }

    if (creativeType === 'IMAGE' || creativeType === 'VIDEO' || creativeType === 'CAROUSEL' || creativeType === 'CATALOG') {
      if (!data.message) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `creativeType=${creativeType} exige message.`,
          path: ['message'],
        })
      }
    }

    if (creativeType === 'VIDEO') {
      if (!data.videoId && !data.videoUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'creativeType=VIDEO exige videoId ou videoUrl.',
          path: ['videoId'],
        })
      }
      if (data.videoId && data.videoUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe videoId OU videoUrl, não ambos.',
          path: ['videoUrl'],
        })
      }
    }

    if (creativeType === 'CAROUSEL') {
      if (!data.childAttachments?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'creativeType=CAROUSEL exige childAttachments (2–10 cards).',
          path: ['childAttachments'],
        })
      }
      else {
        data.childAttachments.forEach((card, index) => {
          if (!card.imageHash && !card.imageUrl && !card.videoId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Card ${index}: informe imageHash, imageUrl ou videoId.`,
              path: ['childAttachments', index],
            })
          }
          if (card.imageHash && card.imageUrl) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Card ${index}: imageHash OU imageUrl, não ambos.`,
              path: ['childAttachments', index, 'imageUrl'],
            })
          }
          if (destinationType === 'WEBSITE' && !card.link) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Card ${index}: CAROUSEL WEBSITE exige link https.`,
              path: ['childAttachments', index, 'link'],
            })
          }
          if (isMessagingDestination(destinationType) && card.link) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Card ${index}: destinos de mensagem não usam URL de site no card. Omita link (protocolo Meta é injetado).`,
              path: ['childAttachments', index, 'link'],
            })
          }
        })
      }
    }

    if (creativeType === 'DYNAMIC_CREATIVE_LEGACY') {
      if (!data.assetFeed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'DYNAMIC_CREATIVE_LEGACY exige assetFeed. Adset deve ter is_dynamic_creative=true.',
          path: ['assetFeed'],
        })
      }
      if (data.degreesOfFreedomSpec) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'degreesOfFreedomSpec não combina com DYNAMIC_CREATIVE_LEGACY.',
          path: ['degreesOfFreedomSpec'],
        })
      }
    }

    if (creativeType === 'CATALOG') {
      if (!data.productSetId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CATALOG exige productSetId.',
          path: ['productSetId'],
        })
      }
      if (!data.catalogId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CATALOG exige catalogId (validação de ownership).',
          path: ['catalogId'],
        })
      }
    }

    const imageSources = [data.imageUrl, data.imageHash, data.assetId].filter(Boolean).length
    if (imageSources > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe imageUrl OU imageHash OU assetId, não combine.',
        path: ['assetId'],
      })
    }
    if (data.assetId && creativeType !== 'IMAGE') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'assetId só é válido em creativeType=IMAGE (vídeo da biblioteca não é suportado).',
        path: ['assetId'],
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
    advantageAudience: z
      .union([z.literal(0), z.literal(1)])
      .optional()
      .describe(
        'targeting_automation.advantage_audience (Graph v23+). Default 0. Use 1 para Advantage+ audience.',
      ),
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
 * Update ad media via new AdCreative + swap. Supports IMAGE|VIDEO|CAROUSEL.
 * Preserves copy from existing creative when possible. dryRun default true.
 */
export const metaUpdateAdMediaSchema = tenantContextSchema
  .extend({
    adId: z.string().min(1).describe('ID do anúncio Meta.'),
    creativeType: z
      .string()
      .optional()
      .default('IMAGE')
      .describe('IMAGE (default) | VIDEO | CAROUSEL — formato do novo criativo.'),
    imageUrl: z.string().url().optional().describe('URL HTTPS imagem. XOR imageHash.'),
    imageHash: z.string().min(1).max(128).optional().describe('image_hash. XOR imageUrl.'),
    videoId: z.string().min(1).optional().describe('video_id (VIDEO). XOR videoUrl.'),
    videoUrl: z.string().url().optional().describe('HTTPS Advideo upload (não dryRun). XOR videoId.'),
    childAttachments: z
      .array(metaCarouselCardSchema)
      .min(2)
      .max(10)
      .optional()
      .describe('CAROUSEL: 2–10 cards.'),
    degreesOfFreedomSpec: metaDegreesOfFreedomSchema.optional(),
    creativeName: z.string().min(1).max(400).optional(),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    let creativeType: MetaAdCreativeType = 'IMAGE'
    try {
      creativeType = normalizeMetaAdCreativeType(data.creativeType)
    }
    catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'creativeType inválido.',
        path: ['creativeType'],
      })
      return
    }
    if (creativeType !== 'IMAGE' && creativeType !== 'VIDEO' && creativeType !== 'CAROUSEL') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'updateAdMedia só aceita IMAGE|VIDEO|CAROUSEL.',
        path: ['creativeType'],
      })
      return
    }
    if (creativeType === 'IMAGE') {
      if (!data.imageUrl && !data.imageHash) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'IMAGE exige imageUrl ou imageHash.',
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
    }
    if (creativeType === 'VIDEO') {
      if (!data.videoId && !data.videoUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'VIDEO exige videoId ou videoUrl.',
          path: ['videoId'],
        })
      }
      if (data.videoId && data.videoUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe videoId OU videoUrl, não ambos.',
          path: ['videoUrl'],
        })
      }
    }
    if (creativeType === 'CAROUSEL' && !data.childAttachments?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CAROUSEL exige childAttachments.',
        path: ['childAttachments'],
      })
    }
  })

export const metaGetCapabilitiesSchema = tenantContextSchema.pick({ tenantId: true }).extend({
  adAccountId: z.string().optional(),
})

export const metaUploadImageSchema = tenantContextSchema
  .extend({
    imageUrl: z.string().url().optional().describe('URL HTTPS da imagem (SSRF-checked). XOR imageHash|assetId|sourceBase64.'),
    imageHash: z.string().min(1).max(128).optional().describe('image_hash existente — reutiliza sem upload.'),
    assetId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID do media_asset da Biblioteca (tenant). XOR imageUrl|imageHash|sourceBase64. Aceita JPG/PNG/WebP/GIF.'),
    sourceBase64: z
      .string()
      .min(1)
      .optional()
      .describe('Imagem codificada em base64 (PNG/JPEG/WebP). XOR imageUrl|imageHash|assetId. Normalizada para Meta antes do upload.'),
    name: z.string().min(1).max(255).optional(),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    const sources = [data.imageUrl, data.imageHash, data.assetId, data.sourceBase64].filter(Boolean).length
    if (sources === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe imageUrl, imageHash, assetId (biblioteca) ou sourceBase64.',
        path: ['assetId'],
      })
    }
    if (sources > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe imageUrl OU imageHash OU assetId OU sourceBase64, não combine.',
        path: ['assetId'],
      })
    }
  })

export const metaUploadVideoSchema = tenantContextSchema
  .extend({
    videoUrl: z.string().url().optional(),
    videoId: z.string().min(1).optional(),
    title: z.string().max(255).optional(),
    description: z.string().max(500).optional(),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    if (!data.videoUrl && !data.videoId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe videoUrl ou videoId.', path: ['videoUrl'] })
    }
    if (data.videoUrl && data.videoId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'videoUrl OU videoId.', path: ['videoUrl'] })
    }
  })

export const metaGetVideoStatusSchema = tenantContextSchema.extend({
  videoId: z.string().min(1),
})

export const metaListCatalogsSchema = tenantContextSchema.extend({
  limit: z.number().int().min(1).max(200).optional().default(50),
})

/** GET act_{id}/adspixels — Pixels da ad account do tenant. */
export const metaListPixelsSchema = tenantContextSchema.extend({
  limit: z.number().int().min(1).max(200).optional().default(50),
})

/** GET act_{id}/offline_conversion_data_sets — Datasets da ad account do tenant. */
export const metaListDatasetsSchema = tenantContextSchema.extend({
  limit: z.number().int().min(1).max(200).optional().default(50),
})

/**
 * Update Ad tracking_specs (Pixel / offline Dataset) + conversion_domain.
 * Meta POST overwrite — default merge with GET snapshot. dryRun default true.
 */
export const metaUpdateAdTrackingSchema = tenantContextSchema
  .extend({
    adId: z.string().min(1).describe('ID do anúncio (mesma ad account do tenant).'),
    replaceTrackingSpecs: z
      .boolean()
      .optional()
      .default(false)
      .describe('Se true, substitui tracking_specs (não faz merge com o GET). Default false = append.'),
    ...metaAdTrackingFieldsSchema.shape,
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    if (!hasAdTrackingInput(data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe trackingSpecs, pixelId, offlineDatasetId ou conversionDomain.',
        path: ['trackingSpecs'],
      })
    }
  })

export const metaListProductSetsSchema = tenantContextSchema.extend({
  catalogId: z.string().min(1).describe('ID do product catalog (via meta_list_catalogs).'),
  limit: z.number().int().min(1).max(200).optional().default(50),
})

const experimentVariationChildAttachmentSchema = z.object({
  imageHash: z.string().optional(),
  assetId: z.string().optional(),
  videoId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  link: z.string().optional(),
})

const experimentVariationSchema = z.object({
  name: z.string().min(1).max(200).optional().describe('Nome da célula / sufixo do anúncio copiado.'),
  creativeType: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL']).optional()
    .describe('Tipo de criativo da variação. Default = mesmo do base.'),
  message: z.string().optional(),
  headline: z.string().optional(),
  description: z.string().optional(),
  callToAction: z.string().optional(),
  welcomeMessage: z.string().optional(),
  imageHash: z.string().optional().describe('image_hash existente na ad account.'),
  imageUrl: z.string().optional().describe('HTTPS URL — upload automático se sem imageHash.'),
  assetId: z.string().optional().describe('Asset da Biblioteca Meta — download + upload como imagem.'),
  videoId: z.string().optional().describe('video_id existente na ad account.'),
  videoUrl: z.string().optional().describe('HTTPS URL — upload automático via advideos.'),
  videoAssetId: z.string().optional().describe('Asset de vídeo da Biblioteca (não suportado — erro claro).'),
  childAttachments: z.array(experimentVariationChildAttachmentSchema).min(2).max(10).optional()
    .describe('Cards do carousel. 2–10 cards, cada um com imageHash/assetId/videoId + link.'),
})

export const metaListExperimentsSchema = tenantContextSchema.extend({
  limit: z.number().int().min(1).max(100).optional().default(50),
})

export const metaCheckExperimentEligibilitySchema = tenantContextSchema.extend({
  adId: z.string().min(1).optional(),
  adIds: z.array(z.string().min(1)).optional(),
  adsetId: z.string().min(1).optional(),
  campaignId: z.string().min(1).optional(),
})

export const metaCreateExperimentSchema = tenantContextSchema
  .extend({
    name: z.string().min(1).max(400),
    description: z.string().max(2000).optional(),
    type: z.enum(['SPLIT_TEST_V2', 'SPLIT_TEST']).default('SPLIT_TEST_V2'),
    cells: z.array(z.object({
      name: z.string().min(1),
      treatmentPercentage: z.number().int().min(10).max(90),
      adId: z.string().min(1).optional(),
      adsetIds: z.array(z.string().min(1)).optional(),
    })).min(2).max(150).optional(),
    baseAdId: z.string().min(1).optional()
      .describe('Atalho SPLIT_TEST_V2: anúncio base + variations (duplica via /copies). XOR com cells[].'),
    variations: z.array(experimentVariationSchema).min(1).max(6).optional()
      .describe('Até 4 variações efetivas (Meta: 2–5 células). 5–6 variações são rejeitadas com erro claro.'),
    startTime: z.number().int().positive().describe('Unix timestamp (seconds).'),
    endTime: z.number().int().positive().describe('Unix timestamp (seconds).'),
    creativeTestDailyBudget: z.number().int().positive().optional(),
    creativeTestLifetimeBudgetPercentage: z.number().int().min(1).max(100).optional(),
    studyOwner: z.enum(['AUTO', 'USER', 'BUSINESS']).optional().default('AUTO')
      .describe('AUTO: POST USER v26 primeiro, BUSINESS se USER falhar (mesmas cópias).'),
    ...metaWriteConfirmationFields,
    ...metaWriteDryRunField,
  })
  .superRefine((data, ctx) => {
    const hasCells = Array.isArray(data.cells) && data.cells.length > 0
    const hasBase = Boolean(data.baseAdId)
    if (hasCells === hasBase) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe cells[] (2+) OU baseAdId + variations[] (XOR).',
        path: hasCells ? ['baseAdId'] : ['cells'],
      })
    }
    if (hasBase && (!data.variations || data.variations.length < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'baseAdId exige variations[] (mínimo 1).',
        path: ['variations'],
      })
    }
    if (hasBase && data.type !== 'SPLIT_TEST_V2') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'baseAdId + variations só se aplica a SPLIT_TEST_V2 (Creative Test).',
        path: ['type'],
      })
    }
  })

export const metaGetExperimentSchema = tenantContextSchema.extend({
  studyId: z.string().min(1),
})

export const metaStopExperimentSchema = tenantContextSchema.extend({
  studyId: z.string().min(1),
  ...metaWriteConfirmationFields,
  ...metaWriteDryRunField,
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
  | 'meta_get_ad'
  | 'meta_get_creative'
  | 'meta_list_creatives'
  | 'meta_get_insights'
  | 'meta_search_interests'
  | 'meta_search_geolocations'
  | 'meta_list_custom_audiences'
  | 'meta_create_custom_audience'
  | 'meta_create_custom_audiences_batch'
  | 'meta_update_custom_audience'
  | 'meta_delete_custom_audience'
  | 'meta_get_custom_audience_usage'
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
  | 'meta_get_capabilities'
  | 'meta_upload_image'
  | 'meta_upload_video'
  | 'meta_get_video_status'
  | 'meta_list_catalogs'
  | 'meta_list_product_sets'
  | 'meta_list_pixels'
  | 'meta_list_datasets'
  | 'meta_update_ad_tracking'
  | 'meta_list_experiments'
  | 'meta_check_experiment_eligibility'
  | 'meta_create_experiment'
  | 'meta_get_experiment'
  | 'meta_stop_experiment'
  | 'meta_check_flexible_ad_eligibility'
  | 'meta_create_flexible_ad'
  | 'meta_get_flexible_ad_structure'
  | 'meta_generate_ad_preview'
  | 'meta_generate_ad_previews_batch'
  | 'meta_validate_creative'

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

function mapInterestRow(row: Record<string, unknown>) {
  const audienceSize = row.audience_size ?? row.audience_size_upper_bound ?? null
  const lower = row.audience_size_lower_bound ?? null
  const upper = row.audience_size_upper_bound ?? null
  return {
    id: String(row.id || ''),
    name: String(row.name || row.id || ''),
    audience_size: audienceSize != null && Number.isFinite(Number(audienceSize))
      ? Number(audienceSize)
      : null,
    audience_size_lower_bound: lower != null && Number.isFinite(Number(lower)) ? Number(lower) : null,
    audience_size_upper_bound: upper != null && Number.isFinite(Number(upper)) ? Number(upper) : null,
    path: Array.isArray(row.path) ? row.path.map(String) : null,
    topic: row.topic != null ? String(row.topic) : null,
    type: 'adinterest' as const,
  }
}

/**
 * Search Meta interest IDs for custom targeting.flexible_spec / interests.
 * Graph: GET /search?type=adinterest
 */
export async function metaSearchInterests(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaSearchInterestsSchema.parse(raw)
  const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
  const graph = fetchGraph(ctx)
  const res = await graph(metaGraphUrl(tokenCtx.apiVersion, '/search'), {
    query: {
      type: 'adinterest',
      q: input.q,
      limit: input.limit,
      locale: input.locale,
      access_token: tokenCtx.accessToken,
    },
  })

  const interests = (Array.isArray(res?.data) ? res.data : [])
    .map((row: Record<string, unknown>) => mapInterestRow(row))
    .filter((row: { id: string }) => Boolean(row.id))

  return {
    tenantId: input.tenantId,
    q: input.q,
    locale: input.locale,
    interests,
    paging: res?.paging || null,
  }
}

function mapGeolocationRow(row: Record<string, unknown>) {
  const key = String(row.key || row.id || '')
  return {
    key,
    name: String(row.name || key),
    type: row.type != null ? String(row.type) : null,
    country_code: row.country_code != null ? String(row.country_code) : null,
    country_name: row.country_name != null ? String(row.country_name) : null,
    region: row.region != null ? String(row.region) : null,
    region_id: row.region_id != null ? String(row.region_id) : null,
    supports_region: typeof row.supports_region === 'boolean' ? row.supports_region : null,
    supports_city: typeof row.supports_city === 'boolean' ? row.supports_city : null,
  }
}

/**
 * Search Meta geo keys for targeting.geo_locations.cities|regions.
 * Graph: GET /search?type=adgeolocation
 */
export async function metaSearchGeolocations(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaSearchGeolocationsSchema.parse(raw)
  const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
  const graph = fetchGraph(ctx)
  const query: Record<string, string | number | undefined> = {
    type: 'adgeolocation',
    q: input.q,
    limit: input.limit,
    location_types: JSON.stringify(input.locationTypes),
    access_token: tokenCtx.accessToken,
  }
  if (input.countryCode)
    query.country_code = input.countryCode.toUpperCase()

  const res = await graph(metaGraphUrl(tokenCtx.apiVersion, '/search'), {
    query,
  })

  const geolocations = (Array.isArray(res?.data) ? res.data : [])
    .map((row: Record<string, unknown>) => mapGeolocationRow(row))
    .filter((row: { key: string }) => Boolean(row.key))

  return {
    tenantId: input.tenantId,
    q: input.q,
    locationTypes: input.locationTypes,
    countryCode: input.countryCode?.toUpperCase() ?? null,
    geolocations,
    paging: res?.paging || null,
  }
}

/**
 * List custom audiences for the tenant ad account (ids for targeting.custom_audiences).
 * Graph: GET /act_{id}/customaudiences
 */
export async function metaListCustomAudiences(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListCustomAudiencesSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const res = await graph(
    metaGraphUrl(creds.apiVersion, `/${actPath(creds.adAccountId)}/customaudiences`),
    {
      query: {
        fields: 'id,name,subtype,description,approximate_count,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status,time_created,time_updated',
        limit: input.limit,
        access_token: creds.accessToken,
      },
    },
  )

  const customAudiences = (Array.isArray(res?.data) ? res.data : []).map((row: Record<string, unknown>) => ({
    id: String(row.id || ''),
    name: String(row.name || row.id || ''),
    subtype: row.subtype != null ? String(row.subtype) : null,
    description: row.description != null ? String(row.description) : null,
    approximate_count: row.approximate_count != null && Number.isFinite(Number(row.approximate_count))
      ? Number(row.approximate_count)
      : null,
    approximate_count_lower_bound: row.approximate_count_lower_bound != null
      && Number.isFinite(Number(row.approximate_count_lower_bound))
      ? Number(row.approximate_count_lower_bound)
      : null,
    approximate_count_upper_bound: row.approximate_count_upper_bound != null
      && Number.isFinite(Number(row.approximate_count_upper_bound))
      ? Number(row.approximate_count_upper_bound)
      : null,
    delivery_status: row.delivery_status ?? null,
    operation_status: row.operation_status ?? null,
    time_created: row.time_created != null ? String(row.time_created) : null,
    time_updated: row.time_updated != null ? String(row.time_updated) : null,
  })).filter((row: { id: string }) => Boolean(row.id))

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    customAudiences,
    paging: res?.paging || null,
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

const META_CREATIVE_FIELDS = 'id,name,object_story_spec,asset_feed_spec,degrees_of_freedom_spec,creative_asset_groups_spec,object_story_id,effective_object_story_id,instagram_actor_id,thumbnail_url,image_url,video_id,url_tags'

const META_AD_WITH_CREATIVE_FIELDS
  = `id,name,status,configured_status,effective_status,creative{${META_CREATIVE_FIELDS}},tracking_specs,conversion_domain,issues_info,recommendations,ad_review_feedback,adset_id,campaign_id`

export async function metaGetAd(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaGetAdSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const ad = await graph(metaGraphUrl(creds.apiVersion, `/${input.adId}`), {
    query: {
      fields: META_AD_WITH_CREATIVE_FIELDS,
      access_token: creds.accessToken,
    },
  })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    ad,
  }
}

export async function metaGetCreative(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaGetCreativeSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const creative = await graph(metaGraphUrl(creds.apiVersion, `/${input.creativeId}`), {
    query: {
      fields: META_CREATIVE_FIELDS,
      access_token: creds.accessToken,
    },
  })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    creative,
  }
}

export async function metaListCreatives(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListCreativesSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const query: Record<string, string | number | undefined> = {
    fields: 'id,name,object_story_spec,thumbnail_url,status',
    limit: input.limit,
    access_token: creds.accessToken,
  }
  if (input.after)
    query.after = input.after

  const res = await graph(metaGraphUrl(creds.apiVersion, `/${actPath(creds.adAccountId)}/adcreatives`), { query })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    creatives: res?.data || [],
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
    advantageAudience: input.advantageAudience,
  })

  let pageId: string | null = null
  let whatsappPhone: string | undefined
  if (isMessagingDestination(destinationType)) {
    const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
    pageId = assertMetaPageId(tokenCtx.publicConfig.page_id)
    if (destinationType === 'WHATSAPP')
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

  if (isMessagingDestination(destinationType)) {
    assertMessagingAdsetCompatibility({
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
    isDynamicCreative: input.isDynamicCreative === true,
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
  if (input.isDynamicCreative === true) {
    budgetNotes.push(
      'is_dynamic_creative=true — ads devem usar creativeType=DYNAMIC_CREATIVE_LEGACY + assetFeed.',
    )
  }
  if (dryRun) {
    budgetNotes.push('Moeda da conta não consultada no dry-run (sem Graph). Use listAdAccounts se precisar.')
    budgetNotes.push('Ownership da campanha será validado na execução (dryRun: false).')
  }
  if (isMessagingDestination(destinationType)) {
    budgetNotes.push(`destination_type=${destinationType} · promoted_object.page_id=${pageId}`)
    if (whatsappPhone)
      budgetNotes.push(`whatsapp_phone_number=${whatsappPhone}`)
    if (campaignObjective)
      budgetNotes.push(`campaign.objective=${campaignObjective}`)
    else if (dryRun)
      budgetNotes.push('Informe campaignObjective no dry-run para validar matriz de destino; na execução a Graph confirma.')
  }

  const targetingNote = resolved.source === 'template'
    ? `targetingTemplate: ${resolved.targetingTemplate} — ${resolved.summary}`
    : `targeting: custom — ${resolved.summary}`
  const advantageNote = `advantage_audience=${resolved.advantageAudience}`

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
        input.isDynamicCreative === true ? 'isDynamicCreative: true' : null,
        targetingNote,
        advantageNote,
        `billing_event=${input.billingEvent} · optimization_goal=${input.optimizationGoal}`,
        `ad_account: ${creds.adAccountId}${currency ? ` (${currency})` : ''}`,
        ...budgetNotes,
        'dryRun=true (default): nenhuma mutação enviada à Graph API.',
      ].filter((n): n is string => Boolean(n)),
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
        isDynamicCreative: input.isDynamicCreative === true,
        pageId,
        whatsappPhoneNumber: whatsappPhone ?? null,
        targetingTemplate: resolved.targetingTemplate,
        targeting: resolved.targeting,
        targetingSummary: resolved.summary,
        targetingSource: resolved.source,
        advantageAudience: resolved.advantageAudience,
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
        advantageAudience: resolved.advantageAudience,
        destinationType,
        isDynamicCreative: input.isDynamicCreative === true,
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
      isDynamicCreative: input.isDynamicCreative === true,
      pageId,
      whatsappPhoneNumber: whatsappPhone ?? null,
      targetingTemplate: resolved.targetingTemplate,
      targeting: resolved.targeting,
      targetingSummary: resolved.summary,
      targetingSource: resolved.source,
      advantageAudience: resolved.advantageAudience,
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
        isDynamicCreative: result.isDynamicCreative,
        pageId: result.pageId,
        targetingTemplate: result.targetingTemplate,
        targeting: result.targeting,
        targetingSource: result.targetingSource,
        advantageAudience: result.advantageAudience,
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
 * Create AdCreative + Ad (or ad from existing creativeId).
 * creativeId XOR creative input. IMAGE|VIDEO|CAROUSEL|DYNAMIC_CREATIVE_LEGACY|CATALOG.
 * Optional Advantage+ degreesOfFreedomSpec. dryRun default true — no uploads/mutations.
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
  const reuseCreativeId = input.creativeId ? String(input.creativeId).trim() : null
  const creativeType = reuseCreativeId
    ? null
    : normalizeMetaAdCreativeType(input.creativeType)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const mediaCtx = {
    apiVersion: creds.apiVersion,
    accessToken: creds.accessToken,
    adAccountId: creds.adAccountId,
    graph,
  }

  let libraryAsset: LibraryImageAsset | null = null
  if (input.assetId)
    libraryAsset = await loadLibraryImageAsset(ctx.client, input.tenantId, input.assetId)

  const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
  const pageToken = decryptSecret(tokenCtx.config.page_access_token_enc)
  let pageId: string | null = null
  if (!reuseCreativeId) {
    pageId = assertMetaPageCreativeReady({
      pageId: tokenCtx.publicConfig.page_id,
      pageAccessToken: pageToken,
    })
  }

  const callToAction = forcedCallToActionForDestination(
    destinationType,
    input.callToAction ?? 'LEARN_MORE',
  )
  const creativeName = input.creativeName || `${input.name} Creative`
  const message = input.message ?? ''
  const instagramActorId = destinationType === 'INSTAGRAM_DIRECT'
    ? (tokenCtx.publicConfig.instagram_business_account_id
      ? String(tokenCtx.publicConfig.instagram_business_account_id).trim()
      : '')
    : undefined
  if (destinationType === 'INSTAGRAM_DIRECT' && !reuseCreativeId && !instagramActorId) {
    throw new MetaAdsToolError(
      'META_INSTAGRAM_ACTOR_REQUIRED',
      'destinationType=INSTAGRAM_DIRECT exige instagram_business_account_id na integração Meta.',
      400,
    )
  }

  // Resolve media uploads only on execute (dryRun never hits Graph upload).
  let resolvedImageHash = input.imageHash ?? null
  let resolvedImageUrl = input.imageUrl ?? null
  let resolvedVideoId = input.videoId ?? null

  let assetFeed: AssetFeedSpecInput | undefined = input.assetFeed as AssetFeedSpecInput | undefined
  if (creativeType === 'DYNAMIC_CREATIVE_LEGACY' && assetFeed) {
    // Promote top-level message/headline into asset feed when omitted.
    if (!assetFeed.bodies?.length && message) {
      assetFeed = { ...assetFeed, bodies: [{ text: message }] }
    }
    if (!assetFeed.titles?.length && input.headline) {
      assetFeed = { ...assetFeed, titles: [{ text: input.headline }] }
    }
  }

  const degreesOfFreedom: DegreesOfFreedomSpecInput | undefined = input.degreesOfFreedomSpec
    ? { creativeFeaturesSpec: input.degreesOfFreedomSpec.creativeFeaturesSpec as DegreesOfFreedomSpecInput['creativeFeaturesSpec'] }
    : undefined

  let creativeBody: Record<string, unknown> | null = null
  if (!reuseCreativeId && pageId && creativeType) {
    // On dryRun, keep picture/url fields; uploads skipped. assetId already tenant-checked.
    if (!dryRun && creativeType === 'IMAGE' && libraryAsset && !input.imageHash) {
      const bytes = await downloadLibraryImageBytes(ctx.client, libraryAsset)
      const uploaded = await uploadImage(mediaCtx, { bytes, name: libraryAsset.name, mimeType: libraryAsset.mimeType }, { dryRun: false })
      resolvedImageHash = uploaded.imageHash
      resolvedImageUrl = null
    }
    else if (!dryRun && creativeType === 'IMAGE' && input.sourceBase64 && !input.imageHash) {
      const uploaded = await uploadImage(mediaCtx, { sourceBase64: input.sourceBase64, name: input.name }, { dryRun: false })
      resolvedImageHash = uploaded.imageHash
      resolvedImageUrl = null
    }
    else if (!dryRun && creativeType === 'IMAGE' && input.imageUrl && !input.imageHash) {
      const uploaded = await uploadImage(mediaCtx, { imageUrl: input.imageUrl }, { dryRun: false })
      resolvedImageHash = uploaded.imageHash
      resolvedImageUrl = null
    }
    if (!dryRun && creativeType === 'VIDEO' && input.videoUrl && !input.videoId) {
      const uploaded = await uploadVideo(mediaCtx, {
        videoUrl: input.videoUrl,
        title: input.headline,
      }, { dryRun: false })
      resolvedVideoId = uploaded.videoId
    }

    creativeBody = buildMetaCreateAdCreativeBodyByType({
      creativeName,
      pageId,
      creativeType,
      destinationType,
      website: destinationType === 'WEBSITE' && creativeType !== 'DYNAMIC_CREATIVE_LEGACY'
        ? {
            message,
            linkUrl: input.linkUrl!,
            callToAction,
            headline: input.headline,
            description: input.description,
            imageUrl: resolvedImageUrl ?? undefined,
            imageHash: resolvedImageHash ?? undefined,
          }
        : undefined,
      whatsapp: isMessagingDestination(destinationType)
        ? {
            message,
            headline: input.headline,
            description: input.description,
            imageUrl: resolvedImageUrl ?? undefined,
            imageHash: resolvedImageHash ?? undefined,
            welcomeMessage: (creativeType === 'IMAGE' || creativeType === 'VIDEO' || creativeType === 'CAROUSEL')
              ? input.welcomeMessage
              : undefined,
          }
        : undefined,
      videoId: resolvedVideoId
        ?? (dryRun && input.videoUrl ? '(dryRun — video_id após upload)' : undefined),
      childAttachments: input.childAttachments,
      assetFeed,
      degreesOfFreedom,
      productSetId: input.productSetId,
      instagramActorId,
    })
  }

  let adsetName: string | null = null
  let campaignId: string | null = null
  let adsetDestinationType: string | null = null
  if (!dryRun) {
    const adset = await graph(metaGraphUrl(creds.apiVersion, `/${input.adsetId}`), {
      query: {
        fields: 'id,name,account_id,campaign_id,status,effective_status,destination_type,is_dynamic_creative',
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

    if (adsetDestinationType) {
      const normalizedAdset = normalizeAdsetDestinationType(adsetDestinationType)
      if (normalizedAdset !== destinationType) {
        throw new MetaAdsToolError(
          'ADSET_DESTINATION_MISMATCH',
          `Criativo ${destinationType} exige adset com destination_type=${destinationType} (adset atual: ${adsetDestinationType}).`,
          400,
          { adsetId: input.adsetId, adsetDestinationType, destinationType },
        )
      }
    }

    if (creativeType === 'DYNAMIC_CREATIVE_LEGACY' && adset?.is_dynamic_creative !== true) {
      throw new MetaAdsToolError(
        'ADSET_DYNAMIC_CREATIVE_REQUIRED',
        'DYNAMIC_CREATIVE_LEGACY exige adset com is_dynamic_creative=true (configure no Ads Manager ou API).',
        400,
        { adsetId: input.adsetId },
      )
    }

    if (creativeType === 'CATALOG' && input.catalogId && input.productSetId) {
      await assertProductSetOwned(mediaCtx, {
        catalogId: input.catalogId,
        productSetId: input.productSetId,
      })
    }

    if (reuseCreativeId) {
      const creative = await graph(metaGraphUrl(creds.apiVersion, `/${reuseCreativeId}`), {
        query: {
          fields: 'id,name,account_id',
          access_token: creds.accessToken,
        },
      })
      assertAdAccountOwnership({
        objectAccountId: creative?.account_id,
        tenantAdAccountId: creds.adAccountId,
        code: 'CREATIVE_TENANT_MISMATCH',
        message: 'AdCreative não pertence à ad account do tenant.',
      })
    }
  }

  const compiledTracking = compileAdTracking(input)
  if (compiledTracking.trackingSpecs.length) {
    await assertTrackingSpecsOwned({
      apiVersion: creds.apiVersion,
      accessToken: creds.accessToken,
      adAccountId: creds.adAccountId,
      graph,
      publicConfig: creds.publicConfig,
    }, compiledTracking.trackingSpecs)
  }

  const creativePath = `/${actPath(creds.adAccountId)}/adcreatives`
  const adPath = `/${actPath(creds.adAccountId)}/ads`
  const previewAdBody: Record<string, unknown> = {
    name: input.name,
    adset_id: input.adsetId,
    creative: { creative_id: reuseCreativeId || '(após create creative)' },
    status,
  }
  applyTrackingToAdGraphBody(previewAdBody, compiledTracking)
  const previewBody = {
    creative: reuseCreativeId ? { creative_id: reuseCreativeId } : creativeBody,
    ad: previewAdBody,
  }

  const mediaNotes: string[] = []
  if (reuseCreativeId)
    mediaNotes.push(`reuse creativeId: ${reuseCreativeId}`)
  else
    mediaNotes.push(`creativeType: ${creativeType}`)
  if (creativeType === 'VIDEO' && resolvedVideoId)
    mediaNotes.push(`mídia: video_id=${resolvedVideoId}`)
  else if (creativeType === 'VIDEO' && input.videoUrl)
    mediaNotes.push(`mídia: videoUrl (upload ${dryRun ? 'adiado — dryRun' : 'no execute'})`)
  else if (creativeType === 'CAROUSEL')
    mediaNotes.push(`mídia: carousel ${input.childAttachments?.length ?? 0} cards`)
  else if (creativeType === 'DYNAMIC_CREATIVE_LEGACY')
    mediaNotes.push('mídia: asset_feed_spec (DYNAMIC_CREATIVE_LEGACY)')
  else if (creativeType === 'CATALOG')
    mediaNotes.push(`mídia: catalog product_set=${input.productSetId}`)
  else if (resolvedImageHash)
    mediaNotes.push(`mídia: image_hash=${resolvedImageHash}`)
  else if (libraryAsset)
    mediaNotes.push(`mídia: biblioteca assetId=${libraryAsset.id} (${libraryAsset.name}; upload ${dryRun ? 'adiado — dryRun' : 'no execute'})`)
  else if (resolvedImageUrl)
    mediaNotes.push(`mídia: imageUrl=${resolvedImageUrl}`)
  if (degreesOfFreedom)
    mediaNotes.push('Advantage+ degrees_of_freedom_spec presente')
  if (status === 'ACTIVE')
    mediaNotes.push('ATENÇÃO: criando ACTIVE — gasto potencial imediato.')
  if (dryRun)
    mediaNotes.push('Ownership / uploads serão validados na execução (dryRun: false).')
  if (isMessagingDestination(destinationType)) {
    const cta = META_MESSAGING_CTA_BY_DESTINATION[destinationType]
    mediaNotes.push(`Click-to-Message: CTA ${cta.type} + app_destination=${cta.appDestination}.`)
  }
  mediaNotes.push(...summarizeTrackingForPreview(compiledTracking))

  const linkNote = destinationType === 'WEBSITE'
    ? `link: ${input.linkUrl ?? '(assetFeed.linkUrls / creativeId)'}`
    : 'link: (protocolo messaging Meta — sem linkUrl de site do usuário)'

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path: reuseCreativeId ? adPath : `${creativePath} then ${adPath}`,
      body: previewBody,
      notes: [
        `Anúncio "${input.name}" → ${status}`,
        reuseCreativeId ? `creativeId: ${reuseCreativeId}` : `creativeType: ${creativeType}`,
        `destinationType: ${destinationType}`,
        `adset_id: ${input.adsetId}${adsetName ? ` (${adsetName})` : ''}`,
        pageId
          ? `page_id: ${pageId}${tokenCtx.publicConfig.page_name ? ` (${tokenCtx.publicConfig.page_name})` : ''}`
          : 'page_id: (reuse creativeId — page check skipped)',
        linkNote,
        message
          ? `message: ${message.slice(0, 120)}${message.length > 120 ? '…' : ''}`
          : 'message: (omitido)',
        `CTA: ${callToAction}`,
        `ad_account: ${creds.adAccountId}`,
        ...mediaNotes,
        'dryRun=true (default): nenhuma mutação/upload enviada à Graph API.',
      ],
    },
    async () => {
      let creativeId = reuseCreativeId
      if (!creativeId) {
        if (!creativeBody) {
          throw new MetaAdsToolError(
            'CREATIVE_BODY_REQUIRED',
            'Falha interna: creativeBody ausente.',
            500,
          )
        }
        const createdCreative = await graphWrite(graph, metaGraphUrl(creds.apiVersion, creativePath), {
          method: 'POST',
          query: { access_token: creds.accessToken },
          body: creativeBody,
        }, creativeBody)
        creativeId = createdCreative?.id ? String(createdCreative.id) : null
        if (!creativeId) {
          throw new MetaAdsToolError(
            'META_CREATE_CREATIVE_FAILED',
            'Meta não retornou id do AdCreative criado.',
            502,
            { response: createdCreative, request_payload: creativeBody },
          )
        }
      }

      const adBody: Record<string, unknown> = {
        name: input.name,
        adset_id: input.adsetId,
        creative: { creative_id: creativeId },
        status,
      }
      applyTrackingToAdGraphBody(adBody, compiledTracking)

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
          'Criativo ok/reusado, mas falhou ao criar o anúncio. Verifique o creativeId no Ads Manager.',
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
          'Meta não retornou id do anúncio.',
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
        creativeType,
        status,
        pageId,
        destinationType,
        linkUrl: destinationType === 'WEBSITE' ? (input.linkUrl ?? null) : null,
        message: message || null,
        headline: input.headline ?? null,
        description: input.description ?? null,
        callToAction,
        welcomeMessage: input.welcomeMessage ?? null,
        imageUrl: resolvedImageUrl,
        imageHash: resolvedImageHash,
        assetId: input.assetId ?? null,
        videoId: resolvedVideoId,
        childAttachmentsCount: input.childAttachments?.length ?? null,
        productSetId: input.productSetId ?? null,
        catalogId: input.catalogId ?? null,
        reusedCreative: Boolean(reuseCreativeId),
        advantagePlus: Boolean(degreesOfFreedom),
        trackingSpecs: compiledTracking.trackingSpecs.length ? compiledTracking.trackingSpecs : null,
        conversionDomain: compiledTracking.conversionDomain,
        success: true as const,
        dryRun: false as const,
        warning: 'Anúncio criado na Meta Graph API. Verifique thumbnail/políticas no Ads Manager.',
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
        creativeType,
        creativeId: reuseCreativeId,
        destinationType,
        linkUrl: destinationType === 'WEBSITE' ? (input.linkUrl ?? null) : null,
        trackingSpecs: compiledTracking.trackingSpecs.length ? compiledTracking.trackingSpecs : null,
        conversionDomain: compiledTracking.conversionDomain,
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
      creativeId: reuseCreativeId,
      name: input.name,
      creativeName,
      creativeType,
      status,
      pageId,
      destinationType,
      linkUrl: destinationType === 'WEBSITE' ? (input.linkUrl ?? null) : null,
      message: message || null,
      headline: input.headline ?? null,
      description: input.description ?? null,
      callToAction,
      welcomeMessage: input.welcomeMessage ?? null,
      imageUrl: resolvedImageUrl,
      imageHash: resolvedImageHash,
      assetId: input.assetId ?? null,
      videoId: resolvedVideoId,
      childAttachmentsCount: input.childAttachments?.length ?? null,
      productSetId: input.productSetId ?? null,
      catalogId: input.catalogId ?? null,
      reusedCreative: Boolean(reuseCreativeId),
      advantagePlus: Boolean(degreesOfFreedom),
      trackingSpecs: compiledTracking.trackingSpecs.length ? compiledTracking.trackingSpecs : null,
      conversionDomain: compiledTracking.conversionDomain,
      success: true as const,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: nenhum anúncio/criativo/upload criado. Reenvie com dryRun: false para executar.',
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
        creativeType: result.creativeType,
        destinationType: result.destinationType,
        linkUrl: result.linkUrl,
        message: result.message,
        headline: result.headline,
        description: result.description,
        callToAction: result.callToAction,
        imageUrl: result.imageUrl,
        imageHash: result.imageHash,
        assetId: result.assetId,
        videoId: result.videoId,
        adAccountId: creds.adAccountId,
        trackingSpecs: result.trackingSpecs,
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
    advantageAudience: input.advantageAudience,
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
  const advantageNote = `advantage_audience=${resolved.advantageAudience}`

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path: `/${input.adsetId}`,
      body: graphBody,
      notes: [
        `Adset ${input.adsetId}${adset?.name ? ` (${adset.name})` : ''}`,
        targetingNote,
        advantageNote,
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
        advantageAudience: resolved.advantageAudience,
        before: { targeting: beforeTargeting },
        after: {
          targetingTemplate: resolved.targetingTemplate,
          targeting: resolved.targeting,
          targetingSource: resolved.source,
          advantageAudience: resolved.advantageAudience,
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
        advantageAudience: resolved.advantageAudience,
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
      advantageAudience: resolved.advantageAudience,
      before: { targeting: beforeTargeting },
      after: {
        targetingTemplate: resolved.targetingTemplate,
        targeting: resolved.targeting,
        targetingSource: resolved.source,
        advantageAudience: resolved.advantageAudience,
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
        advantageAudience: resolved.advantageAudience,
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
 * Update ad media IMAGE|VIDEO|CAROUSEL via new AdCreative + swap. Preserves existing copy when possible.
 */
export async function metaUpdateAdMedia(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaUpdateAdMediaSchema.parse(raw)
  assertWriteConfirmation(input)

  const dryRun = resolveDryRun(input.dryRun, true)
  const creativeType = normalizeMetaAdCreativeType(input.creativeType)
  const { creds, ad, before } = await fetchOwnedAdWithCreative(ctx, {
    tenantId: input.tenantId,
    adAccountId: input.adAccountId,
    adId: input.adId,
  })
  const graph = fetchGraph(ctx)
  const mediaCtx = {
    apiVersion: creds.apiVersion,
    accessToken: creds.accessToken,
    adAccountId: creds.adAccountId,
    graph,
  }

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

  let resolvedImageHash = input.imageHash ?? null
  let resolvedImageUrl = input.imageUrl ?? null
  let resolvedVideoId = input.videoId ?? null

  if (!dryRun && creativeType === 'IMAGE' && input.imageUrl && !input.imageHash) {
    const uploaded = await uploadImage(mediaCtx, { imageUrl: input.imageUrl }, { dryRun: false })
    resolvedImageHash = uploaded.imageHash
    resolvedImageUrl = null
  }
  if (!dryRun && creativeType === 'VIDEO' && input.videoUrl && !input.videoId) {
    const uploaded = await uploadVideo(mediaCtx, { videoUrl: input.videoUrl }, { dryRun: false })
    resolvedVideoId = uploaded.videoId
  }

  const degreesOfFreedom: DegreesOfFreedomSpecInput | undefined = input.degreesOfFreedomSpec
    ? { creativeFeaturesSpec: input.degreesOfFreedomSpec.creativeFeaturesSpec as DegreesOfFreedomSpecInput['creativeFeaturesSpec'] }
    : undefined

  const creativeBody = buildMetaCreateAdCreativeBodyByType({
    creativeName,
    pageId,
    creativeType: creativeType === 'VIDEO' || creativeType === 'CAROUSEL' ? creativeType : 'IMAGE',
    destinationType: 'WEBSITE',
    website: {
      message: before.message,
      linkUrl: before.linkUrl,
      callToAction,
      headline: before.headline ?? undefined,
      description: before.description ?? undefined,
      imageUrl: creativeType === 'IMAGE' ? (resolvedImageUrl ?? undefined) : undefined,
      imageHash: creativeType === 'IMAGE' ? (resolvedImageHash ?? undefined) : undefined,
    },
    videoId: creativeType === 'VIDEO'
      ? (resolvedVideoId ?? (dryRun && input.videoUrl ? '(dryRun — video_id após upload)' : undefined))
      : undefined,
    childAttachments: creativeType === 'CAROUSEL' ? input.childAttachments : undefined,
    degreesOfFreedom,
  })

  const afterMedia = {
    ...before,
    pageId,
    imageHash: creativeType === 'IMAGE' ? resolvedImageHash : before.imageHash,
    imageUrl: creativeType === 'IMAGE' ? resolvedImageUrl : before.imageUrl,
    videoId: creativeType === 'VIDEO' ? resolvedVideoId : null,
    creativeType,
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
        `creativeType: ${creativeType}`,
        creativeType === 'VIDEO'
          ? `mídia: video=${resolvedVideoId || input.videoUrl}`
          : creativeType === 'CAROUSEL'
            ? `mídia: carousel ${input.childAttachments?.length ?? 0} cards`
            : (resolvedImageHash
                ? `mídia: image_hash=${resolvedImageHash}`
                : `mídia: imageUrl=${resolvedImageUrl}`),
        'Copy preservada do criativo atual.',
        dryRun
          ? 'dryRun=true (default): nenhuma mutação/upload enviada à Graph API.'
          : 'Mutação será enviada à Graph.',
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

export async function metaGetCapabilities(ctx: MetaToolContext, raw: unknown) {
  const input = metaGetCapabilitiesSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    capabilities: getMetaCapabilities(creds.apiVersion),
  }
}

export async function metaUploadImage(ctx: MetaToolContext, raw: unknown) {
  const input = metaUploadImageSchema.parse(raw)
  assertWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const mediaCtx = {
    apiVersion: creds.apiVersion,
    accessToken: creds.accessToken,
    adAccountId: creds.adAccountId,
    graph,
  }

  let libraryAsset: LibraryImageAsset | null = null
  let bytes: Buffer | undefined
  let inputMimeType: string | undefined
  if (input.assetId) {
    libraryAsset = await loadLibraryImageAsset(ctx.client, input.tenantId, input.assetId)
    inputMimeType = libraryAsset.mimeType
    if (!dryRun)
      bytes = await downloadLibraryImageBytes(ctx.client, libraryAsset)
  }

  if (dryRun && libraryAsset) {
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      imageHash: '(dryRun — hash após upload)',
      reused: false,
      dryRun: true as const,
      width: libraryAsset.width,
      height: libraryAsset.height,
      mimeType: null as string | null,
      normalized: false,
      originalAssetId: input.assetId ?? null,
      assetId: input.assetId,
      name: input.name || libraryAsset.name,
      success: true as const,
      warning: 'Dry-run: nenhum upload. Reenvie dryRun:false para executar.',
    }
  }

  const result = await uploadImage(
    mediaCtx,
    {
      imageUrl: input.imageUrl,
      imageHash: input.imageHash,
      bytes,
      sourceBase64: input.sourceBase64,
      mimeType: inputMimeType,
      name: input.name || libraryAsset?.name,
    },
    { dryRun },
  )
  const width = result.width ?? libraryAsset?.width ?? null
  const height = result.height ?? libraryAsset?.height ?? null
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    imageHash: result.imageHash,
    reused: result.reused,
    dryRun: result.dryRun,
    width,
    height,
    mimeType: result.mimeType ?? null,
    normalized: result.normalized ?? false,
    originalAssetId: input.assetId ?? null,
    assetId: input.assetId ?? null,
    name: input.name || libraryAsset?.name || null,
    success: true as const,
    warning: dryRun
      ? 'Dry-run: nenhum upload. Reenvie dryRun:false para executar.'
      : (result.reused ? 'image_hash reutilizado.' : 'Imagem enviada à Meta (adimages).'),
  }
}

export async function metaUploadVideo(ctx: MetaToolContext, raw: unknown) {
  const input = metaUploadVideoSchema.parse(raw)
  assertWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const result = await uploadVideo(
    { apiVersion: creds.apiVersion, accessToken: creds.accessToken, adAccountId: creds.adAccountId, graph },
    {
      videoUrl: input.videoUrl,
      videoId: input.videoId,
      title: input.title,
      description: input.description,
    },
    { dryRun },
  )
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    ...result,
    success: true as const,
    warning: dryRun
      ? 'Dry-run: nenhum upload. Reenvie dryRun:false. Após upload, use meta_get_video_status.'
      : (result.reused ? 'video_id reutilizado.' : 'Vídeo enviado (advideos). Aguarde processing via meta_get_video_status.'),
  }
}

export async function metaGetVideoStatusTool(ctx: MetaToolContext, raw: unknown) {
  const input = metaGetVideoStatusSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const status = await getVideoStatus(
    { apiVersion: creds.apiVersion, accessToken: creds.accessToken, adAccountId: creds.adAccountId, graph },
    input.videoId,
  )
  return { tenantId: input.tenantId, adAccountId: creds.adAccountId, ...status }
}

export async function metaListCatalogs(ctx: MetaToolContext, raw: unknown) {
  const input = metaListCatalogsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const catalogs = await listProductCatalogs(
    { apiVersion: creds.apiVersion, accessToken: creds.accessToken, adAccountId: creds.adAccountId, graph },
    { limit: input.limit },
  )
  return { tenantId: input.tenantId, adAccountId: creds.adAccountId, catalogs }
}

export async function metaListProductSets(ctx: MetaToolContext, raw: unknown) {
  const input = metaListProductSetsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const productSets = await listProductSets(
    { apiVersion: creds.apiVersion, accessToken: creds.accessToken, adAccountId: creds.adAccountId, graph },
    { catalogId: input.catalogId, limit: input.limit },
  )
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    catalogId: input.catalogId,
    productSets,
  }
}

export async function metaListPixels(ctx: MetaToolContext, raw: unknown) {
  const input = metaListPixelsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const pixels = await listAdAccountPixels(
    { apiVersion: creds.apiVersion, accessToken: creds.accessToken, adAccountId: creds.adAccountId, graph },
    { limit: input.limit },
  )
  const configuredPixelId = creds.publicConfig.pixel_id
    ? String(creds.publicConfig.pixel_id).trim() || null
    : null
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    configuredPixelId,
    pixels,
  }
}

export async function metaListDatasets(ctx: MetaToolContext, raw: unknown) {
  const input = metaListDatasetsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const datasets = await listAdAccountDatasets(
    { apiVersion: creds.apiVersion, accessToken: creds.accessToken, adAccountId: creds.adAccountId, graph },
    { limit: input.limit },
  )
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    datasets,
  }
}

/**
 * Update tracking_specs on an existing Ad (Pixel site + offline Dataset).
 * GET ad for ownership; Meta overwrites tracking_specs — default merge with snapshot.
 * dryRun default true.
 */
export async function metaUpdateAdTracking(ctx: MetaToolContext, raw: unknown) {
  const input = metaUpdateAdTrackingSchema.parse(raw)
  assertWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const compiled = compileAdTracking(input)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const trackingCtx = {
    apiVersion: creds.apiVersion,
    accessToken: creds.accessToken,
    adAccountId: creds.adAccountId,
    graph,
    publicConfig: creds.publicConfig,
  }

  const ad = await graph(metaGraphUrl(creds.apiVersion, `/${input.adId}`), {
    query: {
      fields: 'id,name,account_id,tracking_specs,conversion_domain',
      access_token: creds.accessToken,
    },
  })
  assertAdAccountOwnership({
    objectAccountId: ad?.account_id,
    tenantAdAccountId: creds.adAccountId,
    code: 'AD_TENANT_MISMATCH',
    message: 'Anúncio não pertence à ad account do tenant.',
  })

  if (compiled.trackingSpecs.length)
    await assertTrackingSpecsOwned(trackingCtx, compiled.trackingSpecs)

  const mergedSpecs = compiled.trackingSpecs.length
    ? mergeTrackingSpecs({
        existing: ad?.tracking_specs,
        incoming: compiled.trackingSpecs,
        replace: Boolean(input.replaceTrackingSpecs),
      })
    : undefined

  const adPath = `/${input.adId}`
  const body: Record<string, unknown> = {}
  applyTrackingToAdGraphBody(
    body,
    { trackingSpecs: compiled.trackingSpecs, conversionDomain: compiled.conversionDomain },
    mergedSpecs,
  )
  if (!Object.keys(body).length) {
    throw new MetaAdsToolError(
      'TRACKING_SPEC_INVALID',
      'Nenhum campo Graph de tracking para enviar.',
      400,
    )
  }

  const mergeNote = input.replaceTrackingSpecs
    ? 'replaceTrackingSpecs=true: POST substitui tracking_specs (docs Meta: overwrite).'
    : 'Merge com tracking_specs atual (GET + append). Meta POST overwrite — enviamos o conjunto final.'

  const run = await withDryRun(
    dryRun,
    {
      method: 'POST',
      path: adPath,
      body,
      notes: [
        `Ad ${input.adId}${ad?.name ? ` (${ad.name})` : ''}: tracking_specs`,
        ...summarizeTrackingForPreview(compiled, mergedSpecs ?? compiled.trackingSpecs),
        mergeNote,
        dryRun ? 'dryRun=true: nenhuma mutação.' : 'POST tracking_specs no Ad.',
      ],
    },
    async () => {
      await graphWrite(graph, metaGraphUrl(creds.apiVersion, adPath), {
        method: 'POST',
        query: { access_token: creds.accessToken },
        body,
      }, body)
      return { success: true as const }
    },
  )

  const trackingOut = {
    trackingSpecs: (mergedSpecs ?? compiled.trackingSpecs) as unknown,
    conversionDomain: compiled.conversionDomain,
  }

  if (run.dryRun) {
    await logMetaWriteAudit({
      tenantId: input.tenantId,
      action: 'meta.gpt.ad.tracking.preview',
      entityType: 'meta_ad',
      entityId: input.adId,
      dryRun: true,
      before: { tracking_specs: ad?.tracking_specs ?? null, conversion_domain: ad?.conversion_domain ?? null },
      after: { preview: run.preview, ...trackingOut, adAccountId: creds.adAccountId },
    })
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      adId: input.adId,
      name: ad?.name ? String(ad.name) : null,
      ...trackingOut,
      previousTrackingSpecs: ad?.tracking_specs ?? null,
      previousConversionDomain: ad?.conversion_domain ?? null,
      success: true as const,
      dryRun: true as const,
      preview: run.preview,
      warning: 'Dry-run: tracking não alterado. Reenvie dryRun: false para aplicar.',
    }
  }

  await logMetaWriteAudit(
    {
      tenantId: input.tenantId,
      action: 'meta.gpt.ad.tracking',
      entityType: 'meta_ad',
      entityId: input.adId,
      dryRun: false,
      before: { tracking_specs: ad?.tracking_specs ?? null, conversion_domain: ad?.conversion_domain ?? null },
      after: { ...trackingOut, adAccountId: creds.adAccountId },
    },
    ctx.client,
  )

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    adId: input.adId,
    name: ad?.name ? String(ad.name) : null,
    ...trackingOut,
    success: true as const,
    dryRun: false as const,
    warning: 'tracking_specs atualizado no anúncio. Confira Pixel/Dataset no Ads Manager.',
  }
}

export async function metaListExperiments(ctx: MetaToolContext, raw: unknown) {
  const input = metaListExperimentsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const listed = await listExperiments(
    { apiVersion: creds.apiVersion, accessToken: creds.accessToken, graph },
    creds.adAccountId,
    { limit: input.limit, businessId: creds.publicConfig.business_id },
  )
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    businessId: listed.businessId,
    userId: listed.userId,
    studies: listed.studies,
    paging: listed.paging,
    sources: listed.sources,
  }
}

async function loadOwnedAdsForExperiment(
  ctx: MetaToolContext,
  params: { tenantId: string, adAccountId?: string, adIds: string[] },
) {
  const ads = []
  for (const adId of params.adIds) {
    const owned = await fetchOwnedAdWithCreative(ctx, {
      tenantId: params.tenantId,
      adAccountId: params.adAccountId,
      adId,
    })
    ads.push(owned)
  }
  return ads
}

export async function metaCheckExperimentEligibility(ctx: MetaToolContext, raw: unknown) {
  const input = metaCheckExperimentEligibilitySchema.parse(raw)
  const adIds = [
    ...(input.adId ? [input.adId] : []),
    ...(input.adIds || []),
  ]
  if (!adIds.length && !input.adsetId && !input.campaignId) {
    throw new MetaAdsToolError(
      'EXPERIMENT_ELIGIBILITY_TARGET_REQUIRED',
      'Informe adId/adIds, adsetId ou campaignId para checar conflitos.',
      400,
    )
  }

  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const adsetIds = new Set<string>()
  const campaignIds = new Set<string>()
  if (input.adsetId)
    adsetIds.add(input.adsetId)
  if (input.campaignId)
    campaignIds.add(input.campaignId)

  if (adIds.length) {
    const owned = await loadOwnedAdsForExperiment(ctx, {
      tenantId: input.tenantId,
      adAccountId: input.adAccountId,
      adIds,
    })
    for (const row of owned) {
      if (row.ad?.adset_id)
        adsetIds.add(String(row.ad.adset_id))
      if (row.ad?.campaign_id)
        campaignIds.add(String(row.ad.campaign_id))
    }
  }

  const eligibility = await checkExperimentEligibility(
    { apiVersion: creds.apiVersion, accessToken: creds.accessToken, graph },
    {
      adAccountId: creds.adAccountId,
      businessId: creds.publicConfig.business_id,
      adIds,
      adsetIds: [...adsetIds],
      campaignIds: [...campaignIds],
    },
  )
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    adIds,
    ...eligibility,
  }
}

/**
 * Resolve media + create AdCreative + swap on a copied ad for experiment variations with media overrides.
 * Reuses meta_upload_image / meta_upload_video pipeline; never mutates the base ad.
 */
async function applyMediaOverrideToAd(
  ctx: MetaToolContext,
  params: {
    variation: ExperimentVariationInput
    adId: string
    pageId: string
    objectStorySpec: Record<string, unknown> | null
    mediaCtx: { apiVersion: string, accessToken: string, adAccountId: string, graph: MetaGraphFetch }
    creds: { apiVersion: string, accessToken: string, adAccountId: string }
    tenantId: string
  },
) {
  const { variation, adId, pageId, objectStorySpec, mediaCtx, creds } = params
  const graph = mediaCtx.graph

  if (variation.videoAssetId) {
    throw new MetaAdsToolError(
      'VIDEO_ASSET_NOT_SUPPORTED',
      'videoAssetId (Biblioteca de vídeo) não é suportado em variações de experiment. Use videoId ou videoUrl.',
      400,
    )
  }

  const resolvedType = variation.creativeType
    || (variation.videoId || variation.videoUrl ? 'VIDEO'
      : variation.childAttachments?.length ? 'CAROUSEL'
        : 'IMAGE') as 'IMAGE' | 'VIDEO' | 'CAROUSEL'

  let resolvedImageHash: string | null = variation.imageHash ?? null
  let resolvedVideoId: string | null = variation.videoId ?? null

  if (variation.assetId && !resolvedImageHash) {
    const libraryAsset = await loadLibraryImageAsset(ctx.client, params.tenantId, variation.assetId)
    const bytes = await downloadLibraryImageBytes(ctx.client, libraryAsset)
    const uploaded = await uploadImage(mediaCtx, { bytes, name: libraryAsset.name }, { dryRun: false })
    resolvedImageHash = uploaded.imageHash
  }
  else if (variation.imageUrl && !resolvedImageHash) {
    const uploaded = await uploadImage(mediaCtx, { imageUrl: variation.imageUrl }, { dryRun: false })
    resolvedImageHash = uploaded.imageHash
  }

  if (variation.videoUrl && !resolvedVideoId) {
    const uploaded = await uploadVideo(mediaCtx, { videoUrl: variation.videoUrl }, { dryRun: false })
    resolvedVideoId = uploaded.videoId
  }

  const baseSpec = objectStorySpec ? structuredClone(objectStorySpec) as Record<string, unknown> : {}
  const baseLinkData = baseSpec.link_data as Record<string, unknown> | undefined
  const baseVideoData = baseSpec.video_data as Record<string, unknown> | undefined

  const baseMessage = variation.message
    ?? (baseLinkData?.message as string | undefined)
    ?? (baseVideoData?.message as string | undefined)
    ?? ''
  const baseHeadline = variation.headline
    ?? (baseLinkData?.name as string | undefined)
    ?? (baseVideoData?.title as string | undefined)
  const baseDescription = variation.description
    ?? (baseLinkData?.description as string | undefined)
    ?? (baseVideoData?.link_description as string | undefined)
  const baseLinkUrl = variation.linkUrl
    ?? (baseLinkData?.link as string | undefined)
    ?? (baseVideoData?.link as string | undefined)
  const baseCta = variation.callToAction
    ?? (baseLinkData?.call_to_action as Record<string, unknown> | undefined)?.type as string | undefined
    ?? 'LEARN_MORE'

  const creativeName = `${adId} Experiment Variation ${Date.now()}`

  const creativeBody = buildMetaCreateAdCreativeBodyByType({
    creativeName,
    pageId,
    creativeType: resolvedType,
    destinationType: 'WEBSITE',
    website: {
      message: baseMessage,
      linkUrl: baseLinkUrl ?? 'https://placeholder.invalid',
      callToAction: baseCta,
      headline: baseHeadline,
      description: baseDescription,
      imageUrl: resolvedType === 'IMAGE' && !resolvedImageHash ? (variation.imageUrl ?? undefined) : undefined,
      imageHash: resolvedType === 'IMAGE' ? (resolvedImageHash ?? undefined) : undefined,
    },
    videoId: resolvedType === 'VIDEO' ? (resolvedVideoId ?? undefined) : undefined,
    childAttachments: resolvedType === 'CAROUSEL' ? variation.childAttachments?.map(card => ({
      link: card.link,
      name: card.name,
      description: card.description,
      imageHash: card.imageHash,
      videoId: card.videoId,
    })) : undefined,
  })

  const creativePath = `/${actPath(creds.adAccountId)}/adcreatives`
  const createdCreative = await graphWrite(graph, metaGraphUrl(creds.apiVersion, creativePath), {
    method: 'POST',
    query: { access_token: creds.accessToken },
    body: creativeBody,
  }, creativeBody)

  const creativeId = createdCreative?.id ? String(createdCreative.id) : null
  if (!creativeId) {
    throw new MetaAdsToolError(
      'META_CREATE_CREATIVE_FAILED',
      'Meta não retornou id do AdCreative criado para variação do experiment.',
      502,
      { response: createdCreative, request_payload: creativeBody },
    )
  }

  const swapBody = { creative: { creative_id: creativeId } }
  await graphWrite(graph, metaGraphUrl(creds.apiVersion, `/${adId}`), {
    method: 'POST',
    query: { access_token: creds.accessToken },
    body: swapBody,
  }, swapBody)

  return { creativeId, creativeType: resolvedType }
}

export async function metaCreateExperiment(ctx: MetaToolContext, raw: unknown) {
  const input = metaCreateExperimentSchema.parse(raw)
  assertWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
  const graph = fetchGraph(ctx)
  const studyOwner = (input.studyOwner || 'AUTO') as StudyOwnerStrategy
  if (input.baseAdId)
    assertCreativeTestVersionCount(1 + (input.variations || []).length)
  const svc = {
    apiVersion: creds.apiVersion,
    accessToken: creds.accessToken,
    graph,
    pageId: creds.publicConfig.page_id ?? null,
    pageAccessToken: decryptSecret(tokenCtx.config.page_access_token_enc) || null,
  }

  let cells = input.cells
  const copiedAds: { variationName: string | null, adId: string, copyBody: Record<string, unknown> }[] = []
  const baseAdId: string | null = input.baseAdId ?? null

  const rollbackCopiedAds = async () => {
    const copiedIds = copiedAds.map(row => row.adId)
    if (!copiedIds.length)
      return null
    return deleteCopiedAdsForFailedStudy(svc, copiedIds, { protectAdIds: [baseAdId] })
  }

  const formatRollback = (rollback: Awaited<ReturnType<typeof rollbackCopiedAds>>) => {
    if (!rollback)
      return undefined
    return {
      deleted: rollback.deleted,
      failed: rollback.failed.map(row => row.adId),
    }
  }

  const rethrowAfterCopyRollback = async (err: unknown): Promise<never> => {
    const rollback = await rollbackCopiedAds()
    const rolled = formatRollback(rollback)
    if (err instanceof MetaAdsToolError) {
      throw new MetaAdsToolError(
        err.code,
        rollback?.deleted.length
          ? `${err.message} Cópias do teste foram removidas automaticamente (${rollback.deleted.join(', ')}); o anúncio base foi preservado.`
          : err.message,
        err.statusCode,
        {
          ...(err.details && typeof err.details === 'object' ? err.details : {}),
          copiedAdsRolledBack: rolled,
          baseAdIdPreserved: baseAdId,
        },
      )
    }
    throw err
  }

  assertUserAccessTokenForAdStudies(svc)

  const owners = await resolveStudyCreateTargets(svc, {
    strategy: studyOwner,
    adAccountId: creds.adAccountId,
    configuredBusinessId: creds.publicConfig.business_id,
  })

  const experimentInputFromCells = (resolvedCells: NonNullable<typeof cells>) => ({
    name: input.name,
    description: input.description,
    type: input.type,
    cells: resolvedCells,
    startTime: input.startTime,
    endTime: input.endTime,
    creativeTestDailyBudget: input.creativeTestDailyBudget,
    creativeTestLifetimeBudgetPercentage: input.creativeTestLifetimeBudgetPercentage,
  })

  const dryRunNotes = (cellCount: number) => [
    `Creative Test ${input.type}: ${input.name}`,
    `studyOwner=${studyOwner} (ordem: ${owners.targets.map(t => t.ownerType).join(' → ')}).`,
    `Graph Ad Studies: ${owners.studiesGraphVersion} (META_ADS_STUDIES_GRAPH_VERSION; Ads permanece ${creds.apiVersion}).`,
    ...owners.targets.map(t => `Tentativa ${t.ownerType}: ${t.endpoint}`),
    owners.businessError && studyOwner === 'AUTO'
      ? `BUSINESS indisponível agora: ${owners.businessError}`
      : null,
    `cells: ${cellCount}`,
    'Cópias via POST /{adId}/copies uma única vez (status PAUSED). Fallback BUSINESS reutiliza as mesmas cópias.',
    'Variações com mídia (imageHash/imageUrl/assetId/videoId/videoUrl/childAttachments): novo AdCreative criado + swap no ad copiado.',
    'Rollback das cópias só depois de TODAS as tentativas falharem. Anúncio-base nunca é apagado.',
    'dryRun=true: nenhuma cópia, nenhum study, nenhum delete, nenhum upload.',
  ].filter((row): row is string => Boolean(row))

  if (input.baseAdId) {
    const variations = (input.variations || []) as ExperimentVariationInput[]
    const { ad } = await fetchOwnedAdWithCreative(ctx, {
      tenantId: input.tenantId,
      adAccountId: input.adAccountId,
      adId: input.baseAdId,
    })
    const objectStorySpec = ad?.creative?.object_story_spec && typeof ad.creative.object_story_spec === 'object'
      ? ad.creative.object_story_spec as Record<string, unknown>
      : null

    const eligibility = await checkExperimentEligibility(svc, {
      adAccountId: creds.adAccountId,
      businessId: creds.publicConfig.business_id,
      adIds: [input.baseAdId],
      adsetIds: ad?.adset_id ? [String(ad.adset_id)] : [],
      campaignIds: ad?.campaign_id ? [String(ad.campaign_id)] : [],
    })
    assertEligibleOrThrow(eligibility)

    const percents = evenTreatmentPercentages(1 + variations.length)
    const plannedCopies = variations.map((variation, index) => ({
      variationName: variation.name ?? null,
      copyBody: buildCopyAdGraphBody({
        variation,
        index,
        objectStorySpec,
      }),
    }))

    if (dryRun) {
      const plannedCells = [
        { name: 'Base', treatmentPercentage: percents[0]!, adId: input.baseAdId },
        ...plannedCopies.map((row, i) => ({
          name: row.variationName || `Variação ${i + 1}`,
          treatmentPercentage: percents[i + 1]!,
          adId: `(copy de ${input.baseAdId})`,
        })),
      ]
      const bodyPreview = buildCreateExperimentGraphBody(experimentInputFromCells(plannedCells.map(cell => ({
        ...cell,
        adId: typeof cell.adId === 'string' && cell.adId.startsWith('(copy')
          ? 'COPIED_AD_ID'
          : cell.adId,
      }))))
      return {
        tenantId: input.tenantId,
        adAccountId: creds.adAccountId,
        success: true as const,
        studyId: null,
        studyOwner: undefined,
        studyOwnerId: undefined,
        studiesGraphVersion: owners.studiesGraphVersion,
        type: 'SPLIT_TEST_V2' as const,
        name: input.name,
        baseAdId: input.baseAdId,
        plannedCopies,
        cells: plannedCells,
        attempts: owners.targets.map(t => ({
          ownerType: t.ownerType,
          ownerId: t.ownerId,
          graphVersion: t.graphVersion,
          endpoint: t.endpoint,
          success: false,
        })),
        copiedAdsRolledBack: undefined,
        baseAdIdPreserved: input.baseAdId,
        dryRun: true as const,
        preview: {
          dryRun: true as const,
          wouldMutate: true as const,
          method: 'POST',
          path: owners.targets[0]?.endpoint,
          plannedEndpoints: owners.targets.map(t => t.endpoint),
          ownerOrder: owners.targets.map(t => t.ownerType),
          studiesGraphVersion: owners.studiesGraphVersion,
          body: bodyPreview,
          notes: dryRunNotes(plannedCells.length),
        },
        warning: 'Dry-run: ads não duplicados e experiment não criado.',
      }
    }

    const mediaCtx = {
      apiVersion: creds.apiVersion,
      accessToken: creds.accessToken,
      adAccountId: creds.adAccountId,
      graph,
    }

    let pageId: string | null = null
    const hasAnyMediaVariation = variations.some(variationHasMediaOverride)
    if (hasAnyMediaVariation) {
      const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
      const pageToken = decryptSecret(tokenCtx.config.page_access_token_enc)
      pageId = assertMetaPageCreativeReady({
        pageId: objectStorySpec?.page_id ? String(objectStorySpec.page_id)
          : tokenCtx.publicConfig.page_id,
        pageAccessToken: pageToken,
      })
    }

    try {
      for (const [index, variation] of variations.entries()) {
        const copyBody = plannedCopies[index]!.copyBody
        const copiedAdId = await copyAdForExperiment(svc, input.baseAdId, copyBody)
        const ownedCopy = await fetchOwnedAdWithCreative(ctx, {
          tenantId: input.tenantId,
          adAccountId: input.adAccountId,
          adId: copiedAdId,
        })
        const finalAdId = String(ownedCopy.ad?.id || copiedAdId)
        copiedAds.push({
          variationName: variation.name ?? null,
          adId: finalAdId,
          copyBody,
        })

        if (variationHasMediaOverride(variation) && pageId) {
          await applyMediaOverrideToAd(ctx, {
            variation,
            adId: finalAdId,
            pageId,
            objectStorySpec,
            mediaCtx,
            creds,
            tenantId: input.tenantId,
          })
        }
      }
    }
    catch (err) {
      await rethrowAfterCopyRollback(err)
    }

    cells = [
      { name: 'Base', treatmentPercentage: percents[0]!, adId: input.baseAdId },
      ...copiedAds.map((row, i) => ({
        name: row.variationName || `Variação ${i + 1}`,
        treatmentPercentage: percents[i + 1]!,
        adId: row.adId,
      })),
    ]
  }

  if (!cells?.length) {
    throw new MetaAdsToolError('EXPERIMENT_CELLS_INVALID', 'cells[] é obrigatório sem baseAdId.', 400)
  }

  const cellAdIds = cells.map(c => c.adId).filter((id): id is string => Boolean(id))
  if (cellAdIds.length && !input.baseAdId) {
    const owned = await loadOwnedAdsForExperiment(ctx, {
      tenantId: input.tenantId,
      adAccountId: input.adAccountId,
      adIds: cellAdIds,
    })
    const eligibility = await checkExperimentEligibility(svc, {
      adAccountId: creds.adAccountId,
      businessId: creds.publicConfig.business_id,
      adIds: cellAdIds,
      adsetIds: owned.map(row => row.ad?.adset_id).filter(Boolean).map(String),
      campaignIds: owned.map(row => row.ad?.campaign_id).filter(Boolean).map(String),
    })
    assertEligibleOrThrow(eligibility)
  }

  const bodyPreview = buildCreateExperimentGraphBody(experimentInputFromCells(cells))
  if (dryRun) {
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      success: true as const,
      studyId: null,
      studiesGraphVersion: owners.studiesGraphVersion,
      type: input.type,
      name: input.name,
      cells,
      attempts: owners.targets.map(t => ({
        ownerType: t.ownerType,
        ownerId: t.ownerId,
        graphVersion: t.graphVersion,
        endpoint: t.endpoint,
        success: false,
      })),
      baseAdIdPreserved: baseAdId,
      dryRun: true as const,
      preview: {
        dryRun: true as const,
        wouldMutate: true as const,
        method: 'POST',
        path: owners.targets[0]?.endpoint,
        plannedEndpoints: owners.targets.map(t => t.endpoint),
        ownerOrder: owners.targets.map(t => t.ownerType),
        studiesGraphVersion: owners.studiesGraphVersion,
        body: bodyPreview,
        notes: dryRunNotes(cells.length),
      },
      warning: 'Dry-run: experiment não criado.',
    }
  }

  try {
    const created = await postAdStudyWithOwnerFallback(
      svc,
      experimentInputFromCells(cells),
      owners.targets,
      {
        adAccountId: creds.adAccountId,
        businessId: owners.business?.businessId || creds.publicConfig.business_id,
        userId: owners.graphUser?.id || null,
      },
    )
    return {
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      success: true as const,
      studyId: created.studyId,
      studyOwner: created.studyOwner,
      studyOwnerId: created.studyOwnerId,
      studiesGraphVersion: owners.studiesGraphVersion,
      type: input.type,
      name: input.name,
      baseAdId,
      copiedAds,
      cells,
      attempts: created.attempts,
      copiedAdsRolledBack: undefined,
      baseAdIdPreserved: baseAdId,
      recovered: created.recovered,
      dryRun: false as const,
    }
  }
  catch (err) {
    await rethrowAfterCopyRollback(err)
  }
}

async function assertExperimentOwnedByTenant(
  ctx: MetaToolContext,
  creds: { apiVersion: string, accessToken: string, adAccountId: string },
  studyId: string,
) {
  const graph = fetchGraph(ctx)
  const svc = { apiVersion: creds.apiVersion, accessToken: creds.accessToken, graph }
  const result = await getExperiment(svc, studyId)
  const probeId = result.ads[0] || result.adsets[0] || result.campaigns[0]
  if (probeId) {
    const node = await graph(metaGraphUrl(creds.apiVersion, `/${probeId}`), {
      query: {
        fields: 'id,account_id',
        access_token: creds.accessToken,
      },
    })
    assertAdAccountOwnership({
      objectAccountId: node?.account_id,
      tenantAdAccountId: creds.adAccountId,
      code: 'EXPERIMENT_TENANT_MISMATCH',
      message: 'Study não pertence à ad account do tenant.',
    })
    return result
  }
  await assertStudyOnAdAccount(svc, creds.adAccountId, studyId)
  return result
}

export async function metaGetExperiment(ctx: MetaToolContext, raw: unknown) {
  const input = metaGetExperimentSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const result = await assertExperimentOwnedByTenant(ctx, creds, input.studyId)
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    studyId: input.studyId,
    ...result,
  }
}

export async function metaStopExperiment(ctx: MetaToolContext, raw: unknown) {
  const input = metaStopExperimentSchema.parse(raw)
  assertWriteConfirmation(input)
  const dryRun = resolveDryRun(input.dryRun, true)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const svc = { apiVersion: creds.apiVersion, accessToken: creds.accessToken, graph }
  await assertExperimentOwnedByTenant(ctx, creds, input.studyId)
  const stopped = await stopExperiment(
    svc,
    input.studyId,
    { dryRun },
  )
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    ...stopped,
    success: true as const,
    warning: dryRun ? 'Dry-run: experiment não parado.' : 'end_time atualizado para agora.',
  }
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

// ---------- Flexible Ad Format tool handlers ----------

export async function metaCheckFlexibleAdEligibility(ctx: MetaToolContext, raw: unknown) {
  const input = metaCheckFlexibleAdEligibilitySchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const eligibility = checkFlexibleAdEligibility(creds.apiVersion)
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    ...eligibility,
  }
}

export async function metaCreateFlexibleAd(ctx: MetaToolContext, raw: unknown) {
  const input = metaCreateFlexibleAdSchema.parse(raw)
  const dryRun = resolveDryRun(input.dryRun, true)
  if (!dryRun) assertWriteConfirmation(input)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)

  const eligibility = checkFlexibleAdEligibility(creds.apiVersion)
  if (!eligibility.eligible) {
    throw new MetaAdsToolError(
      'FLEXIBLE_AD_NOT_ELIGIBLE',
      eligibility.notes,
      400,
      { graphVersion: eligibility.graphVersion },
    )
  }

  const graphBody = buildFlexibleAdGraphBody({
    adsetId: input.adsetId,
    name: input.name,
    status: input.status ?? 'PAUSED',
    groups: input.groups,
  })

  if (dryRun) {
    return {
      dryRun: true as const,
      tenantId: input.tenantId,
      adAccountId: creds.adAccountId,
      graphBody,
      preview: buildCreativeAssetGroupsSpec(input.groups),
      message: 'Dry-run: payload validado. Reenvie com dryRun:false + confirm:true + confirmTenantId para criar.',
      deprecationWarning: eligibility.deprecationWarning,
    }
  }

  const url = metaGraphUrl(creds.apiVersion ?? 'v25.0', `${actPath(creds.adAccountId)}/ads`, {
    access_token: creds.accessToken,
  })

  const formBody = new URLSearchParams()
  for (const [k, v] of Object.entries(graphBody)) {
    formBody.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }

  const response = await graph(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
  })

  const data = await response.json() as Record<string, unknown>
  if (!response.ok) {
    throw new MetaAdsToolError(
      'FLEXIBLE_AD_CREATE_FAILED',
      `Erro ao criar Flexible Ad: ${JSON.stringify((data as any)?.error?.message ?? response.status)}`,
      response.status,
      { graphBody, error: (data as any)?.error },
    )
  }

  await logMetaWriteAudit(ctx.client, {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    tool: 'meta_create_flexible_ad',
    action: 'CREATE',
    level: 'ad',
    objectId: String((data as any)?.id ?? ''),
    payload: graphBody,
  })

  return {
    dryRun: false as const,
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    adId: (data as any)?.id,
    message: 'Anúncio Flexible Ad Format criado.',
    deprecationWarning: eligibility.deprecationWarning,
  }
}

export async function metaGetFlexibleAdStructure(ctx: MetaToolContext, raw: unknown) {
  const input = metaGetFlexibleAdStructureSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)

  const data = await readFlexibleAdStructure(graph, input.adId, creds.accessToken, creds.apiVersion)
  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    adId: input.adId,
    ...(data ?? {}),
    hasFlexibleFormat: Boolean((data as any)?.creative_asset_groups_spec),
  }
}

// --- Ad Preview (Generate Previews API) ---

const adPreviewFormatEnum = z.enum([
  'DESKTOP_FEED_STANDARD',
  'MOBILE_FEED_STANDARD',
  'INSTAGRAM_STANDARD',
  'INSTAGRAM_STORY',
  'INSTAGRAM_REELS',
  'FACEBOOK_STORY_MOBILE',
  'FACEBOOK_REELS_MOBILE',
  'MESSENGER_MOBILE_INBOX_MEDIA',
  'RIGHT_COLUMN_STANDARD',
  'INSTAGRAM_EXPLORE_CONTEXTUAL',
  'INSTAGRAM_EXPLORE_GRID_HOME',
  'AUDIENCE_NETWORK_INSTREAM_VIDEO',
  'INSTREAM_VIDEO_DESKTOP',
  'INSTREAM_VIDEO_MOBILE',
  'FACEBOOK_REELS_BANNER',
])

export const metaGenerateAdPreviewSchema = tenantContextSchema.extend({
  adId: z.string().optional().describe('ID de um ad existente (GET /{adId}/previews).'),
  creativeId: z.string().optional().describe('ID de um AdCreative existente (GET /{creativeId}/previews).'),
  creative: z.record(z.unknown()).optional().describe('Creative spec JSON para preview de rascunho (GET /act_{id}/generatepreviews).'),
  ad_format: adPreviewFormatEnum.describe('Posicionamento/formato do preview.'),
})

export const metaGenerateAdPreviewsBatchSchema = tenantContextSchema.extend({
  adId: z.string().optional().describe('ID de um ad existente.'),
  creativeId: z.string().optional().describe('ID de um AdCreative existente.'),
  creative: z.record(z.unknown()).optional().describe('Creative spec JSON para preview de rascunho.'),
  ad_formats: z.array(adPreviewFormatEnum).min(1).max(15).describe('Lista de posicionamentos (máx 15).'),
})

export const metaValidateCreativeSchema = tenantContextSchema.extend({
  adId: z.string().optional().describe('ID de um ad existente para validar.'),
  creativeId: z.string().optional().describe('ID de um AdCreative existente.'),
  creative: z.record(z.unknown()).optional().describe('Creative spec JSON a validar.'),
  ad_formats: z.array(adPreviewFormatEnum).min(1).max(15).optional()
    .default(['DESKTOP_FEED_STANDARD', 'MOBILE_FEED_STANDARD', 'INSTAGRAM_STANDARD', 'INSTAGRAM_STORY'])
    .describe('Posicionamentos a testar (default: feed desktop/mobile + IG feed + IG story).'),
})

export async function metaGenerateAdPreview(ctx: MetaToolContext, raw: unknown) {
  const input = metaGenerateAdPreviewSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)

  if (input.adId) {
    const { getExistingAdPreview } = await import('./preview-service')
    const result = await getExistingAdPreview(graph, creds.accessToken, {
      adId: input.adId,
      ad_format: input.ad_format,
      apiVersion: creds.apiVersion,
    })
    return { tenantId: input.tenantId, adAccountId: creds.adAccountId, ...result }
  }

  if (input.creativeId) {
    const { getExistingCreativePreview } = await import('./preview-service')
    const result = await getExistingCreativePreview(graph, creds.accessToken, {
      creativeId: input.creativeId,
      ad_format: input.ad_format,
      apiVersion: creds.apiVersion,
    })
    return { tenantId: input.tenantId, adAccountId: creds.adAccountId, ...result }
  }

  if (input.creative) {
    const { generateAdPreview: genPreview } = await import('./preview-service')
    const result = await genPreview(graph, creds.accessToken, {
      adAccountId: creds.adAccountId,
      creative: input.creative,
      ad_format: input.ad_format,
      apiVersion: creds.apiVersion,
    })
    return { tenantId: input.tenantId, adAccountId: creds.adAccountId, ...result }
  }

  throw new MetaAdsToolError('VALIDATION_ERROR', 'Informe adId, creativeId ou creative.')
}

export async function metaGenerateAdPreviewsBatch(ctx: MetaToolContext, raw: unknown) {
  const input = metaGenerateAdPreviewsBatchSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)

  const { generateAdPreviewsBatch: batchPreviews } = await import('./preview-service')
  const results = await batchPreviews(graph, creds.accessToken, {
    adAccountId: creds.adAccountId,
    adId: input.adId,
    creativeId: input.creativeId,
    creative: input.creative,
    ad_formats: input.ad_formats,
    apiVersion: creds.apiVersion,
  })

  const succeeded = results.filter(r => r.body && !r.error)
  const failed = results.filter(r => r.error)

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    total: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    previews: results,
  }
}

export async function metaValidateCreative(ctx: MetaToolContext, raw: unknown) {
  const input = metaValidateCreativeSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)

  const { validateCreativeViaPreview } = await import('./preview-service')
  const result = await validateCreativeViaPreview(graph, creds.accessToken, {
    adAccountId: creds.adAccountId,
    adId: input.adId,
    creativeId: input.creativeId,
    creative: input.creative,
    ad_formats: input.ad_formats,
    apiVersion: creds.apiVersion,
  })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    ...result,
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
  meta_get_ad: metaGetAd,
  meta_get_creative: metaGetCreative,
  meta_list_creatives: metaListCreatives,
  meta_get_insights: metaGetInsights,
  meta_search_interests: metaSearchInterests,
  meta_search_geolocations: metaSearchGeolocations,
  meta_list_custom_audiences: metaListCustomAudiences,
  meta_create_custom_audience: metaCreateCustomAudience,
  meta_create_custom_audiences_batch: metaCreateCustomAudiencesBatch,
  meta_update_custom_audience: metaUpdateCustomAudience,
  meta_delete_custom_audience: metaDeleteCustomAudience,
  meta_get_custom_audience_usage: metaGetCustomAudienceUsage,
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
  meta_get_capabilities: metaGetCapabilities,
  meta_upload_image: metaUploadImage,
  meta_upload_video: metaUploadVideo,
  meta_get_video_status: metaGetVideoStatusTool,
  meta_list_catalogs: metaListCatalogs,
  meta_list_product_sets: metaListProductSets,
  meta_list_pixels: metaListPixels,
  meta_list_datasets: metaListDatasets,
  meta_update_ad_tracking: metaUpdateAdTracking,
  meta_list_experiments: metaListExperiments,
  meta_check_experiment_eligibility: metaCheckExperimentEligibility,
  meta_create_experiment: metaCreateExperiment,
  meta_get_experiment: metaGetExperiment,
  meta_stop_experiment: metaStopExperiment,
  meta_check_flexible_ad_eligibility: metaCheckFlexibleAdEligibility,
  meta_create_flexible_ad: metaCreateFlexibleAd,
  meta_get_flexible_ad_structure: metaGetFlexibleAdStructure,
  meta_generate_ad_preview: metaGenerateAdPreview,
  meta_generate_ad_previews_batch: metaGenerateAdPreviewsBatch,
  meta_validate_creative: metaValidateCreative,
}

export const META_TOOL_SCHEMAS: Record<MetaToolName, z.ZodTypeAny> = {
  meta_list_integrations: metaListIntegrationsSchema,
  meta_list_ad_accounts: metaListAdAccountsSchema,
  meta_list_campaigns: metaListCampaignsSchema,
  meta_get_campaign: metaGetCampaignSchema,
  meta_list_adsets: metaListAdsetsSchema,
  meta_list_ads: metaListAdsSchema,
  meta_get_ad: metaGetAdSchema,
  meta_get_creative: metaGetCreativeSchema,
  meta_list_creatives: metaListCreativesSchema,
  meta_get_insights: metaGetInsightsSchema,
  meta_search_interests: metaSearchInterestsSchema,
  meta_search_geolocations: metaSearchGeolocationsSchema,
  meta_list_custom_audiences: metaListCustomAudiencesSchema,
  meta_create_custom_audience: metaCreateCustomAudienceSchema,
  meta_create_custom_audiences_batch: metaCreateCustomAudiencesBatchSchema,
  meta_update_custom_audience: metaUpdateCustomAudienceSchema,
  meta_delete_custom_audience: metaDeleteCustomAudienceSchema,
  meta_get_custom_audience_usage: metaGetCustomAudienceUsageSchema,
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
  meta_get_capabilities: metaGetCapabilitiesSchema,
  meta_upload_image: metaUploadImageSchema,
  meta_upload_video: metaUploadVideoSchema,
  meta_get_video_status: metaGetVideoStatusSchema,
  meta_list_catalogs: metaListCatalogsSchema,
  meta_list_product_sets: metaListProductSetsSchema,
  meta_list_pixels: metaListPixelsSchema,
  meta_list_datasets: metaListDatasetsSchema,
  meta_update_ad_tracking: metaUpdateAdTrackingSchema,
  meta_list_experiments: metaListExperimentsSchema,
  meta_check_experiment_eligibility: metaCheckExperimentEligibilitySchema,
  meta_create_experiment: metaCreateExperimentSchema,
  meta_get_experiment: metaGetExperimentSchema,
  meta_stop_experiment: metaStopExperimentSchema,
  meta_check_flexible_ad_eligibility: metaCheckFlexibleAdEligibilitySchema,
  meta_create_flexible_ad: metaCreateFlexibleAdSchema,
  meta_get_flexible_ad_structure: metaGetFlexibleAdStructureSchema,
  meta_generate_ad_preview: metaGenerateAdPreviewSchema,
  meta_generate_ad_previews_batch: metaGenerateAdPreviewsBatchSchema,
  meta_validate_creative: metaValidateCreativeSchema,
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
  meta_get_ad:
    'Obtém detalhe de um anúncio Meta com creative expandido (object_story_spec, asset_feed_spec, degrees_of_freedom_spec, creative_asset_groups_spec, tracking, issues, recommendations).',
  meta_get_creative:
    'Lê um AdCreative por ID. Retorna todos os campos criativos (object_story_spec, asset_feed_spec, degrees_of_freedom_spec, media, url_tags).',
  meta_list_creatives:
    'Lista AdCreatives da ad account (id, name, object_story_spec resumido, thumbnail_url, status). Paginação via cursor.',
  meta_get_insights:
    'Consulta insights/métricas Meta (nível account|campaign|adset|ad + período).',
  meta_search_interests:
    'Busca interesses Meta (id+name+audience_size) via Graph adinterest. Use os IDs em targeting.interests / flexible_spec.',
  meta_search_geolocations:
    'Busca cidades/regiões Meta (key+name+country_code) via Graph adgeolocation. Use key em targeting.geo_locations.cities|regions.',
  meta_list_custom_audiences:
    'Lista custom audiences da ad account (id+name+subtype+contagem). Use ids em targeting.custom_audiences.',
  meta_create_custom_audience:
    'Cria público Meta (INSTAGRAM|FACEBOOK_PAGE|WEBSITE|LEAD_FORM|CUSTOMER_LIST|LOOKALIKE). event amigável; dryRun default true; confirm+confirmTenantId. Alias ads_meta_create_custom_audience.',
  meta_create_custom_audiences_batch:
    'Cria vários públicos em sequência (succeeded[]/failed[], sem transação). Mesmos campos por item. dryRun default true.',
  meta_update_custom_audience:
    'Atualiza nome/descrição/rule de um público (ownership da ad account). dryRun default true.',
  meta_delete_custom_audience:
    'Exclui público. Exige confirm+confirmTenantId+confirmDelete. Recusa se em uso (ads/lookalikes). dryRun default true.',
  meta_get_custom_audience_usage:
    'Lista ads e lookalikes que usam o público. Consulte antes de excluir.',
  meta_update_campaign_status:
    'PAUSA ou ATIVA campanha (ACTIVE|PAUSED). Exige confirm=true e confirmTenantId=tenantId. dryRun opcional (default false).',
  meta_update_adset_status:
    'PAUSA ou ATIVA adset (ACTIVE|PAUSED). Exige confirm=true e confirmTenantId=tenantId. dryRun opcional (default false).',
  meta_update_ad_status:
    'PAUSA ou ATIVA anúncio (ACTIVE|PAUSED). Exige confirm=true e confirmTenantId=tenantId. dryRun opcional (default false).',
  meta_create_campaign:
    'Cria campanha (Outcome_*). Default PAUSED + dryRun=true. Exige confirm+confirmTenantId. ACTIVE exige confirmActive. Budget opcional com teto env.',
  meta_create_adset:
    'Cria adset (BR_* ou targeting custom). PAUSED+dryRun. destinationType WEBSITE|WHATSAPP|MESSENGER|INSTAGRAM_DIRECT. isDynamicCreative opcional (DYNAMIC_CREATIVE_LEGACY, só WEBSITE). Exige confirm+budget+campaignId.',
  meta_create_ad:
    'Cria Ad+Creative. creativeId XOR creativeType IMAGE|VIDEO|CAROUSEL|DYNAMIC_CREATIVE_LEGACY|CATALOG. IMAGE: imageUrl|imageHash|assetId|sourceBase64 (biblioteca). Normaliza imagens (EXIF, alpha, WebP). Destinos WEBSITE|WHATSAPP|MESSENGER|INSTAGRAM_DIRECT. trackingSpecs/pixelId/offlineDatasetId/conversionDomain opcionais. Advantage+ degreesOfFreedomSpec. PAUSED+dryRun.',
  meta_update_adset_budget:
    'Atualiza budget do adset (daily|lifetime). dryRun default true. Teto META_GPT_BUDGET_* + confirmBudgetIncrease se aumento % alto.',
  meta_update_adset_targeting:
    'Atualiza targeting do adset (BR_* ou targeting custom). dryRun default true. XOR targetingTemplate|targeting.',
  meta_update_ad_creative_copy:
    'Atualiza copy do ad (message/headline/description/CTA/link) via novo AdCreative + swap. dryRun default true. Exige Page.',
  meta_update_ad_media:
    'Atualiza mídia IMAGE|VIDEO|CAROUSEL via novo AdCreative + swap; preserva copy. dryRun default true. Upload URL com SSRF check.',
  meta_preview_bulk_delete:
    'Preview de exclusão em massa (IDs explícitos, level campaign|adset|ad). Ownership + previewToken (TTL). Sem Graph POST. Nunca por nome.',
  meta_execute_bulk_delete:
    'Executa exclusão em massa após preview. Exige previewToken + confirm + confirmTenantId + confirmDelete + dryRun=false. Sequencial; succeeded/failed.',
  meta_get_capabilities:
    'Retorna matriz de capacidades Meta Ads (criativos, mídia, catálogo, experiments, Flexible Media) para a Graph version do tenant.',
  meta_upload_image:
    'Upload/reuse imagem na ad account (imageUrl HTTPS, imageHash existente, assetId da Biblioteca, ou sourceBase64). Normaliza automaticamente (EXIF, alpha→RGB, WebP→JPEG). Retry automático: URL fail→bytes, formato inválido→JPEG. dryRun default true.',
  meta_upload_video:
    'Upload/reuse vídeo (videoUrl HTTPS file_url com SSRF ou videoId). dryRun default true. Depois use meta_get_video_status.',
  meta_get_video_status:
    'Consulta status de processamento do Advideo (status/title/length).',
  meta_list_catalogs:
    'Lista product catalogs da ad account do tenant (ownership).',
  meta_list_product_sets:
    'Lista product sets de um catalogId (ownership via ad account). Use productSetId em createAd CATALOG.',
  meta_list_pixels:
    'Lista Pixels da ad account (GET act_{id}/adspixels). Use type=website + pixelId (ou actionType=offsite_conversion).',
  meta_list_datasets:
    'Lista Datasets da ad account (GET act_{id}/offline_conversion_data_sets). Use type=offline + datasetId (ou actionType=offline_conversion).',
  meta_update_ad_tracking:
    'Atualiza tracking_specs do Ad (website Pixel / offline Dataset / crm). Merge default; replaceTrackingSpecs=true substitui. dryRun true. confirm+confirmTenantId.',
  meta_list_experiments:
    'Lista Ad Studies: GET v26 /{user_id}/ad_studies + /{business_id}/ad_studies (META_ADS_STUDIES_GRAPH_VERSION) + GET act_{id}/impacting_ad_studies na versão Ads. Dedupe por studyId; isolamento por tenant/ad account.',
  meta_check_experiment_eligibility:
    'Checa conflitos com testes ativos/agendados (ad/adset/campaign vs studies).',
  meta_create_experiment:
    'Cria Ad Study SPLIT_TEST_V2. studyOwner AUTO (default): GET /me + POST v26 /{user_id}/ad_studies, fallback POST /{business_id}/ad_studies com as mesmas cópias. cells[] OU baseAdId+variations. Variações com mídia: imageHash/imageUrl/assetId/videoId/videoUrl/childAttachments → novo AdCreative + swap no ad copiado. Rollback só se todas as tentativas falharem. dryRun default true.',
  meta_get_experiment:
    'Lê study + cells + ads + winner (results_first_available_date; Graph não documenta winner_cell_id).',
  meta_stop_experiment:
    'Encerra experiment antecipadamente (end_time=now). dryRun default true.',
  meta_check_flexible_ad_eligibility:
    'Verifica se a conta suporta Flexible Ad Format (creative_asset_groups_spec). Retorna eligibilidade, objetivos suportados e aviso de deprecação.',
  meta_create_flexible_ad:
    'Cria anúncio Flexible Ad Format com creative_asset_groups_spec (múltiplas imagens/vídeos + textos + CTA). Apenas OUTCOME_SALES/OUTCOME_APP_PROMOTION. dryRun default true.',
  meta_get_flexible_ad_structure:
    'Lê creative_asset_groups_spec de um anúncio existente. Retorna estrutura dos grupos de assets.',
  meta_generate_ad_preview:
    'Preview real de um ad/creative/spec via Generate Previews API Meta. Um posicionamento por vez (ad_format). Retorna HTML/iframe. adId | creativeId | creative spec.',
  meta_generate_ad_previews_batch:
    'Preview real em múltiplos posicionamentos (até 15). Retorna HTML/iframe + succeeded/failed por placement. adId | creativeId | creative spec.',
  meta_validate_creative:
    'Validação de criativo via Generate Previews API. Testa posicionamentos padrão, retorna placements_ok / placements_failed + summary. Sem HTML completo. adId | creativeId | creative spec.',
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
