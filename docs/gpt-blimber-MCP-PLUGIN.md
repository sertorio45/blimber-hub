# Plugin MCP Blimber — ChatGPT Developer Mode

Conecte o **mesmo backend** das GPT Actions (Marketing + Meta Ads) como **plugin MCP remoto** no ChatGPT, sem importar dois YAMLs OpenAPI.

## URL do servidor

| Ambiente | URL para colar no ChatGPT |
|----------|---------------------------|
| Produção | `https://app.blimber.com.br/api/mcp` |
| Local (dev) | `http://localhost:3000/api/mcp` |
| Túnel (ngrok / Cloudflare) | `https://<seu-tunel>/api/mcp` |

> **Importante:** use **Streamable HTTP** (`/api/mcp`), não `/sse`. O transporte HTTP+SSE legado foi substituído pelo spec MCP 2025-03-26. ChatGPT Developer Mode aceita apenas **MCP remoto (Streamable HTTP)**.

## Autenticação

| Campo no ChatGPT | Valor |
|------------------|-------|
| Tipo | **API Key** (Bearer) |
| Header | `Authorization` |
| Valor | `Bearer <BLIMBER_MCP_API_KEY>` |

A mesma chave das **GPT Actions** (`openapi-marketing.yaml` + `openapi-ads.yaml`).

Variáveis no Vercel / `.env`:

```env
BLIMBER_MCP_API_KEY=sua-chave-secreta
BLIMBER_MCP_ACTOR_USER_ID=uuid-de-auth.users   # opcional; exigido só em writes marketing com dryRun=false
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

Alternativa para scripts locais: header `x-blimber-mcp-key: <chave>`.

OAuth 2.1 **não** está configurado neste endpoint — API Key Bearer é o caminho suportado hoje (igual às Actions).

## Formulário do plugin (Developer Mode → Novo plugin)

| Campo | Sugestão (PT-BR) |
|-------|------------------|
| **Nome** | Blimber Hub |
| **Descrição** | Marketing editorial e Meta Ads do Blimber Hub — posts, campanhas editoriais, campanhas/anúncios Meta, insights. Tenant-aware, dryRun e confirmação em mutações. |
| **URL do servidor MCP** | `https://app.blimber.com.br/api/mcp` |
| **Autenticação** | API Key → Bearer → sua `BLIMBER_MCP_API_KEY` |

## Tools expostas (~35)

Mesma lógica de `lib/blimber-mcp/` e `lib/meta-ads/`:

| Domínio | Exemplos |
|---------|----------|
| **platform** | `searchTenants`, `listBlimberTools` |
| **marketing** | `marketing_list_posts`, `marketing_create_post`, `marketing_delete_asset`, … |
| **ads.meta** | `meta_list_campaigns`, `meta_create_ad`, `meta_get_insights`, … |
| **ads.google** | `ads_google_status` (stub) |

Nomes canônicos `meta_*` (não duplica aliases `ads_meta_*` do registry).

### Contratos iguais às Actions

- **`tenantId`** obrigatório em tools de domínio
- **`dryRun`** default `true` em writes marketing; execute exige `actorUserId` ou `BLIMBER_MCP_ACTOR_USER_ID`
- **Meta writes:** `confirm=true`, `confirmTenantId=tenantId`, padrões dryRun do pack Ads

## Relação com GPT Actions (OpenAPI)

```
ChatGPT
  ├── Plugin MCP ──► POST/GET /api/mcp  ──┐
  └── 2 Ações OpenAPI ──► /api/gpt/*  ────┼──► lib/blimber-mcp + lib/meta-ads
                                          └──► Supabase (service role)
```

| Abordagem | Quando usar |
|-----------|-------------|
| **2 Ações OpenAPI** | GPT clássico com Actions; limite 30 ops/Ação; hosts `app.*` + `ads.*` |
| **Plugin MCP** | Developer Mode; **uma** conexão; todas as tools (~35); sem limite de operations OpenAPI |

Backend compartilhado — escolha um ou use os dois no mesmo ecossistema.

## Limitações

1. **Vercel serverless:** endpoint em modo **stateless** + respostas JSON (`enableJsonResponse: true`) — sem SSE persistente entre requests.
2. **Sem upload binário** de mídia via MCP (igual Marketing Actions).
3. **Google Ads:** apenas stub `ads_google_status`.
4. **CRM:** não exposto (planned no registry).
5. **Cold start:** primeira requisição após deploy pode ser mais lenta (init Supabase + MCP).
6. **OAuth MCP:** não implementado; use API Key Bearer.

## Alternativa: túnel local

Se preferir testar sem deploy:

```bash
pnpm mcp:blimber
# expõe http://127.0.0.1:8787/mcp — use túnel HTTPS apontando para essa porta
```

Ver `mcp/blimber/README.md`.

## Testes

```bash
pnpm test tests/blimber-mcp-http.test.ts
pnpm test tests/blimber-mcp-registry.test.ts
```

## Arquivos relacionados

- `server/api/mcp.ts` — handler Nitro Streamable HTTP
- `lib/blimber-mcp/create-server.ts` — registro unificado de tools
- `server/utils/blimber-mcp-transport.ts` — transport singleton stateless
- `docs/mcp-blimber-platform.md` — arquitetura geral
- `gpt/blimber/README.md` — pack OpenAPI Actions
