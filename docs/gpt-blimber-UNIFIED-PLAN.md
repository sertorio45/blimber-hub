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
- OpenAPI unificado (`gpt/blimber/openapi.yaml`) inclui **todas** as operations Meta (`/api/gpt/meta/*`) — **uma Ação** no GPT
- Pack `gpt/blimber-meta/` permanece **standalone** (GPT só Ads). **Não** importe os dois YAMLs no mesmo GPT (domínio `app.blimber.com.br` duplicado)
- Auth: `BLIMBER_MCP_API_KEY` + actor `BLIMBER_MCP_ACTOR_USER_ID` para creates editoriais
- Backend Meta **não duplicado** — mesmas rotas `server/api/gpt/meta/*`

## Roadmap curto

1. Marketing editorial (feito)
2. OpenAPI unificado Marketing + Meta (feito) / soft-publish posts
3. Google Ads read
4. CRM read → write com confirm

Pack Meta: [`gpt-blimber-meta.md`](./gpt-blimber-meta.md).
