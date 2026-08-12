# Blimber GPT Unificado — Plano

> **Doc canônico de arquitetura:** [`mcp-blimber-platform.md`](./mcp-blimber-platform.md)  
> **Roadmap detalhado:** [`mcp-blimber-platform-PLAN.md`](./mcp-blimber-platform-PLAN.md)  
> **Como usar Marketing:** [`gpt-blimber-MARKETING.md`](./gpt-blimber-MARKETING.md)

Este arquivo resume a visão módulos **Marketing → Ads → CRM** para o hub GPT.

## Separação de entidades

| Conceito | Tabela / superfície | Namespace |
|----------|---------------------|-----------|
| Campanha **editorial** | `social_campaigns` | `marketing_*` |
| Post / conteúdo | `social_posts` | `marketing_*` |
| Brand Context | Brand Center | `marketing_get_brand_context` |
| Campanha **paid Meta** | Graph / `lib/meta-ads` | `meta_*` / aliases `ads_meta_*` |
| Campanha paid Google (futuro) | stub | `ads.google` |
| CRM (futuro) | leads/deals | `crm_*` |

## Entrega atual (MVP)

- Pack `gpt/blimber/` + rotas `/api/gpt/marketing/*` + `/api/gpt/tenants` + registry
- OpenAPI em **2 Ações** no mesmo GPT: `openapi-marketing.yaml` (`app.blimber.com.br`) + `openapi-ads.yaml` (`ads.blimber.com.br`). Índice `openapi.yaml` **não** é importável. Setup: [`gpt-blimber-ACTIONS.md`](./gpt-blimber-ACTIONS.md)
- Pack standalone Ads-only **removido**. Ads no ChatGPT = `gpt/blimber/openapi-ads.yaml`
- Keep vs drop: [`gpt/blimber/README.md`](../gpt/blimber/README.md)
- Auth: `BLIMBER_MCP_API_KEY` + actor `BLIMBER_MCP_ACTOR_USER_ID` (só no execute; preview dry-run não exige)
- Backend Meta **não duplicado** — mesmas rotas `server/api/gpt/meta/*`

## Roadmap curto

1. Marketing editorial (feito)
2. OpenAPI em 2 Ações (marketing + ads, hosts diferentes) / soft-publish posts
3. Google Ads read
4. CRM read → write com confirm

Ads (OpenAPI canônico): [`gpt/blimber/openapi-ads.yaml`](../gpt/blimber/openapi-ads.yaml). Doc: [`gpt-blimber-meta.md`](./gpt-blimber-meta.md).
