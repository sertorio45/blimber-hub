# ETAPA 8 — Revisão final (Marketing + Ads + Brand Center)

**Data:** 2026-08-11  
**Escopo:** auditoria completa do epic; correções mínimas só para regressões claras do escopo.  
**Resultado geral:** **PASS COM RESSALVAS**

---

## 1. Resumo executivo

O epic concluiu a separação comercial **Marketing (orgânico/editorial)** ↔ **Ads (mídia paga)** e a evolução do **Brand Center** com **Brand Context** consumível por Ads — sem geração de imagem/copy e sem migrations.

| Domínio | Status |
|---------|--------|
| Marketing (menu + rotas editoriais + `social_campaigns`) | ✅ OK |
| Ads (`/ads/*`, boards reutilizados, convivência `/marketing/reports`) | ✅ OK |
| Brand Center + Visual Direction + Brand Context API | ✅ OK |
| Ads ↔ Brand (card + `/ads/creatives` placeholder) | ✅ OK (ETAPA 7 no working tree / uncommitted) |
| Agência / portal / workspace | ✅ OK (gaps residuais leves) |
| Typecheck / lint global | ⚠️ FAIL pré-existente (não bloqueante do epic) |
| Geração de imagens / Prompt Builder | ❌ fora de escopo (intencional) |

---

## 2. Checklist de auditoria

### 2.1 Marketing

| Item | Status | Evidência |
|------|--------|-----------|
| Menu final ETAPA 3 | ✅ | `constants/menus.ts` — Visão Geral, Planejamento (Calendário/Campanhas/Briefings), Conteúdos, Produção, Aprovações, Biblioteca, Marca → `/marketing/brand`, Publicações, Relatórios, Configurações |
| Campanhas editoriais | ✅ | `/marketing/campaigns` → APIs `social_campaigns` |
| Contas sociais fora do top-level | ✅ | Hub em `/marketing/settings` + `/settings/integrations` |
| Relatórios paid ainda no menu Marketing | ✅ | `/marketing/reports` (sem redirect para Ads — política de convivência) |
| Audience agency | ✅ | Briefings, Produção, Aprovações, Marca, Publicações |

### 2.2 Ads

| Rota | Página | Status |
|------|--------|--------|
| `/ads` | `pages/ads/index.vue` | ✅ overview live + card Brand Context |
| `/ads/meta` | `meta.vue` | ✅ `MarketingReportsPanel` `locked-source="meta"` |
| `/ads/google` | `google.vue` | ✅ idem Google |
| `/ads/analytics` | `analytics.vue` | ✅ idem Analytics |
| `/ads/campaigns` | `campaigns.vue` | ✅ campanhas pagas live (não `social_campaigns`) |
| `/ads/reports` | `reports.vue` | ✅ painel completo |
| `/ads/integrations` | `integrations.vue` | ✅ 301 → `/settings/integrations` |
| `/ads/creatives` | `creatives.vue` | ✅ placeholder arquitetura (sem gerar) |
| Boards reutilizados | — | ✅ mesmos componentes Marketing |
| `/marketing/reports` | thin wrapper | ✅ ainda OK |

Companion module: Marketing unlocks Ads (`constants/modules.ts`); Ads fora de `ASSIGNABLE_MODULE_SLUGS`.

### 2.3 Brand Center

| Item | Status |
|------|--------|
| `/marketing/brand` | ✅ UI tabs (identidade, comunicação, público, produtos, concorrentes, restrições, direção visual, IA) |
| Redirect `/marketing/brand-guide` | ✅ `nuxt.config` routeRules 301 + página thin |
| Logos upload/save | ✅ `BrandLogoPicker` → `BrandAssetPicker` + merge POST |
| Direção visual + AI prefs | ✅ `metadata.visualDirection` / `metadata.aiPreferences` |
| Brand Context API | ✅ `GET /api/marketing/brand/context` |
| Ads consome Brand Context | ✅ `useAdsBrandContext` + `AdsBrandContextCard` |
| Migrations | ✅ nenhuma no epic (JSONB `social_brand_guides`) |

### 2.4 Agência / cliente

| Item | Status |
|------|--------|
| Workspace / `managedTenants` / switcher | ✅ inalterado; Brand/Ads usam tenant ativo |
| Portal cliente Marketing whitelist | ✅ calendar, campaigns, content, media, reports, settings, integrations |
| Brand blocklist no portal | ✅ `/marketing/brand` + `/marketing/brand-guide` |
| Ads whitelist portal | ✅ prefixo `/ads` + lista explícita (incl. creatives) |
| Troca de tenant | ✅ Brand Context e Ads overview reativos a `tenantId` |

