# ETAPA 8 — Limpeza (reposicionar Ads)

**Data:** 2026-08-14  
**Escopo:** referências de **produto/navegação**. Sem rename técnico (`marketing_integrations`, GPT `ads.blimber.com.br`, `lib/meta-ads`).  
**Não é** a revisão histórica `ETAPA-8-REVISAO-FINAL.md` (epic 2026-08-11, Ads como produto irmão).

---

## 1. Resultado de produto

```
CRM
WhatsApp
Marketing
  └── Ads (submenu)
        Visão Geral / Campanhas / Criativos / Relatórios
  └── Configurações
        Marca / Contas sociais / Contas de anúncios / Integrações
```

Seletor e hub **sem** tile Ads. Bookmarks `/ads*` → 301 Marketing.

---

## 2. O que mudou nesta etapa

| Área | Mudança |
|------|---------|
| Shell | Base canônica `/marketing/ads`; criativos sempre nessa rota |
| Overview | Removido card “Abrir Marketing” da casca Ads irmã |
| Boards Meta/Google/Analytics | Breadcrumb Marketing → Ads |
| Copy/comentários | Produto irmão / dual-entry atualizados |
| Docs | Inclui baseline ETAPA-0–2 do epic de reposicionamento (estavam untracked) |

---

## 3. Preservado (não limpar)

- `components/ads`, `composables/ads`, `types/ads-brand`
- `MODULE_META.ads` (metadado legado)
- APIs `/api/marketing/*`, `/api/gpt/meta/*`, MCP
- Tabelas `marketing_*`
- Relatórios orgânicos em `/marketing/reports` (sem cutover)

---

## 4. Arquivos

**Criados**

- `docs/marketing-ads-brand-reorg/ETAPA-8-LIMPEZA.md` (este arquivo)
- Docs já escritas nas etapas 0–2 (commit de higiene)

**Modificados**

- `utils/ads-shell.ts`, `utils/ads-brand.ts`
- `composables/ads/useAdsShellBase.ts`
- `components/ads/AdsOverviewView.vue`, `AdsMarketingChrome.vue`
- `pages/marketing/ads/{meta,google,analytics}.vue` (+ comentários wrappers)
- `constants/ads-domain.ts`, `constants/modules.ts`
- `types/ads-brand.ts`, `MarketingReportsPanel.vue`
- testes ads-shell / ads-brand

**Migrations:** 0

---

## 5. Testes

```bash
pnpm exec vitest run \
  tests/ads-redirects.test.ts \
  tests/ads-shell.test.ts \
  tests/ads-brand.test.ts \
  tests/workspace-guard.test.ts \
  tests/tenant-modules.test.ts \
  tests/nav-flatten.test.ts
```

---

## 6. Gaps residuais (não bloqueantes)

| Item | Nota |
|------|------|
| Typecheck/lint globais | Pré-existentes; não zerados |
| `/marketing/reports` orgânico vs Ads | Convivência intencional |
| `pages/ads/*` | Wrappers 301 — podem ser removidos num follow-up |
| GPT host `ads.blimber.com.br` | Actions, não UI Hub |
| `gpt/blimber/skills.zip` | Não commitado |
