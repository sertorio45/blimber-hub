# ETAPA 2 — Blimber Ads (experiência paid)

**Data:** 2026-08-11  
**Escopo:** mover a experiência Meta Ads / Google Ads / Google Analytics para o produto **Ads**, reutilizando boards existentes.  
**Não inclui:** cutover/remoção de `/marketing/reports`, reorg do menu Marketing (ETAPA 3), Brand Center, OAuth novo, tabelas `ads_*`.

---

## 1. Objetivo

```
Ads
├── Visão Geral     → /ads
├── Meta Ads        → /ads/meta
├── Google Ads      → /ads/google
├── Analytics       → /ads/analytics
├── Campanhas       → /ads/campaigns   (paid — não editorial)
├── Relatórios      → /ads/reports
└── Integrações     → /ads/integrations → 301 /settings/integrations
```

Manter `/marketing/reports` funcionando (mesmo `MarketingReportsPanel`).

---

## 2. Domínio de campanhas (código)

Documentado em `constants/ads-domain.ts` e nas páginas Ads:

| Entidade | Domínio | UI |
|----------|---------|-----|
| `social_campaigns` | editorial / orgânico | `/marketing/campaigns` |
| `marketing_campaigns` | paid Meta Ads (schema legado) | não é a lista editorial |
| Live Meta/Google APIs + `marketing_campaign_cache` | paid reports atuais | `/ads/*` e `/marketing/reports` |

**Regra:** Ads nunca lista `social_campaigns` como campanhas pagas.

---

## 3. O que mudou

| Área | Mudança |
|------|---------|
| Painel compartilhado | `components/marketing/MarketingReportsPanel.vue` — extrai lógica de reports; `lockedSource` para Meta/Google/Analytics |
| `/marketing/reports` | Thin wrapper no painel (compatibilidade preservada) |
| Páginas Ads | `index`, `meta`, `google`, `analytics`, `campaigns`, `reports`, `integrations` |
| Menu | `constants/menus.ts` — árvore Ads completa |
| Portal cliente | `CLIENT_PORTAL_ADS_LINKS` expandido (prefixo `/ads` já cobria subrotas) |
| Domínio | `constants/ads-domain.ts` |

### Visão Geral (`/ads`)

- Chama `GET /api/marketing/overview?source=all&date_preset=last_7d`
- KPIs reais (investimento Meta/Google, sessões Analytics) — **sem métricas falsas**
- Cards de atalho para canais + campanhas + Marketing + integrações

### Campanhas (`/ads/campaigns`)

- União de campanhas Meta + Google Ads do overview live
- Comentário explícito vs `/marketing/campaigns` editorial

### Integrações

- `pages/ads/integrations.vue` → redirect 301 para `/settings/integrations` (evita duplicar OAuth UI)

---

## 4. O que foi preservado

- `/marketing/reports` intacto funcionalmente
- OAuth / `marketing_integrations` / callbacks — sem alterações
- Sem tabela `ads_campaigns`
- Sem apagar boards sob Marketing; Ads **monta os mesmos** componentes
- Capabilities: `marketing.social.reports` / `integrations` (sem ACL `ads.*` nova)
- Workspace / tenant / agência inalterados
- Schema remoto inalterado (ETAPA 1 e 2 sem migrations)

---

## 5. Arquivos

**Criados**

- `components/marketing/MarketingReportsPanel.vue`
- `constants/ads-domain.ts`
- `pages/ads/meta.vue`
- `pages/ads/google.vue`
- `pages/ads/analytics.vue`
- `pages/ads/campaigns.vue`
- `pages/ads/reports.vue`
- `pages/ads/integrations.vue`
- `docs/marketing-ads-brand-reorg/ETAPA-2-ADS.md` (este arquivo)

**Modificados**

- `pages/ads/index.vue`
- `pages/marketing/reports.vue`
- `constants/menus.ts`
- `constants/marketing-audience.ts`
- `tests/workspace-guard.test.ts`

**Migrations:** nenhuma.  
**Alteração de banco:** nenhuma.

---

## 6. Testes

- `pnpm exec vitest run tests/workspace-guard.test.ts` (expectativa: Ads whitelist atualizada)
- Demais testes de tenant/modules já cobriam companion Ads na ETAPA 1

---

## 7. Próximos passos = ETAPA 3 (NÃO executar aqui)

**ETAPA 3 — Limpeza do Marketing:** remover Resultados/Relatórios paid do menu Marketing, redirects de convivência, eventualmente cutover de URLs antigas — sem quebrar bookmarks até política de redirect definida.
