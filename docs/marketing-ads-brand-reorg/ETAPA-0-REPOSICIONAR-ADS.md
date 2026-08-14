# ETAPA 0 — Baseline para reposicionar Ads dentro de Marketing

**Data:** 2026-08-14  
**Escopo:** somente mapeamento do estado real. **Nenhum código de runtime alterado.**  
**Princípio do epic:** REPOSICIONAR, NÃO RECONSTRUIR. Sem migrations. Sem páginas novas nesta etapa. Sem mudanças de menu (Etapa 1).

Documento irmão (histórico da separação Ads como produto): `ETAPA-0-BASELINE.md` (2026-08-11). Este arquivo descreve o **estado atual após** aquele epic, como ponto de partida para **trazer Ads de volta para dentro do produto Marketing**.

---

## A. Inventário — páginas, componentes e composables Ads

### A.1 `pages/ads/` (8 arquivos)

**Não existe** `pages/ads/settings.vue`. O item de menu mais próximo de “configurações” de Ads é **Integrações** (`/ads/integrations`).

| Arquivo | Rota Nuxt | O que renderiza de fato |
|---------|-----------|-------------------------|
| `index.vue` | `/ads` | Home paid: KPIs 7d via `GET /api/marketing/overview`, atalhos Meta/Google/Analytics, `AdsBrandContextCard` |
| `meta.vue` | `/ads/meta` | `MarketingReportsPanel` com `locked-source="meta"` |
| `google.vue` | `/ads/google` | Idem, `locked-source="google_ads"` |
| `analytics.vue` | `/ads/analytics` | Idem, `locked-source="google_analytics"` |
| `campaigns.vue` | `/ads/campaigns` | Lista **paga** (Meta + Google) via overview API; **não** lê `social_campaigns` |
| `creatives.vue` | `/ads/creatives` | Placeholder de arquitetura (pipeline IA futura); sem gerar copy/imagem |
| `reports.vue` | `/ads/reports` | `MarketingReportsPanel` completo (três fontes) |
| `integrations.vue` | `/ads/integrations` | Thin **301** → `/settings/integrations` |

Todas usam `definePageMeta({ middleware: ['auth'] })`. Nenhuma define `layout` — usam `layouts/default.vue` (sidebar + header).

`nuxt.config.ts`: `/ads` e `/ads/**` com SSR + `Cache-Control: private, no-store`.

### A.2 Componentes Ads

| Caminho | Papel |
|---------|--------|
| `components/ads/AdsBrandContextCard.vue` | Peek de Brand Context do tenant ativo + links Brand Center / Criativos |

Boards paid **não** estão em `components/ads/` — reuso em Marketing:

- `components/marketing/MarketingReportsPanel.vue`
- `components/marketing/MetaAdsBoard.vue`
- `components/marketing/GoogleAdsBoard.vue`
- `components/marketing/AnalyticsBoard.vue` (implícito no panel)
- `components/marketing/ReportKpiCard.vue`, `ReportInsightTable.vue`, etc.

Comentário em `MarketingReportsPanel` ainda cita uso por `/marketing/reports` **e** `/ads/*`. No código atual, `/marketing/reports` usa **`MarketingOrganicReportsPanel`**, não o panel paid.

### A.3 Composables / domínio Ads

| Caminho | Papel |
|---------|--------|
| `composables/ads/useAdsBrandContext.ts` | Wrapper de `useBrandContext()` (Marketing) + summary `toAdsBrandContextSummary` |
| `constants/ads-domain.ts` | Fronteira editorial vs paid + rotas Brand Center / criativos |
| `types/ads-brand.ts` | Contratos de summary / pipeline futura |
| `utils/ads-brand.ts` | `ADS_BRAND_CENTER_PATH` (= `/marketing/brand`), fatores do checklist |

Não há pasta `composables/ads/` além de `useAdsBrandContext.ts`. Fetch paid usa `useMarketingFetch` + `/api/marketing/overview`.

### A.4 Testes e APIs relacionadas (não são UI Hub)

