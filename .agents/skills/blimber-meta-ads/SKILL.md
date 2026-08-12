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
| `meta_create_adset` | Criar adset (`BR_18_65` / `BR_*` **ou** `targeting` custom; destination WEBSITE\|WHATSAPP) |
| `meta_update_adset_budget` | Budget adset (dryRun default true) |
| `meta_update_adset_targeting` | Targeting `BR_*` **ou** `targeting` custom (XOR) |
| `meta_list_ads` | Anúncios |
| `meta_search_interests` | Busca interesses Meta (id) para targeting custom |
| `meta_search_geolocations` | Busca cidades/regiões (key) para geo_locations |
| `meta_list_custom_audiences` | Lista custom audiences da ad account |
| `meta_create_ad` | Criar criativo IMAGE|VIDEO|CAROUSEL|DYNAMIC + anúncio (WEBSITE ou WhatsApp CTWA; default PAUSED + dryRun true) |
| `meta_update_ad_creative_copy` | Copy via novo creative |
| `meta_update_ad_media` | imageUrl\|imageHash via novo creative |
| `meta_preview_bulk_delete` | Preview exclusão (IDs + previewToken) |
| `meta_execute_bulk_delete` | Execute exclusão (confirmações + dryRun false) |
| `meta_get_insights` | Métricas (level + datePreset) |
| `meta_update_campaign_status` | ACTIVE / PAUSED |
| `meta_update_adset_status` | ACTIVE / PAUSED |
| `meta_update_ad_status` | ACTIVE / PAUSED |

OpenAPI: `gpt/blimber/openapi-ads.yaml` (`createCampaign`, `createAdset`, `createAd`, `searchInterests`, `searchGeolocations`, `listCustomAudiences`, `updateAdsetStatus`, `updateAdsetBudget`, `updateAdCreativeCopy`, `previewBulkDelete`, `executeBulkDelete`, …)  
Catálogo: `GET /api/gpt/meta/tools`

`createAd.creativeType`: IMAGE (default) | VIDEO | CAROUSEL | DYNAMIC_CREATIVE — mídia já na Meta (`imageHash` / `videoId`); DYNAMIC exige adset `is_dynamic_creative=true`. Sem upload binário.

## Fluxo sugerido

1. `searchTenants` (se não houver UUID) → confirmar cliente  
2. `meta_list_integrations` → confirmar Meta pronto / write_readiness  
3. `meta_list_campaigns` / adsets / ads ou `meta_get_insights`  
4. Targeting custom: `meta_search_interests` / `meta_search_geolocations` (opcional `meta_list_custom_audiences`) → montar `targeting` com IDs/keys → `meta_create_adset` ou `meta_update_adset_targeting`  
5. Pausar/ativar: listar ou detalhar → confirmação → tool de status (`dryRun` opcional)  
6. Criar/editar: preview (`dryRun` default) → confirmar → `dryRun: false`  
7. Bulk delete: `meta_preview_bulk_delete` → listar IDs ao usuário → `meta_execute_bulk_delete`

## Fora de escopo

- Inventar IDs de interest/city — sempre buscar via `meta_search_*`
- Upload binário de vídeo/imagem para a Meta (use image_hash / video_id já existentes)
- Advantage+ / catálogo / Instant Experience / Collection ads / Stories placement customization
- Targeting sem geo mínimo
- Delete por nome/filtro sem lista de IDs
- Brand Center / geração de imagem por IA
- Campanhas orgânicas (`social_campaigns`) — ver Marketing `createPost` (format static|carousel|video|story)
- Meta CAPI (CRM)
