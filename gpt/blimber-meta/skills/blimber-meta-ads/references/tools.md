# Mapeamento Ações (Actions) ↔ tools

Referência para a habilidade. Carregue quando precisar do nome exato da operação.

| operationId OpenAPI | Path | Método | Tool `lib/meta-ads` |
|---------------------|------|--------|---------------------|
| searchTenants | `/api/gpt/meta/tenants` | GET | — (busca `tenant` por nome/slug) |
| listMetaTools | `/api/gpt/meta/tools` | GET | — (catálogo) |
| listIntegrations | `/api/gpt/meta/integrations` | GET | `meta_list_integrations` |
| listAdAccounts | `/api/gpt/meta/ad-accounts` | GET | `meta_list_ad_accounts` |
| listCampaigns | `/api/gpt/meta/campaigns` | GET | `meta_list_campaigns` |
| getCampaign | `/api/gpt/meta/campaigns/{campaignId}` | GET | `meta_get_campaign` |
| createCampaign | `/api/gpt/meta/campaigns` | POST | `meta_create_campaign` |
| updateCampaignStatus | `/api/gpt/meta/campaigns/{campaignId}/status` | POST | `meta_update_campaign_status` |
| listAdsets | `/api/gpt/meta/adsets` | GET | `meta_list_adsets` |
| createAdset | `/api/gpt/meta/adsets` | POST | `meta_create_adset` |
| updateAdsetStatus | `/api/gpt/meta/adsets/{adsetId}/status` | POST | `meta_update_adset_status` |
| updateAdsetBudget | `/api/gpt/meta/adsets/{adsetId}/budget` | POST | `meta_update_adset_budget` |
| updateAdsetTargeting | `/api/gpt/meta/adsets/{adsetId}/targeting` | POST | `meta_update_adset_targeting` |
| listAds | `/api/gpt/meta/ads` | GET | `meta_list_ads` |
| createAd | `/api/gpt/meta/ads` | POST | `meta_create_ad` |
| updateAdStatus | `/api/gpt/meta/ads/{adId}/status` | POST | `meta_update_ad_status` |
| updateAdCreativeCopy | `/api/gpt/meta/ads/{adId}/creative-copy` | POST | `meta_update_ad_creative_copy` |
| updateAdMedia | `/api/gpt/meta/ads/{adId}/media` | POST | `meta_update_ad_media` |
| previewBulkDelete | `/api/gpt/meta/bulk-delete/preview` | POST | `meta_preview_bulk_delete` |
| executeBulkDelete | `/api/gpt/meta/bulk-delete/execute` | POST | `meta_execute_bulk_delete` |
| getInsights | `/api/gpt/meta/insights` | POST | `meta_get_insights` |
| invokeMetaTool | `/api/gpt/meta/invoke` | POST | qualquer tool (alternativa) |

Auth: `Authorization: Bearer <BLIMBER_MCP_API_KEY>`

`searchTenants`: query `q` (ou `name`), opcional `organizationId` / `limit`. Resposta só `{ id, name, slug }` — nunca tokens.

Mutações de status: body com `tenantId`, `status` (ACTIVE\|PAUSED), `confirm: true`, `confirmTenantId === tenantId`, `dryRun?`.

Create campaign: `name`, `objective` (OUTCOME_*), `confirm` + `confirmTenantId`; default `status=PAUSED`, `dryRun=true`; ACTIVE exige `confirmActive=true`.

Create adset: `campaignId`, `name`, `targetingTemplate` (`BR_18_65`|`BR_25_54`|`BR_18_34`|`BR_35_65`), `billingEvent`, `optimizationGoal`, budget (`dailyBudget`|`lifetimeBudget`), `confirm` + `confirmTenantId`; default `PAUSED` + `dryRun=true`.

Create ad: `adsetId`, `name`, `linkUrl` (https), `message`, `confirm` + `confirmTenantId`; opcionais `headline`/`description`/`callToAction`/`imageUrl`|`imageHash`; default `PAUSED` + `dryRun=true`. Exige page_id + page token. Nunca inventar URLs.

Edits (dryRun default true): budget (`dailyBudget`|`lifetimeBudget`, `confirmBudgetIncrease` se aumento % alto); targeting (`targetingTemplate`); copy (≥1 campo copy/link); media (`imageUrl`|`imageHash`).

**Bulk delete (AVISO):** só IDs explícitos. `previewBulkDelete` → mostrar tabela → `executeBulkDelete` com `previewToken` + `confirmDelete` + `confirm` + `confirmTenantId` + `dryRun: false`. Nunca por nome. Máx. META_GPT_BULK_MAX. Default `deleteMode=DELETED`.