# Meta WRITE — ETAPA 0 (Fundação) — concluída

**Data:** 2026-08-11  
**Plano:** [`gpt-blimber-meta-WRITE-PLAN.md`](./gpt-blimber-meta-WRITE-PLAN.md)  
**Status:** done (somente rails de segurança; sem tools de negócio novas)

---

## Objetivo

Preparar `lib/meta-ads` + contrato GPT para mutações seguras: confirmação, ownership, dry-run, limites e audit — sem create/edit/delete.

---

## Entregas

| Entrega | Onde |
|---------|------|
| Guards compartilhados | `lib/meta-ads/write-guards.ts` |
| Limites via env | `lib/meta-ads/write-limits.ts` |
| Audit estruturado (+ espelho `audit_events`) | `lib/meta-ads/write-audit.ts` |
| Refator `meta_update_campaign_status` | `lib/meta-ads/tools.ts` |
| OpenAPI `dryRun` opcional | `gpt/blimber/openapi-ads.yaml` (pack standalone removido) |
| Rota GPT passa `dryRun` | `server/api/gpt/meta/campaigns/[campaignId]/status.post.ts` |
| Testes unitários | `tests/meta-write-guards.test.ts`, `tests/meta-ads-tools.test.ts` |

### Guards

- `assertWriteConfirmation` — `confirm === true` + `confirmTenantId === tenantId`
- `assertAdAccountOwnership` — `account_id` do objeto vs ad account do tenant
- `assertBulkItemLimit` — teto `META_GPT_BULK_MAX` (default 20)
- `withDryRun` / `resolveDryRun` — preview sem POST/DELETE

### Dry-run (tool legada)

- `meta_update_campaign_status` aceita `dryRun` opcional
- **Default `false`** (retrocompatível: chamadas atuais continuam mutando)
- Com `dryRun: true`: ownership + preview; **sem** POST na Graph

### Limites (env, opcionais)

| Env | Default | Uso |
|-----|---------|-----|
| `META_GPT_BULK_MAX` | 20 | Bulk (etapas futuras) |
| `META_GPT_BUDGET_DAILY_MAX_CENTS` | 500000 | Create/edit budget |
| `META_GPT_WRITES_PER_MINUTE` | 30 | Throttle (helper pronto; enforce nas etapas write) |

Documentados em `.env.example`.

### Audit

- Log estruturado console: `[meta-gpt-write-audit] {json}` (sem tokens)
- Mutação executada (`dryRun: false`): também tenta `insert` em `audit_events` via client Supabase
- **Sem migration** — schema `audit_events` existente basta
- **`actor_id`:** `null` (GPT sem user Hub). Marcador `source: "gpt-meta"` em `after_data`
- Decisão formal de fingerprint da API key adiadas à Etapa 1 (ver plano §13)

### OpenAPI

Contrato comum documentado na description geral e em `UpdateCampaignStatusBody.dryRun`. Descriptions ≤ 300 chars; parameters inline.

---

## Critérios de aceite (Etapa 0)

- [x] Nenhuma tool nova de negócio
- [x] Pause/activate existente compatível (default dryRun false)
- [x] Docs `docs/gpt-*` atualizados (este arquivo + plano marcado)
- [x] Zero conflito com `docs/marketing-ads-brand-reorg/`
- [x] Testes dos guards + regressão status

---

## Como validar

```bash
pnpm test tests/meta-write-guards.test.ts tests/meta-ads-tools.test.ts tests/gpt-meta-openapi.test.ts
```

Manualmente (opcional): chamar `POST /api/gpt/meta/campaigns/{id}/status` com `dryRun: true` e confirmar que a campanha **não** muda no Ads Manager.

---

## O que NÃO foi feito (próximas etapas)

- Etapa 1: audit obrigatório endurecido + status adset/ad + readiness scopes
- Etapas 2–6: create campaign/adset/ad, edit budget, bulk delete

**PARAR AQUI.** Não implementar Etapa 1 sem validação humana dos guards.
