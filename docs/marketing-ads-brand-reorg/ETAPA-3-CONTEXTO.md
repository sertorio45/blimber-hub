# ETAPA 3 — Contexto Marketing (labels, breadcrumbs, settings)

**Data:** 2026-08-14  
**Escopo:** disambiguar orgânico vs pago na sidebar, breadcrumbs/tenant em `/marketing/ads*`, alinhamento de settings/integrações.  
**Não inclui:** Brand Center (Etapa 4), remoção do produto Ads no seletor, redirects `/ads` → `/marketing/ads`, Graph API / MCP.

Documento anterior: `ETAPA-2-ROTAS.md`. A spec histórica `ETAPA-3-MARKETING-MENU.md` (2026-08-11) já estava aplicada na árvore orgânica e **não** é reexecutada aqui.

---

## 1. Objetivo

Ads dentro de Marketing deixa de parecer um produto paralelo “solto”:

- Sidebar Marketing **não** mostra dois “Campanhas” / dois “Relatórios” no mesmo nível.
- Páginas `/marketing/ads*` mostram trilha **Marketing → Ads → …** e o cliente ativo.
- Configurações de Marketing apontam para o OAuth único e para Ads.

```
Marketing (sidebar, flatten)
├── Visão Geral
├── Calendário / Campanhas editoriais / Briefings   ← Planejamento achatado
├── Conteúdos … Marca … Publicações
├── Relatórios orgânicos
├── Ads (grupo colapsável, keepGroup)
│   ├── Visão Geral
│   ├── Campanhas
│   ├── Criativos          badge “Em evolução”
│   └── Relatórios
└── Configurações
```

Produto Ads no seletor e menu `/ads*` **permanecem**.

---

## 2. O que mudou

| Área | Mudança |
|------|---------|
| Menu | `Campanhas editoriais`, `Relatórios orgânicos`; Ads `keepGroup: true` |
| Sidebar | Flatten respeita `keepGroup`; Ads renderiza como grupo |
| Views Ads | Chrome de breadcrumb + tenant só em `/marketing/ads*` |
| Relatórios orgânicos | CTA canônico → `/marketing/ads/reports` (sem 301 de `/ads`) |
| Settings Marketing | Copy OAuth único + card Ads → `/marketing/ads` |
| Títulos | Campanhas pagas / Relatórios pagos nas views paid |

Integrações continuam em `/settings/integrations` (Ads Integrações segue 301). Boards Meta/Google/Analytics nos atalhos da overview **continuam** em `/ads/meta|google|analytics`.

---

## 3. O que NÃO fazer nesta etapa

- Não remover o tile Ads nem as rotas `/ads*`
- Não criar redirects 301 `/ads` → `/marketing/ads`
- Não migrations
- Não Brand Center / Direção Visual
- Não alterar Graph API / MCP

---

## 4. Arquivos

**Criados**

- `utils/nav-flatten.ts`
- `utils/ads-shell.ts`
- `components/ads/AdsMarketingChrome.vue`
- `tests/nav-flatten.test.ts`
- `tests/ads-shell.test.ts`
- `docs/marketing-ads-brand-reorg/ETAPA-3-CONTEXTO.md` (este arquivo)

**Modificados**

- `types/nav.d.ts`
- `constants/menus.ts`
- `components/layout/AppSidebar.vue`
- `composables/ads/useAdsShellBase.ts`
- `components/ads/Ads*View.vue`
- `pages/marketing/settings.vue`
- `pages/marketing/reports.vue`
- `pages/marketing/campaigns/index.vue`
- `tests/workspace-guard.test.ts`

**Migrations:** nenhuma.

---

## 5. Testes

- `pnpm exec vitest run tests/workspace-guard.test.ts tests/nav-flatten.test.ts tests/ads-shell.test.ts`
- eslint nos arquivos tocados

---

## 6. PRÓXIMA ETAPA (NÃO EXECUTAR AQUI)

**ETAPA 4 — Brand Center** (`ETAPA-4-BRAND-CENTER.md`): rename/UI de `/marketing/brand` — já existe no repo histórico; no epic de reposicionamento, alinhar Ads ao Brand Center sem cutover do seletor.
