# MCP / GPT Blimber Platform (unificado)

Visão: um surface **tenant-aware** para Custom GPT Actions (e futuro MCP stdio), cobrindo Marketing agora e Ads/CRM depois — sem reescrever o Meta write já maduro.

## Arquitetura escolhida

```
gpt/blimber/                 # OpenAPI + instructions + skill (pack unificado)
server/api/gpt/
  tenants, tools             # platform
  marketing/*                # editorial MVP
  brand/context              # alias Brand
  ads/meta/tools             # catálogo namespace ads.meta
  ads/google/status          # stub
  meta/*                     # Meta legado (lib/meta-ads) — intacto
lib/blimber-mcp/             # registry, marketing-tools, ads aliases, errors
lib/meta-ads/                # Graph write/read (reutilizado)
```

**Por quê este layout:** Custom GPT + HTTP é o transporte primário (como Meta). MCP stdio (`mcp/blimber`) fica opcional na próxima fase — evita duplicar runtime agora.

### Domínios

| Domínio | Status | Implementação |
|---------|--------|---------------|
| `platform` | ready | `/api/gpt/tenants`, `/api/gpt/tools` |
| `marketing` | ready (MVP) | `lib/blimber-mcp/marketing-tools` → `/api/gpt/marketing/*` |
| `brand` | ready | alias de brand-context marketing |
| `ads.meta` | ready (reuse) | `lib/meta-ads` + `/api/gpt/meta/*` + aliases `ads_meta_*` no registry |
| `ads.google` | stub | `/api/gpt/ads/google/status` |
| `crm` | planned | só no registry / plano |

### Auth

- Única chave: **`BLIMBER_MCP_API_KEY`** (Bearer; fallback legado `MARKETING_WORKER_SECRET`)
- Gate compartilhado: `assertMetaGptApiKey` / `assertBlimberMcpApiKey`
- Escrita marketing: `created_by` exige UUID em `auth.users` → `actorUserId` **ou** `BLIMBER_MCP_ACTOR_USER_ID`
- Mutações: `confirm` + `confirmTenantId` + `dryRun` default `true` (mesmo espírito do Meta)

### Tenant-aware

Toda tool de domínio exige `tenantId`. Busca administrativa: `searchTenants` (também espelhada em `/api/gpt/meta/tenants` para o pack legado).

### Custom GPT: 2 Ações no mesmo GPT (hosts diferentes + ≤30 operations cada)

O ChatGPT **não permite** duas Ações com o mesmo `servers.url` e limita cada spec a **≤30 operations**.

| Ação | Spec | Host | Ops |
|------|------|------|-----|
| Marketing | `gpt/blimber/openapi-marketing.yaml` | `https://app.blimber.com.br` | 13 |
| Ads (Meta) | `gpt/blimber/openapi-ads.yaml` | `https://ads.blimber.com.br` | 21 |

`ads.blimber.com.br` é **alias** do mesmo projeto Vercel (não outro app). Setup: [`gpt-blimber-ACTIONS.md`](./gpt-blimber-ACTIONS.md).

**Não** importe `gpt/blimber/openapi.yaml` (índice). Ads no ChatGPT = `openapi-ads.yaml`. Pack standalone Ads-only **removido**.

| Abordagem | Quando | Como |
|-----------|--------|------|
| **Pack unificado** `gpt/blimber/` | Marketing + Meta Ads no **mesmo** chat | **Duas Ações** — marketing.yaml + ads.yaml |

Mesma Bearer key (`BLIMBER_MCP_API_KEY`). Backend `/api/gpt/*` **não perde rotas**.

Keep vs drop: [`gpt/blimber/README.md`](../gpt/blimber/README.md).

## Roadmap

1. **Fase 1 (esta):** fundação + Marketing editorial MVP + OpenAPI em 2 Ações (hosts app.* + ads.*)  
2. **Fase 2:** Google Ads (OAuth + tools read)  
3. **Fase 3:** CRM stubs → reads → writes com as mesmas confirmações  
4. **Fase 4:** MCP stdio unificado opcional (`mcp/blimber`)

Ver [`mcp-blimber-platform-PLAN.md`](./mcp-blimber-platform-PLAN.md).

## Relacionados

- Plano / ponte GPT Meta: [`gpt-blimber-UNIFIED-PLAN.md`](./gpt-blimber-UNIFIED-PLAN.md)
- Setup 2 Ações + DNS alias: [`gpt-blimber-ACTIONS.md`](./gpt-blimber-ACTIONS.md)
- Tutorial Marketing editorial: [`gpt-blimber-MARKETING.md`](./gpt-blimber-MARKETING.md)
- Meta Ads (OpenAPI `openapi-ads.yaml`): [`gpt-blimber-meta.md`](./gpt-blimber-meta.md)
- Tutorial Meta + DNS alias `ads.*`: [`gpt-blimber-meta-TUTORIAL.md`](./gpt-blimber-meta-TUTORIAL.md)

## Compatibilidade

- **Não quebrar** `/api/gpt/meta/*` nem `lib/meta-ads/` (HTTP Ads + Graph)
- Registry lista tools Meta (`meta_*`) e aliases (`ads_meta_*`)
- Pack GPT standalone Ads-only removido; contrato ChatGPT = `gpt/blimber/openapi-ads.yaml`
