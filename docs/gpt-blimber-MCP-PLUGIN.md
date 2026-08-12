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

O plugin MCP no ChatGPT **não** oferece campo “API Key Bearer” na UI — use **OAuth** (ou **Mista**, se quiser combinar no futuro).

| Campo no ChatGPT | Valor |
|------------------|-------|
| Tipo | **OAuth** |
| URL do servidor MCP | `https://app.blimber.com.br/api/mcp` |

O ChatGPT descobre automaticamente:

| Descoberta | URL |
|------------|-----|
| Protected Resource Metadata (RFC 9728) | `https://app.blimber.com.br/.well-known/oauth-protected-resource/api/mcp` |
| Authorization Server Metadata (RFC 8414) | `https://app.blimber.com.br/.well-known/oauth-authorization-server/api/mcp/oauth` |

### Fluxo OAuth (primeira conexão)

1. No formulário do plugin, selecione **OAuth** e salve.
2. Ao usar uma tool pela primeira vez, o ChatGPT abre o fluxo OAuth 2.1 (authorization code + PKCE).
3. Você verá a página **“Conectar Blimber Hub MCP”** no navegador.
4. Cole a **`BLIMBER_MCP_API_KEY`** (a mesma das GPT Actions) e confirme.
5. O servidor emite um **access token OAuth** de curta duração (~1 h) para o ChatGPT usar em `Authorization: Bearer …` nas chamadas MCP.

> **GPT Actions (OpenAPI)** continuam com **API Key Bearer** — rotas `/api/gpt/*` **não mudaram**.

### Compatibilidade legada (curl / scripts)

`POST/GET /api/mcp` ainda aceita:

- `Authorization: Bearer <BLIMBER_MCP_API_KEY>`
- `x-blimber-mcp-key: <chave>`

Variáveis no Vercel / `.env`:

```env
BLIMBER_MCP_API_KEY=sua-chave-secreta
BLIMBER_MCP_OAUTH_JWT_SECRET=opcional-separado-para-assinar-tokens-oauth
BLIMBER_MCP_PUBLIC_URL=https://app.blimber.com.br
BLIMBER_MCP_ACTOR_USER_ID=uuid-de-auth.users   # opcional; exigido só em writes marketing com dryRun=false
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

- `BLIMBER_MCP_OAUTH_JWT_SECRET` — opcional; se omitido, deriva de `BLIMBER_MCP_API_KEY`.
- `BLIMBER_MCP_PUBLIC_URL` — URL pública canônica (issuer OAuth + `aud` do token). Use em túneis locais.

## Formulário do plugin (Developer Mode → Novo plugin)

| Campo | Sugestão (PT-BR) |
|-------|------------------|
| **Nome** | Blimber Hub |
| **Descrição** | Marketing editorial e Meta Ads do Blimber Hub — posts, campanhas editoriais, campanhas/anúncios Meta, insights. Tenant-aware, dryRun e confirmação em mutações. |
| **URL do servidor MCP** | `https://app.blimber.com.br/api/mcp` |
| **Autenticação** | **OAuth** (não use API Key no formulário MCP) |

### Callback OAuth (ChatGPT)

Não é necessário configurar manualmente no Blimber. O authorization server aceita:

- `https://chatgpt.com/connector/oauth/{callback_id}` (atual)
- `https://chatgpt.com/connector_platform_oauth_redirect` (legado)

Suporte a **DCR** (`POST /api/mcp/oauth/register`) e **CIMD** (`client_id_metadata_document_supported: true`) para registro automático do cliente ChatGPT.

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
| **Plugin MCP** | Developer Mode; **uma** conexão; todas as tools (~35); OAuth na UI |

Backend compartilhado — escolha um ou use os dois no mesmo ecossistema.

## Limitações

1. **Vercel serverless:** endpoint em modo **stateless** + respostas JSON (`enableJsonResponse: true`) — sem SSE persistente entre requests.
2. **OAuth pragmático:** não é login Supabase/Google — você valida `BLIMBER_MCP_API_KEY` uma vez na tela de consentimento; tokens OAuth são JWT HS256 de curta duração.
3. **Sem refresh token:** ao expirar (~1 h), reconecte pelo fluxo OAuth no ChatGPT.
4. **Sem upload binário** de mídia via MCP (igual Marketing Actions).
5. **Google Ads:** apenas stub `ads_google_status`.
6. **CRM:** não exposto (planned no registry).
7. **Cold start:** primeira requisição após deploy pode ser mais lenta (init Supabase + MCP).

## Alternativa: túnel local

Se preferir testar sem deploy:

```bash
pnpm mcp:blimber
# expõe http://127.0.0.1:8787/mcp — use túnel HTTPS apontando para essa porta
```

Ver `mcp/blimber/README.md`.

## Testes

```bash
pnpm test tests/blimber-mcp-oauth.test.ts
pnpm test tests/blimber-mcp-http.test.ts
pnpm test tests/blimber-mcp-registry.test.ts
```

## Arquivos relacionados

- `server/api/mcp.ts` — handler Nitro Streamable HTTP (OAuth + API key)
- `server/api/mcp/oauth/*` — authorization server (authorize, token, register)
- `server/routes/.well-known/*` — discovery RFC 9728 / 8414
- `server/utils/blimber-mcp-oauth.ts` — JWT, PKCE, metadata
- `lib/blimber-mcp/create-server.ts` — registro unificado de tools
- `server/utils/blimber-mcp-transport.ts` — transport singleton stateless
- `docs/mcp-blimber-platform.md` — arquitetura geral
- `gpt/blimber/README.md` — pack OpenAPI Actions
