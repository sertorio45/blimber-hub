# MCP Blimber Meta Ads (opcional / legado)

> **Uso principal do produto:** GPT personalizado no ChatGPT (**Ações** + **Habilidade**).  
> Guia completo: [`docs/gpt-blimber-meta.md`](./gpt-blimber-meta.md)  
> OpenAPI Ads: [`gpt/blimber/openapi-ads.yaml`](../gpt/blimber/openapi-ads.yaml) (pack standalone removido)

Este documento cobre apenas o **MCP stdio** e o bridge HTTP interno — úteis para Cursor/Claude Desktop ou scripts, **não** para o usuário final do ChatGPT.

## Arquitetura

```
Agente local (opcional)
    │
    ├─ stdio  →  mcp/blimber-meta
    │
    └─ HTTP   →  POST /api/internal/mcp/meta/invoke
                      │
                      ▼
              mesma stack que /api/gpt/meta/*
              → lib/meta-ads → marketing_integrations + Graph API
```

- **Não** recria OAuth.
- Tokens **nunca** retornados ao LLM.
- Mutação: status (`meta_update_*_status`), creates, edits (budget/targeting/copy/media) — exigem `confirm=true` + `confirmTenantId`; creates/edits sensíveis usam `dryRun` default true.

## Auth

Mesma chave das Ações do GPT:

```bash
BLIMBER_MCP_API_KEY=
# fallback: MARKETING_WORKER_SECRET
```

Header: `Authorization: Bearer …` ou `x-blimber-mcp-key`.

## Como rodar (stdio)

```bash
pnpm install
pnpm --dir mcp/blimber-meta install
pnpm mcp:meta
```

Config Cursor / Claude Desktop (exemplo):

```json
{
  "mcpServers": {
    "blimber-meta": {
      "command": "pnpm",
      "args": ["mcp:meta"],
      "cwd": "/absolute/path/to/blimber-hub"
    }
  }
}
```

## HTTP bridge legado

```http
GET /api/internal/mcp/meta/tools
Authorization: Bearer <BLIMBER_MCP_API_KEY>
```

```http
POST /api/internal/mcp/meta/invoke
Authorization: Bearer <BLIMBER_MCP_API_KEY>
Content-Type: application/json

{
  "tool": "meta_get_insights",
  "arguments": {
    "tenantId": "<uuid>",
    "datePreset": "last_7d",
    "level": "campaign"
  }
}
```

Prefira as rotas REST `/api/gpt/meta/*` documentadas no OpenAPI.

## Tools MVP

| Tool | Tipo | Descrição |
|------|------|-----------|
| `meta_list_integrations` | read | Status + `write_readiness` do tenant |
| `meta_list_ad_accounts` | read | Ad accounts do token OAuth |
| `meta_list_campaigns` | read | Campanhas |
| `meta_get_campaign` | read | Detalhe + ownership |
| `meta_list_adsets` | read | Conjuntos |
| `meta_list_ads` | read | Anúncios |
| `meta_get_insights` | read | Insights |
| `meta_update_campaign_status` | write | ACTIVE/PAUSED (confirmação) |
| `meta_update_adset_status` | write | ACTIVE/PAUSED (confirmação) |
| `meta_update_ad_status` | write | ACTIVE/PAUSED (confirmação) |
| `meta_create_campaign` | write | Criar campanha (PAUSED / dryRun default true) |
| `meta_create_adset` | write | Criar adset com targetingTemplate fechado |
| `meta_create_ad` | write | Criar AdCreative link/page + Ad (dryRun default true) |
| `meta_update_adset_budget` | write | Budget adset (dryRun default true) |
| `meta_update_adset_targeting` | write | Targeting BR_* |
| `meta_update_ad_creative_copy` | write | Copy via novo creative |
| `meta_update_ad_media` | write | imageUrl\|imageHash via novo creative |
| `meta_preview_bulk_delete` | write preview | Preview exclusão + previewToken |
| `meta_execute_bulk_delete` | write | Execute exclusão (confirmações + dryRun false) |

## Testes

```bash
pnpm test tests/meta-ads-tools.test.ts tests/meta-write-guards.test.ts tests/gpt-meta-openapi.test.ts
```
