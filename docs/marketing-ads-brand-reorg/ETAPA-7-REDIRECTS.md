# ETAPA 7 — Redirects `/ads` → `/marketing/ads`

**Data:** 2026-08-14  
**Escopo:** compatibilidade de bookmarks da casca Ads. Sem glob `/ads/**` (settings/integrações têm destinos próprios).  
**Não inclui:** limpeza ampla de copy (Etapa 8), migrations, OAuth, Graph/MCP.

Documento anterior: `ETAPA-6-PRODUTO.md`. Destino de settings: Etapa 5 (`/marketing/settings`).

---

## 1. Objetivo

```
/ads              → /marketing/ads
/ads/campaigns    → /marketing/ads/campaigns
/ads/creatives    → /marketing/ads/creatives
/ads/reports      → /marketing/ads/reports
/ads/meta         → /marketing/ads/meta
/ads/google       → /marketing/ads/google
/ads/analytics    → /marketing/ads/analytics
/ads/integrations → /settings/integrations
/ads/settings     → /marketing/settings
```

301 em `routeRules` + `navigateTo` nas páginas `/ads*` (navegação client-side). Destinos **não** começam com `/ads` — sem loop.

---

## 2. O que mudou

| Área | Mudança |
|------|---------|
| `ADS_LEGACY_REDIRECTS` | Mapa canônico |
| `nuxt.config.ts` | `routeRules` 301 a partir do mapa |
| `pages/ads/*.vue` | Wrappers thin de redirect |
| `pages/marketing/ads/{meta,google,analytics}.vue` | Boards (mesmos painéis) |
| Overview | Atalhos de canal usam `/marketing/ads/{meta,google,analytics}` |

---

## 3. O que NÃO fazer nesta etapa

- Não apagar `components/ads` / APIs
- Não glob `/ads/**` → `/marketing/ads/**`
- Não migrations / MCP

---

## 4. Arquivos

**Criados**

- `pages/marketing/ads/meta.vue`
- `pages/marketing/ads/google.vue`
- `pages/marketing/ads/analytics.vue`
- `tests/ads-redirects.test.ts`
- `docs/marketing-ads-brand-reorg/ETAPA-7-REDIRECTS.md` (este arquivo)

**Modificados**

- `constants/ads-domain.ts`
- `nuxt.config.ts`
- `pages/ads/*.vue`
- `components/ads/AdsOverviewView.vue`

**Migrations:** nenhuma.

---

## 5. Testes

```bash
pnpm exec vitest run tests/ads-redirects.test.ts tests/ads-shell.test.ts tests/ads-brand.test.ts tests/workspace-guard.test.ts
```

---

## 6. PRÓXIMA ETAPA

**ETAPA 8 — Limpeza** de referências de produto/navegação (`Blimber Ads`, seletor, copy). Não renomear domínio técnico.
