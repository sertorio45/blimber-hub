# ETAPA 7 — Ads + Brand Context

**Data:** 2026-08-11  
**Escopo:** preparar o produto Ads para consumir Brand Context (arquitetura + UI leve).  
**Não inclui:** geração de imagens/copy, Prompt Builder, migrations, GPT Meta, OAuth, ETAPA 8.

---

## 1. Objetivo

```
Campanha Ads (paga) + Produto + Marca (Brand Context) + Objetivo
        ↓
 futuro Blimber AI
        ↓
 Copy / Imagem / Variações
```

Nesta etapa: **somente contratos, helpers e UI de preparação** — sem chamar modelos.

---

## 2. Fronteira de domínio (Ads vs Marketing)

| Entidade | Domínio | UI |
|----------|---------|-----|
| `social_campaigns` | editorial / orgânico | `/marketing/campaigns` |
| Live Meta/Google + `marketing_campaigns` / cache | mídia paga | `/ads/*` |
| `BrandContext` (via Brand Center) | leitura unificada da marca | `/marketing/brand` + consumo Ads |

**Regra:** Ads nunca lista `social_campaigns` como campanhas pagas.  
Documentado em `constants/ads-domain.ts` e comentários nas páginas `/ads/*`.

---

## 3. Como Ads lê Brand Context

| Peça | Papel |
|------|--------|
| `GET /api/marketing/brand/context` | API existente (ETAPA 6) — tenant do workspace |
| `useBrandContext` | Loader Marketing |
| `useAdsBrandContext` | Wrapper Ads + `summary` tipado |
| `types/ads-brand.ts` | Contratos de criativo futuro + summary |
| `utils/ads-brand.ts` | Summary / `buildAdsCreativeGenerationInput` (sem geração) |

**Capability:** `marketing.social.brand_guide.read` (mesma do Brand Center).  
**Tenant:** sempre o cliente ativo do workspace (agência → switcher). O builder rejeita Brand Context de outro `tenantId`.

**Sem** tabela duplicada de marca. **Sem** endpoint Ads paralelo de brand.

---

## 4. UI

| Superfície | Conteúdo |
|------------|----------|
| `/ads` | Card “Contexto da marca” (nome do cliente, cores, tom, completude) + link Brand Center |
| `/ads/creatives` | Placeholder “Em preparação / Arquitetura”: checklist campanha + produto + brand + objetivo; **sem** botão de gerar |
| Menu Ads | Item “Criativos” |

---

## 5. Arquivos

**Criados**

- `types/ads-brand.ts`
- `utils/ads-brand.ts`
- `composables/ads/useAdsBrandContext.ts`
- `components/ads/AdsBrandContextCard.vue`
- `pages/ads/creatives.vue`
- `tests/ads-brand.test.ts`
- `docs/marketing-ads-brand-reorg/ETAPA-7-ADS-BRAND.md` (este arquivo)

**Modificados**

- `constants/ads-domain.ts`
- `constants/menus.ts`
- `constants/marketing-audience.ts`
- `pages/ads/index.vue`
- `pages/ads/meta.vue`, `google.vue`, `analytics.vue`, `reports.vue` (comentários de domínio)
- `tests/workspace-guard.test.ts`

**Migrations:** nenhuma.  
**Alteração de banco:** nenhuma.

---

## 6. O que foi preservado

- Brand Center / `social_brand_guides` / API de context (ETAPA 6)
- Boards Meta/Google/Analytics e OAuth
- Sem geração de criativos
- Sem GPT Meta / MCP changes
- Schema remoto inalterado

---

## 7. Testes

```bash
pnpm exec vitest run tests/ads-brand.test.ts tests/workspace-guard.test.ts tests/brand-context.test.ts
```

---

## 8. PRÓXIMA ETAPA (NÃO EXECUTAR AQUI)

**ETAPA 8 — Revisão final** (auditoria ampla da reorg Marketing / Ads / Brand).
