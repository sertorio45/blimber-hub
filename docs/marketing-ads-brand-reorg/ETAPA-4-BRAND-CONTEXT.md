# ETAPA 4 — Tenant + Brand Context (Ads dentro de Marketing)

**Data:** 2026-08-14  
**Escopo:** alinhar Ads ao Brand Center existente (`/marketing/brand`) — tenant ativo, Brand Context idêntico nas duas entradas, portal vs agência.  
**Não inclui:** Direção Visual / IA (histórico ETAPA 5), Settings cutover (Etapa 5 deste epic), remoção do produto Ads no seletor, redirects `/ads` → `/marketing/ads`.

Documento de Brand Center já entregue: `ETAPA-4-BRAND-CENTER.md` (2026-08-11). Esta etapa **não reconstrói** essa UI.

---

## 1. Objetivo

```
Campanha Ads + Produto + Marca (Brand Context) + Objetivo
```

`useAdsBrandContext` continua a única leitura Ads da marca do **cliente ativo** (`useTenant` / `useMarketingSocial`), igual em `/ads*` e `/marketing/ads*`.

Brand Center permanece dono da escrita (`social_brand_guides`). Ads só lê.

---

## 2. O que mudou

| Área | Mudança |
|------|---------|
| Portal cliente | Peek de Brand Context nos cards Ads; **sem** CTA “Abrir Brand Center” (rota na blocklist) |
| Agência / cliente direto (não portal) | CTA Brand Center → `/marketing/brand` |
| Dual entry criativos | `resolveAdsCreativesPath` — Marketing `/marketing/ads/creatives`, produto `/ads/creatives` (sem 301) |
| `/marketing/brand` | Breadcrumb Marketing → Marca + “Cliente ativo” + atalho Criativos de Ads |
| Constantes | `MARKETING_ADS_CREATIVES_ROUTE`; Brand Center único `/marketing/brand` |

Seletor de produto **ainda tem Ads**. Integrações continuam em `/settings/integrations`.

---

## 3. O que NÃO fazer nesta etapa

- Não remover o tile Ads nem as rotas `/ads*`
- Não criar redirects 301 `/ads` → `/marketing/ads`
- Não migrations / schema
- Não Direção Visual / geração de imagens
- Não reorganizar Configurações (Etapa 5 deste epic)
- Não alterar Graph API / MCP

---

## 4. Arquivos

**Criados**

- `docs/marketing-ads-brand-reorg/ETAPA-4-BRAND-CONTEXT.md` (este arquivo)

**Modificados**

- `constants/ads-domain.ts`
- `utils/ads-brand.ts`
- `composables/ads/useAdsBrandContext.ts`
- `components/ads/AdsBrandContextCard.vue`
- `components/ads/AdsCreativesView.vue`
- `pages/marketing/brand.vue`
- `tests/ads-brand.test.ts`
- `tests/workspace-guard.test.ts`

**Migrations:** nenhuma.  
**Alteração de banco:** nenhuma.

---

## 5. Testes

```bash
pnpm exec vitest run tests/ads-brand.test.ts tests/workspace-guard.test.ts tests/brand-guide.test.ts tests/brand-context.test.ts tests/ads-shell.test.ts
```

---

## 6. PRÓXIMA ETAPA (NÃO EXECUTAR AQUI)

**ETAPA 5 — Configurações** (brief de reposicionamento): analisar settings de Ads vs Marketing → Contas sociais / anúncios / integrações no hub de Configurações. **Não** é a ETAPA 5 histórica (Direção Visual).