- `tests/ads-brand.test.ts`, `tests/workspace-guard.test.ts`, `tests/tenant-modules.test.ts`
- GPT/MCP: `https://ads.blimber.com.br` + `/api/gpt/meta/*` / `/api/gpt/ads/*` — **host/API de Actions**, independente da árvore de páginas `/ads` do Hub

---

## B. Menu, seletor de produto e módulos

### B.1 Menu (`constants/menus.ts`)

**Ads é um produto de primeiro nível**, irmão de Marketing / CRM / WhatsApp — **não** aparece como filho do menu Marketing.

```
Marketing                          Ads
├── Visão Geral → /marketing       ├── Visão Geral → /ads
├── Planejamento                   ├── Meta Ads → /ads/meta
│   ├── Calendário                 ├── Google Ads → /ads/google
│   ├── Campanhas (editorial)      ├── Analytics → /ads/analytics
│   └── Briefings (agency)         ├── Campanhas (paga) → /ads/campaigns
├── Conteúdos                      ├── Criativos → /ads/creatives
├── Produção (agency)              ├── Relatórios → /ads/reports
├── Aprovações (agency)            └── Integrações → /ads/integrations (301)
├── Biblioteca
├── Marca → /marketing/brand (agency)
├── Publicações (agency queue)
├── Relatórios (orgânico + banner para /ads/reports)
└── Configurações → /marketing/settings
```

Sidebar (`AppSidebar`): filtra `navMenu` pelo **título do módulo ativo** (`currentModuleMeta.title`). Com módulo Ads selecionado, só a seção “Ads”; com Marketing, só “Marketing”. Grupos aninhados flattenam (Planejamento vira folhas).

Teste `tests/workspace-guard.test.ts` **afirma** que nenhuma folha de Marketing aponta para `/ads/*`.

### B.2 Módulos (`constants/modules.ts`)

| Constante | Comportamento atual |
|-----------|---------------------|
| `MODULE_META.ads` | `basePath` / `defaultPath` = `/ads`, ícone `lucide:circle-dollar-sign` |
| `ASSIGNABLE_MODULE_SLUGS` | **omite** `ads` — admin não liga Ads sozinho em `tenant_modules` |
| `resolveTenantModuleSlugs` | Marketing (ou bundle `all`) **injeta companion** `ads` imediatamente após `marketing` |

Seletor (`components/tenant/ModuleDropdown.vue`): ao escolher Ads, `navigateTo('/ads')`. Tenant com Marketing vê **dois** tiles: Marketing e Ads.

`useModule.fetchTenantModules` chama `expandTenantModuleRows` para o switcher coincidir com o companion.

**Servidor:** `WorkspaceModule` em `server/utils/workspace-context.ts` é `'crm' \| 'article' \| 'marketing' \| 'whatsapp'` — **sem** `'ads'`. Gate de API é `/api/marketing` → módulo `marketing`. Ads UI não tem middleware de módulo próprio.

### B.3 Feature flags

Não há feature flag de produto Ads. Liberação = `tenant_modules` Marketing (ou `all`) + capabilities `marketing.social.*`.

---

## C. Rotas `/ads` — URLs esperadas e o que renderizam

Smoke de browser **não** foi executado (sem dependência de servidor nesta etapa). Rotas abaixo existem como arquivos em `pages/ads/` (file-based routing Nuxt 3). Auth obrigatório.

| URL | Página | Conteúdo |
|-----|--------|----------|
| `/ads` | `index.vue` | Overview paid + Brand Context |
| `/ads/meta` | `meta.vue` | Board Meta |
| `/ads/google` | `google.vue` | Board Google Ads |
| `/ads/analytics` | `analytics.vue` | Board Analytics |
| `/ads/campaigns` | `campaigns.vue` | Tabela campanhas pagas |
| `/ads/creatives` | `creatives.vue` | Placeholder criativos |
| `/ads/reports` | `reports.vue` | Relatórios paid + analytics |
| `/ads/integrations` | `integrations.vue` | 301 → `/settings/integrations` |
| `/ads/settings` | **inexistente** | 404 esperado |

