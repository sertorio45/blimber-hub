---
name: blimber-meta-ads
description: >-
  Gestão e insights de Meta Ads no Blimber Hub (campanhas, adsets, ads,
  insights, status de integração). Uso principal = ChatGPT Custom GPT Actions
  (gpt/blimber-meta). Em Cursor, use o HTTP /api/gpt/meta/* ou MCP stdio
  opcional. Sempre via tools — nunca SQL direto. Exige tenantId.
---

# Blimber Meta Ads

> **Primário:** ChatGPT Custom GPT + Actions + Skill em `gpt/blimber-meta/`.  
> Docs: `docs/gpt-blimber-meta.md`  
> Este arquivo (Cursor) é **legado / espelho** — não é a entrega principal ao usuário.

## Quando usar

- Relatórios / insights Meta Ads de um tenant
- Listar campanhas, adsets, ads
- Pausar ou reativar **uma** campanha (com confirmação)
- Ver se Meta está conectado (`marketing_integrations`)

## Como operar

1. **Produção usuário:** Custom GPT no ChatGPT (importar `gpt/blimber-meta/openapi.yaml`).
2. **Neste repo (Cursor):** `GET/POST /api/gpt/meta/*` com Bearer `BLIMBER_MCP_API_KEY`, ou MCP stdio `pnpm mcp:meta` (opcional).
3. **Sempre** informe `tenantId` (UUID). Nunca misture tenants.
4. **Não** peça/revele `access_token`.
5. Escrita: só `meta_update_campaign_status` / Action `updateCampaignStatus` com `confirm: true` e `confirmTenantId === tenantId`.

## Tools

| Tool | Uso |
|------|-----|
| `meta_list_integrations` | Status da conexão Meta/Google/etc. |
| `meta_list_ad_accounts` | Contas de anúncio do OAuth |
| `meta_list_campaigns` | Campanhas |
| `meta_get_campaign` | Detalhe |
| `meta_list_adsets` | Conjuntos |
| `meta_list_ads` | Anúncios |
| `meta_get_insights` | Métricas (level + datePreset) |
| `meta_update_campaign_status` | ACTIVE / PAUSED |

OpenAPI: `gpt/blimber-meta/openapi.yaml`  
Catálogo: `GET /api/gpt/meta/tools`

## Fluxo sugerido

1. `meta_list_integrations` → confirmar Meta pronto  
2. `meta_list_campaigns` ou `meta_get_insights` com `datePreset: last_7d`  
3. Pausar: `meta_get_campaign` → confirmação → `meta_update_campaign_status`

## Fora de escopo

- Brand Center / geração de imagem
- Campanhas orgânicas (`social_campaigns`)
- Meta CAPI (CRM)
- Delete em massa / alteração de budget (não exposto no MVP)
