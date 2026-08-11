---
name: blimber-platform
description: >-
  Plataforma Blimber unificada no ChatGPT (Marketing editorial + platform +
  aliases ads.meta). Posts, campanhas social_campaigns, brand, biblioteca.
  Meta Ads paga continua em gpt/blimber-meta /api/gpt/meta/*. Sem SQL direto.
---

# Blimber Platform (MCP / GPT unificado)

> Pack primário unificado: `gpt/blimber/`.  
> Meta Ads completo (write): `gpt/blimber-meta/` — **compatível**, mesma API key.  
> Docs: `docs/mcp-blimber-platform.md`

## Quando usar

- Conteúdo mensal / posts / calendário editorial
- Campanhas `social_campaigns` (não pagas)
- Brand Context / biblioteca de mídia
- Descobrir `tenantId` por nome
- Encaminhar Ads Meta pagos ao pack/rotas Meta

## Como operar

1. Importar `gpt/blimber/openapi.yaml` nas Ações do GPT.
2. Bearer `BLIMBER_MCP_API_KEY`.
3. Sempre `searchTenants` se faltar UUID.
4. Mutações: dryRun → confirmar → `dryRun: false` + `confirm` + `confirmTenantId`.
5. Respostas em **PT-BR**.

## Tools (MVP)

| Tool / operationId | Uso |
|--------------------|-----|
| `searchTenants` | nome → tenantId |
| `listBlimberTools` | catálogo unificado |
| `listPosts` / `createPost` / `updatePost` | conteúdo editorial |
| `listEditorialCampaigns` / `createEditorialCampaign` | campanha mensal |
| `getBrandContext` | Brand Center |
| `listMediaAssets` / `listSocialAccounts` | biblioteca / contas |
| `listAdsMetaTools` | ponte Meta |
| `adsGoogleStatus` | stub Google |

## Fora de escopo (nesta fase)

- CRM writes
- Google Ads
- Upload binário / geração de imagem por IA
- Apagar Meta Ads por nome
