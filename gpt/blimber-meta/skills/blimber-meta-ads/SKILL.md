---
name: blimber-meta-ads
description: >-
  Gestão e insights de Meta Ads no Blimber Hub via Ações (Actions) do GPT
  personalizado (campanhas, adsets, ads, insights, status, create, edits e
  bulk delete com preview). Use quando o usuário pedir anúncios
  Facebook/Instagram, performance Meta, pausar/ativar, criar, editar ou
  excluir — sempre via Ações HTTP, nunca SQL direto e nunca revelar tokens.
  Busque o cliente pelo nome (searchTenants) se não houver tenantId. Conteúdo
  em português (Brasil).
---

# Blimber Meta Ads (ChatGPT)

Habilidade (Skill) do ecossistema OpenAI / ChatGPT (pacote com `SKILL.md`).
Uso principal: **GPT personalizado + Ações** no ChatGPT. MCP stdio (Cursor/Claude) é opcional/legado.

**Idioma:** responda ao usuário final sempre em **português (Brasil)**.

## Quando usar

- Relatórios / insights Meta Ads de um tenant
- Listar campanhas, conjuntos de anúncios (adsets) e anúncios
- Pausar ou reativar **campanha, adset ou anúncio** (ACTIVE/PAUSED, com confirmação)
- **Criar** campanha, adset ou anúncio+criativo (link/WEBSITE ou Click-to-WhatsApp)
- **Editar** budget/targeting do adset; copy/mídia do ad (dryRun default true)
- **Excluir em massa** com preview obrigatório (IDs explícitos — nunca por nome)
- Verificar se Meta está conectado e write-ready (`meta_ready`, `write_readiness`)
- Descobrir o `tenantId` a partir do **nome do cliente**

## Quando NÃO usar

- Brand Center / geração de imagem por IA
- Campanhas orgânicas (`social_campaigns`)
- Meta CAPI (CRM)
- Delete por filtro de nome / “apague tudo que tiver X”
- Targeting Graph livre / Advantage+ / catálogo (só templates fechados)
- video_id / upload binário / carousel

## Pré-requisitos

1. `tenantId` (UUID) — **obrigatório** em toda Ação Meta. Se o usuário der só o nome, resolva com `searchTenants` antes.
2. Integração Meta já OAuth no Hub para esse tenant
3. Ações importadas de `gpt/blimber-meta/openapi.yaml` (UI: **Configurar** → **Ações** → **Criar nova ação**). Este pack = **GPT só Ads**. Não importe `gpt/blimber/openapi.yaml` no mesmo GPT (domínio `app.blimber.com.br` duplicado). GPT unificado (Marketing + Meta) usa só `gpt/blimber/openapi.yaml`.
4. Auth Bearer = `BLIMBER_MCP_API_KEY` em **Autenticação** → **Chave de API** → **Bearer**
5. Para **createAd** / edits de creative/media: `write_readiness.has_page_token` + `page_id`

## Tools / Ações

| Ação (operationId) | Tool lógica | Uso |
|----------------------|-------------|-----|
| `searchTenants` | — (busca `tenant`) | Nome/slug → `id` (tenantId). Vários matches → perguntar. |
| `listIntegrations` | `meta_list_integrations` | Status + `write_readiness` |
| `listAdAccounts` | `meta_list_ad_accounts` | Contas de anúncio do OAuth |
| `listCampaigns` | `meta_list_campaigns` | Campanhas |
| `getCampaign` | `meta_get_campaign` | Detalhe + ownership |
| `createCampaign` | `meta_create_campaign` | Criar (PAUSED / dryRun default true) |
| `listAdsets` | `meta_list_adsets` | Conjuntos de anúncios |
| `createAdset` | `meta_create_adset` | Criar adset (BR_*); destination WEBSITE\|WHATSAPP |
| `updateAdsetBudget` | `meta_update_adset_budget` | Budget adset (dryRun default true) |
| `updateAdsetTargeting` | `meta_update_adset_targeting` | Targeting BR_* |
| `listAds` | `meta_list_ads` | Anúncios |
| `createAd` | `meta_create_ad` | Criativo WEBSITE (linkUrl) ou WHATSAPP (CTWA) + anúncio |
| `updateAdCreativeCopy` | `meta_update_ad_creative_copy` | Copy via novo creative |
| `updateAdMedia` | `meta_update_ad_media` | imageUrl\|imageHash via novo creative |
| `previewBulkDelete` | `meta_preview_bulk_delete` | Preview exclusão (IDs + previewToken) |
| `executeBulkDelete` | `meta_execute_bulk_delete` | Execute após confirmação |
| `getInsights` | `meta_get_insights` | Métricas |
| `updateCampaignStatus` | `meta_update_campaign_status` | ACTIVE / PAUSED |
| `updateAdsetStatus` | `meta_update_adset_status` | ACTIVE / PAUSED |
| `updateAdStatus` | `meta_update_ad_status` | ACTIVE / PAUSED |

