# Blimber Meta Ads no ChatGPT

Experiência **primária**: GPT personalizado + **Ações** (Actions / OpenAPI) + **Habilidade** (Skill) OpenAI.  
MCP stdio (Cursor / Claude Desktop) é **opcional** — ver [`mcp-blimber-meta.md`](./mcp-blimber-meta.md).

> **Hub unificado (Marketing + Meta Ads):** [`mcp-blimber-platform.md`](./mcp-blimber-platform.md) e pack `gpt/blimber/` — **duas Ações** (`openapi-marketing.yaml` + `openapi-ads.yaml`, hosts `app.*` e `ads.*`). Setup: [`gpt-blimber-ACTIONS.md`](./gpt-blimber-ACTIONS.md).  
> Ads no ChatGPT = [`gpt/blimber/openapi-ads.yaml`](../gpt/blimber/openapi-ads.yaml). Pack standalone Ads-only **removido**.

> Plano: [`gpt-blimber-UNIFIED-PLAN.md`](./gpt-blimber-UNIFIED-PLAN.md) · marketing [`gpt-blimber-MARKETING.md`](./gpt-blimber-MARKETING.md)

> **Tutorial completo (passo a passo, prompts, troubleshooting):**  
> [`gpt-blimber-meta-TUTORIAL.md`](./gpt-blimber-meta-TUTORIAL.md)

> O plugin clássico ChatGPT (`ai-plugin.json` / `.well-known`) está **descontinuado**.  
> Use **Ações** do GPT + arquivo de Habilidade (`SKILL.md`).

## Onde achar na interface (PT)

**Explorar GPTs** → **Criar** (ou **Meus GPTs** → **Editar GPT**) → aba **Configurar** → **Instruções** + **Ações** (**Criar nova ação**) + **Conhecimento** / **Habilidades** → **Criar** ou **Atualizar**.

