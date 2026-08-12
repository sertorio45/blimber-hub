# Meta WRITE — ETAPA 2 (Create campaign) — concluída

**Data:** 2026-08-11  
**Plano:** [`gpt-blimber-meta-WRITE-PLAN.md`](./gpt-blimber-meta-WRITE-PLAN.md)  
**Status:** done (create campaign tipado + dryRun default true)  
**Pré-requisitos:** [`gpt-blimber-meta-WRITE-ETAPA-0.md`](./gpt-blimber-meta-WRITE-ETAPA-0.md), [`gpt-blimber-meta-WRITE-ETAPA-1.md`](./gpt-blimber-meta-WRITE-ETAPA-1.md)

---

## Objetivo

`POST /act_{ad_account_id}/campaigns` via tool tipada `meta_create_campaign`, com defaults seguros (PAUSED + dryRun true) e audit em execução real.

---

## Entregas

| Entrega | Onde |
|---------|------|
| Tool `meta_create_campaign` | `lib/meta-ads/tools.ts` |
| Builder `buildMetaCreateCampaignGraphBody` | `lib/meta-ads/tools.ts` |
| Guards budget + confirmActive | `lib/meta-ads/write-guards.ts` |
| Erros Graph enriquecidos | `lib/meta-ads/graph.ts` (`extractMetaGraphErrorFields`, `enrichMetaGraphWriteError`) |
| Rota GPT REST | `server/api/gpt/meta/campaigns/index.post.ts` |
| OpenAPI v1.7.1 | hoje `gpt/blimber/openapi-ads.yaml` (`createCampaign` + `ErrorToolResponse`) |
| Instruções + Skill | `gpt/blimber/instructions.md`, `.agents/skills/blimber-meta-ads` |
| Testes | `tests/meta-ads-tools.test.ts`, `tests/meta-graph.test.ts`, `tests/meta-write-guards.test.ts`, `tests/gpt-meta-openapi.test.ts` |

### Tool

| Campo | Regra |
|-------|--------|
| `name` | Obrigatório |
| `objective` | Whitelist Outcome_* apenas |
| `status` | Default **PAUSED**; ACTIVE exige `confirmActive: true` |
| `dailyBudget` / `lifetimeBudget` | Opcionais, XOR; centavos; teto `META_GPT_BUDGET_*` |
| `specialAdCategories` | Default `[]` (sempre enviado à Graph — campo obrigatório) |
| Sem budget de campanha | Envia `is_adset_budget_sharing_enabled: false` (ABO; exigido Marketing API v24+) |
| Com budget de campanha | Omite `is_adset_budget_sharing_enabled` (CBO) |
| `confirm` + `confirmTenantId` | Obrigatórios |
| `dryRun` | Default **true** (sem Graph no preview) |

### Objetivos

**Suportados:** `OUTCOME_AWARENESS`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_TRAFFIC`, `OUTCOME_APP_PROMOTION`  

**Rejeitados:** legados (`CONVERSIONS`, `LINK_CLICKS`, `BRAND_AWARENESS`, etc.) via schema Zod.

### Audit

- Preview: `meta.gpt.campaign.create.preview` (console / sink; sem DB)
- Execute: `meta.gpt.campaign.create` + `entity_id` = campaign id retornado; `after.source = gpt-meta`
- Falha Graph: `meta.gpt.campaign.create.failed` com `request_payload` sanitizado + campos do erro

---

## Changelog — fix Invalid parameter (100) (2026-08-11)

### Causa raiz

Sem budget no nível campanha, o payload **não** enviava `is_adset_budget_sharing_enabled`.  
A Marketing API (doc oficial + v24+) exige `true`/`false` nesse caso (`0` no exemplo curl).  
Resultado típico: `OAuthException` code **100** Invalid parameter.

### Correção

- `buildMetaCreateCampaignGraphBody`: ABO → `is_adset_budget_sharing_enabled: false`; CBO → omitir o flag
- `special_ad_categories` continua sempre presente (`[]` = nenhuma)
- Booleans no client Graph viram `0`/`1` (form/query)

### Debug de erros Graph

Em falhas de write (`META_GRAPH_ERROR`), `error.details` inclui:

| Campo | Origem |
|-------|--------|
| `code` | Graph `error.code` |
| `error_subcode` | Graph |
| `error_user_title` / `error_user_msg` | Graph (PT quando disponível) |
| `fbtrace_id` | Graph |
| `message` / `type` | Graph |
| `request_payload` | Body enviado, **sem** tokens |

### Como debugar em produção

1. Dry-run: `POST /api/gpt/meta/campaigns` com `confirm: true` (omitir dryRun ou `true`) → conferir `data.preview.body`
2. Execute: mesmo body + `dryRun: false`
3. Se 400/`META_GRAPH_ERROR`: ler `error.details.error_user_msg`, `error_subcode` e `request_payload`
4. Logs: ação `meta.gpt.campaign.create.failed`

---

## Critérios de aceite

- [x] Create só na ad account resolvida do tenant (`resolveMetaCredentials`)
- [x] Default PAUSED; ACTIVE exige `confirmActive`
- [x] Preview dry-run mostra payload + notas de budget (moeda sob execute / listAdAccounts)
- [x] Audit com `after.campaignId`
- [x] OpenAPI + testes de schema / confirms / dry-run sem Graph
- [x] Documentação de objetivos suportados vs rejeitados
- [x] ABO envia `is_adset_budget_sharing_enabled: false`
- [x] Erros Graph com subcode/user msgs + payload sanitizado

---

## Como validar

```bash
pnpm test tests/meta-graph.test.ts tests/meta-write-guards.test.ts tests/meta-ads-tools.test.ts tests/gpt-meta-openapi.test.ts
```

### Sandbox (tenant piloto)

1. `POST /api/gpt/meta/campaigns` com body mínimo + `confirm` (omitir `dryRun` ou `true`) → **não** cria no Ads Manager; conferir `preview.body.is_adset_budget_sharing_enabled === false` se sem budget
2. Após confirmação: mesmo payload com `dryRun: false` → campanha PAUSED no Ads Manager
3. Conferir `audit_events` com action `meta.gpt.campaign.create` e `after_data.source = gpt-meta`

---

## O que NÃO foi feito (próximas etapas)

- **Etapa 3:** create adset (targeting template) — concluída em [`gpt-blimber-meta-WRITE-ETAPA-3.md`](./gpt-blimber-meta-WRITE-ETAPA-3.md)
- Etapas 4–6: create ad/creative, edit budget, bulk delete

**PARAR AQUI.** Não implementar Etapa 4 sem validação humana no sandbox.
