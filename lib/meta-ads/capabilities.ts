/**
 * Declares Meta Ads capabilities for the Graph version in use.
 * Never announce features the schema/implementation cannot execute.
 */

import { resolveMetaAdsStudiesGraphVersion, resolveMetaGraphVersion } from './graph'

export type MetaCapabilityFlag = {
  supported: boolean
  reason?: string
  notes?: string
}

export type MetaCapabilitiesReport = {
  graphVersion: string
  /** Isolated Ad Studies Graph (POST/GET business ad_studies). Default v26.0. */
  studiesGraphVersion: string
  destinations: {
    WEBSITE: MetaCapabilityFlag
    WHATSAPP_CTWA: MetaCapabilityFlag
    MESSENGER: MetaCapabilityFlag
    INSTAGRAM_DIRECT: MetaCapabilityFlag
  }
  creativeTypes: {
    IMAGE: MetaCapabilityFlag
    VIDEO: MetaCapabilityFlag
    CAROUSEL: MetaCapabilityFlag
    DYNAMIC_CREATIVE_LEGACY: MetaCapabilityFlag
    ADVANTAGE_PLUS_CREATIVE: MetaCapabilityFlag
    CATALOG: MetaCapabilityFlag
    COLLECTION: MetaCapabilityFlag
    FLEXIBLE_AD_FORMAT: MetaCapabilityFlag
    FLEXIBLE_MEDIA_PAC_RELAXATION: MetaCapabilityFlag
  }
  media: {
    uploadImageUrl: MetaCapabilityFlag
    uploadVideoUrl: MetaCapabilityFlag
    reuseImageHash: MetaCapabilityFlag
    reuseVideoId: MetaCapabilityFlag
    getVideoStatus: MetaCapabilityFlag
  }
  experiments: {
    splitTestV2Creative: MetaCapabilityFlag
    splitTestAdsetLevel: MetaCapabilityFlag
    levels: string[]
  }
  catalog: {
    listProductCatalogs: MetaCapabilityFlag
    listProductSets: MetaCapabilityFlag
    catalogTemplateCreative: MetaCapabilityFlag
  }
  tracking: {
    adTrackingSpecs: MetaCapabilityFlag
    listPixels: MetaCapabilityFlag
    listDatasets: MetaCapabilityFlag
    websitePixel: MetaCapabilityFlag
    offlineDataset: MetaCapabilityFlag
    crmLeadgenQuality: MetaCapabilityFlag
  }
}

function ok(notes?: string): MetaCapabilityFlag {
  return { supported: true, ...(notes ? { notes } : {}) }
}

function no(reason: string): MetaCapabilityFlag {
  return { supported: false, reason }
}

/**
 * Capability matrix for Blimber Meta Ads (MCP + REST invoke).
 * Graph default: META_ADS_GRAPH_VERSION → META_GRAPH_VERSION → v25.0.
 * Flexible Ad Format stays unsupported regardless of Graph version.
 */
