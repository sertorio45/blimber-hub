# Pack GPT — Blimber Hub (2 Ações)

**Duas Ações** no mesmo GPT: Marketing editorial + Meta Ads (set completo).

O ChatGPT aceita **no máximo 30 operations por Ação** e **recusa o mesmo hostname** em duas Ações. Por isso o pack importa **dois YAML** com hosts diferentes.

| Artefato | Arquivo |
|----------|---------|
| OpenAPI Marketing (**importe**) | `openapi-marketing.yaml` → `https://app.blimber.com.br` (13 ops) |
| OpenAPI Ads (**importe**) | `openapi-ads.yaml` → `https://ads.blimber.com.br` (21 ops) |
| Índice (**não importe**) | `openapi.yaml` |
| Instruções | `instructions.md` |
| Setup 2 Ações + DNS | `docs/gpt-blimber-ACTIONS.md` |
| Skill (platform) | `skills/blimber-platform/SKILL.md` |
| Skill (hub espelho) | `skills/blimber-hub/SKILL.md` |

## Setup

1. GPT → colar `instructions.md` (a partir de “Você é o assistente…”)
2. **Ações → duas Ações:**
   - Marketing: `openapi-marketing.yaml` → Bearer `BLIMBER_MCP_API_KEY`
   - Ads: `openapi-ads.yaml` → mesma Bearer key
3. **Não** importe `openapi.yaml` (índice).
4. **Não** importe `../blimber-meta/openapi.yaml` neste GPT (host `app.blimber.com.br` = duplicado com Marketing).
5. Pack `gpt/blimber-meta` = **outro GPT** (só Ads, standby, host `app.*`).
6. Env: `BLIMBER_MCP_API_KEY` + `BLIMBER_MCP_ACTOR_USER_ID` (creates editoriais)
7. Domínio alias: adicione `ads.blimber.com.br` no Vercel (mesmo projeto). Ver `docs/gpt-blimber-ACTIONS.md`.

Docs: `docs/mcp-blimber-platform.md`, `docs/gpt-blimber-MARKETING.md`, `docs/gpt-blimber-UNIFIED-PLAN.md`.

## Operations

### Ação Marketing (13) — `app.blimber.com.br`

| operationId | Path |
|-------------|------|
| `searchTenants` | `GET /api/gpt/tenants` |
| `listBlimberTools` | `GET /api/gpt/tools` |
| `listSocialAccounts` | `GET /api/gpt/marketing/accounts` |
| `listMediaAssets` | `GET /api/gpt/marketing/assets` |
| `getBrandContext` | `GET /api/gpt/marketing/brand-context` |
| `listPosts` | `GET /api/gpt/marketing/posts` |
| `createPost` | `POST /api/gpt/marketing/posts` |
| `getPost` | `GET /api/gpt/marketing/posts/{postId}` |
| `updatePost` | `PUT /api/gpt/marketing/posts/{postId}` |
| `listEditorialCampaigns` | `GET /api/gpt/marketing/campaigns` |
| `createEditorialCampaign` | `POST /api/gpt/marketing/campaigns` |
| `getEditorialCampaign` | `GET /api/gpt/marketing/campaigns/{campaignId}` |
| `updateEditorialCampaign` | `PUT /api/gpt/marketing/campaigns/{campaignId}` |

### Ação Ads (21) — `ads.blimber.com.br`

Sem `searchTenants` (canônico na Ação Marketing).

| operationId | Path |
|-------------|------|
| `listMetaTools` | `GET /api/gpt/meta/tools` |
| `listIntegrations` | `GET /api/gpt/meta/integrations` |
| `listAdAccounts` | `GET /api/gpt/meta/ad-accounts` |
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
