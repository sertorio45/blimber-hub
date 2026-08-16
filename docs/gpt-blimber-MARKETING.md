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
| GET | `/api/gpt/marketing/posts?...` | `listPosts` |
| POST | `/api/gpt/marketing/posts` | `createPost` |
| GET | `/api/gpt/marketing/posts/{id}?tenantId=` | `getPost` |
| PUT | `/api/gpt/marketing/posts/{id}` | `updatePost` |
| DELETE | `/api/gpt/marketing/posts/{id}` | `deletePost` |
| GET | `/api/gpt/marketing/campaigns?...` | `listEditorialCampaigns` |
| POST | `/api/gpt/marketing/campaigns` | `createEditorialCampaign` |
| GET | `/api/gpt/marketing/campaigns/{id}?tenantId=` | `getEditorialCampaign` |
| PUT | `/api/gpt/marketing/campaigns/{id}` | `updateEditorialCampaign` |

## Fluxos sugeridos

### 1. Planejar mês editorial

1. `searchTenants` → `tenantId`
2. `getBrandContext` (tom, CTAs, restrições)
3. `createEditorialCampaign` com `dryRun: true` → confirmar → `dryRun: false`
4. `createPost` com `campaignId` da campanha editorial

### 2. Criar post com referência de mídia

1. `uploadMediaAsset` com `sourceUrl` HTTPS pública (`dryRun: true` → confirmar → `dryRun: false`) **ou** `listMediaAssets` se o arquivo já estiver no Hub
2. `createPost` com `referenceAssetIds: [...]`
3. Opcional: `accountId` + `platform` de `listSocialAccounts`

### 3. Editar rascunho

1. `listPosts` / `getPost`
2. `updatePost` dryRun → confirmar → execute  
   (bloqueado se `published` / `publishing`)

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
