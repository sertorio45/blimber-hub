# ETAPA 1 — Estrutura de produtos (Marketing + Ads)

**Data:** 2026-08-11  
**Escopo:** só estrutura comercial / navegação / shell `/ads`.  
**Não inclui:** migração de boards Meta/Google/Analytics, reorg do menu interno de Marketing, Brand Center.

---

## 1. Objetivo

Introduzir **Ads** como produto comercial irmão de **Marketing**, sem alterar o runtime paid atual:

```
Blimber
├── CRM / …
├── Marketing   (inalterado funcionalmente)
└── Ads         (shell + Visão Geral)
```

AI, Connect, Portal e Insights **não** viram produtos comerciais nesta etapa.

---

## 2. O que mudou

| Área | Mudança |
|------|---------|
| Metadados de módulo | `constants/modules.ts` → `MODULE_META.ads` (`basePath`/`defaultPath` `/ads`, ícone `lucide:circle-dollar-sign`) |
| Companion unlock | Marketing (`tenant_modules`) também resolve **Ads** via `resolveTenantModuleSlugs` / `expandTenantModuleRows` |
| Assignable catalog | Ads **não** entra no picker admin (`ASSIGNABLE_MODULE_SLUGS`) — evita cobilling/DB até decisão própria |
| Menu | `constants/menus.ts` → seção **Ads** com **Visão Geral** → `/ads` |
| Página shell | `pages/ads/index.vue` — overview “em construção” + atalho temporário a `/marketing/reports` |
| SSR headers | `nuxt.config.ts` → `/ads` e `/ads/**` com `Cache-Control: private, no-store` |
| Portal cliente | Whitelist `CLIENT_PORTAL_ADS_LINKS` + `isClientPortalAdsLink`; sidebar filtra `/ads` |
| Hub / switcher | Labels/descrições PT; `useModule` expande companion; `useHubHome` descreve Ads |
| Capability | Menu/página reutilizam `marketing.social.reports` (sem nova ACL / planos) |

### Árvore Ads (ETAPA 1)

```
Ads
└── Visão Geral  → /ads
```

Sem stubs Meta/Google/Analytics/Campanhas no menu (preferência: shell mínimo sem páginas vazias).

---

## 3. O que foi preservado

- `/marketing/**` e menu MVP de Marketing intactos (incluindo **Resultados → Relatórios** → `/marketing/reports`)
- Boards `MetaAdsBoard` / `GoogleAdsBoard` / `AnalyticsBoard` permanecem em Marketing
- Sem redirect que remova `/marketing/reports`
- Sem migrations / tables (`ads_campaigns`, etc.)
- Sem mudanças OAuth / `marketing_integrations`
- Sem misturar `social_campaigns` com `marketing_campaigns`
- Workspace/tenant/agência: Ads usa o mesmo contexto (`useWorkspace` / switcher de cliente); acesso via capability de reports já existente
- Capacidades `marketing.social.*` inalteradas no matriz de papéis

---

## 4. Decisão de capability (documentação)

| Superfície | Gate |
|------------|------|
| Item de menu Ads → Visão Geral | `marketing.social.reports` |
| CTAs “Relatórios (temporário)” na shell | `workspace.can('marketing.social.reports')` |

**Por quê:** reports paid hoje já exigem essa capability. Nova flag `ads.*` fica para quando o produto sair do companion Marketing (billing/catalog).

---

## 5. Decisão de tenant_modules

| Situação | Ads disponível? |
|----------|-----------------|
| `tenant_modules` inclui `marketing` | Sim (companion) |
| `tenant_modules` = `all` | Sim |
| Staff admin/funcionário (`includeAllModulesForStaff`) | Sim (todos `MODULE_META`) |
| Só CRM / WhatsApp | Não |

Nenhuma migration: não exige row `module_name = 'ads'`.

---

## 6. Arquivos tocados

**Criados**

- `pages/ads/index.vue`
- `docs/marketing-ads-brand-reorg/ETAPA-1-PRODUTOS.md` (este arquivo)

**Modificados**

- `constants/modules.ts`
- `constants/menus.ts`
- `constants/marketing-audience.ts`
- `composables/useModule.ts`
- `composables/useHubHome.ts`
- `composables/marketing/useMarketingAudience.ts`
- `components/layout/AppSidebar.vue`
- `nuxt.config.ts`
- `tests/tenant-modules.test.ts`
- `tests/workspace-guard.test.ts`

**Migrations:** nenhuma.

---

## 7. Próximos passos = ETAPA 2 (não executar aqui)

**ETAPA 2 — Blimber Ads:** migrar experiência Meta / Google Ads / Analytics (boards, overview API surface, templates) para `/ads`, mantendo convivência temporária com `/marketing/reports` até cutover.

Depois: ETAPA 3 (reorg menu Marketing orgânico), ETAPA 4+ (Brand Center).
