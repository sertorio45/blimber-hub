# Plano — MCP Blimber Platform

Plano por etapas a partir da fundação em `docs/mcp-blimber-platform.md`.

## Fase 1 — Fundação + Marketing (agora) ✅

- [x] `lib/blimber-mcp` (registry, errors, confirm, marketing-tools)
- [x] Rotas `/api/gpt/marketing/*`, `/api/gpt/tenants`, `/api/gpt/tools`
- [x] Namespace `ads.meta` (reuse `lib/meta-ads` + catálogo)
- [x] Stub `ads.google`
- [x] Pack `gpt/blimber/`
- [x] Compat `gpt/blimber-meta` + `/api/gpt/meta/*`
- [x] OpenAPI unificado (1 Ação): marketing + meta no `gpt/blimber/openapi.yaml` — pack meta fica GPT separado (domínio duplicado se importar os dois)
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

## Fase 4 — Transporte MCP stdio

- `mcp/blimber` registrando tools do registry (marketing + ads.meta via invoke)
- Manter HTTP GPT como primário

## Fora de escopo (explícito)

- Migrations sem necessidade
- Geração de imagem / Brand Center generative
- Apagar Meta pack
- CRM writes antecipados
