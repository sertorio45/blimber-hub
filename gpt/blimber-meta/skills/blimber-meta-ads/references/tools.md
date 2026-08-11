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
| updateCampaignStatus | `/api/gpt/meta/campaigns/{campaignId}/status` | POST | `meta_update_campaign_status` |
| listAdsets | `/api/gpt/meta/adsets` | GET | `meta_list_adsets` |
| listAds | `/api/gpt/meta/ads` | GET | `meta_list_ads` |
| getInsights | `/api/gpt/meta/insights` | POST | `meta_get_insights` |
| invokeMetaTool | `/api/gpt/meta/invoke` | POST | qualquer tool (alternativa) |

Auth: `Authorization: Bearer <BLIMBER_MCP_API_KEY>`

`searchTenants`: query `q` (ou `name`), opcional `organizationId` / `limit`. Resposta só `{ id, name, slug }` — nunca tokens.
