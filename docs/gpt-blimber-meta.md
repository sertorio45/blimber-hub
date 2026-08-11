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
| GET | `/api/gpt/meta/campaigns/{id}?tenantId=` | `getCampaign` |
| POST | `/api/gpt/meta/campaigns/{id}/status` | `updateCampaignStatus` |
| GET | `/api/gpt/meta/adsets?...` | `listAdsets` |
| GET | `/api/gpt/meta/ads?...` | `listAds` |
| POST | `/api/gpt/meta/insights` | `getInsights` |
| POST | `/api/gpt/meta/invoke` | `invokeMetaTool` (fallback) |

`searchTenants` resolve nome → `tenantId` (só id/name/slug; busca administrativa com a API key global).  
Todas as Ações Meta ainda exigem `tenantId`. Mutações exigem `confirm: true` + `confirmTenantId === tenantId`.  
Contrato completo: `gpt/blimber-meta/openapi.yaml`.

## Segurança (resumo)

- Auth obrigatória; sem chave → 401; sem env → 503  
- Tokens Meta **nunca** nas respostas  
- HTTPS público obrigatório para Ações  
- Confirme mutações com o usuário antes de chamar a ação  

## Limitações

- Sem create/delete campaign, budget em massa, CAPI, Brand Center (MVP)  
- Timeout ~45s / payloads texto < ~100k (limites OpenAI)  
- Sempre passe o `tenantId` correto  

## Testes

```bash
pnpm test tests/meta-ads-tools.test.ts tests/gpt-meta-openapi.test.ts
```
