# Meta WRITE — ETAPA 1 (MVP write) — concluída

**Data:** 2026-08-11  
**Plano:** [`gpt-blimber-meta-WRITE-PLAN.md`](./gpt-blimber-meta-WRITE-PLAN.md)  
**Status:** done (paridade status campaign/adset/ad + readiness + audit)  
**Pré-requisito:** [`gpt-blimber-meta-WRITE-ETAPA-0.md`](./gpt-blimber-meta-WRITE-ETAPA-0.md)

---

## Objetivo

Escrita mínima confiável e auditável: endurecer pause/activate de campanha e espelhar para adset/ad; reportar readiness de write sem novos OAuth scopes.

---

## Entregas

| Entrega | Onde |
|---------|------|
| Tools `meta_update_adset_status`, `meta_update_ad_status` | `lib/meta-ads/tools.ts` |
| Helper compartilhado de status + ownership + dryRun + audit | `mutateOwnedObjectStatus` |
| `write_readiness` em list integrations | `lib/meta-ads/integration.ts` |
| Rotas GPT REST | `server/api/gpt/meta/adsets/[adsetId]/status.post.ts`, `.../ads/[adId]/status.post.ts` |
| OpenAPI v1.2.0 | hoje `gpt/blimber/openapi-ads.yaml` (pack standalone removido) |
| Instruções + Skill (fluxo mostrar → confirmar → mutar) | `gpt/blimber/instructions.md`, `.agents/skills/blimber-meta-ads` |
| Testes | `tests/meta-ads-tools.test.ts`, `tests/meta-write-guards.test.ts`, `tests/gpt-meta-openapi.test.ts` |

### Tools de status (ACTIVE \| PAUSED)

| Tool | Graph | dryRun default |
|------|-------|----------------|
| `meta_update_campaign_status` | `POST /{campaignId}` | **false** (legado) |
| `meta_update_adset_status` | `POST /{adsetId}` | **false** (espelho) |
| `meta_update_ad_status` | `POST /{adId}` | **false** (espelho) |

Todas exigem: `confirm: true`, `confirmTenantId === tenantId`, ownership da ad account, audit em mutação executada.

### write_readiness (provider=meta)

Campo em cada integração Meta retornada por `meta_list_integrations`:

| Campo | Significado |
|-------|-------------|
| `ads_management` | Escopo presente em `granted_scopes` (se scopes ausentes → assume OK se há token) |
| `has_page_token` | `page_access_token` presente (creatives Page/IG nas etapas futuras) |
| `scopes_unknown` | Lista de scopes vazia/ausente |
| `notes` | Avisos human-readable (sem tokens) |

**Sem novos OAuth scopes** no start OAuth.

### Audit

- Mutação (`dryRun: false`): console `[meta-gpt-write-audit]` + insert `audit_events`
- Preview (`dryRun: true`): só console / sink (não persiste DB)
- Actions: `meta.gpt.campaign|adset|ad.status` (+ `.preview`)
- **`actor_id`:** `null`; `after.source = "gpt-meta"` (fingerprint da API key continua adiado)

---

## Critérios de aceite

- [x] Toda mutação executada gera audit (console + tentativa `audit_events`)
- [x] Ownership falha com 403 se objeto de outra ad account
- [x] `confirm` / `confirmTenantId` rejeitados nos testes
- [x] GPT instructions: fluxo “mostrar → confirmar → mutar” (campanha/adset/ad)
- [x] OpenAPI: descriptions ≤300, parameters inline, server `https://app.blimber.com.br`
- [x] `pnpm test` nos testes Meta GPT / openapi / guards

---

## Como validar

```bash
pnpm test tests/meta-write-guards.test.ts tests/meta-ads-tools.test.ts tests/gpt-meta-openapi.test.ts
```

### Sandbox (tenant piloto)

1. `GET /api/gpt/meta/integrations?tenantId=` → conferir `write_readiness.ads_management`
2. `POST .../campaigns/{id}/status` com `dryRun: true` → campanha **não** muda
3. Após confirmação: `dryRun: false` (ou omitir) → pausa/ativa no Ads Manager
4. Repetir com `POST .../adsets/{id}/status` e `POST .../ads/{id}/status`
5. Conferir linha em `audit_events` (action `meta.gpt.*.status`, `after_data.source = gpt-meta`)

---

## O que NÃO foi feito (próximas etapas)

- **Etapa 2:** create campaign (`PAUSED` default) — **DONE** (`gpt-blimber-meta-WRITE-ETAPA-2.md`)
- Etapas 3–6: create adset/ad, edit budget, bulk delete

**PARAR AQUI.** Não implementar Etapa 3 sem validação humana no sandbox.
