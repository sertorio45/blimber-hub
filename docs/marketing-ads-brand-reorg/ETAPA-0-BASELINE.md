# ETAPA 0 — Baseline do módulo Marketing

**Data:** 2026-08-11  
**Escopo:** somente mapeamento e testes de qualidade (typecheck/lint).  
**Produto:** nenhum código de runtime alterado nesta etapa.

---

## 1. Resumo executivo

O módulo **Marketing** hoje concentra três domínios no mesmo shell `/marketing`:

| Domínio | Natureza | Superfície principal |
|--------|----------|----------------------|
| **Orgânico / editorial (MVP social)** | posts, calendário, produção, aprovações, publicação, briefings, biblioteca, brand guide | páginas + `/api/marketing/social/*` |
| **Paid ads / reports** | Meta Ads, Google Ads, Google Analytics (lives APIs + cache) | `/marketing/reports` + `/api/marketing/overview` |
| **Integrações OAuth** | Meta, LinkedIn, Google Ads, Google Analytics | `/settings/integrations` (+ rotas legacy `/marketing/integrations`) |

**Diferença crítica (já documentada em migration, não alterar ainda):**

- `social_campaigns` → campanhas **editoriais / orgânicas** (usada por `/marketing/campaigns`)
- `marketing_campaigns` → campanhas **pagas Meta Ads** (schema legado; reports atuais preferem APIs live + `marketing_campaign_cache`)

Não existe produto `/ads` separado. Relatórios paid já vivem **dentro** de Marketing (`/marketing/reports`). Brand guide vive em `/marketing/brand-guide` (agency-only no menu).

---

## 2. Inventário de menu atual (Marketing)

Fonte: `constants/menus.ts` (árvore MVP IA). Itens avançados permanecem acessíveis por URL, mas fora do menu principal.

### 2.1 Árvore visível

```
Marketing
├── Visão geral                          → /marketing
├── Planejamento
│   ├── Calendário                       → /marketing/calendar
│   ├── Campanhas                        → /marketing/campaigns
│   └── Briefings (audience: agency)     → /marketing/briefings
├── Conteúdo
│   ├── Conteúdos / Publicações (client) → /marketing/content
│   ├── Produção (agency)                → /marketing/production
│   └── Aprovações (agency)              → /marketing/approvals
├── Operação
│   ├── Biblioteca                       → /marketing/media
│   └── Publicações (agency queue)       → /marketing/publishing
├── Resultados
│   └── Relatórios                       → /marketing/reports
└── Configurações
    ├── Contas sociais                   → /settings/integrations
    └── Marca (agency)                   → /marketing/brand-guide
```

### 2.2 Audiência cliente vs agência

Fonte: `constants/marketing-audience.ts` + `composables/marketing/useMarketingAudience.ts`.

**Portal cliente (whitelist):**  
`/marketing`, `/marketing/calendar`, `/marketing/campaigns`, `/marketing/content`, `/marketing/media`, `/marketing/reports`, `/marketing/settings`, `/settings/integrations` (+ legados `/marketing/posts`, `/marketing/library`).

**Bloqueados no portal cliente:**  
produção, tasks, approvals, briefings, brand-guide, publishing, packages, ops-metrics, automations, logs, notifications.

**Menu `audience: 'agency'`:** Briefings, Produção, Aprovações, Publicações (queue), Marca.

### 2.3 Capabilidades relevantes (amostra)

Definidas em `constants/workspace.ts` / `constants/organization-role-matrix.ts`, prefixo `marketing.social.*` (read/create/update/schedule/publish/approvals/campaigns/briefing/library/brand_guide/reports/integrations/…).

---

## 3. Rotas obrigatórias — existência e implementação

| Rota alvo | Página Nuxt | Status | Observações |
|-----------|-------------|--------|-------------|
| `/marketing` | `pages/marketing/index.vue` | ✅ implementada | Overview MVP (`/api/marketing/mvp/overview`); diferencia client vs agency |
| `/marketing/calendar` | `pages/marketing/calendar.vue` | ✅ | API `GET /api/marketing/social/calendar` |
| `/marketing/campaigns` | `pages/marketing/campaigns/index.vue` + `[id].vue` | ✅ | **Editorial** → `social_campaigns` |
| `/marketing/briefings` | `pages/marketing/briefings.vue` | ✅ | Agency; magic links |
| `/marketing/content` | `pages/marketing/content/index.vue`, `new.vue`, `[id].vue` | ✅ | Core editorial board/editor |
| `/marketing/production` | `pages/marketing/production/index.vue` (+ `tasks.vue`) | ✅ | Kanban agency-only |
| `/marketing/approvals` | `pages/marketing/approvals.vue` | ✅ | Agency-only |
| `/marketing/media` | `pages/marketing/media.vue` | ✅ | Biblioteca `media_assets` |
| `/marketing/brand-guide` | `pages/marketing/brand-guide.vue` | ✅ | `social_brand_guides` |
| `/marketing/publishing` | `pages/marketing/publishing.vue` | ✅ | Fila agency (agendado/publicado/erro) |
| `/marketing/reports` | `pages/marketing/reports.vue` | ✅ | **Ads/Analytics already-in-marketing** |