### 2.5 Rotas antigas vs novas

| Legado | Destino | Status |
|--------|---------|--------|
| `/marketing/brand-guide` | `/marketing/brand` | ✅ |
| `/marketing/posts/**` | `/marketing/content/**` | ✅ |
| `/marketing/library` | `/marketing/media` | ✅ |
| `/marketing/integrations` | `/settings/integrations` | ✅ |
| `/marketing/performance` | `/marketing/reports` | ✅ |
| `/ads/integrations` | `/settings/integrations` | ✅ |
| `/marketing/reports` | (mantido, sem cutover) | ✅ convivência |

Avançados fora do menu (ainda por URL): packages, ops-metrics, automations, logs, notifications, production/tasks.

### 2.6 TypeScript / lint / testes

| Check | Resultado |
|-------|-----------|
| Vitest epic (ver §5) | ✅ 39/39 |
| ESLint focado (arquivos do epic) | ⚠️ poucos erros de style em arquivos já commitados (ex.: sort-imports em `brand-guide` / `brand-context`); **corrigidos** imports/unocss em arquivos ETAPA 7 |
| `pnpm typecheck` global | ❌ FAIL pré-existente (~148 erros no monólito — ETAPA 0); **não zerado** |
| `pnpm lint` global | ❌ FAIL pré-existente (milhares de problems); **não zerado** |

### 2.7 Menu / mobile

| Item | Status |
|------|--------|
| Sidebar flatten de grupos | ✅ só `Planejamento` aninha; demais folhas |
| Marketing + Ads como produtos irmãos | ✅ |
| Labels PT-BR | ✅ (cliente: Conteúdos → “Publicações”) |
| Links órfãos no menu | ✅ nenhum apontando para rota inexistente |

### 2.8 Regressões óbvias

Nenhuma regressão crítica encontrada (menu pointer, redirect faltando, Ads listando editorial, etc.).

**Correção mínima aplicada nesta etapa:** auto-fix ESLint em artefatos ETAPA 7 (`pages/ads/creatives.vue`, `tests/ads-brand.test.ts`, `components/ads/AdsBrandContextCard.vue`) — sort-imports / trailing comma / unocss order.

---

## 3. Arquitetura final

```
                    ┌─────────────────────────────────────────┐
                    │         Workspace (tenant ativo)         │
                    │   agency switcher / managedTenants / can │
                    └──────────────────┬──────────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          ▼                            ▼                            ▼
   ┌──────────────┐           ┌──────────────┐            ┌──────────────────┐
   │  MARKETING   │           │     ADS      │            │ SETTINGS         │
   │  orgânico    │           │  mídia paga  │            │ /settings/       │
   │              │           │              │            │   integrations   │
   │ /marketing/* │           │ /ads/*       │◄──301──────┤ (OAuth único)    │
   └──────┬───────┘           └──────┬───────┘            └──────────────────┘
          │                          │
          │ social_campaigns         │ live Meta/Google/GA
          │ social_posts             │ + marketing_campaign_cache
          │ media_assets             │ (+ schema legado marketing_campaigns)
          │                          │
          │                          │ lê (não escreve marca)
          ▼                          ▼
   ┌──────────────────────────────────────────┐
   │           BRAND CENTER                   │
   │  /marketing/brand  (social_brand_guides) │
   │  GET/POST .../social/brand-guide         │
   │  GET /api/marketing/brand/context        │
   │       → BrandContext                     │
   │       → useAdsBrandContext (Ads UI)      │
   └──────────────────────────────────────────┘
                    │
                    ▼  (futuro — fora deste epic)
            Prompt Builder / Blimber AI
            (copy + imagem + variações)
```

### Fronteira de campanhas (inalterável sem produto)

```
social_campaigns     → editorial  → /marketing/campaigns
marketing_campaigns  → paid legado / live APIs → /ads/campaigns + reports
```

---

## 4. Estado git (no momento da revisão)

**Branch:** `master` @ `3979e0d` (`feat: Brand Context e GPT Meta com busca de tenant`)

**Já commitado (amostra epic):** ETAPAs 1–6 artefatos principais (Ads shell/boards, menu Marketing, Brand Center, Visual Direction, Brand Context) + GPT Meta `searchTenants` / docs.

**Working tree sujo — ETAPA 7 + extras (NÃO pushado nesta revisão):**

