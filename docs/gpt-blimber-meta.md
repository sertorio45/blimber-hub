# Blimber Meta Ads no ChatGPT

Experiência **primária**: GPT personalizado + **Ações** (Actions / OpenAPI) + **Habilidade** (Skill) OpenAI.  
MCP stdio (Cursor / Claude Desktop) é **opcional** — ver [`mcp-blimber-meta.md`](./mcp-blimber-meta.md).

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

Pack importável: [`gpt/blimber-meta/`](../gpt/blimber-meta/)

| Artefato | Caminho |
|----------|---------|
| **Tutorial** | `docs/gpt-blimber-meta-TUTORIAL.md` |
| OpenAPI 3.0.3 | `gpt/blimber-meta/openapi.yaml` |
| Instruções (colar na UI) | `gpt/blimber-meta/instructions.md` |
| Skill | `gpt/blimber-meta/skills/blimber-meta-ads/SKILL.md` |
| Setup Ações | `gpt/blimber-meta/gpt-actions.md` |

## Setup rápido

1. Deploy HTTPS público + `BLIMBER_MCP_API_KEY` (ver `.env.example`)
2. **Criar** GPT → colar `instructions.md` em **Instruções**
3. **Ações** → **Criar nova ação** → importar `openapi.yaml` → `servers.url` → **Autenticação**: **Chave de API** + **Bearer**
4. Anexar Habilidade em **Conhecimento** / **Habilidades** (`skills/blimber-meta-ads` ou ZIP)
5. Testar: nome do cliente → `searchTenants` → insights / campanhas (ou `tenantId` direto)

Passo a passo numerado, prompts e troubleshooting: **[Tutorial](./gpt-blimber-meta-TUTORIAL.md)**.

## Endpoints REST (`/api/gpt/meta`)

| Método | Path | operationId |
|--------|------|-------------|
| GET | `/api/gpt/meta/tenants?q=` | `searchTenants` |
| GET | `/api/gpt/meta/tools` | `listMetaTools` |
| GET | `/api/gpt/meta/integrations?tenantId=` | `listIntegrations` |
| GET | `/api/gpt/meta/ad-accounts?tenantId=` | `listAdAccounts` |
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
Contrato completo: `gpt/blimber-meta/openapi.yaml`.

## Segurança (resumo)

- Auth obrigatória; sem chave → 401; sem env → 503  
- Tokens Meta **nunca** nas respostas  
- HTTPS público obrigatório para Ações  
- Confirme mutações com o usuário antes de chamar a ação (mostrar → confirmar → mutar)  

## Limitações

- Sem CAPI, Brand Center / geração de imagem  
- Targeting de adset só via templates fechados (`BR_*`) — sem Graph targeting livre  
- Create/edit ad: criativo link/page + mídia tipada (`imageUrl`|`imageHash`); exige page token  
- Sem `video_id` / upload binário / carousel no edit de mídia  
- Bulk delete: **só IDs explícitos** (nunca por nome); preview + `previewToken` obrigatórios  
- Timeout ~45s / payloads texto < ~100k (limites OpenAI)  
- Sempre passe o `tenantId` correto  

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