### 3.1 Rotas auxiliares / legado (fora da lista alvo, mas relevantes)

| Rota | Status |
|------|--------|
| `/marketing/settings` | Hub de links (integrações + marca) |
| `/marketing/integrations` | Redirect 301 → `/settings/integrations` |
| `/marketing/performance` | Redirect 301 → `/marketing/reports` |
| `/marketing/posts/**` | Redirect 301 → `/marketing/content/**` (`nuxt.config.ts` routeRules) |
| `/marketing/library` | Redirect 301 → `/marketing/media` |
| `/marketing/packages`, `/ops-metrics`, `/automations`, `/logs`, `/notifications` | Páginas existem; ocultas do menu MVP |
| `/settings/integrations` | UI oficial de OAuth/social |
| `/settings/integrations/meta-capi` | CRM × Meta (reusa `marketing_integrations`) |

---

## 4. Mapa por área

### 4.1 Visão geral (`/marketing`)

- **Página:** `pages/marketing/index.vue`
- **API:** `GET /api/marketing/mvp/overview`
- **Composables:** `useMarketingFetch`, `useMarketingAudience`, `useWorkspace`, `useTenant`
- **Tabelas / views:** overview editorial via domínio social (`social_posts` / view `marketing_mvp_contents` documentada em migration); contagens MVP status
- **Dependências:** audience client/agency muda cards e deep-links (client → content; agency → approvals/production/publishing)

### 4.2 Calendário (`/marketing/calendar`)

- **Página:** `pages/marketing/calendar.vue`
- **API:** `GET /api/marketing/social/calendar`
- **Tabelas:** `social_posts` + assets (`media_assets` via join)
- **Notas typecheck:** 3 erros TS em `calendar.get.ts` (propriedades tipadas como `{}`)

### 4.3 Campanhas editoriais (`/marketing/campaigns`)

- **Páginas:** `campaigns/index.vue`, `campaigns/[id].vue`
- **APIs:** `/api/marketing/social/campaigns` (GET/POST), `/[id]` (GET/PUT)
- **Tabela:** `social_campaigns` (NÃO `marketing_campaigns`)
- **Colunas principais (migration):** `id`, `tenant_id`, `organization_id`, `name`, `objective`, `status`, `starts_at`, `ends_at`, `owner_id`, `briefing_summary`, `metadata`, `created_by`, timestamps
- **FK:** `social_posts.campaign_id` → `social_campaigns`

### 4.4 Briefings (`/marketing/briefings`)

- **Página:** `briefings.vue`
- **APIs:** `/api/marketing/social/briefings`, `/briefings/link`
- **Tabelas:** `social_briefings`, `social_briefing_templates`, `social_briefing_links`, …
- **Audience:** agency

### 4.5 Conteúdo (`/marketing/content`)

- **Páginas:** `content/index.vue`, `new.vue`, `[id].vue`
- **Componentes:** `content/ContentEditor`, `ContentCard`, `ProductionMetaFields`, `ScheduleSlotsEditor`, `social/SocialPostForm`, `SocialContentBoard`, …
- **APIs:** `/api/marketing/social/posts/**` (CRUD, schedule, submit, bypass, comments, duplicate, share-stories, …)
- **Tabelas:** `social_posts`, `social_post_variants`, `social_post_assets`, `content_versions`, `media_assets`

### 4.6 Produção (`/marketing/production`)

- **Páginas:** `production/index.vue`, `production/tasks.vue`
- **Componentes:** `social/ProductionKanbanBoard`
- **APIs:** `/social/production/board`, `move`, `meta`, `tasks`
- **Tabelas:** `social_production_tasks`, movements/events
- **Audience:** agency (redirect client → content)

### 4.7 Aprovações (`/marketing/approvals`)

- **Página:** `approvals.vue`
- **Componentes:** `ApprovalReviewSheet`, `ApprovalMediaPreview`, `ApprovalVersionCompare`
- **APIs:** `/social/approvals/**`, review-links, workflows, approvers
- **Tabelas:** `approval_requests`, decisions, `social_review_links`, `social_comments`, …
- **Notas typecheck:** 4 erros TS em `pages/marketing/approvals.vue`