| Path | Nota |
|------|------|
| `components/ads/`, `composables/ads/`, `pages/ads/creatives.vue`, `types/ads-brand.ts`, `utils/ads-brand.ts`, `tests/ads-brand.test.ts` | ETAPA 7 |
| `docs/.../ETAPA-7-ADS-BRAND.md` (+ este ETAPA-8) | docs |
| `constants/{menus,marketing-audience,ads-domain}.ts`, páginas `/ads/*`, `tests/workspace-guard.test.ts` | ETAPA 7 wiring |
| `gpt/blimber/openapi-ads.yaml` | contrato Ads canônico (pack standalone removido) |
| `.env.example` | mudanças de exemplo (paralelas; não secret) |

**Política:** commit/push **não** executados nesta etapa (conforme escopo — só revisão). OpenAPI note: descriptions GPT encurtadas prontas para commit quando o usuário pedir.

---

## 5. Testes executados

```bash
pnpm exec vitest run \
  tests/brand-guide.test.ts \
  tests/brand-context.test.ts \
  tests/ads-brand.test.ts \
  tests/workspace-guard.test.ts \
  tests/tenant-modules.test.ts \
  tests/gpt-meta-openapi.test.ts
```

**Resultado:** 6 files / **39 tests passed**.

---

## 6. Gaps residuais / recomendações

| # | Gap | Prioridade | Recomendação |
|---|-----|------------|--------------|
| 1 | ETAPA 7 ainda **uncommitted** no working tree | Alta (processo) | Commit dedicado “Ads Brand Context bridge” quando aprovado |
| 2 | OpenAPI descriptions GPT uncommitted | Média | Incluir no mesmo ou próximo commit GPT; atualizar Actions no ChatGPT se produção usa esse YAML |
| 3 | Convivência `/marketing/reports` × `/ads/reports` (duplicidade UX) | Média (produto) | Definir cutover: redirect Marketing→Ads **ou** reports orgânico-only em Marketing |
| 4 | `Criativos` no menu Ads **sem** `audience: 'agency'` (Marca é agency) | Baixa | Alinhar: agency-only **ou** manter portal se clientes com `brand_guide.read` devem ver o placeholder |
| 5 | Types gerados (`database.types.ts`) sem `social_brand_guides` / `social_campaigns` | Média (DX) | Regenerar types Supabase |
| 6 | Typecheck/lint global vermelhos | Baixa (epic) | Não bloquear; tratar em debt separado |
| 7 | ACL própria `ads.*` / billing row `tenant_modules.ads` | Baixa | Quando Ads sair de companion Marketing |
| 8 | Geração de criativos / Prompt Builder | Futuro | Consome `BrandContext` + `AdsCreativeGenerationInput` já tipados |
| 9 | Tabelas paid persistidas pouco usadas no hot-path | Info | Documentado desde ETAPA 0; live APIs + cache predominam |
| 10 | Style lint residual em `utils/brand-guide.ts` / testes brand-* | Baixa | `eslint --fix` pontual se hygiene for desejada |

---

## 7. O que o epic NÃO fez (confirmado)

- Sem geração de imagens / copy / chamada a modelos  
- Sem migrations / novas tabelas `brand_center` / `ads_*`  
- Sem cutover removendo `/marketing/reports`  
- Sem misturar `social_campaigns` em listagens Ads  
- Sem zerar typecheck/lint do monorepo  

---

## 8. Artefatos do epic (índice)

| Etapa | Doc |
|-------|-----|
| 0 Baseline | `ETAPA-0-BASELINE.md` |
| 1 Produtos | `ETAPA-1-PRODUTOS.md` |
| 2 Ads | `ETAPA-2-ADS.md` |
| 3 Menu Marketing | `ETAPA-3-MARKETING-MENU.md` |
| 4 Brand Center | `ETAPA-4-BRAND-CENTER.md` |
| 5 Direção Visual | `ETAPA-5-VISUAL-DIRECTION.md` |
| 6 Brand Context | `ETAPA-6-BRAND-CONTEXT.md` |
| 7 Ads + Brand | `ETAPA-7-ADS-BRAND.md` |
| 8 Revisão | **este arquivo** |

---

## 9. Veredito

**PASS COM RESSALVAS** — arquitetura e superfícies do epic estão coerentes, testadas no escopo e sem regressões claras; ressalvas = working tree ETAPA 7 + OpenAPI uncommitted, debt de typecheck/lint global, e decisões de produto futuras (cutover reports, audience Criativos, geração AI).
