# ETAPA 2 — Rotas `/marketing/ads*` (views compartilhadas)

**Data:** 2026-08-14  
**Escopo:** novas rotas + extração de views. Sem migrations. Sem Etapa 3 (labels/contexto).  
**Não inclui:** breadcrumbs/títulos completos de Marketing, remoção do produto Ads, 301 de `/ads` → `/marketing/ads`.

Documento de baseline: `ETAPA-0-REPOSICIONAR-ADS.md`. Etapa anterior: `ETAPA-1-NAV.md`.

---

## Objetivo

Criar a árvore canônica sob Marketing, **reusando** as implementações de `pages/ads/*.vue` (overview, campanhas, criativos, relatórios).

```
/marketing/ads
/marketing/ads/campaigns
/marketing/ads/creatives
/marketing/ads/reports
```

Rotas `/ads*` **permanecem** (entrada dupla temporária). Meta / Google / Analytics / Integrações **não** foram extraídas.

---

## O que mudou

| Área | Mudança |
|------|---------|
| `components/ads/Ads*View.vue` | Lógica de UI extraída (overview, campaigns, creatives, reports) |
| `pages/ads/{index,campaigns,creatives,reports}.vue` | Wrappers finos com `definePageMeta` + view compartilhada |
| `pages/marketing/ads/*.vue` | Novas rotas consumindo as mesmas views |
| `composables/ads/useAdsShellBase.ts` | Prefixo `/marketing/ads` vs `/ads` para CTAs internos das 4 telas |
| `constants/menus.ts` | Submenu Marketing → Ads aponta para `/marketing/ads*` |
| `constants/marketing-audience.ts` | Portal cliente libera `/marketing/ads` (prefixo das 4 rotas) |
| Produto Ads (seletor / menu top-level) | Continua em `/ads*` |

Boards Meta/Google/Analytics nos atalhos da overview **continuam** em `/ads/meta`, `/ads/google`, `/ads/analytics`.

---

## O que NÃO fazer nesta etapa

- Não iniciar Etapa 3 (labels pago vs orgânico, contexto Marketing completo)
- Não remover o tile Ads nem as rotas `/ads*`
- Não migrations / redirects 301
- Não extrair `meta` / `google` / `analytics` / `integrations`

---

**ETAPA 2 CONCLUÍDA. PARAR. Não iniciar Etapa 3.**
