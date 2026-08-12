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

### Custom GPT: uma Ação por GPT (domínio único)

O ChatGPT **não permite** duas Ações com o mesmo `servers.url`. Importar `gpt/blimber/openapi.yaml` **e** `gpt/blimber-meta/openapi.yaml` no **mesmo** GPT falha com:

> Conjuntos de ações não podem ter domínios duplicados — app.blimber.com.br já existe em outra ação

| Abordagem | Quando | Como |
|-----------|--------|------|
| **Pack unificado** `gpt/blimber/openapi.yaml` | Marketing + Meta Ads no **mesmo** assistente | **Uma Ação só** — o YAML já inclui `/api/gpt/marketing/*` e `/api/gpt/meta/*` |
| **Pack Meta** `gpt/blimber-meta/openapi.yaml` | GPT **separado** só de Ads | Outro GPT, não uma 2ª Ação no unificado |

Ambos usam a **mesma** Bearer key (`BLIMBER_MCP_API_KEY`) e o **mesmo** host `https://app.blimber.com.br` — por isso não podem coexistir como duas Ações.

## Roadmap

1. **Fase 1 (esta):** fundação + Marketing editorial MVP + OpenAPI unificado (1 Ação)  
2. **Fase 2:** Google Ads (OAuth + tools read)  
3. **Fase 3:** CRM stubs → reads → writes com as mesmas confirmações  
4. **Fase 4:** MCP stdio unificado opcional (`mcp/blimber`)

Ver [`mcp-blimber-platform-PLAN.md`](./mcp-blimber-platform-PLAN.md).

## Relacionados

- Plano / ponte GPT Meta: [`gpt-blimber-UNIFIED-PLAN.md`](./gpt-blimber-UNIFIED-PLAN.md)
- Tutorial Marketing editorial: [`gpt-blimber-MARKETING.md`](./gpt-blimber-MARKETING.md)
- Pack Meta Ads (GPT separado): [`gpt-blimber-meta.md`](./gpt-blimber-meta.md)
- Tutorial Meta + erro de domínio duplicado: [`gpt-blimber-meta-TUTORIAL.md`](./gpt-blimber-meta-TUTORIAL.md)

## Compatibilidade

- **Não quebrar** `gpt/blimber-meta` nem `/api/gpt/meta/*` (pack standalone para GPT só Ads)
- Registry lista tools Meta (`meta_*`) e aliases (`ads_meta_*`)
- Docs Meta antigos continuam válidos; este doc é o hub da plataforma
