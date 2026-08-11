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

### Custom GPT: OpenAPI único vs multi-packs

| Abordagem | Quando |
|-----------|--------|
| **Pack unificado** `gpt/blimber/` | Marketing + ponte Meta + roadmap |
| **Pack Meta** `gpt/blimber-meta/` | GPT só Ads (write completo no OpenAPI Meta) |
| **Dois Actions no mesmo GPT** | Unificado + Meta full write no mesmo assistente |

Ambos usam a **mesma** Bearer key e o **mesmo** servidor `https://app.blimber.com.br`.

## Roadmap

## Relacionados

- Plano / ponte GPT Meta: [`gpt-blimber-UNIFIED-PLAN.md`](./gpt-blimber-UNIFIED-PLAN.md)
- Tutorial Marketing editorial: [`gpt-blimber-MARKETING.md`](./gpt-blimber-MARKETING.md)
- Pack Meta Ads (write): [`gpt-blimber-meta.md`](./gpt-blimber-meta.md)

Ver [`mcp-blimber-platform-PLAN.md`](./mcp-blimber-platform-PLAN.md).


1. **Fase 1 (esta):** fundação + Marketing editorial MVP + aliases Meta  
2. **Fase 2:** Google Ads (OAuth + tools read)  
3. **Fase 3:** CRM stubs → reads → writes com as mesmas confirmações  
4. **Fase 4:** MCP stdio unificado opcional (`mcp/blimber`)

## Compatibilidade

- **Não quebrar** `gpt/blimber-meta` nem `/api/gpt/meta/*`
- Registry lista tools Meta (`meta_*`) e aliases (`ads_meta_*`)
- Docs Meta antigos continuam válidos; este doc é o hub da plataforma
