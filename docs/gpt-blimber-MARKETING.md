# Blimber GPT — Marketing editorial

Como usar as tools de **Marketing** do hub unificado (`gpt/blimber/`).

> **Não é Meta Ads.** Campanhas aqui são `social_campaigns` (editorial).  
> Ads pagos: Ação Ads do mesmo GPT (`gpt/blimber/openapi-ads.yaml`, host `ads.blimber.com.br`) — set completo (list/create/status/bulk/budget/copy).  
> Pack standalone Ads-only foi **removido**. Setup: [gpt-blimber-ACTIONS.md](./gpt-blimber-ACTIONS.md).

## Pré-requisitos

| Env | Uso |
|-----|-----|
| `BLIMBER_MCP_API_KEY` | Bearer nas Ações |
| `BLIMBER_MCP_ACTOR_USER_ID` | UUID de `auth.users` (staff/sistema) usado em `created_by` nas criações |

Preview (`dryRun=true`, default) **não** exige actor. Execute (`dryRun=false`) sem actor retorna `503 ACTOR_REQUIRED` — defina o env **ou** envie `actorUserId` no body.

## Endpoints

| Método | Path | operationId |
|--------|------|-------------|
| GET | `/api/gpt/tenants?q=` | `searchTenants` |
| GET | `/api/gpt/marketing/accounts?tenantId=` | `listSocialAccounts` |
| GET | `/api/gpt/marketing/assets?tenantId=` | `listMediaAssets` |
| POST | `/api/gpt/marketing/assets/upload` | `uploadMediaAsset` |
| GET | `/api/gpt/marketing/brand-context?tenantId=` | `getBrandContext` |
| PUT | `/api/gpt/marketing/brand-context` | `updateBrandContext` |
| GET | `/api/gpt/marketing/posts?...` | `listPosts` |
| POST | `/api/gpt/marketing/posts` | `createPost` |
| GET | `/api/gpt/marketing/posts/{id}?tenantId=` | `getPost` |
| PUT | `/api/gpt/marketing/posts/{id}` | `updatePost` |
| POST | `/api/gpt/marketing/posts/{id}/approve` | `approvePost` |
| POST | `/api/gpt/marketing/posts/{id}/submit` | `submitPost` |
| POST | `/api/gpt/marketing/posts/{id}/schedule` | `schedulePost` |
| POST | `/api/gpt/marketing/posts/{id}/publish` | `publishPost` |
| POST | `/api/gpt/marketing/posts/{id}/unschedule` | `unschedulePost` |
| POST | `/api/gpt/marketing/posts/{id}/delete` | `deletePost` |
| GET | `/api/gpt/marketing/campaigns?...` | `listEditorialCampaigns` |
| POST | `/api/gpt/marketing/campaigns` | `createEditorialCampaign` |
| GET | `/api/gpt/marketing/campaigns/{id}?tenantId=` | `getEditorialCampaign` |
| PUT | `/api/gpt/marketing/campaigns/{id}` | `updateEditorialCampaign` |
| GET | `/api/gpt/marketing/approvals` | `listApprovals` |
| POST | `/api/gpt/marketing/approvals/{id}/review-link` | `createReviewLink` |
| GET | `/api/gpt/marketing/approvers` | `listApprovers` |
| GET | `/api/gpt/marketing/calendar` | `listCalendar` |
| POST | `/api/gpt/marketing/invoke` | `invokeMarketingTool` |

## Fluxos sugeridos

### 1. Planejar mês editorial

1. `searchTenants` → `tenantId`
2. `getBrandContext` (tom, CTAs, restrições)
3. `createEditorialCampaign` com `dryRun: true` → confirmar → `dryRun: false`
4. `createPost` com `campaignId` da campanha editorial

### 2. Criar post com mídia (biblioteca e/ou upload no mesmo call)

1. `listSocialAccounts` → `accountId` + `platform` (obrigatório para peças de **publicação**)
2. Já na biblioteca: `listMediaAssets` (`purpose=publication`) → `createPost.assetIds`
3. Upload no mesmo `createPost`: `sourceUrls` (HTTPS) e/ou `sourceBase64` — mesmo pipeline/SSRF da biblioteca. `dryRun: true` lista o plano **sem** gravar.
4. Referência de arte (não publicada): `referenceAssetIds` (`purpose=reference`)
5. Só biblioteca, sem post: `uploadMediaAsset`