Referências de navegação Hub para `/ads` (além do menu): `pages/ads/index.vue`, `pages/ads/creatives.vue`, `components/ads/AdsBrandContextCard.vue`, `pages/marketing/reports.vue` (CTA “Ver relatórios de Ads”).

---

## D. O que “settings” de Ads é (e não é)

- **Não há** `/ads/settings`.
- **`/ads/integrations`:** redirect 301 para o painel global de OAuth (`/settings/integrations`) — mesmo destino que Marketing → Configurações → Contas sociais e `pages/marketing/integrations.vue`.
- **`/marketing/settings`:** hub de links (Contas sociais + Marca para agência). Não é settings de Ads.

Integrações paid (Meta Ads, Google Ads, GA) já vivem no mesmo painel de settings global; não duplicar painel ao reposicionar.

---

## E. Brand — caminho atual

| Superfície | Caminho |
|------------|---------|
| Brand Center (UI) | **`pages/marketing/brand.vue` existe** — `BrandCenterPanel` + `useBrandGuide` |
| Bookmark legado | `/marketing/brand-guide` → 301 `/marketing/brand` (`nuxt.config` + página thin) |
| API Brand Context | `GET /api/marketing/brand/context` via `composables/marketing/useBrandContext.ts` |
| Ads consome | `useAdsBrandContext` → summary no card; constante `ADS_BRAND_CENTER_ROUTE = '/marketing/brand'` |
| Portal cliente | `/marketing/brand` e `/marketing/brand-guide` na **blocklist** (`marketing-audience.ts`) |
| Menu Marca | `audience: 'agency'` + `marketing.social.brand_guide.read` |

Criativos Ads só **leem** Brand Context; dono da escrita é Marketing Brand Center.

---

## F. Permissões, audience, layouts, middleware

### Capabilities (prefixo Marketing — Ads não tem cap próprio)

Definidas em `constants/workspace.ts` / `constants/organization-role-matrix.ts`.

| Item Ads | Capability no menu |
|----------|-------------------|
| Visão Geral, Meta, Google, Analytics, Campanhas, Relatórios | `marketing.social.reports` |
| Criativos | `marketing.social.brand_guide.read` |
| Integrações | `marketing.social.integrations` |

Páginas Ads **não** rechecam capability no `definePageMeta` (só `auth`). A home checa `canReports` para fetch; boards dependem do panel interno.

### Portal cliente

`CLIENT_PORTAL_ADS_LINKS`: `/ads`, meta, google, analytics, campaigns, creatives, reports, integrations. `isClientPortalAdsLink` trata prefixo `/ads` para qualquer `/ads/*`.

Marketing whitelist **não** inclui brand, production, approvals, etc.

### Middleware / layouts

| Camada | Ads |
|--------|-----|
| `middleware/auth.ts` | Sim (todas as páginas ads) |
| Middleware de módulo na página | Não |
| `server/middleware/module-access.ts` | Só prefixos `/api/crm\|articles\|marketing\|whatsapp` |
| Layout | `default` |

---

## G. Marketing hoje vs árvore desejada (reposicionamento)

### G.1 Páginas `pages/marketing/` (24 arquivos)

Visíveis no menu: index, calendar, campaigns, briefings, content, production, approvals, media, brand, publishing, reports, settings.

Por URL, fora do menu principal: packages, automations, ops-metrics, logs, notifications, production/tasks, content/[id], campaigns/[id].

Redirects: `integrations.vue` → settings/integrations; `performance.vue` → `/marketing/reports`; `brand-guide.vue` → `/marketing/brand`.

### G.2 Relatórios: orgânico vs pago (já separados na UI)

| Rota | Painel |
|------|--------|
| `/marketing/reports` | Orgânico (`MarketingOrganicReportsPanel`) + banner linkando `/ads/reports` |
| `/ads/reports` (+ meta/google/analytics) | Pago / analytics (`MarketingReportsPanel`) |

Campanhas:

