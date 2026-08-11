# ETAPA 5 — Direção Visual + preparação IA

**Data:** 2026-08-11  
**Escopo:** seções Direção Visual e IA no Brand Center (`/marketing/brand`), contratos JSONB tipados, completude.  
**Não inclui:** BrandContext API unificada (ETAPA 6), geração de imagens, Ads MCP, nova tabela.

---

## 1. Objetivo

Ampliar o Brand Center com:

1. **Direção Visual** — estilos, fotografia, composição, pessoas, produtos nas imagens, elementos, proibições, referências (`media_assets`).
2. **IA (contexto)** — fidelidade, realismo, texto em imagem, logo, preferências e observações — **sem gerar imagens**.

---

## 2. Decisão de banco

| Opção | Resultado |
|-------|-----------|
| Nova tabela `brand_center` | ❌ não |
| Novas colunas | ❌ não |
| View | ❌ não |
| `metadata` JSONB + hidratação de assets | ✅ usado |

**Contratos em `metadata`:**

| Chave | Conteúdo |
|-------|----------|
| `metadata.visualDirection` | estilos, fotografia, composição, people, productsInImages, elementos, negative guidance, `visualReferenceAssetIds` |
| `metadata.aiPreferences` | fidelity, realism, textInImage, logo, preferences, notes |

Referências visuais guardam **somente IDs** de `media_assets` (mesma regra de logos). Previews hidratados em `BrandGuide.visualReferenceAssets` no GET.

**Migrations:** nenhuma.  
**Alteração de banco:** nenhuma (JSONB existente).

---

## 3. UI (`/marketing/brand`)

Novas abas:

- **Direção visual** — subáreas: Estilos, Fotografia, Composição, Pessoas, Produtos, Elementos, Proibições, Referências (picker da biblioteca).
- **IA** — preferências de contexto + alerta de que não gera imagens.

Completude % inclui seções `visual` e `ai` (indicador — nunca bloqueia save).

---

## 4. API / código

| Peça | Papel |
|------|--------|
| `GET/POST /api/marketing/social/brand-guide` | Inalterada na rota; merge parcial inclui `visualDirection` + `aiPreferences`; GET hidrata refs visuais |
| `types/brand-guide.ts` | Tipos de direção visual e IA |
| `utils/brand-guide.ts` | Normalize, filled helpers, completeness, `toBrandGuideInput` |
| `server/utils/brand-guide-schema.ts` | Zod |
| `server/utils/brand-guide.ts` | Hidratação de logos + refs; merge helpers |
| `components/marketing/brand/BrandAssetPicker.vue` | Picker genérico da biblioteca |
| `BrandVisualDirectionEditor.vue` / `BrandAiPreferencesEditor.vue` | UI das novas abas |

Capabilities inalteradas: `marketing.social.brand_guide.read` / `.manage`.

---

## 5. Arquivos

**Criados**

- `components/marketing/brand/BrandAssetPicker.vue`
- `components/marketing/brand/BrandVisualDirectionEditor.vue`
- `components/marketing/brand/BrandAiPreferencesEditor.vue`
- `docs/marketing-ads-brand-reorg/ETAPA-5-VISUAL-DIRECTION.md` (este arquivo)

**Modificados**

- `types/brand-guide.ts`
- `utils/brand-guide.ts`
- `server/utils/brand-guide-schema.ts`
- `server/utils/brand-guide.ts`
- `server/api/marketing/social/brand-guide/index.post.ts`
- `components/marketing/brand/BrandCenterPanel.vue`
- `components/marketing/brand/BrandLogoPicker.vue` (wrapper do picker genérico)
- `tests/brand-guide.test.ts`

**Migrations:** nenhuma.

---

## 6. O que foi preservado

- Dados existentes em `social_brand_guides`
- Endpoints, capabilities, RLS, tenant/agência via workspace
- Sem geração de imagem
- Sem BrandContext unificado (ETAPA 6)
- Sem alterações em Ads / MCP Meta

---

## 7. Testes

```bash
pnpm exec vitest run tests/brand-guide.test.ts
```

---

## 8. PRÓXIMA ETAPA (NÃO EXECUTAR AQUI)

**ETAPA 6 — Brand Context para IA** (serviço/API unificada de contexto).
