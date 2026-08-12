# Meta WRITE — ETAPA 5 (Edits) — concluída

**Data:** 2026-08-11  
**Plano:** [`gpt-blimber-meta-WRITE-PLAN.md`](./gpt-blimber-meta-WRITE-PLAN.md)  
**Status:** done (budget / targeting / copy / media tipados; sem patch Graph genérico)  
**Pré-requisitos:** Etapas 0–4

---

## Objetivo

Updates pontuais com tools whitelist separadas: budget e targeting de adset; copy e mídia de ad (via novo AdCreative + swap). Sem bulk delete. Sem Brand/IA.

---

## Entregas

| Entrega | Onde |
|---------|------|
| Guard aumento % | `assertBudgetIncreaseAllowed` + `META_GPT_BUDGET_INCREASE_MAX_PERCENT` |
| Tools | `meta_update_adset_budget`, `meta_update_adset_targeting`, `meta_update_ad_creative_copy`, `meta_update_ad_media` |
| Rotas GPT REST | `adsets/[adsetId]/budget|targeting.post.ts`, `ads/[adId]/creative-copy|media.post.ts` |
| OpenAPI v1.6.0 | hoje `gpt/blimber/openapi-ads.yaml` (pack standalone removido) |
| Instruções + Skill | pack GPT + espelho Cursor |
| Doc | este arquivo |
| Testes | `meta-ads-tools`, `meta-write-guards`, `gpt-meta-openapi` |

### Tools

| Tool | Campos | dryRun default |
|------|--------|----------------|
| `meta_update_adset_budget` | `dailyBudget` XOR `lifetimeBudget`; `endTime` se lifetime sem end; `confirmBudgetIncrease` se aumento % > teto | **true** |
| `meta_update_adset_targeting` | `targetingTemplate` (`BR_*` only) | **true** |
| `meta_update_ad_creative_copy` | ≥1 de message/headline/description/CTA/linkUrl; merge com criativo atual | **true** |
| `meta_update_ad_media` | `imageUrl` XOR `imageHash`; preserva copy | **true** |

Todas: `confirm` + `confirmTenantId`, ownership, audit com **before/after**, teto abs. `META_GPT_BUDGET_DAILY_MAX_CENTS`.

### Graph

- Budget/targeting: `POST /{adsetId}`  
- Copy/media: `POST /act_*/adcreatives` + `POST /{adId}` `{ creative: { creative_id } }` (AdCreative imutável na prática)

### Audit

| Ação | dryRun |
|------|--------|
| `meta.gpt.adset.budget[.preview]` | sim/não |
| `meta.gpt.adset.targeting[.preview]` | sim/não |
| `meta.gpt.ad.creative_copy[.preview]` | sim/não |
| `meta.gpt.ad.media[.preview]` | sim/não |

---

## Gaps (mídia avançada)

- `video_id`, upload binário, carousel, Stories — **fora**  
- Mutação in-place do mesmo `creative_id` — não usada (novo creative + swap)  
- Edit de budget no nível **campaign** — fora (só adset nesta etapa)

---

## Critérios de aceite

- [x] Schema rejeita fora da whitelist  
- [x] Diff before/after no response e audit  
- [x] Pause/activate intactos (testes)  
- [x] OpenAPI + Skill + instructions PT  
- [x] dryRun default true em edits sensíveis  

---

## Como validar

```bash
pnpm test tests/meta-write-guards.test.ts tests/meta-ads-tools.test.ts tests/gpt-meta-openapi.test.ts
```

### Sandbox

1. Budget: dryRun → depois `dryRun:false` (redução); aumento alto + `confirmBudgetIncrease`  
2. Targeting: trocar `BR_*` e conferir Ads Manager  
3. Copy: alterar message; conferir novo creative  
4. Media: `imageHash`/`imageUrl` real; sem inventar URL  

---

## O que NÃO foi feito

- **Etapa 6:** bulk delete  
- Brand Context / IA (4c / bridge)  

**PARAR AQUI.** Não implementar Etapa 6 sem validação humana.
