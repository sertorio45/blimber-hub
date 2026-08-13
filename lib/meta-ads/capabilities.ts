/**
 * Declares Meta Ads capabilities for the Graph version in use.
 * Never announce features the schema/implementation cannot execute.
 */

import { resolveMetaGraphVersion } from './graph'

export type MetaCapabilityFlag = {
  supported: boolean
  reason?: string
  notes?: string
}

export type MetaCapabilitiesReport = {
  graphVersion: string
  destinations: {
    WEBSITE: MetaCapabilityFlag
    WHATSAPP_CTWA: MetaCapabilityFlag
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
    catalogTemplateCreative: MetaCapabilityFlag
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
 * Graph default: META_GRAPH_VERSION || v20.0 — do not silently upgrade.
 */
export function getMetaCapabilities(explicitVersion?: string | null): MetaCapabilitiesReport {
  const graphVersion = resolveMetaGraphVersion(explicitVersion)

  return {
    graphVersion,
    destinations: {
      WEBSITE: ok('link_data / video_data com linkUrl https'),
      WHATSAPP_CTWA: ok('destination_type=WHATSAPP + CTA WHATSAPP_MESSAGE; IMAGE|VIDEO'),
    },
    creativeTypes: {
      IMAGE: ok('object_story_spec.link_data'),
      VIDEO: ok('object_story_spec.video_data'),
      CAROUSEL: ok('link_data.child_attachments mistos image/video; WEBSITE only'),
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
        'creative_asset_groups_spec (Flexible Ad Format) documentado com exemplos em Graph ≥ v25; '
        + `projeto usa ${graphVersion} — não inventar campos; reavaliar ao subir versão oficialmente.`,
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
        'POST /me/ad_studies type=SPLIT_TEST_V2 + creative_test_config; cells with ads[] (1 ad/celula)',
      ),
      splitTestAdsetLevel: ok(
        'POST /me/ad_studies type=SPLIT_TEST; cells with adsets[] (split classico)',
      ),
      levels: ['ad (creative test SPLIT_TEST_V2)', 'adset (SPLIT_TEST classico)'],
    },
    catalog: {
      listProductCatalogs: ok('GET act_{adAccountId}/product_catalogs (ownership via ad account do tenant)'),
      catalogTemplateCreative: ok(
        'AdCreative template_data + product_set_id; product set deve pertencer a catalogo listado',
      ),
    },
  }
}