### 4.8 Mídia / biblioteca (`/marketing/media`)

- **Página:** `media.vue`
- **APIs:** `/social/assets`, `/social/library/meta`
- **Tabela:** `media_assets` (+ folders/tags em migrations posteriores)
- **Row (types gerados — desatualizado vs migrations de pasta/categoria):**  
  `id`, `tenant_id`, `name`, `bucket`, `object_path`, `mime_type`, `size_bytes`, `width`, `height`, `duration_seconds`, `checksum`, `status`, `purpose`, `metadata`, `created_by`, timestamps  
  Migrations adicionais: `purpose`, folders (`folder_id`), `category`, `lifecycle`, vínculo opcional a `social_campaigns`

### 4.9 Brand guide (`/marketing/brand-guide`)

- **Página:** `brand-guide.vue` (form parcial: tom, público, palavras, CTAs, hashtags, restrições, notas legais)
- **APIs:** `GET/POST /api/marketing/social/brand-guide`
- **Tabela:** `social_brand_guides` (1:1 por `tenant_id`)

#### Schema `social_brand_guides` (migration `20260727082850_…`)

| Coluna | Tipo | Default |
|--------|------|---------|
| `id` | uuid PK | `gen_random_uuid()` |
| `tenant_id` | uuid UNIQUE FK tenant | — |
| `tone_of_voice` | text | `''` |
| `audience` | text | `''` |
| `allowed_words` | text[] | `{}` |
| `forbidden_words` | text[] | `{}` |
| `ctas` | text[] | `{}` |
| `hashtags` | text[] | `{}` |
| `colors` | jsonb | `[]` |
| `fonts` | jsonb | `[]` |
| `products` | jsonb | `[]` |
| `competitors` | jsonb | `[]` |
| `restrictions` | text | `''` |
| `legal_notes` | text | `''` |
| `logo_asset_ids` | uuid[] | `{}` |
| `metadata` | jsonb | `{}` |
| `updated_by` | uuid? | — |
| `created_at` / `updated_at` | timestamptz | now() |

**API POST aceita** também `colors`, `fonts`, `products`, `competitors`, `logoAssetIds` — UI atual não expõe todos esses campos.

**Gap de tipagem:** `social_brand_guides` **não aparece** em `types/database.types.ts` / `types/supabase/database.types.ts` (types gerados desatualizados em relação às migrations). Chamadas usam `.from('social_brand_guides')` sem tipagem forte da tabela.

### 4.10 Publicações / fila (`/marketing/publishing`)

- **Página:** `publishing.vue`
- **API:** lista posts via composable `useMarketingSocial().listPosts`
- **Tabelas:** `social_posts`, `publication_jobs`, `publication_attempts`
- **Audience:** agency-only no menu; cliente usa “Publicações” = `/marketing/content`

### 4.11 Relatórios / Ads already-in-marketing (`/marketing/reports`)

- **Página:** `reports.vue`
- **Componentes paid:** `MetaAdsBoard`, `GoogleAdsBoard`, `AnalyticsBoard`, `MarketingReportTemplatePicker/Sidebar`, `ReportKpiCard`, `ReportTrendChart`, `ReportInsightTable`, `ReportDeltaBadge`, …
- **Constantes:** `constants/marketing-report-templates.ts`
- **Tipos:** `types/marketing-reports.ts`, `types/marketing.ts`
- **Composable:** `useMarketingReportMetrics.ts`
- **API principal paid:** `GET /api/marketing/overview` (source=`meta` \| `google_ads` \| `google_analytics`, templates, date presets, cache)
- **Utilitários:** `server/utils/marketing.ts`, `server/utils/marketing-reports.ts`
- **Cache:** `marketing_campaign_cache` (provider + cache_key + payload + expires)
- **Integrações:** lê `marketing_integrations` (tokens Meta / Google Ads / Google Analytics)
- **Tabelas paid legadas presentes no schema, pouco/ninguém queryadas no path atual de reports:**  
  `marketing_campaigns`, `marketing_ads`, `marketing_campaign_metrics`, `marketing_report_logs`  
  (grep server: uso ativo de cache; integrations; overview via API externa)

---

## 5. Inventário de APIs (`server/api/marketing`)

**Total:** 71 arquivos de rota.

### Núcleo / paid / OAuth