| Rota | Fonte |
|------|--------|
| `/marketing/campaigns` | Editorial `social_campaigns` |
| `/ads/campaigns` | Live Meta/Google (`marketing_campaigns` / cache / APIs) |

### G.3 Alvo declarado do próximo epic (não implementado aqui)

Reposicionar Ads **dentro** de Marketing (mesmo produto/shell), preservando páginas e boards. Árvore desejada (intenção, Etapas 1+): calendário, campanhas (cuidado com homônimos editorial vs paid), marca, relatórios orgânico vs pago — **sem** Ads como tile irmão no seletor.

---

## H. Typecheck / lint

Executado em 2026-08-14 no repo.

| Check | Resultado |
|-------|-----------|
| `pnpm typecheck` (`vue-tsc --noEmit`) | **FAIL** — **228** erros `error TS` |
| Erros em `pages/ads/**`, `composables/ads/**`, `constants/ads-domain.ts` | **Nenhum** |
| Erros adjacentes Marketing | `BrandCenterPanel.vue`, `MarketingOrganicReportsPanel.vue`, content/schedule (pré-existentes) |
| `pnpm lint` (`eslint .`) | **FAIL** — **7360** problems (0 warnings); maioria style `--fix` |
| ESLint focado `pages/ads`, `components/ads`, `composables/ads`, `ads-domain`, `menus.ts`, `modules.ts`, `marketing-audience.ts` | **PASS** (exit 0) |

Não bloquear o epic de reposicionamento em zerar o monólito. Não “consertar” lint/typecheck global nesta etapa 0.

---

## I. Riscos para Etapas 1–8

1. **Seletor de produto:** companion `ads` + testes `tenant-modules.test.ts` (`['marketing', 'ads']`). Remover o tile Ads quebra o switcher e esses testes de propósito.
2. **Menu / workspace-guard:** teste atual **proíbe** `/ads` sob Marketing. Etapa 1 inverterá essa asserção se os links paid forem filhos de Marketing.
3. **Homônimos:** duas “Campanhas” e dois “Relatórios”. Sem labels (Orgânico / Pago) o flatten da sidebar fica ambíguo.
4. **Bookmarks `/ads/*`:** páginas reais; reposicionar menu sem redirects 301 quebra atalhos e o CTA em `/marketing/reports`.
5. **Não reconstruir boards:** Meta/Google/Analytics já são wrappers finos. Mover arquivos de `pages/ads` para `pages/marketing/...` é opcional depois; o risco é duplicar `MarketingReportsPanel`.
6. **Capabilities:** tudo é `marketing.social.*`. Não inventar `ads.*` sem decisão explícita.
7. **Portal cliente:** whitelist Ads separada da Marketing; unificar produto exige decidir se clientes continuam vendo Meta/Google/Criativos.
8. **Brand agency-only** vs **Criativos Ads no portal:** criativos usam `brand_guide.read` e estão na whitelist Ads; Brand Center está bloqueado para cliente.
9. **APIs:** continuar em `/api/marketing/*`. `WorkspaceModule` não tem `ads`.
10. **GPT `ads.blimber.com.br`:** não misturar com rotas de UI; não migrar OpenAPI neste epic de menu.
11. **Docs antigas** (`ETAPA-1-PRODUTOS.md` … `ETAPA-8`) descrevem Ads como produto irmão — atualizar só quando as etapas novas existirem, para não reescrever história.
12. **Sem migrations** — fronteira `social_campaigns` vs `marketing_campaigns` permanece.

---

## Referência rápida — o que NÃO fazer nesta etapa

- Não alterar `constants/menus.ts`
- Não criar páginas novas
- Não migrations
- Não mudar `ASSIGNABLE_MODULE_SLUGS` / companion
- Não redirects novos

---

**ETAPA 0 CONCLUÍDA. PARAR. Não iniciar Etapa 1.**

---

**Follow-up (2026-08-14):** Etapa 1 de navegação está em `ETAPA-1-NAV.md` (submenu Ads em Marketing, URLs `/ads*` inalteradas). O item 2 da seção I foi resolvido no teste `workspace-guard`.
