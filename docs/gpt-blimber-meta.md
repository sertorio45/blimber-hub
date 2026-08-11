# Blimber Meta Ads no ChatGPT

Experiência **primária**: Custom GPT + **Actions** (OpenAPI) + **Skill** OpenAI.  
MCP stdio (Cursor / Claude Desktop) é **opcional** — ver [`mcp-blimber-meta.md`](./mcp-blimber-meta.md).

> O plugin clássico ChatGPT (`ai-plugin.json` / `.well-known`) está **deprecated**.  
> Use Custom GPT Actions + arquivo de Skill (`SKILL.md`).

## Arquitetura

```
Usuário no ChatGPT
    │
    ▼
Custom GPT (Instructions + Skill)
    │  Actions (OpenAPI)
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
| OpenAPI 3.1 | `gpt/blimber-meta/openapi.yaml` |
| Instructions | `gpt/blimber-meta/instructions.md` |
| Skill | `gpt/blimber-meta/skills/blimber-meta-ads/SKILL.md` |
| Setup Actions | `gpt/blimber-meta/gpt-actions.md` |

## Passo a passo

### 1. Deploy / URL pública

O ChatGPT exige **HTTPS público** (TLS 1.2+). Localhost não serve para Actions.

Exemplo: `https://app.blimber.com.br`

### 2. Configurar API key

```bash
# .env / secrets do deploy
BLIMBER_MCP_API_KEY=uma-chave-longa-e-aleatoria
```

Também necessários (já do Hub):

```bash
SUPABASE_URL=
SUPABASE_SERVICE_KEY=          # ou SUPABASE_SERVICE_ROLE_KEY
MARKETING_ENCRYPTION_SECRET=   # decrypt de access_token_enc
META_GRAPH_VERSION=v20.0       # opcional
```

Fallback de auth: se `BLIMBER_MCP_API_KEY` estiver vazio, aceita `MARKETING_WORKER_SECRET`.

Headers aceitos:

- `Authorization: Bearer <chave>` ← **use no Custom GPT** (único scheme OpenAPI)
- `x-blimber-mcp-key: <chave>` ← scripts / bridge legado

### 3. Criar Custom GPT → Import Actions

1. ChatGPT → Create a GPT  
2. Cole [`instructions.md`](../gpt/blimber-meta/instructions.md) em **Instructions**  
3. Em **Actions**, importe [`openapi.yaml`](../gpt/blimber-meta/openapi.yaml)  
4. Ajuste `servers.url` se o host for outro  
5. Authentication → **API Key** → **Bearer** → cole `BLIMBER_MCP_API_KEY`

### 4. Skill

Anexe a pasta `gpt/blimber-meta/skills/blimber-meta-ads` ou gere o ZIP:

```bash
cd gpt/blimber-meta/skills
zip -r ../blimber-meta-ads.skill.zip blimber-meta-ads
```

Upload via ChatGPT Skills / Knowledge, conforme o fluxo da sua conta OpenAI.

### 5. Testar com tenantId real

```
Liste as integrações do tenant <TENANT_UUID> e diga se Meta está pronto.
```

```
Spend last_7d level=campaign do tenant <TENANT_UUID>.
```

```
Pause a campanha <CAMPAIGN_ID> do tenant <TENANT_UUID> (só depois da minha confirmação).
```

## Endpoints REST (`/api/gpt/meta`)

| Método | Path | operationId |
|--------|------|-------------|
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

Todas (exceto documentação) exigem API key. Mutações exigem `confirm: true` + `confirmTenantId === tenantId`.  
`updateCampaignStatus` marca `x-openai-isConsequential: true`.

## Segurança

- Auth obrigatória; sem chave → 401; sem env → 503  
- Tokens Meta **nunca** saem nas respostas das tools  
- URL precisa ser pública HTTPS  
- ChatGPT Actions: um único security scheme (Bearer) — não dependa de headers custom no schema  
- Confirme mutações com o usuário antes de chamar a Action

## Opcional (não é o caminho do usuário)

| Modo | Quando |
|------|--------|
| stdio MCP `pnpm mcp:meta` | Dev local Cursor/Claude |
| `POST /api/internal/mcp/meta/invoke` | Bridge legado de agents |
| Skill Cursor `.agents/skills/blimber-meta-ads` | Legacy — aponta para este fluxo GPT |

## Limitações

- HTTPS público obrigatório para Actions  
- Timeout ~45s / payloads texto < ~100k (limites OpenAI)  
- MVP sem create/delete campaign, budget em massa, CAPI, Brand Center  
- O GPT assume trust da API key: **sempre** passe o `tenantId` correto

## Testes

```bash
pnpm test tests/meta-ads-tools.test.ts tests/gpt-meta-openapi.test.ts
```