| Rota | Função |
|------|--------|
| `overview.get.ts` | Relatórios paid (Meta/Google Ads/GA) |
| `mvp/overview.get.ts` | Dashboard editorial MVP |
| `integrations.get/post/delete.ts` | CRUD `marketing_integrations` |
| `oauth/[provider]/start.get.ts` | Início OAuth |
| `oauth/[provider]/callback.get.ts` | Callback (legacy path) |
| `oauth/accounts.get.ts` | Contas/recursos por provider |

Callback canônico adicional: `server/api/oauth/[provider]/callback.get.ts` (preferido para novos apps).

### Social (editorial)

Prefixo `/api/marketing/social/`: posts, calendar, campaigns, briefings, brand-guide, assets/library, production, approvals, schedules, accounts, workflows, packages/sla, automations, notifications, logs, ops-metrics, jobs, access, overview, review-links.

---

## 6. Composables

| Arquivo | Papel |
|---------|-------|
| `composables/marketing/useMarketingFetch.ts` | Fetch com cache/TTL/SWR (~45s) |
| `composables/marketing/useMarketingAudience.ts` | Client portal vs agency experience |
| `composables/marketing/useMarketingSocial.ts` | Facade HTTP do domínio social |
| `composables/marketing/useMarketingReportMetrics.ts` | Formatação/helpers de métricas de report |
| `composables/useWorkspace.ts` | `managedTenants`, `agencyPortfolioTenants`, `can()`, org type |
| `composables/useTenant.ts` | `tenantId` ativo no contexto |

---

## 7. Tabelas Supabase — mapa de domínio

### 7.1 Editorial / social (`social_*` + media + approval/publication)

| Tabela | Uso baseline |
|--------|--------------|
| `social_posts` (+ variants/assets) | Conteúdo MVP |
| `social_campaigns` | Campanhas editoriais (`/marketing/campaigns`) |
| `social_briefings*` | Briefings |
| `social_brand_guides` | Brand guide |
| `social_accounts` | Contas conectadas |
| `media_assets` (+ variants/folders/tags) | Biblioteca |
| `approval_*` / `content_versions` / `social_review_links` | Aprovações |
| `publication_jobs` / `publication_attempts` / `deletion_jobs` | Publicação |
| `social_production_*` | Kanban |
| `oauth_states` | CSRF OAuth |

Comentários de domínio: migration `20260806104006_marketing_mvp_domain_alignment.sql`.

### 7.2 Paid / integrations (`marketing_*`)

| Tabela | Uso baseline |
|--------|--------------|
| `marketing_integrations` | Tokens/config OAuth (Meta, LinkedIn, Google Ads, GA); compartilhado orgânico + paid + CRM Meta CAPI |
| `marketing_campaign_cache` | Cache de payloads de overview/reports |
| `marketing_campaigns` | Schema paid Meta Ads; **não é a mesma entidade de `/marketing/campaigns`** |
| `marketing_ads` | Criativos paid |
| `marketing_campaign_metrics` | Métricas paid persistidas |
| `marketing_report_logs` | Logs de geração de report |
| `marketing_ai_messages` | Legado IA tied to paid campaigns |

### 7.3 Diferença explícita a preservar na reorg

```
social_campaigns      = editorial / orgânico  → UI: /marketing/campaigns
marketing_campaigns   = paid Meta Ads         → (reports live / schema legado)
```

Renomes futuros sugeridos na migration:  
`marketing_editorial_campaigns` vs `marketing_paid_campaigns` — **não executar nesta etapa**.

---

## 8. OAuth / integrações

**Providers tipados:** `google_ads` | `google_analytics` | `meta` | `linkedin`  
(`server/utils/oauth-callback.ts`).

| Provider | Start route | Escopos / notas |
|----------|-------------|-----------------|
| Meta | `/api/marketing/oauth/meta/start` | Pages/IG publish + ad accounts; também CRM Meta CAPI |
| LinkedIn | `/api/marketing/oauth/linkedin/start` | Publicação orgânica |
| Google Ads | `/api/marketing/oauth/google_ads/start` | `adwords` scope |
| Google Analytics | `/api/marketing/oauth/google_analytics/start` | `analytics.readonly` |

Persistência: `marketing_integrations` (`provider`, `config` json com tokens criptografados, `is_active`, `tenant_id`).

UI: `/settings/integrations` (`SocialProvidersPanel`); redirect legacy `/marketing/integrations`.

---

## 9. Padrões agência / tenant

