---
name: blimber-platform
description: >-
  Plataforma Blimber no ChatGPT (Marketing editorial + Meta Ads + platform).
  Duas Ações no mesmo GPT: openapi-marketing.yaml (app.blimber.com.br) e
  openapi-ads.yaml (ads.blimber.com.br). Posts, social_campaigns, brand,
  biblioteca e Meta completo (list/create/status/bulk/budget). Sem SQL direto.
---

# Blimber Platform (MCP / GPT unificado)

> Pack primário: `gpt/blimber/` — **duas Ações** no mesmo GPT.  
> Setup: `docs/gpt-blimber-ACTIONS.md`  
> Ads = `openapi-ads.yaml` (host `ads.*`). Pack standalone `gpt/blimber-meta/` removido.  
> Docs: `docs/mcp-blimber-platform.md`

## Quando usar

- Conteúdo mensal / posts / calendário editorial
- Campanhas `social_campaigns` (não pagas)
- Brand Context / biblioteca de mídia
- Descobrir `tenantId` por nome (`searchTenants` na Ação Marketing)
- Meta Ads pagos via Ação Ads (`/api/gpt/meta/*`, host `ads.blimber.com.br`)

## Como operar

1. Importar `openapi-marketing.yaml` **e** `openapi-ads.yaml` (duas Ações).
2. **Não** importe `openapi.yaml` (índice). Ads = `openapi-ads.yaml`.
3. Bearer `BLIMBER_MCP_API_KEY` nas duas Ações.
4. Sempre `searchTenants` (Marketing) se faltar UUID.
5. Mutações: dryRun → confirmar → `dryRun: false` + `confirm` + `confirmTenantId`.
6. Respostas em **PT-BR**.

## Tools — Ação Marketing (13, host app.*)

| Tool / operationId | Uso |
|--------------------|-----|
| `searchTenants` | nome → tenantId |
| `listBlimberTools` | catálogo unificado |
| `listPosts` / `getPost` / `createPost` / `updatePost` | conteúdo editorial |
| `listEditorialCampaigns` / `getEditorialCampaign` / `createEditorialCampaign` / `updateEditorialCampaign` | campanha mensal |
| `getBrandContext` | Brand Center |
| `listMediaAssets` / `listSocialAccounts` | biblioteca / contas |

## Tools — Ação Ads (24, host ads.*)

| Tool / operationId | Uso |
|--------------------|-----|
| `listMetaTools` / `listIntegrations` / `listAdAccounts` | catálogo / status / contas |
| `searchInterests` / `searchGeolocations` / `listCustomAudiences` | IDs de interesse/cidade/audiences para targeting |
| `listCampaigns` / `getCampaign` / `createCampaign` / `updateCampaignStatus` | campanhas Meta |
| `listAdsets` / `createAdset` / `updateAdsetStatus` / `updateAdsetBudget` / `updateAdsetTargeting` | adsets |
| `listAds` / `createAd` / `updateAdStatus` / `updateAdCreativeCopy` / `updateAdMedia` | anúncios |
| `getInsights` / `previewBulkDelete` / `executeBulkDelete` / `invokeMetaTool` | insights / bulk / invoke |

Keep vs drop: `gpt/blimber/README.md`.
