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

## Tools — Ação Marketing (27, host app.*)

| Tool / operationId | Uso |
|--------------------|-----|
| `searchTenants` | nome → tenantId |
| `listBlimberTools` | catálogo unificado |
| `listPosts` / `getPost` / `createPost` / `updatePost` / `submitPost` / `approvePost` / `schedulePost` / `publishPost` / `unschedulePost` | editorial; submitPost envia ao cliente; approvePost decide/bypass |
| `listEditorialCampaigns` / `getEditorialCampaign` / `createEditorialCampaign` / `updateEditorialCampaign` | campanha mensal |
| `getBrandContext` / `updateBrandContext` | Brand Center |
| `listMediaAssets` / `uploadMediaAsset` / `listSocialAccounts` | biblioteca / contas |
| `listApprovals` / `listApprovers` / `createReviewLink` / `listCalendar` / `invokeMarketingTool` | fila, aprovadores, link mágico, calendário, overflow |

### Draft → approved (MCP)

1. `searchTenants` → `tenantId`
2. `getPost` (confirme `editorialStatus: draft`)
3. Preview: `approvePost` com `dryRun: true` (path=`bypass` no rascunho; `decision` se já houver fila)
4. Execute:

```json
{
  "tenantId": "<uuid>",
  "confirmTenantId": "<mesmo uuid>",
  "confirm": true,
  "dryRun": false,
  "decision": "approved"
}
```

`BLIMBER_MCP_ACTOR_USER_ID` deve ser UUID de Superadministrador (`auth.users.app_metadata.role=admin`, staff do Hub — não `cliente`). Esse ator **não precisa ser membro da org do cliente** nem autor do post. Qualquer usuário com esse papel funciona como actor; UUID sem esse papel ainda exige membership + caps. Equivalente no Hub: bypass de aprovação — **não** um UPDATE solto em `editorial_status`. Alternativa: `updatePost` com `editorialStatus: "approved"` (mesmo domínio).

`changes_requested` / `rejected` exigem `approval_request` pendente + `comment`. `decision: draft` cancela a fila (`cancelApprovalRun`).

### Enviar ao cliente (MCP)

1. `listApprovers` → `approverIds`
2. Preview: `submitPost` `dryRun: true` (`stage: client` default)
3. Execute:

```json
{
  "tenantId": "<uuid>",
  "confirmTenantId": "<mesmo uuid>",
  "confirm": true,
  "dryRun": false,
  "approverIds": ["<uuid-do-aprovador>"],
  "stage": "client"
}
```

Abre `client_review` via `startApprovalWorkflow` (simple_client). Superadmin sem membership. Não use `approvePost` para enviar.

### Agendar / publicar (MCP)

O Hub **não** agenda só com `scheduled_at`. Precisa `enqueueApprovedPost` (`publication_jobs` + `publication_status=scheduled`). Timezone: `America/Sao_Paulo` (BRT, UTC-3). Sempre ISO com offset.

1. `getPost` — `editorialStatus` deve ser `approved` (senão `approvePost` primeiro; 409 `NOT_APPROVED`)
2. Preview: `schedulePost` `dryRun: true`
3. Execute:

```json
{
  "tenantId": "<uuid>",
  "confirmTenantId": "<mesmo uuid>",
  "confirm": true,
  "dryRun": false,
  "scheduledAt": "2026-08-17T19:00:00-03:00",
  "timezone": "America/Sao_Paulo"
}
```

Publicar agora: `publishPost` (mesmo confirm/dryRun). Cancelar agenda: `unschedulePost`. Equivalente: `updatePost` com `scheduledAt` ou `publicationStatus: "scheduled"|"published"|"not_scheduled"`.


## Tools — Ação Ads (26, host ads.*)

| Tool / operationId | Uso |
|--------------------|-----|
| `listMetaTools` / `listIntegrations` / `listAdAccounts` | catálogo / status / contas |
| `searchInterests` / `searchGeolocations` / `listCustomAudiences` | IDs de interesse/cidade/audiences para targeting |
| `listCampaigns` / `getCampaign` / `createCampaign` / `updateCampaignStatus` | campanhas Meta |
| `listAdsets` / `createAdset` / `updateAdsetStatus` / `updateAdsetBudget` / `updateAdsetTargeting` | adsets |
| `listAds` / `createAd` / `updateAdStatus` / `updateAdCreativeCopy` / `updateAdMedia` / `updateAdTracking` | anúncios (`createAd.creativeType`: IMAGE\|VIDEO\|CAROUSEL; tracking Pixel/Dataset) |
| `getInsights` / `previewBulkDelete` / `executeBulkDelete` / `invokeMetaTool` | insights / bulk / invoke |

Keep vs drop: `gpt/blimber/README.md`.
