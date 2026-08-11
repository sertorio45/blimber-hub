---
name: blimber-meta-ads
description: >-
  Gestão e insights de Meta Ads no Blimber Hub (campanhas, adsets, ads,
  insights, status de integração). Uso principal = ChatGPT GPT personalizado +
  Ações em português (Brasil) — pack primário em gpt/blimber-meta. Em Cursor,
  use HTTP /api/gpt/meta/* ou MCP stdio opcional. Sempre via tools — nunca SQL
  direto. Resolva tenantId por nome (searchTenants) se necessário; tools Meta
  ainda exigem tenantId.
---

# Blimber Meta Ads

> **Primário (PT-BR):** ChatGPT GPT personalizado + Ações + Habilidade em `gpt/blimber-meta/`.  
> Docs: `docs/gpt-blimber-meta.md` e `docs/gpt-blimber-meta-TUTORIAL.md`  
> Este arquivo (Cursor) é **legado / espelho** — não é a entrega principal ao usuário.
> Mantenha alinhado ao pack GPT; edite primeiro `gpt/blimber-meta/skills/blimber-meta-ads/SKILL.md`.

## Quando usar

- Relatórios / insights Meta Ads de um tenant
- Listar campanhas, conjuntos de anúncios (adsets) e anúncios
- Pausar ou reativar **uma** campanha (com confirmação)
- Ver se Meta está conectado (`marketing_integrations`)
- Descobrir `tenantId` a partir do nome do cliente (`GET /api/gpt/meta/tenants?q=`)

## Como operar

1. **Produção (usuário):** GPT no ChatGPT — **Configurar** → **Ações** → importar `gpt/blimber-meta/openapi.yaml`.
2. **Neste repo (Cursor):** `GET/POST /api/gpt/meta/*` com Bearer `BLIMBER_MCP_API_KEY`, ou MCP stdio `pnpm mcp:meta` (opcional).
3. Se só houver o **nome** do cliente: `GET /api/gpt/meta/tenants?q=Nome` → pegar `id` → usar como `tenantId`. Vários matches → confirmar. **Nunca** misture tenants.
4. Tools Meta **sempre** exigem `tenantId` (UUID). Isolamento por tenant mantido.
5. **Não** peça/revele `access_token`.
6. Escrita: só `meta_update_campaign_status` / Ação `updateCampaignStatus` com `confirm: true` e `confirmTenantId === tenantId`.
7. **Idioma:** respostas ao usuário final em **português (Brasil)**.

## Tools

| Tool | Uso |
|------|-----|
| `searchTenants` (HTTP) | Nome/slug → `{ tenants: [{ id, name, slug }] }` |
| `meta_list_integrations` | Status da conexão Meta/Google/etc. |
| `meta_list_ad_accounts` | Contas de anúncio do OAuth |
| `meta_list_campaigns` | Campanhas |
| `meta_get_campaign` | Detalhe |
| `meta_list_adsets` | Conjuntos de anúncios |
| `meta_list_ads` | Anúncios |
| `meta_get_insights` | Métricas (level + datePreset) |
| `meta_update_campaign_status` | ACTIVE / PAUSED |

OpenAPI: `gpt/blimber-meta/openapi.yaml`  
Catálogo: `GET /api/gpt/meta/tools`

## Fluxo sugerido

1. `searchTenants` (se não houver UUID) → confirmar cliente  
2. `meta_list_integrations` → confirmar Meta pronto  
3. `meta_list_campaigns` ou `meta_get_insights` com `datePreset: last_7d`  
4. Pausar: `meta_get_campaign` → confirmação → `meta_update_campaign_status`

## Fora de escopo

- Brand Center / geração de imagem
- Campanhas orgânicas (`social_campaigns`)
- Meta CAPI (CRM)
- Exclusão em massa / alteração de budget (não exposto no MVP)
