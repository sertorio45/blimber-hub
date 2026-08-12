# Meta WRITE — ETAPA 4 (Create ad + creative) — concluída

**Data:** 2026-08-11  
**Plano:** [`gpt-blimber-meta-WRITE-PLAN.md`](./gpt-blimber-meta-WRITE-PLAN.md)  
**Status:** done (4a link/page creative + create ad; 4b mídia leve via imageUrl|imageHash; 4c não integrado)  
**Pré-requisitos:** Etapas 0–3

---

## Objetivo

`POST /act_{ad_account_id}/adcreatives` (object_story_spec link/page) + `POST /act_*/ads` via tool tipada `meta_create_ad`, ligado a `adsetId` da mesma ad account do tenant, com defaults seguros (PAUSED + dryRun true) e falha clara se Page/page token ausentes.

---

## Entregas

| Entrega | Onde |
|---------|------|
| Guard Page | `assertMetaPageCreativeReady` em `lib/meta-ads/write-guards.ts` |
| Tool `meta_create_ad` | `lib/meta-ads/tools.ts` |
| Rota GPT REST | `server/api/gpt/meta/ads.post.ts` |
| OpenAPI v1.5.0 | hoje `gpt/blimber/openapi-ads.yaml` (`createAd`) |
| Instruções + Skill | `gpt/blimber/instructions.md`, `.agents/skills/blimber-meta-ads` |
| Testes | `tests/meta-ads-tools.test.ts`, `tests/meta-write-guards.test.ts`, `tests/gpt-meta-openapi.test.ts` |

### Tool

| Campo | Regra |
|-------|--------|
| `adsetId` | Obrigatório; ownership na execução |
| `name` | Nome do anúncio |
| `linkUrl` | https obrigatório (nunca inventar) |
| `message` | Copy explícita do usuário |
| `headline` / `description` | Opcionais → link_data |
| `callToAction` | Whitelist; default `LEARN_MORE` |
| `imageUrl` / `imageHash` | XOR opcional (4b leve); nunca inventar URL |
| `status` | Default **PAUSED**; ACTIVE exige `confirmActive: true` |
| `confirm` + `confirmTenantId` | Obrigatórios |
| `dryRun` | Default **true** (sem Graph POST no preview) |
| Page | `page_id` + `page_access_token` da integração (obrigatórios) |

### Graph (execute)

1. GET adset → ownership vs ad account do tenant  
2. POST `/{act}/adcreatives` com `object_story_spec.page_id` + `link_data`  
3. POST `/{act}/ads` com `creative_id` + `adset_id` + status  

### Audit

- Preview: `meta.gpt.ad.create.preview` (console / sink; sem DB)  
- Execute: `meta.gpt.ad.create` + `entity_id` = ad id; `after` inclui creativeId, pageId, linkUrl; `source = gpt-meta`

---

## Critérios de aceite

- [x] Falha clara se `page_id` / page token ausente (`META_PAGE_ID_REQUIRED` / `META_PAGE_TOKEN_REQUIRED`)  
- [x] Ad criado PAUSED por default  
- [x] Ownership: adset na mesma ad account  
- [x] Dry-run mostra copy + URL + page (sem Graph POST)  
- [x] Sem geração de imagem automática  
- [x] Skill GPT: nunca inventar URLs de mídia  
- [x] OpenAPI + Skill + instructions  

---

## Como validar

```bash
pnpm test tests/meta-write-guards.test.ts tests/meta-ads-tools.test.ts tests/gpt-meta-openapi.test.ts
```

### Sandbox (tenant piloto)

1. Confirmar campanha + adset PAUSED (Etapas 2–3) e Page conectada (`listIntegrations` → `write_readiness.has_page_token`)  
2. `POST /api/gpt/meta/ads` com body mínimo + `confirm` (omitir `dryRun` ou `true`) → **não** cria; conferir `preview` (copy, link, page)  
3. Após confirmação: `dryRun: false` → anúncio PAUSED + creative no Ads Manager  
4. Conferir `audit_events` com action `meta.gpt.ad.create`

---

## O que NÃO foi feito

- **4c:** Brand Context / IA para sugerir copy (só documentação; sem bridge código)  
- Upload binário de mídia / video_id complexo  
- **Etapa 5:** edit budget / targeting / copy / media — ver [`gpt-blimber-meta-WRITE-ETAPA-5.md`](./gpt-blimber-meta-WRITE-ETAPA-5.md)  
- **Etapa 6:** bulk delete  

Validação sandbox da Etapa 4 permanece recomendada antes de mutações reais.
