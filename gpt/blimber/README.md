# Pack GPT — Blimber Hub (2 Ações)

**Duas Ações** no mesmo GPT: Marketing editorial + Meta Ads (set completo).

O ChatGPT aceita **no máximo 30 operations por Ação** e **recusa o mesmo hostname** em duas Ações. Por isso o pack importa **dois YAML** com hosts diferentes.

| Artefato | Arquivo |
|----------|---------|
| OpenAPI Marketing (**importe**) | `openapi-marketing.yaml` → `https://app.blimber.com.br` (17 ops) |
| OpenAPI Ads (**importe**) | `openapi-ads.yaml` → `https://ads.blimber.com.br` (26 ops) |
| Índice (**não importe**) | `openapi.yaml` |
| Instruções | `instructions.md` |
| Setup 2 Ações + DNS | `docs/gpt-blimber-ACTIONS.md` |
| Skill | `skills/blimber-platform/SKILL.md` |
| Plugin MCP (ChatGPT Dev Mode) | `docs/gpt-blimber-MCP-PLUGIN.md` → `https://app.blimber.com.br/api/mcp` |

## Setup

### Opção A — GPT Actions (2 OpenAPI)

1. GPT → colar `instructions.md` (a partir de “Você é o assistente…”)
2. **Ações → duas Ações:**
   - Marketing: `openapi-marketing.yaml` → Bearer `BLIMBER_MCP_API_KEY`
   - Ads: `openapi-ads.yaml` → mesma Bearer key
3. **Não** importe `openapi.yaml` (índice).
4. Ads no ChatGPT = `openapi-ads.yaml`. Pack standalone `gpt/blimber-meta/` **removido**.
5. Env: `BLIMBER_MCP_API_KEY` + `BLIMBER_MCP_ACTOR_USER_ID` (staff/sistema; só exigido no execute, não no preview)
6. Domínio alias: adicione `ads.blimber.com.br` no Vercel (mesmo projeto). Ver `docs/gpt-blimber-ACTIONS.md`.

### Opção B — Plugin MCP (Developer Mode)

Uma conexão com **todas** as tools (~38), mesmo backend `/api/gpt/*`:

1. ChatGPT → Developer Mode → **Novo plugin**
2. URL: `https://app.blimber.com.br/api/mcp`
3. Auth: API Key Bearer → `BLIMBER_MCP_API_KEY`
4. Detalhes: `docs/gpt-blimber-MCP-PLUGIN.md`

Local / túnel: `pnpm mcp:blimber` → `http://127.0.0.1:8787/mcp`

Docs: `docs/mcp-blimber-platform.md`, `docs/gpt-blimber-MARKETING.md`, `docs/gpt-blimber-UNIFIED-PLAN.md`.

## Operations

### Ação Marketing (17) — `app.blimber.com.br`

| operationId | Path |
|-------------|------|
| `searchTenants` | `GET /api/gpt/tenants` |
| `listBlimberTools` | `GET /api/gpt/tools` |
| `listSocialAccounts` | `GET /api/gpt/marketing/accounts` |
| `listMediaAssets` | `GET /api/gpt/marketing/assets` |
| `uploadMediaAsset` | `POST /api/gpt/marketing/assets/upload` |
| `getBrandContext` | `GET /api/gpt/marketing/brand-context` |
| `listPosts` | `GET /api/gpt/marketing/posts` |
| `createPost` | `POST /api/gpt/marketing/posts` |
| `getPost` | `GET /api/gpt/marketing/posts/{postId}` |
| `updatePost` | `PUT /api/gpt/marketing/posts/{postId}` |
| `approvePost` | `POST /api/gpt/marketing/posts/{postId}/approve` |
| `deletePost` | `POST /api/gpt/marketing/posts/{postId}/delete` |
| `deleteMediaAsset` | `POST /api/gpt/marketing/assets/{assetId}/delete` |
| `listEditorialCampaigns` | `GET /api/gpt/marketing/campaigns` |
| `createEditorialCampaign` | `POST /api/gpt/marketing/campaigns` |
| `getEditorialCampaign` | `GET /api/gpt/marketing/campaigns/{campaignId}` |
| `updateEditorialCampaign` | `PUT /api/gpt/marketing/campaigns/{campaignId}` |

### Ação Ads (24) — `ads.blimber.com.br`

Sem `searchTenants` (canônico na Ação Marketing).

| operationId | Path |
|-------------|------|
| `listMetaTools` | `GET /api/gpt/meta/tools` |
| `listIntegrations` | `GET /api/gpt/meta/integrations` |
| `listAdAccounts` | `GET /api/gpt/meta/ad-accounts` |
| `searchInterests` | `GET /api/gpt/meta/targeting/interests` |
| `searchGeolocations` | `GET /api/gpt/meta/targeting/geolocations` |
| `listCustomAudiences` | `GET /api/gpt/meta/custom-audiences` |
| `listCampaigns` | `GET /api/gpt/meta/campaigns` |
| `createCampaign` | `POST /api/gpt/meta/campaigns` |
| `getCampaign` | `GET /api/gpt/meta/campaigns/{campaignId}` |
| `updateCampaignStatus` | `POST /api/gpt/meta/campaigns/{campaignId}/status` |
| `listAdsets` | `GET /api/gpt/meta/adsets` |
| `createAdset` | `POST /api/gpt/meta/adsets` |
| `updateAdsetStatus` | `POST /api/gpt/meta/adsets/{adsetId}/status` |
| `updateAdsetBudget` | `POST /api/gpt/meta/adsets/{adsetId}/budget` |
| `updateAdsetTargeting` | `POST /api/gpt/meta/adsets/{adsetId}/targeting` |
| `listAds` | `GET /api/gpt/meta/ads` |
| `createAd` | `POST /api/gpt/meta/ads` |
| `updateAdStatus` | `POST /api/gpt/meta/ads/{adId}/status` |
| `updateAdCreativeCopy` | `POST /api/gpt/meta/ads/{adId}/creative-copy` |
| `updateAdMedia` | `POST /api/gpt/meta/ads/{adId}/media` |
| `updateAdTracking` | `POST /api/gpt/meta/ads/{adId}/tracking` |
| `previewBulkDelete` | `POST /api/gpt/meta/bulk-delete/preview` |
| `executeBulkDelete` | `POST /api/gpt/meta/bulk-delete/execute` |
| `getInsights` | `POST /api/gpt/meta/insights` |
| `invokeMetaTool` | `POST /api/gpt/meta/invoke` |

### Fora do GPT unificado

| operationId | Motivo |
|-------------|--------|
| `searchTenantsMetaCompat` (`/api/gpt/meta/tenants`) | Duplicado — use `searchTenants` na Ação Marketing |
| `getBrandContextAlias` | Duplicado de `getBrandContext` |
| `listMarketingTools` / `listAdsMetaTools` | Catálogos redundantes |
| `adsGoogleStatus` | Stub Google |

Rotas HTTP no backend **não** foram removidas.

## Reimportar no ChatGPT

1. Abra o GPT → **Configurar** → **Ações**
2. Apague a Ação antiga (YAML unificado)
3. Importe `openapi-marketing.yaml` e `openapi-ads.yaml` (duas Ações)
4. Auth: Bearer `BLIMBER_MCP_API_KEY` em ambas
5. Confirme hosts: `app.blimber.com.br` ≠ `ads.blimber.com.br`, cada spec ≤30 ops