- **`useWorkspace`:** organização `agency` vs `direct`; `managedTenants`; `agencyPortfolioTenants`; switcher de cliente; `can(capability)`.
- **`useMarketingAudience`:** determina `isClientExperience` vs `isAgencyExperience` (não confiar só em aliases de capability).
- **`matchesNavAudience` / menu `audience`:** esconde itens operacionais da agência no portal.
- **Middleware páginas:** tipicamente `auth`.
- **SSR:** `/marketing/**` com `Cache-Control: private, no-store` em `nuxt.config.ts`.
- **Módulo:** `constants/modules.ts` → slug `marketing`, `basePath`/`defaultPath` `/marketing`.

---

## 10. Dependências Marketing ↔ Ads/reports ↔ brand-guide

```
                    ┌─────────────────────────────┐
                    │   marketing_integrations    │
                    │ Meta / LinkedIn / Ads / GA │
                    └─────────────┬───────────────┘
           ┌──────────────────────┼──────────────────────┐
           ▼                      ▼                      ▼
   Social publish          Reports paid             CRM Meta CAPI
   (publisher utils)   (/marketing/reports         (settings +
                        + overview API +              crm APIs)
                        campaign_cache)
           │
           ▼
   social_posts / accounts
           │
           ├── media_assets (biblioteca / assets do post)
           ├── social_campaigns (editorial UI)
           └── social_brand_guides (guia; agency)
```

Brand-guide **não** alimenta reports paid hoje; reports **não** leem `social_campaigns`.  
O ponto de acoplamento real entre “marketing social” e “ads” é principalmente **`marketing_integrations`** + shell/menu único.

---

## 11. Componentes Vue (`components/marketing`)

**Reports/Ads:** AnalyticsBoard, GoogleAdsBoard, MetaAdsBoard, Overview, report widgets, template picker/sidebar, GoogleAdsTestTokenNotice, IntegrationSoonCard, MiniSparkline, LineChartExample.

**Content:** ContentCard, ContentEditor, ProductionMetaFields, ScheduleSlotsEditor.

**Social/ops:** SocialContentBoard, SocialPostForm, SocialDateTimePicker, SocialViewToggle, ProductionKanbanBoard, Approval*, DeletePostDialog.

**Shell:** MarketingPageSkeleton, MarketingMvpStatusBadge.

---

## 12. Qualidade — comandos obrigatórios (registrados)

### `pnpm typecheck` → **FAIL** (exit 2)

- **~148 erros TS** no monólito (não exclusivo de Marketing).
- **Erros no domínio Marketing (amostra):**
  - `components/marketing/content/ProductionMetaFields.vue`
  - `components/marketing/content/ScheduleSlotsEditor.vue`
  - `pages/marketing/approvals.vue` (4)
  - `server/api/marketing/social/calendar.get.ts` (3)
  - `server/api/marketing/social/production/board.get.ts` (1)
  - `server/utils/social-automations.ts` (4)
- Demais erros em WhatsApp, CRM, workspace, articles, admin, etc.

**Ação ETAPA 0:** apenas documentado — sem correção.

### `pnpm lint` → **FAIL** (exit 1)

- **6382 problems** (5911 errors, 471 warnings); ~5651 auto-fixáveis.
- Muitos arquivos Marketing/listados (quotes, style, `ts/consistent-type-definitions`, etc.) — ruído preexistente amplo no repo.

**Ação ETAPA 0:** apenas documentado — sem correção.

---

## 13. Riscos / gaps observados (sem fix)

1. Colisão semântica de nome **campaigns** (editorial vs paid) — crítica para a reorg.
2. Types gerados (`database.types.ts`) **atrasados** em relação a tabelas `social_*` novas (ex.: `social_brand_guides`, `social_campaigns`).
3. UI brand-guide não cobre todo o schema (colors/fonts/products/competitors/logos).
4. Tabelas paid persistidas (`marketing_campaigns`/`ads`/`metrics`/`report_logs`) pouco usadas no hot-path atual (reports = API live + cache).
5. Typecheck/lint vermelhos preexistentes — não bloquear baseline, mas impedem “verde limpo” antes da ETAPA 1.
6. Menu aponta “Contas sociais” para `/settings/integrations`, fora do path `/marketing/*`.

---

## 14. O que NÃO foi feito (conforme escopo)

- Sem migrations
- Sem mover/apagar rotas
- Sem alterações de produto/runtime
- Sem iniciar ETAPA 1 (estrutura `/ads`, split de menu/shell)

---

## 15. Artefato desta etapa

- Este arquivo: `docs/marketing-ads-brand-reorg/ETAPA-0-BASELINE.md`

**PRÓXIMA ETAPA (não executar aqui):**  
ETAPA 1 — Estrutura de produtos (menu/shell `/ads`)