Catálogo HTTP: `GET /api/gpt/meta/tools`  
OpenAPI: `gpt/blimber-meta/openapi.yaml`  
Tutorial: `docs/gpt-blimber-meta-TUTORIAL.md`  
Docs curtos: `docs/gpt-blimber-meta.md`

## Fluxo obrigatório (mostrar → confirmar → mutar)

1. **Resolver tenant:** UUID informado **ou** `searchTenants?q=Nome` → se vários, perguntar qual → usar `id` como `tenantId`
2. **`listIntegrations`** → confirmar Meta pronto
3. **Listar / detalhar** o objeto e **mostrar** IDs e valores atuais (before)
4. Pedir confirmação explícita
5. Mutar com `confirm: true` e `confirmTenantId === tenantId`
6. Status: `dryRun` opcional (default false). Create/edit/delete: **default `dryRun: true`** → preview → `dryRun: false`
7. Budget: aumento % alto exige `confirmBudgetIncrease: true`
8. **Bulk delete (AVISO FORTE):**
   - Só IDs obtidos via Ações — **nunca** “apague pelo nome”
   - `previewBulkDelete` → mostre tabela (nome/status/budget) → peça “confirmar exclusão” listando IDs
   - Só então `executeBulkDelete` com **mesmos** `deletableIds`, `previewToken`, `confirmDelete: true`, `confirm: true`, `confirmTenantId`, `dryRun: false`
   - Máx. `META_GPT_BULK_MAX` (default 20). Default `deleteMode=DELETED` (≠ ARCHIVED)
9. **Nunca invente** URLs de site, wa.me, api.whatsapp.com ou mídia. WhatsApp Ads: `destinationType=WHATSAPP` (não fabricar linkUrl).

### Click-to-WhatsApp (`destinationType=WHATSAPP`)

1. Campanha com objective `OUTCOME_ENGAGEMENT|LEADS|SALES|TRAFFIC` (WHATSAPP **não** é objective).
2. `createAdset` com `destinationType=WHATSAPP`, `billingEvent=IMPRESSIONS`, `optimizationGoal=CONVERSATIONS` (matriz oficial × objective).
3. `createAd` com `destinationType=WHATSAPP`, `message`, sem `linkUrl` — CTA oficial `WHATSAPP_MESSAGE`.
4. Sempre dryRun primeiro; mostre o payload Graph do preview.

### Templates de targeting (`BR_*`)

| Id | Targeting |
|----|-----------|
| `BR_18_65` | Brasil, 18–65 |
| `BR_25_54` | Brasil, 25–54 |
| `BR_18_34` | Brasil, 18–34 |
| `BR_35_65` | Brasil, 35–65 |

## Segurança

- Nunca peça/revele `access_token` ou chaves do servidor
- Nunca rode SQL em `marketing_integrations`
- Mutação só com `confirm` + `confirmTenantId` (+ ownership)
- Exclusão em massa: previewToken + confirmDelete + dryRun false
- Respostas em português (Brasil)

## Empacotar (upload de Habilidades)

```bash
cd gpt/blimber-meta/skills
zip -r ../blimber-meta-ads.skill.zip blimber-meta-ads
```
