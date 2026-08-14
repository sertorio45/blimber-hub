# ETAPA 1 — Ads como submenu de Marketing (entrada dupla)

**Data:** 2026-08-14  
**Escopo:** somente navegação. **Sem rotas novas.** Sem extração de views. Sem migrations.  
**Não inclui:** `/marketing/ads/*` (Etapa 2), remoção do produto Ads no seletor.

Documento de baseline: `ETAPA-0-REPOSICIONAR-ADS.md`.

---

## Objetivo

Expor Ads **dentro** do menu Marketing, mantendo Ads como produto de primeiro nível (entrada dupla temporária).

```
Marketing
└── Ads
    ├── Visão Geral     → /ads          (temporário; Etapa 2: /marketing/ads)
    ├── Campanhas       → /ads/campaigns
    ├── Criativos       → /ads/creatives  (badge "Em evolução")
    └── Relatórios      → /ads/reports
```

Meta Ads / Google Ads / Analytics / Integrações **não** entram neste submenu; continuam só no produto Ads.

---

## O que mudou

| Área | Mudança |
|------|---------|
| `constants/menus.ts` | Grupo **Ads** após Relatórios orgânicos, antes de Configurações |
| `types/nav.d.ts` | Campo opcional `badge` em `NavLink` |
| Sidebar | Renderiza `badge` (ex.: “Em evolução”) no menu plano e nos grupos |
| `tests/workspace-guard.test.ts` | Permite `/ads*` no submenu Marketing; ainda proíbe Meta/Google ali |

Produto Ads no seletor e em `MODULE_META.ads` **inalterado**.

---

## O que NÃO fazer nesta etapa

- Não criar `pages/marketing/ads/**`
- Não remover o tile Ads
- Não migrations
- Não redirects 301 de `/ads` → `/marketing/ads`

---

**ETAPA 1 CONCLUÍDA. PARAR. Não iniciar Etapa 2.**
