# ETAPA 6 — Brand Context para IA

**Data:** 2026-08-11  
**Escopo:** contrato unificado `BrandContext`, mapper, API GET tenant-aware, composable client.  
**Não inclui:** Prompt Builder, geração de imagens, Ads+Brand (ETAPA 7), MCP/GPT Meta.

---

## 1. Objetivo

```
Brand Center (social_brand_guides)
        ↓
   BrandContext
        ↓
 futuro Prompt Builder
        ↓
 futuro Blimber AI
```

Uma única fonte de leitura do contexto completo da marca por tenant, sem disparar geração.

---

## 2. Decisão de banco

| Opção | Resultado |
|-------|-----------|
| Nova tabela | ❌ não |
| Novas colunas | ❌ não |
| View | ❌ não |
| Reuso `social_brand_guides` + mapper | ✅ |

**Migrations:** nenhuma.  
**Alteração de banco:** nenhuma.

---

## 3. Contrato `BrandContext`

| Bloco | Conteúdo |
|-------|----------|
| `identity` | logos (ids + assets), cores, tipografia |
| `visual` | `visualDirection` + `referenceAssets` hidratados |
| `communication` | tom, estilo, palavras, CTAs, hashtags |
| `audiences` | perfil estruturado + summary |
| `products` | produtos da marca |
| `competitors` | concorrentes |
| `references` | referências (separadas) |
| `ai` | preferências de contexto IA |
| `restrictions` | restrições + notas legais |
| meta | `tenantId`, `guideId`, datas, `completeness` |

Tipos em `types/brand-context.ts` — sem `any`. Reutiliza contratos de `types/brand-guide.ts`.

---

## 4. API / código

| Peça | Papel |
|------|--------|
| `GET /api/marketing/brand/context` | Contexto completo do tenant do workspace |
| `utils/brand-context.ts` | `toBrandContext` / empty / tenant check |
| `server/utils/brand-context.ts` | `fetchBrandContextForTenant` (via brand-guide + isolation guard) |
| `composables/marketing/useBrandContext.ts` | Client fetch + cache por tenant |

**Capability:** `marketing.social.brand_guide.read` (mesma do Brand Center).  
**Tenant:** `requireSocialContext` → tenant ativo (agência edita cliente via workspace).

Endpoints de edição permanecem em `/api/marketing/social/brand-guide` (não forked).

---

## 5. Isolamento por tenant

1. Fetch sempre com `.eq('tenant_id', tenantId)`.
2. Mapper carimba `context.tenantId`.
3. Guard no serviço: rejeita guide cujo `tenantId` ≠ workspace.
4. Testes unitários cobrem ausência de cross-contamination entre contextos A/B.

---

## 6. Arquivos

**Criados**

- `types/brand-context.ts`
- `utils/brand-context.ts`
- `server/utils/brand-context.ts`
- `server/api/marketing/brand/context.get.ts`
- `composables/marketing/useBrandContext.ts`
- `tests/brand-context.test.ts`
- `docs/marketing-ads-brand-reorg/ETAPA-6-BRAND-CONTEXT.md` (este arquivo)

**Modificados**

- Nenhum arquivo de runtime existente (apenas adições).

**Migrations:** nenhuma.

---

## 7. O que foi preservado

- Brand Center UI e `social_brand_guides`
- APIs GET/POST `/api/marketing/social/brand-guide`
- Capabilities e RLS existentes
- Sem geração de imagem / Prompt Builder
- Sem Ads + Brand (ETAPA 7)

---

## 8. Testes

```bash
pnpm exec vitest run tests/brand-context.test.ts tests/brand-guide.test.ts
```

---

## 9. PRÓXIMA ETAPA (NÃO EXECUTAR AQUI)

**ETAPA 7 — Ads + Brand Context** (preparar Ads para consumir Brand Context; sem gerar imagens).
