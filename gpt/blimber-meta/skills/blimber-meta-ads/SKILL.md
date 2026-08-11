---
name: blimber-meta-ads
description: >-
  Gestão e insights de Meta Ads no Blimber Hub via Custom GPT Actions
  (campanhas, adsets, ads, insights, status de integração). Use quando o
  usuário pedir anúncios Facebook/Instagram, performance Meta, pausar/ativar
  campanha ou listar contas conectadas — sempre via Actions HTTP, nunca SQL
  direto e nunca revelar tokens. Exige tenantId.
---

# Blimber Meta Ads (ChatGPT)

Skill do ecossistema OpenAI / ChatGPT Skills (pacote com `SKILL.md`).
Uso principal: **Custom GPT + Actions** no ChatGPT. MCP stdio (Cursor/Claude) é opcional/legado.

## Quando usar

- Relatórios / insights Meta Ads de um tenant
- Listar campanhas, adsets, ads
- Pausar ou reativar **uma** campanha (com confirmação do usuário)
- Verificar se Meta está conectado (`marketing_integrations`)

## Quando NÃO usar

- Brand Center / geração de imagem
- Campanhas orgânicas (`social_campaigns`)
- Meta CAPI (CRM)
- Delete em massa / alteração de budget (não exposto no MVP)

## Pré-requisitos

1. `tenantId` (UUID) — **obrigatório** em toda chamada
2. Integração Meta já OAuth no Hub para esse tenant
3. Actions importadas de `gpt/blimber-meta/openapi.yaml`
4. Auth Bearer = `BLIMBER_MCP_API_KEY` no editor do Custom GPT

## Tools / Actions

| Action (operationId) | Tool lógica | Uso |
|----------------------|-------------|-----|
| `listIntegrations` | `meta_list_integrations` | Status da conexão Meta/Google/etc. |
| `listAdAccounts` | `meta_list_ad_accounts` | Contas de anúncio do OAuth |
| `listCampaigns` | `meta_list_campaigns` | Campanhas |
| `getCampaign` | `meta_get_campaign` | Detalhe + ownership |
| `listAdsets` | `meta_list_adsets` | Conjuntos |
| `listAds` | `meta_list_ads` | Anúncios |
| `getInsights` | `meta_get_insights` | Métricas (level + datePreset) |
| `updateCampaignStatus` | `meta_update_campaign_status` | ACTIVE / PAUSED |

Catálogo HTTP: `GET /api/gpt/meta/tools`  
OpenAPI: `gpt/blimber-meta/openapi.yaml`  
Docs: `docs/gpt-blimber-meta.md`

## Fluxo obrigatório

1. **`listIntegrations`** → confirmar Meta pronto
2. **`listCampaigns`** e/ou **`getInsights`** (`datePreset: last_7d`, `level: campaign`)
3. Se pausar/ativar:
   - `getCampaign` → resumir ao usuário
   - Pedir confirmação explícita
   - `updateCampaignStatus` com `confirm: true` e `confirmTenantId === tenantId`

## Segurança

- Nunca peça/revele `access_token` ou chaves do servidor
- Nunca rode SQL em `marketing_integrations`
- Nunca chame Graph API “direto” fora das Actions
- Mutação só com `confirm` + `confirmTenantId`
- Respostas ao usuário em português; não invente IDs

## Empacotar (upload OpenAI Skills)

```bash
cd gpt/blimber-meta/skills
zip -r ../blimber-meta-ads.skill.zip blimber-meta-ads
```

Ou anexe a pasta `skills/blimber-meta-ads` / este `SKILL.md` como Knowledge / Skill no GPT.
