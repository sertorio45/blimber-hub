---
name: blimber-meta-ads
description: >-
  Gestão e insights de Meta Ads no Blimber Hub via Ações (Actions) do GPT
  personalizado (campanhas, adsets, ads, insights, status de integração). Use
  quando o usuário pedir anúncios Facebook/Instagram, performance Meta,
  pausar/ativar campanha ou listar contas conectadas — sempre via Ações HTTP,
  nunca SQL direto e nunca revelar tokens. Busque o cliente pelo nome
  (searchTenants) se não houver tenantId. Conteúdo em português (Brasil).
---

# Blimber Meta Ads (ChatGPT)

Habilidade (Skill) do ecossistema OpenAI / ChatGPT (pacote com `SKILL.md`).
Uso principal: **GPT personalizado + Ações** no ChatGPT. MCP stdio (Cursor/Claude) é opcional/legado.

**Idioma:** responda ao usuário final sempre em **português (Brasil)**.

## Quando usar

- Relatórios / insights Meta Ads de um tenant
- Listar campanhas, conjuntos de anúncios (adsets) e anúncios
- Pausar ou reativar **uma** campanha (com confirmação do usuário)
- Verificar se Meta está conectado (`marketing_integrations`)
- Descobrir o `tenantId` a partir do **nome do cliente**

## Quando NÃO usar

- Brand Center / geração de imagem
- Campanhas orgânicas (`social_campaigns`)
- Meta CAPI (CRM)
- Exclusão em massa / alteração de budget (não exposto no MVP)

## Pré-requisitos

1. `tenantId` (UUID) — **obrigatório** em toda Ação Meta. Se o usuário der só o nome, resolva com `searchTenants` antes.
2. Integração Meta já OAuth no Hub para esse tenant
3. Ações importadas de `gpt/blimber-meta/openapi.yaml` (UI: **Configurar** → **Ações** → **Criar nova ação**)
4. Auth Bearer = `BLIMBER_MCP_API_KEY` em **Autenticação** → **Chave de API** → **Bearer**

## Tools / Ações

| Ação (operationId) | Tool lógica | Uso |
|----------------------|-------------|-----|
| `searchTenants` | — (busca `tenant`) | Nome/slug → `id` (tenantId). Vários matches → perguntar. |
| `listIntegrations` | `meta_list_integrations` | Status da conexão Meta/Google/etc. |
| `listAdAccounts` | `meta_list_ad_accounts` | Contas de anúncio do OAuth |
| `listCampaigns` | `meta_list_campaigns` | Campanhas |
| `getCampaign` | `meta_get_campaign` | Detalhe + ownership |
| `listAdsets` | `meta_list_adsets` | Conjuntos de anúncios |
| `listAds` | `meta_list_ads` | Anúncios |
| `getInsights` | `meta_get_insights` | Métricas (level + datePreset) |
| `updateCampaignStatus` | `meta_update_campaign_status` | ACTIVE / PAUSED |

Catálogo HTTP: `GET /api/gpt/meta/tools`  
OpenAPI: `gpt/blimber-meta/openapi.yaml`  
Tutorial: `docs/gpt-blimber-meta-TUTORIAL.md`  
Docs curtos: `docs/gpt-blimber-meta.md`

## Fluxo obrigatório

1. **Resolver tenant:** UUID informado **ou** `searchTenants?q=Nome` → se vários, perguntar qual → usar `id` como `tenantId`
2. **`listIntegrations`** → confirmar Meta pronto
3. **`listCampaigns`** e/ou **`getInsights`** (`datePreset: last_7d`, `level: campaign`)
4. Se pausar/ativar:
   - `getCampaign` → resumir ao usuário
   - Pedir confirmação explícita
   - `updateCampaignStatus` com `confirm: true` e `confirmTenantId === tenantId`

## Segurança

- Nunca peça/revele `access_token` ou chaves do servidor
- Nunca rode SQL em `marketing_integrations`
- Nunca chame Graph API “direto” fora das Ações
- `searchTenants` retorna só id/name/slug (busca administrativa com a API key global)
- Mutação só com `confirm` + `confirmTenantId`
- Respostas ao usuário em português (Brasil); não invente IDs

## Empacotar (upload de Habilidades)

```bash
cd gpt/blimber-meta/skills
zip -r ../blimber-meta-ads.skill.zip blimber-meta-ads
```

Ou anexe a pasta `skills/blimber-meta-ads` / este `SKILL.md` em **Conhecimento** / **Habilidades** no GPT (aba **Configurar**).