Detalhes: [Tutorial — Onde achar na interface (PT)](./gpt-blimber-meta-TUTORIAL.md#onde-achar-na-interface-pt).

## Arquitetura

```
Usuário no ChatGPT
    │
    ▼
GPT personalizado (Instruções + Habilidade)
    │  Ações (OpenAPI)
    ▼
HTTPS POST/GET  /api/gpt/meta/*
Authorization: Bearer BLIMBER_MCP_API_KEY
    │
    ▼
lib/meta-ads (tools tipadas — sem alteração de domínio)
    │
    ├─ marketing_integrations (token AES por tenant)
    └─ Meta Graph API
```

Contrato Ads: [`gpt/blimber/openapi-ads.yaml`](../gpt/blimber/openapi-ads.yaml) (host `ads.blimber.com.br`).

| Artefato | Caminho |
|----------|---------|
| **Tutorial** | `docs/gpt-blimber-meta-TUTORIAL.md` |
| OpenAPI Ads 3.0.3 | `gpt/blimber/openapi-ads.yaml` |
| OpenAPI Marketing | `gpt/blimber/openapi-marketing.yaml` |
| Instruções (colar na UI) | `gpt/blimber/instructions.md` |
| Skill (Cursor) | `.agents/skills/blimber-meta-ads/SKILL.md` |
| Setup 2 Ações | `docs/gpt-blimber-ACTIONS.md` |

## Setup rápido

1. Deploy HTTPS público + `BLIMBER_MCP_API_KEY` (ver `.env.example`) + alias DNS `ads.blimber.com.br`
2. **Criar** GPT → colar `gpt/blimber/instructions.md` em **Instruções**
3. **Ações** → duas Ações: `openapi-marketing.yaml` (`app.*`) + `openapi-ads.yaml` (`ads.*`) → **Autenticação**: **Chave de API** + **Bearer**
4. Testar: nome do cliente → `searchTenants` (Marketing) → insights / campanhas na Ação Ads (ou `tenantId` direto)

Passo a passo numerado, prompts e troubleshooting: **[Tutorial](./gpt-blimber-meta-TUTORIAL.md)**.

## Endpoints REST (`/api/gpt/meta`)

| Método | Path | operationId |
|--------|------|-------------|
| GET | `/api/gpt/meta/tenants?q=` | `searchTenants` |
| GET | `/api/gpt/meta/tools` | `listMetaTools` |
| GET | `/api/gpt/meta/integrations?tenantId=` | `listIntegrations` |
| GET | `/api/gpt/meta/ad-accounts?tenantId=` | `listAdAccounts` |
| GET | `/api/gpt/meta/targeting/interests?...` | `searchInterests` |
| GET | `/api/gpt/meta/targeting/geolocations?...` | `searchGeolocations` |
| GET | `/api/gpt/meta/custom-audiences?...` | `listCustomAudiences` |
| GET | `/api/gpt/meta/campaigns?...` | `listCampaigns` |
| POST | `/api/gpt/meta/campaigns` | `createCampaign` |
| GET | `/api/gpt/meta/campaigns/{id}?tenantId=` | `getCampaign` |
| POST | `/api/gpt/meta/campaigns/{id}/status` | `updateCampaignStatus` |
| GET | `/api/gpt/meta/adsets?...` | `listAdsets` |
| POST | `/api/gpt/meta/adsets` | `createAdset` |
| POST | `/api/gpt/meta/adsets/{id}/status` | `updateAdsetStatus` |
| GET | `/api/gpt/meta/ads?...` | `listAds` |
| POST | `/api/gpt/meta/ads` | `createAd` |
| POST | `/api/gpt/meta/ads/{id}/status` | `updateAdStatus` |
| POST | `/api/gpt/meta/insights` | `getInsights` |
| POST | `/api/gpt/meta/invoke` | `invokeMetaTool` (fallback) |

`searchTenants` resolve nome → `tenantId` (só id/name/slug; busca administrativa com a API key global).  
Todas as Ações Meta ainda exigem `tenantId`. Mutações exigem `confirm: true` + `confirmTenantId === tenantId`.  
Contrato completo: `gpt/blimber/openapi-ads.yaml` (host `ads.blimber.com.br`). `searchTenants` canônico: Ação Marketing (`GET /api/gpt/tenants`).

## Segurança (resumo)

- Auth obrigatória; sem chave → 401; sem env → 503  
- Tokens Meta **nunca** nas respostas  
- HTTPS público obrigatório para Ações  
- Confirme mutações com o usuário antes de chamar a ação (mostrar → confirmar → mutar)  

## Limitações

- Sem CAPI, Brand Center / geração de imagem por IA  
- Targeting de adset: presets `BR_*` **ou** objeto `targeting` customizado (XOR; geo obrigatório). IDs via `searchInterests` / `searchGeolocations` / `listCustomAudiences`  
- Create/edit ad: `creativeId` XOR criativo tipado; mídia via `imageHash`/`videoId` **ou** upload HTTPS (`imageUrl`/`videoUrl`) com SSRF check  
- Bulk delete: **só IDs explícitos** (nunca por nome); preview + `previewToken` obrigatórios  
- Timeout ~45s / payloads texto < ~100k (limites OpenAI)  
- Sempre passe o `tenantId` correto  

## META CREATIVE CAPABILITIES

Graph default do projeto: `META_GRAPH_VERSION` ou **v20.0** (`lib/meta-ads/graph.ts`). Não subir versão silenciosamente.

| Capacidade | Status | Notas |
|------------|--------|-------|
| IMAGE / VIDEO / CAROUSEL (misto) | ✅ | `object_story_spec`; CAROUSEL WEBSITE only |
| Upload/reuse imagem | ✅ | `meta_upload_image` + createAd `imageUrl`\|`imageHash` |
| Upload/reuse vídeo | ✅ | `meta_upload_video` + `meta_get_video_status` |
| Ad a partir de `creativeId` | ✅ | XOR com campos de criativo novo |
| Advantage+ Creative | ✅ | `degreesOfFreedomSpec` tipado (`pac_relaxation`, `text_optimizations`, …) |
| Mídia flexível (Ads Manager) | ✅ | = Advantage+ `pac_relaxation` — **não** é Dynamic Creative |
| Flexible Ad Format | ❌ | `creative_asset_groups_spec` não modelado; `META_GRAPH_VERSION` sobe Graph sem mudar default v20 e **não** habilita sozinho |
| DYNAMIC_CREATIVE_LEGACY | ✅ | `asset_feed_spec` + adset `is_dynamic_creative=true` (`createAdset.isDynamicCreative`); WEBSITE only |
| Catalog / Advantage+ Catalog | ✅ | `meta_list_catalogs` + `meta_list_product_sets` + creativeType `CATALOG` |
| Collection | ❌ | Instant Experience/canvas não implementado |
| A/B Experiments | ✅ | `meta_create_experiment` / get / stop — `SPLIT_TEST_V2` (ads) e `SPLIT_TEST` (adsets) |
| WEBSITE + WHATSAPP CTWA | ✅ | Preservados |

Descoberta runtime: `meta_get_capabilities` / `GET /api/gpt/meta/tools` / `invokeMetaTool` (overflow ≤30 ops OpenAPI).

Roadmap de escrita (create / edit / bulk delete): [`gpt-blimber-meta-WRITE-PLAN.md`](./gpt-blimber-meta-WRITE-PLAN.md) — **etapas 0–6 concluídas**.  
**Etapa 0:** [`gpt-blimber-meta-WRITE-ETAPA-0.md`](./gpt-blimber-meta-WRITE-ETAPA-0.md) — guards, dry-run, limites e audit.  
**Etapa 1:** [`gpt-blimber-meta-WRITE-ETAPA-1.md`](./gpt-blimber-meta-WRITE-ETAPA-1.md) — status adset/ad + `write_readiness`.  
**Etapa 2:** [`gpt-blimber-meta-WRITE-ETAPA-2.md`](./gpt-blimber-meta-WRITE-ETAPA-2.md) — `meta_create_campaign` (PAUSED / dryRun default true).  
**Etapa 3:** [`gpt-blimber-meta-WRITE-ETAPA-3.md`](./gpt-blimber-meta-WRITE-ETAPA-3.md) — `meta_create_adset` (templates BR_*).  
**Etapa 4:** [`gpt-blimber-meta-WRITE-ETAPA-4.md`](./gpt-blimber-meta-WRITE-ETAPA-4.md) — `meta_create_ad` (AdCreative link/page + Ad).  
**Etapa 5:** [`gpt-blimber-meta-WRITE-ETAPA-5.md`](./gpt-blimber-meta-WRITE-ETAPA-5.md) — edits budget / targeting / copy / media.  
**Etapa 6:** [`gpt-blimber-meta-WRITE-ETAPA-6.md`](./gpt-blimber-meta-WRITE-ETAPA-6.md) — bulk delete (preview → execute).

## Testes

```bash
pnpm test tests/meta-ads-tools.test.ts tests/meta-write-guards.test.ts tests/gpt-meta-openapi.test.ts
```
