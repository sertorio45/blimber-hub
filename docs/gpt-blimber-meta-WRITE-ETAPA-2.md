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
| Guards budget + confirmActive | `lib/meta-ads/write-guards.ts` |
| Rota GPT REST | `server/api/gpt/meta/campaigns/index.post.ts` |
| OpenAPI v1.3.0 | `gpt/blimber-meta/openapi.yaml` (`createCampaign`) |
| Instruções + Skill | `gpt/blimber-meta/instructions.md`, skills + Cursor espelho |
| Testes | `tests/meta-ads-tools.test.ts`, `tests/meta-write-guards.test.ts`, `tests/gpt-meta-openapi.test.ts` |

### Tool

| Campo | Regra |
|-------|--------|
| `name` | Obrigatório |
| `objective` | Whitelist Outcome_* apenas |
| `status` | Default **PAUSED**; ACTIVE exige `confirmActive: true` |
| `dailyBudget` / `lifetimeBudget` | Opcionais, XOR; centavos; teto `META_GPT_BUDGET_*` |
| `specialAdCategories` | Default `[]` |
| `confirm` + `confirmTenantId` | Obrigatórios |
| `dryRun` | Default **true** (sem Graph no preview) |

### Objetivos

**Suportados:** `OUTCOME_AWARENESS`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_TRAFFIC`, `OUTCOME_APP_PROMOTION`  

**Rejeitados:** legados (`CONVERSIONS`, `LINK_CLICKS`, `BRAND_AWARENESS`, etc.) via schema Zod.

### Audit

- Preview: `meta.gpt.campaign.create.preview` (console / sink; sem DB)
- Execute: `meta.gpt.campaign.create` + `entity_id` = campaign id retornado; `after.source = gpt-meta`

---

## Critérios de aceite

- [x] Create só na ad account resolvida do tenant (`resolveMetaCredentials`)
- [x] Default PAUSED; ACTIVE exige `confirmActive`
- [x] Preview dry-run mostra payload + notas de budget (moeda sob execute / listAdAccounts)
- [x] Audit com `after.campaignId`
- [x] OpenAPI + testes de schema / confirms / dry-run sem Graph
- [x] Documentação de objetivos suportados vs rejeitados

---

## Como validar

```bash
pnpm test tests/meta-write-guards.test.ts tests/meta-ads-tools.test.ts tests/gpt-meta-openapi.test.ts
```

### Sandbox (tenant piloto)

1. `POST /api/gpt/meta/campaigns` com body mínimo + `confirm` (omitir `dryRun` ou `true`) → **não** cria no Ads Manager; conferir `preview`
2. Após confirmação: mesmo payload com `dryRun: false` → campanha PAUSED no Ads Manager
3. Conferir `audit_events` com action `meta.gpt.campaign.create` e `after_data.source = gpt-meta`

---

## O que NÃO foi feito (próximas etapas)

- **Etapa 3:** create adset (targeting template) — concluída em [`gpt-blimber-meta-WRITE-ETAPA-3.md`](./gpt-blimber-meta-WRITE-ETAPA-3.md)
- Etapas 4–6: create ad/creative, edit budget, bulk delete

**PARAR AQUI.** Não implementar Etapa 4 sem validação humana no sandbox.
