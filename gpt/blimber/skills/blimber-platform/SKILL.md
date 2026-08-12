---
name: blimber-platform
description: >-
  Plataforma Blimber unificada no ChatGPT (Marketing editorial + Meta Ads
  write + platform). Uma Ação só: gpt/blimber/openapi.yaml. Posts,
  social_campaigns, brand, biblioteca e /api/gpt/meta/*. Pack
  gpt/blimber-meta é GPT separado (domínio duplicado se importar os dois).
  Sem SQL direto.
---

# Blimber Platform (MCP / GPT unificado)

> Pack primário: `gpt/blimber/` — **uma Ação** (`openapi.yaml`).  
> Pack `gpt/blimber-meta/` = **GPT separado** só de Ads (não importe no mesmo GPT).  
> Docs: `docs/mcp-blimber-platform.md`

## Quando usar

- Conteúdo mensal / posts / calendário editorial
- Campanhas `social_campaigns` (não pagas)
- Brand Context / biblioteca de mídia
- Descobrir `tenantId` por nome
- Meta Ads pagos (insights, status, create/edit/bulk) via `/api/gpt/meta/*`

## Como operar

1. Importar **apenas** `gpt/blimber/openapi.yaml` nas Ações do GPT.
2. Bearer `BLIMBER_MCP_API_KEY`.
3. Sempre `searchTenants` se faltar UUID.
4. Mutações: dryRun → confirmar → `dryRun: false` + `confirm` + `confirmTenantId`.
5. Respostas em **PT-BR**.
6. **Não** adicione uma segunda Ação com `gpt/blimber-meta/openapi.yaml` (mesmo host).

## Tools (desta Ação)

| Tool / operationId | Uso |
|--------------------|-----|
| `searchTenants` | nome → tenantId |
| `listBlimberTools` | catálogo unificado |
| `listPosts` / `createPost` / `updatePost` | conteúdo editorial |
| `listEditorialCampaigns` / `createEditorialCampaign` | campanha mensal |
| `getBrandContext` | Brand Center |
| `listMediaAssets` / `listSocialAccounts` | biblioteca / contas |
| `listIntegrations` / `listCampaigns` / `createCampaign` | Meta Ads |
| `listAdsets` / `createAdset` / `listAds` / `createAd` | Meta Ads |
| `getInsights` / `updateCampaignStatus` | insights / pause-activate |
| `previewBulkDelete` / `executeBulkDelete` | exclusão em massa (IDs) |
| `listAdsMetaTools` / `listMetaTools` | catálogo Meta |
| `adsGoogleStatus` | stub Google |

## Fora de escopo

- CRM writes
- Google Ads (além do stub)
- Upload binário / geração de imagem por IA
- Apagar Meta Ads por nome
- Duas Ações no mesmo GPT (domínio `app.blimber.com.br` duplicado)
