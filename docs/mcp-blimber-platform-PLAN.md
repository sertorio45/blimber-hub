# Plano — MCP Blimber Platform

Plano por etapas a partir da fundação em `docs/mcp-blimber-platform.md`.

## Fase 1 — Fundação + Marketing (agora) ✅

- [x] `lib/blimber-mcp` (registry, errors, confirm, marketing-tools)
- [x] Rotas `/api/gpt/marketing/*`, `/api/gpt/tenants`, `/api/gpt/tools`
- [x] Namespace `ads.meta` (reuse `lib/meta-ads` + catálogo)
- [x] Stub `ads.google`
- [x] Pack `gpt/blimber/`
- [x] Compat `/api/gpt/meta/*` + `lib/meta-ads`
- [x] OpenAPI em 2 Ações (≤30 ops cada): `openapi-marketing.yaml` (app.*) + `openapi-ads.yaml` (ads.*) — pack Ads-only standalone removido
- [ ] Skill ZIP opcional para upload no ChatGPT
- [ ] Hardening: signed upload URL via GPT (sem binário na Action)

### Marketing MVP tools

- Posts: list / get / create / update (draft)
- Campanhas editoriais: list / get / create / update (`social_campaigns`)
- Brand context, assets list, social accounts list
- Sem publish automático avançado nesta fase (submit/aprovação ficam no Hub ou fase 1.1)

## Fase 2 — Ads Google

- OAuth Google Ads no Hub (espelhar padrão Meta `marketing_integrations`)
- Tools read: accounts, campaigns, insights
- Depois write com dryRun + confirm (mesmo contrato)

## Fase 3 — CRM

- Stub no registry → list contacts / deals (read) → writes com confirmação
- **Não** implementar CRM writes antes do contrato de domínio CRM estável

## Fase 4 — Transporte MCP remoto ✅

- [x] `lib/blimber-mcp/create-server.ts` — tools unificadas (marketing + meta + platform)
- [x] `server/api/mcp.ts` — Streamable HTTP stateless (ChatGPT plugin)
- [x] `mcp/blimber/` — servidor local para túnel
- [x] `docs/gpt-blimber-MCP-PLUGIN.md`
- Manter HTTP GPT Actions como alternativa primária para GPT clássico

## Fora de escopo (explícito)

- Migrations sem necessidade
- Geração de imagem / Brand Center generative
- Apagar Meta pack
- CRM writes antecipados