export function getMetaCapabilities(explicitVersion?: string | null): MetaCapabilitiesReport {
  const graphVersion = resolveMetaGraphVersion(explicitVersion)
  const studiesGraphVersion = resolveMetaAdsStudiesGraphVersion()

  return {
    graphVersion,
    studiesGraphVersion,
    destinations: {
      WEBSITE: ok('link_data / video_data com linkUrl https'),
      WHATSAPP_CTWA: ok(
        'destination_type=WHATSAPP + CTA WHATSAPP_MESSAGE; IMAGE|VIDEO|CAROUSEL (docs Meta CTWA). '
        + 'DYNAMIC_CREATIVE_LEGACY e CATALOG não suportados.',
      ),
      MESSENGER: ok(
        'destination_type=MESSENGER + CTA MESSAGE_PAGE; IMAGE|VIDEO|CAROUSEL. Exige page_id.',
      ),
      INSTAGRAM_DIRECT: ok(
        'destination_type=INSTAGRAM_DIRECT + CTA INSTAGRAM_MESSAGE; IMAGE|VIDEO|CAROUSEL. '
        + 'Exige page_id + instagram_business_account_id (instagram_actor_id).',
      ),
    },
    creativeTypes: {
      IMAGE: ok('object_story_spec.link_data — WEBSITE e destinos de mensagem'),
      VIDEO: ok('object_story_spec.video_data — WEBSITE e destinos de mensagem'),
      CAROUSEL: ok(
        'link_data.child_attachments mistos image/video; WEBSITE + WHATSAPP + MESSENGER + INSTAGRAM_DIRECT',
      ),
      DYNAMIC_CREATIVE_LEGACY: ok(
        'asset_feed_spec + adset is_dynamic_creative=true; WEBSITE only; legado Ads Manager',
      ),
      ADVANTAGE_PLUS_CREATIVE: ok(
        'degrees_of_freedom_spec.creative_features_spec (OPT_IN|OPT_OUT) em IMAGE|VIDEO|CAROUSEL',
      ),
      CATALOG: ok(
        'template_data + product_set_id quando catálogo/product set é da business do token',
      ),
      COLLECTION: no(
        'Collection / Instant Experience exige canvas/storefront path não implementado no Blimber; use CAROUSEL ou CATALOG.',
      ),
      FLEXIBLE_AD_FORMAT: no(
        'creative_asset_groups_spec (Flexible Ad Format) não implementado no Blimber. '
        + `Graph atual=${graphVersion} (default v25.0; META_ADS_GRAPH_VERSION / META_GRAPH_VERSION sobem a versão sem habilitar o campo). `
        + 'Mesmo com Graph ≥ v25, capability permanece false até o Blimber modelar o campo — não inventar payloads.',
      ),
      FLEXIBLE_MEDIA_PAC_RELAXATION: ok(
        'Ads Manager "Mídia flexível" = Advantage+ pac_relaxation em degrees_of_freedom_spec (não é Dynamic Creative).',
      ),
    },
    media: {
      uploadImageUrl: ok('POST act_{adAccountId}/adimages url= (SSRF-checked)'),
      uploadVideoUrl: ok('POST act_{adAccountId}/advideos file_url= (SSRF-checked); status via getVideoStatus'),
      reuseImageHash: ok(),
      reuseVideoId: ok(),
      getVideoStatus: ok('GET /{video-id}?fields=status,title,length'),
    },
    experiments: {
      splitTestV2Creative: ok(
        `POST ${studiesGraphVersion} /{business_id}/ad_studies type=SPLIT_TEST_V2 + creative_test_config; 2–5 cells, 1 ad/célula; list GET business ad_studies (v26 trial) + impacting_ad_studies (versão Ads)`,
      ),
      splitTestAdsetLevel: ok(
        `POST ${studiesGraphVersion} /{business_id}/ad_studies type=SPLIT_TEST; cells with adsets[] (máx. 150 células; clássico)`,
      ),
      levels: ['ad (creative test SPLIT_TEST_V2, 2–5 cells)', 'adset (SPLIT_TEST classico)'],
    },
    catalog: {
      listProductCatalogs: ok('GET act_{adAccountId}/product_catalogs (ownership via ad account do tenant)'),
      listProductSets: ok(
        'GET /{catalog-id}/product_sets após validar catalog na ad account (meta_list_product_sets)',
      ),
      catalogTemplateCreative: ok(
        'AdCreative template_data + product_set_id; product set deve pertencer a catalogo listado',
      ),
    },
    tracking: {
      adTrackingSpecs: ok(
        'Campo tracking_specs no Ad (não AdSet/Campaign). createAd + meta_update_ad_tracking.',
      ),
      listPixels: ok('GET act_{adAccountId}/adspixels (meta_list_pixels)'),
      listDatasets: ok(
        'GET act_{adAccountId}/offline_conversion_data_sets (meta_list_datasets)',
      ),
      websitePixel: ok(
        'action.type=offsite_conversion + fb_pixel. Pixel da ad account do tenant.',
      ),
      offlineDataset: ok(
        'action.type=offline_conversion + dataset. Dataset da ad account do tenant.',
      ),
      crmLeadgenQuality: ok(
        'action.type=leadgen_quality_conversion + fb_pixel ou dataset (docs Tracking Specs).',
      ),
    },
  }
}
