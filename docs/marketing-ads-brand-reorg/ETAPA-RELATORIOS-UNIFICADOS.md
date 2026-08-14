# Relatórios unificados — auditoria e implementação

**Data:** 2026-08-14  
**Escopo:** um hub de Relatórios (Ads / Analytics / Social orgânico) com shell compartilhado.  
**Fora:** migrations, OAuth novo, Graph/CRM/Inbox, duplicar boards, misturar `social_campaigns`.

---

## Etapa 0 — mapa atual (antes)

| Superfície | Rota | UI | Dados |
|------------|------|----|--------|
| Orgânico | `/marketing/reports` | `MarketingOrganicReportsPanel` | `GET /api/marketing/social/organic-reports` — Facebook Page / Instagram; LinkedIn placeholder |
| Pagos (tudo) | `/marketing/ads/reports` | `AdsReportsView` → `MarketingReportsPanel` | `GET /api/marketing/overview` — Meta, Google Ads **e** GA no mesmo painel |
| Analytics | `/marketing/ads/analytics` | painel locked `google_analytics` | mesmo overview |
| Drill-down | `/marketing/ads/meta`, `/google` | locked source | operacional, manter |
| Overview Ads | `/marketing/ads` | KPIs 7d + cards | resumo; botão Relatórios ia para `/marketing/ads/reports` |
| Legacy `/ads/*` | 301 via `ADS_LEGACY_REDIRECTS` | — | `/ads/reports` → ads reports; `/ads/analytics` → ads analytics |

**Duplicação:** dois “Relatórios” (orgânico no Marketing + pagos em Ads). Analytics misturado no painel pago. Período não compartilhava entre telas. Empty/erro orgânico apontava `/marketing/integrations`.

**Configurações:** permanece só **Marca**. OAuth só em `/settings/integrations`.

---

## Decisão de hub

Tabs no shell + default Anúncios (`/marketing/reports` → `/marketing/reports/ads`). Mesmo header, período (`range`) e cliente nas três URLs. Menos duplicação que um resumo extra + tabs.

---

## Rotas canônicas

- `/marketing/reports` → 302 `/marketing/reports/ads` (query preservada)
- `/marketing/reports/ads` — Meta + Google Ads (filtro de plataforma)
- `/marketing/reports/analytics` — GA
- `/marketing/reports/social` — orgânico (não mistura campanhas editoriais)

## Redirects 301

- `/marketing/ads/reports` → `/marketing/reports/ads`
- `/marketing/ads/analytics` → `/marketing/reports/analytics`
- `/ads/reports` → `/marketing/reports/ads`
- `/ads/analytics` → `/marketing/reports/analytics`

Mantidos: `/marketing/ads/meta`, `/marketing/ads/google`.
