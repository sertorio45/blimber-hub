# Meta WRITE — ETAPA 3 (Create adset) — concluída

**Data:** 2026-08-11  
**Plano:** [`gpt-blimber-meta-WRITE-PLAN.md`](./gpt-blimber-meta-WRITE-PLAN.md)  
**Status:** done (create adset tipado + targeting templates fechados + dryRun default true)  
**Pré-requisitos:** [`gpt-blimber-meta-WRITE-ETAPA-0.md`](./gpt-blimber-meta-WRITE-ETAPA-0.md), [`gpt-blimber-meta-WRITE-ETAPA-1.md`](./gpt-blimber-meta-WRITE-ETAPA-1.md), [`gpt-blimber-meta-WRITE-ETAPA-2.md`](./gpt-blimber-meta-WRITE-ETAPA-2.md)

---

## Objetivo

`POST /act_{ad_account_id}/adsets` via tool tipada `meta_create_adset`, ligado a `campaignId` da mesma ad account do tenant, com targeting **somente** via templates whitelist e defaults seguros (PAUSED + dryRun true).

---

## Entregas

| Entrega | Onde |
|---------|------|
| Templates de targeting | `lib/meta-ads/targeting-templates.ts` |
| Tool `meta_create_adset` | `lib/meta-ads/tools.ts` |
| Rota GPT REST | `server/api/gpt/meta/adsets.post.ts` |
| OpenAPI v1.4.0 | hoje `gpt/blimber/openapi-ads.yaml` (`createAdset`) |
| Instruções + Skill | `gpt/blimber/instructions.md`, `.agents/skills/blimber-meta-ads` |
| Testes | `tests/meta-ads-tools.test.ts`, `tests/gpt-meta-openapi.test.ts` |

### Tool

| Campo | Regra |
|-------|--------|
| `campaignId` | Obrigatório; ownership na execução |
| `name` | Obrigatório |
| `targetingTemplate` | Whitelist: `BR_18_65`, `BR_25_54`, `BR_18_34`, `BR_35_65` |
| `billingEvent` | `IMPRESSIONS` \| `LINK_CLICKS` |
| `optimizationGoal` | Whitelist (REACH, LINK_CLICKS, OFFSITE_CONVERSIONS, …) |
| `dailyBudget` / `lifetimeBudget` | XOR; **um obrigatório**; lifetime exige `endTime` |
| `status` | Default **PAUSED**; ACTIVE exige `confirmActive: true` |
| `confirm` + `confirmTenantId` | Obrigatórios |
| `dryRun` | Default **true** (sem Graph no preview) |

### Templates

| Id | Targeting Graph montado |
|----|-------------------------|
| `BR_18_65` | countries=`BR`, age 18–65 |
| `BR_25_54` | countries=`BR`, age 25–54 |
| `BR_18_34` | countries=`BR`, age 18–34 |
| `BR_35_65` | countries=`BR`, age 35–65 |

**Rejeitado:** targeting Graph arbitrário, Advantage+, catálogo.

### Audit

- Preview: `meta.gpt.adset.create.preview` (console / sink; sem DB)
- Execute: `meta.gpt.adset.create` + `entity_id` = adset id; `after.source = gpt-meta`

---

## Critérios de aceite

- [x] Rejeita `campaignId` fora da ad account (execute)
- [x] Targeting só schemas/templates Zod permitidos
- [x] Dry-run preview legível (geos, idade, budget) sem Graph POST
- [x] Audit + testes (confirms, templates inválidos, ownership)
- [x] Sem Advantage+ complex / catálogo
- [x] OpenAPI + Skill + instructions

---

## Como validar

```bash
pnpm test tests/meta-write-guards.test.ts tests/meta-ads-tools.test.ts tests/gpt-meta-openapi.test.ts
```

### Sandbox (tenant piloto)

1. Criar campanha PAUSED (Etapa 2) se ainda não existir  
2. `POST /api/gpt/meta/adsets` com body mínimo + `confirm` (omitir `dryRun` ou `true`) → **não** cria; conferir `preview` (template + budget)  
3. Após confirmação: `dryRun: false` → adset PAUSED sob a campanha no Ads Manager  
4. Conferir `audit_events` com action `meta.gpt.adset.create`

---

## O que NÃO foi feito (próximas etapas)

- **Etapa 4:** create ad + creative — concluída em [`gpt-blimber-meta-WRITE-ETAPA-4.md`](./gpt-blimber-meta-WRITE-ETAPA-4.md)  
- Etapas 5–6: edit budget/targeting/copy, bulk delete  

Validação sandbox da Etapa 3 permanece recomendada antes de mutações reais.
