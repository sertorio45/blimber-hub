# ETAPA 3 — Limpeza do menu Marketing (orgânico)

**Data:** 2026-08-11  
**Escopo:** reorganizar a navegação principal de Marketing após Ads existir em paralelo.  
**Não inclui:** Brand Center (`/marketing/brand`), cutover/remoção de `/marketing/reports`, migrations, remoção de páginas.

---

## 1. Objetivo

Árvore principal (labels PT-BR):

```
Marketing
├── Visão Geral                         → /marketing
├── Planejamento
│   ├── Calendário                      → /marketing/calendar
│   ├── Campanhas (editoriais)          → /marketing/campaigns
│   └── Briefings (agency)              → /marketing/briefings
├── Conteúdos                           → /marketing/content
├── Produção (agency)                   → /marketing/production
├── Aprovações (agency)                 → /marketing/approvals
├── Biblioteca                          → /marketing/media
├── Marca (agency)                      → /marketing/brand-guide
├── Publicações (agency queue)          → /marketing/publishing
├── Relatórios                          → /marketing/reports
└── Configurações                       → /marketing/settings
```

A sidebar continua **achatando** grupos aninhados (só `Planejamento` tem filhos); os demais itens são folhas top-level.

---

## 2. O que mudou

| Área | Mudança |
|------|---------|
| Menu | Removidos agrupadores `Conteúdo`, `Operação`, `Resultados` |
| Marca | Saiu de Configurações → item top-level (ainda `/marketing/brand-guide`; rename de rota = ETAPA 4) |
| Contas sociais | Removidas do menu Marketing top-level |
| Relatórios | Permanecem em Marketing como folha (sem redirect para Ads) |
| Ads | Nada no menu Marketing aponta para `/ads/*` |

### Domínio de campanhas (inalterado)

| Entidade | Domínio | Menu |
|----------|---------|------|
| `social_campaigns` | editorial / orgânico | Marketing → Campanhas |
| live APIs / `marketing_campaigns` | paid | Ads → Campanhas |

---

## 3. Contas sociais / integrações — onde ficaram

Removido o leaf **Contas sociais** do menu principal de Marketing. Caminhos oficiais:

| Entrada | Destino | Uso |
|---------|---------|-----|
| Marketing → **Configurações** | `/marketing/settings` → card Contas sociais | Atalho no produto orgânico |
| Configurações globais → **Integrações** | `/settings/integrations` | Nav global (`navMenuGlobal`) |
| Ads → **Integrações** | `/ads/integrations` → 301 `/settings/integrations` | Produto paid |

**Decisão:** uma única UI OAuth em `/settings/integrations` (evita duplicar painéis). Whitelist do portal cliente mantém `/settings/integrations` e `/marketing/settings`.

---

## 4. Itens que saíram do top-level Marketing

| Item anterior | Destino agora |
|---------------|---------------|
| Contas sociais (menu) | `/marketing/settings` + `/settings/integrations` + Ads Integrações |
| Agrupador Resultados | Removido; Relatórios é folha |
| Agrupadores Conteúdo / Operação | Removidos; folhas promovidas |

### Recursos avançados (ainda fora do menu principal)

Continuam por URL / deep link (não orphanados de código):

- `/marketing/packages`, `/ops-metrics`, `/automations`, `/logs`, `/notifications`
- Tasks de produção: `/marketing/production/tasks`

---

## 5. Audiência portal vs agência

Fonte: `constants/marketing-audience.ts` + `matchesNavAudience` / AppSidebar.

**Portal cliente (whitelist inalterada):**  
`/marketing`, calendar, campaigns, content, media, reports, settings, `/settings/integrations` (+ legados posts/library).

**Menu `audience: 'agency'`:** Briefings, Produção, Aprovações, Marca, Publicações (fila).

**Cliente:** item Conteúdos usa `clientTitle: 'Publicações'` (fila agency de Publicações fica oculta).

Nenhuma mudança na lógica de `useMarketingAudience` além do que já cobria Ads na ETAPA 1–2.

---

## 6. O que foi preservado

- Todas as pages `/marketing/**` (incluindo `/marketing/reports` e `/marketing/brand-guide`)
- Boards Ads em `/ads/*` (não movidos de volta)
- OAuth / `marketing_integrations`
- Capabilities `marketing.social.*`
- Sem migrations / Brand Center
- Sem misturar `social_campaigns` com `marketing_campaigns`

---

## 7. Arquivos

**Criados**

- `docs/marketing-ads-brand-reorg/ETAPA-3-MARKETING-MENU.md` (este arquivo)

**Modificados**

- `constants/menus.ts`
- `pages/marketing/settings.vue` (copy do hub)
- `tests/workspace-guard.test.ts`

**Audience / sidebar:** sem mudança de API; filtros já existentes cobrem a nova árvore.

**Migrations:** nenhuma.  
**Alteração de banco:** não.

---

## 8. Testes

- `pnpm exec vitest run tests/workspace-guard.test.ts`
- eslint nos arquivos tocados

---

## 9. PRÓXIMA ETAPA (NÃO EXECUTAR AQUI)

**ETAPA 4 — Brand Center base** (rename `/marketing/brand-guide` → `/marketing/brand`, redirect, expansão de UI).
