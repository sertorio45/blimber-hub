---
name: blimber-meta-ads
description: >-
  Gestão e insights de Meta Ads no Blimber Hub (campanhas, adsets, ads,
  insights, status, create, edits e bulk delete com preview). Uso principal =
  ChatGPT GPT personalizado + Ações em português (Brasil) — Ads em
  gpt/blimber/openapi-ads.yaml (host ads.blimber.com.br). Hub unificado: 2 Ações
  (openapi-marketing.yaml em app.* + openapi-ads.yaml em ads.*).
  Em Cursor, use HTTP /api/gpt/meta/* ou MCP stdio opcional.
  Sempre via tools — nunca SQL direto. Resolva tenantId por nome
  (searchTenants na Ação Marketing) se necessário; tools Meta ainda exigem tenantId.
---

# Blimber Meta Ads

> **Primário (PT-BR):** ChatGPT GPT unificado + 2 Ações. Ads = `gpt/blimber/openapi-ads.yaml`.  
> Setup: `docs/gpt-blimber-ACTIONS.md`. Docs: `docs/gpt-blimber-meta.md` e `docs/gpt-blimber-meta-TUTORIAL.md`.  
> Pack standalone Ads-only foi **removido**.  
> Em Cursor, este skill aponta para o mesmo contrato HTTP `/api/gpt/meta/*`.

## Quando usar

- Relatórios / insights Meta Ads de um tenant
- Listar campanhas, conjuntos de anúncios (adsets) e anúncios
- Pausar ou reativar campanha, adset ou anúncio (com confirmação)
- Criar campanha, adset ou anúncio+criativo (WEBSITE ou WhatsApp CTWA; default PAUSED + dryRun true)
- Editar budget/targeting do adset; copy/mídia do ad (dryRun default true)
- Excluir em massa com preview → execute (IDs explícitos; nunca por nome)
- Ver se Meta está conectado / write-ready (`write_readiness`)
- Descobrir `tenantId` a partir do nome do cliente (`searchTenants` / `GET /api/gpt/tenants?q=`)

## Como operar

1. **Produção (usuário):** GPT no ChatGPT — **Configurar** → **Ações** → importar `gpt/blimber/openapi-marketing.yaml` (host `app.*`) **e** `gpt/blimber/openapi-ads.yaml` (host `ads.*`).
2. **Neste repo (Cursor):** `GET/POST /api/gpt/meta/*` com Bearer `BLIMBER_MCP_API_KEY`, ou MCP stdio `pnpm mcp:meta` (opcional).
3. Se só houver o **nome** do cliente: `searchTenants` (`GET /api/gpt/tenants?q=Nome`) → pegar `id` → usar como `tenantId`. Vários matches → confirmar. **Nunca** misture tenants.
4. Tools Meta **sempre** exigem `tenantId` (UUID). Isolamento por tenant mantido.
5. **Não** peça/revele `access_token`.
6. Escrita: fluxo **mostrar → confirmar → mutar** com `confirm: true` e `confirmTenantId === tenantId`.
7. Create/edit/delete: default `dryRun: true`; ACTIVE no create exige `confirmActive: true`. Bulk delete: preview → confirmDelete + previewToken + dryRun false. Nunca inventar URLs (nem wa.me); WhatsApp Ads usam `destinationType=WHATSAPP`. Nunca apagar por nome.
8. **Idioma:** respostas ao usuário final em **português (Brasil)**.

## Tools

| Tool | Uso |
|------|-----|
| `searchTenants` (HTTP Marketing) | Nome/slug → `{ tenants: [{ id, name, slug }] }` |
| `meta_list_integrations` | Status + `write_readiness` (ads_management / page token) |
| `meta_list_ad_accounts` | Contas de anúncio do OAuth |
| `meta_list_campaigns` | Campanhas |
| `meta_get_campaign` | Detalhe |
| `meta_create_campaign` | Criar campanha (PAUSED / dryRun default true) |
| `meta_list_adsets` | Conjuntos de anúncios |
| `meta_create_adset` | Criar adset (`BR_18_65` / `BR_*` **ou** `targeting` custom; destination WEBSITE\|WHATSAPP; `isDynamicCreative` opcional p/ DYNAMIC_CREATIVE_LEGACY) |
| `meta_update_adset_budget` | Budget adset (dryRun default true) |
| `meta_update_adset_targeting` | Targeting `BR_*` **ou** `targeting` custom (XOR) |
| `meta_list_ads` | Anúncios |
| `meta_search_interests` | Busca interesses Meta (id) para targeting custom |
| `meta_search_geolocations` | Busca cidades/regiões (key) para geo_locations |
| `meta_list_custom_audiences` | Lista custom audiences da ad account |
| `meta_create_ad` | Criar criativo IMAGE\|VIDEO\|CAROUSEL\|DYNAMIC_CREATIVE_LEGACY\|CATALOG (+ Advantage+) ou ad via `creativeId`; WEBSITE/WhatsApp CTWA; default PAUSED + dryRun true |
| `meta_update_ad_creative_copy` | Copy via novo creative |
| `meta_update_ad_media` | IMAGE\|VIDEO\|CAROUSEL via novo creative |
| `meta_get_capabilities` | Matriz de capacidades vs Graph version |
| `meta_upload_image` / `meta_upload_video` / `meta_get_video_status` | Upload/reuse mídia (SSRF) |
| `meta_list_catalogs` / `meta_list_product_sets` | Catalogs + product sets (ownership) |
| `meta_create_experiment` / `meta_get_experiment` / `meta_stop_experiment` | Ad Studies oficiais (SPLIT_TEST_V2 / SPLIT_TEST) |
| `meta_preview_bulk_delete` | Preview exclusão (IDs + previewToken) |
| `meta_execute_bulk_delete` | Execute exclusão (confirmações + dryRun false) |
| `meta_get_insights` | Métricas (level + datePreset) |
| `meta_update_campaign_status` | ACTIVE / PAUSED |
| `meta_update_adset_status` | ACTIVE / PAUSED |
| `meta_update_ad_status` | ACTIVE / PAUSED |

OpenAPI: `gpt/blimber/openapi-ads.yaml` (`createCampaign`, `createAdset`, `createAd`, `searchInterests`, `searchGeolocations`, `listCustomAudiences`, `updateAdsetStatus`, `updateAdsetBudget`, `updateAdCreativeCopy`, `previewBulkDelete`, `executeBulkDelete`, …; overflow via `invokeMetaTool`: capabilities, upload, catalogs, product sets, experiments)  
Catálogo: `GET /api/gpt/meta/tools`

`createAd.creativeType`: IMAGE (default) | VIDEO | CAROUSEL | DYNAMIC_CREATIVE_LEGACY | CATALOG — ou `creativeId` XOR. Upload HTTPS opcional (`imageUrl`/`videoUrl`) com SSRF; dryRun não faz upload.  
`createAdset.isDynamicCreative`: opcional → `is_dynamic_creative=true` (só WEBSITE; ads com DYNAMIC_CREATIVE_LEGACY).  
`createAdset` / `updateAdsetTargeting.advantageAudience`: opcional `0|1` (default `0`) → `targeting_automation.advantage_audience`.

**Clarificações:**
- **Mídia flexível** (Ads Manager) = Advantage+ `pac_relaxation` (`degreesOfFreedomSpec`) — implementado.
- **Flexible Ad Format** (`creative_asset_groups_spec`) = capability=false (não implementado; `META_ADS_GRAPH_VERSION` / `META_GRAPH_VERSION` sobem Graph sem habilitar o campo; default Ads **v25.0**).
- **advantage_audience**: create/update adset sempre envia `targeting_automation.advantage_audience` (default `0`; opcional `advantageAudience: 1`).
- **Dynamic Creative** = `DYNAMIC_CREATIVE_LEGACY` (`asset_feed_spec` + adset `is_dynamic_creative` via `isDynamicCreative`).
- **Teste de criativo** = `meta_create_experiment` (SPLIT_TEST_V2).
- **Competição prática:** vários ads IMAGE|VIDEO no mesmo adset.

## Fluxo sugerido

1. `searchTenants` (se não houver UUID) → confirmar cliente  
2. `meta_list_integrations` → confirmar Meta pronto / write_readiness  
3. `meta_list_campaigns` / adsets / ads ou `meta_get_insights`  
4. Targeting custom: `meta_search_interests` / `meta_search_geolocations` (opcional `meta_list_custom_audiences`) → montar `targeting` com IDs/keys → `meta_create_adset` ou `meta_update_adset_targeting`  
5. Pausar/ativar: listar ou detalhar → confirmação → tool de status (`dryRun` opcional)  
6. Criar/editar: preview (`dryRun` default) → confirmar → `dryRun: false`  
7. Bulk delete: `meta_preview_bulk_delete` → listar IDs ao usuário → `meta_execute_bulk_delete`

## Fora de escopo

- Flexible Ad Format (`creative_asset_groups_spec`) — capability false mesmo em Graph v25
- Collection / Instant Experience canvas
- Targeting sem geo mínimo
- Delete por nome/filtro sem lista de IDs
- Brand Center / geração de imagem por IA
- Campanhas orgânicas (`social_campaigns`) — ver Marketing `createPost` (format static|carousel|video|story)
- Meta CAPI (CRM)
- WhatsApp Cloud API version (fica em v21 hardcoded)