Estático/story/vídeo = 1 arquivo; carrossel até 10. Tenant isolado. Agendar: `schedulePost` (após aprovado).

### 3. Editar rascunho

1. `listPosts` / `getPost`
2. `updatePost` dryRun → confirmar → execute  
   (bloqueado se `published` / `publishing`)

### 3b. Aprovar rascunho (draft → approved)

1. `getPost` — confirme `editorialStatus`
2. `approvePost` com `dryRun: true` (preview `path`: `bypass` no rascunho, `decision` se houver fila)
3. Confirme com o usuário → `approvePost` com `dryRun: false`, `confirm: true`, `confirmTenantId === tenantId`
4. O ator (`BLIMBER_MCP_ACTOR_USER_ID`) precisa ser Superadministrador (`app_metadata.role=admin`, staff do Hub) **ou** ter membership na org + `marketing.social.approval.bypass` / caps de decisão. Superadmin **não** precisa ser membro da org do cliente nem autor do post. UUID que não for staff continua 403 sem membership. Usa `bypassApproval` / `submitApprovalDecision` — não atualiza `editorial_status` direto.

Equivalente: `updatePost` com `editorialStatus: "approved"` (e `status: "approved"` só como alias). `changes_requested` / `rejected` exigem `approval_request` pendente + `comment`.

### 3b2. Enviar para aprovação do cliente

1. `listApprovers` → `userId`s
2. `submitPost` `dryRun: true` (`stage: client` default, workflow simple_client)
3. Confirme → `dryRun: false` com `approverIds`, `confirm: true`, `confirmTenantId === tenantId`
4. Abre `client_review`. Decida depois com `approvePost` / `createReviewLink`.

### 3c. Agendar / publicar agora / cancelar agenda

O Hub agenda com `enqueueApprovedPost` (cria `publication_jobs` e `publication_status=scheduled`). Gravar só `scheduled_at` **não** agenda.

1. `getPost` — `editorialStatus` precisa ser `approved` (senão `approvePost` primeiro)
2. `schedulePost` `dryRun: true` → confirmar → `dryRun: false`
3. `scheduledAt` em ISO com offset. Timezone do Hub: `America/Sao_Paulo` (BRT, UTC-3). Ex. 19:00 BRT: `"2026-08-17T19:00:00-03:00"`
4. Publicar agora: `publishPost`. Cancelar: `unschedulePost` (não remove das redes)
5. Equivalente: `updatePost` com `scheduledAt` ou `publicationStatus: "scheduled"|"published"|"not_scheduled"`

Se o post não estiver aprovado, a tool retorna **409** `NOT_APPROVED` (aprove primeiro) em vez de deixar `not_scheduled`.

### 4. Remover duplicados de uma campanha

1. `getEditorialCampaign` (ou `listPosts` com `campaignId`) — liste ids/títulos
2. `deletePost` com `dryRun: true` → preview (`id`, `title`, `campaignId`)
3. Confirmar com o usuário → `deletePost` com `dryRun: false`
4. Um post por chamada (N duplicados = N executes). Soft-delete local (`deleted_at`); não remove das redes.

## Segurança

- Mutações exigem `confirm: true` e `confirmTenantId === tenantId`
- Default `dryRun: true`
- Respostas **nunca** incluem tokens OAuth
- Service role no servidor; isolamento por `tenant_id` em toda query

## Glossário rápido

| Usuário diz | Entidade | Tool |
|-------------|----------|------|
| “Campanha de maio / calendário” | `social_campaigns` | `*EditorialCampaign*` |
| “Post / conteúdo / peça” | `social_posts` | `*Post*` |
| “Campanha de anúncio / Ads / tráfego pago” | Meta Graph | `listCampaigns` / `createCampaign` (mesmo OpenAPI) |
| “Biblioteca / arte” | `media_assets` | `listMediaAssets` / `uploadMediaAsset` |

Plano geral: [gpt-blimber-UNIFIED-PLAN.md](./gpt-blimber-UNIFIED-PLAN.md).
