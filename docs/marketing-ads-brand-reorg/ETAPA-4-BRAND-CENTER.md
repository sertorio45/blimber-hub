# ETAPA 4 — Brand Center base

**Data:** 2026-08-11  
**Escopo:** renomear `/marketing/brand-guide` → `/marketing/brand`, UI Brand Center com tabs, tipos/contratos JSONB.  
**Não inclui:** Direção Visual / IA (ETAPA 5), BrandContext API unificada (ETAPA 6), geração de imagens, Ads MCP.

---

## 1. Objetivo

```
/marketing/brand-guide  →  301  /marketing/brand
```

Nova experiência **Brand Center / Marca** reutilizando `social_brand_guides` (1:1 por `tenant_id`).

---

## 2. Decisão de banco

| Opção | Resultado |
|-------|-----------|
| Nova tabela `brand_center` | ❌ não |
| Novas colunas | ❌ não |
| View | ❌ não |
| JSONB + colunas existentes | ✅ usado |

**Schema reutilizado** (`social_brand_guides`):

| Campo | Uso no Brand Center |
|-------|---------------------|
| `tone_of_voice` | Comunicação → tom |
| `audience` | Público → resumo (espelha `metadata.audienceProfile.summary`) |
| `allowed_words` / `forbidden_words` / `ctas` / `hashtags` | Comunicação |
| `colors` / `fonts` | Identidade visual |
| `products` | Produtos |
| `competitors` | Concorrentes |
| `restrictions` / `legal_notes` | Restrições |
| `logo_asset_ids` | Logos (refs `media_assets`) |
| `metadata.audienceProfile` | Público estruturado (segmentos, dores, canais…) |
| `metadata.references` | Referências (separadas de concorrentes) |
| `metadata.communicationStyle` | Estilo de comunicação |

**Migrations:** nenhuma.

---

## 3. UI (`/marketing/brand`)

Navegação lateral (desktop) + tabs (mobile):

1. Visão geral — cards (logo, cores, tom, público) + % completude  
2. Identidade visual — logos (picker da biblioteca), cores + preview, tipografia  
3. Comunicação — tom, estilo, palavras, CTAs, hashtags  
4. Público — perfil estruturado (não CRM)  
5. Produtos  
6. Concorrentes / Referências (listas separadas)  
7. Restrições / legal  

Completude é **indicador** — nunca bloqueia save/uso.

---

## 4. API / código

| Peça | Papel |
|------|--------|
| `GET/POST /api/marketing/social/brand-guide` | Evoluída (não forked); GET hidrata logos; POST faz merge parcial com existing |
| `types/brand-guide.ts` | Contratos tipados (sem `any`) |
| `utils/brand-guide.ts` | Normalize + completeness + input sanitize |
| `composables/marketing/useBrandGuide.ts` | Estado do Brand Center + save |
| `components/marketing/brand/*` | UI |

Capabilities inalteradas: `marketing.social.brand_guide.read` / `.manage`.

---

## 5. Navegação / audience

| Item | Destino |
|------|---------|
| Menu Marketing → Marca | `/marketing/brand` (`audience: agency`) |
| Settings Marketing card | `/marketing/brand` |
| Redirect | `routeRules` + página thin `/marketing/brand-guide` → `/marketing/brand` |
| Portal cliente | `/marketing/brand` e `/marketing/brand-guide` na blocklist |

Brand continua **por tenant do cliente** via `useWorkspace` / `useTenant` (agência edita o cliente ativo).

---

## 6. Arquivos

**Criados**

- `pages/marketing/brand.vue`
- `types/brand-guide.ts`
- `utils/brand-guide.ts`
- `composables/marketing/useBrandGuide.ts`
- `components/marketing/brand/BrandCenterPanel.vue`
- `components/marketing/brand/BrandColorEditor.vue`
- `components/marketing/brand/BrandLogoPicker.vue`
- `components/marketing/brand/BrandTagListEditor.vue`
- `server/utils/brand-guide.ts`
- `server/utils/brand-guide-schema.ts`
- `tests/brand-guide.test.ts`
- `docs/marketing-ads-brand-reorg/ETAPA-4-BRAND-CENTER.md` (este arquivo)

**Modificados**

- `pages/marketing/brand-guide.vue` (redirect thin)
- `server/api/marketing/social/brand-guide/index.get.ts`
- `server/api/marketing/social/brand-guide/index.post.ts`
- `constants/menus.ts`
- `constants/marketing-audience.ts`
- `pages/marketing/settings.vue`
- `nuxt.config.ts` (routeRules redirect)
- `tests/workspace-guard.test.ts`

**Migrations:** nenhuma.  
**Alteração de banco:** nenhuma.

---

## 7. O que foi preservado

- Dados existentes em `social_brand_guides`
- Endpoints sob `/api/marketing/social/brand-guide`
- Capabilities e RLS existentes
- Sem mistura com Ads / MCP Meta
- Sem seção Direção Visual / IA (ETAPA 5)

---

## 8. Testes

- `pnpm exec vitest run tests/brand-guide.test.ts tests/workspace-guard.test.ts`

---

## 9. PRÓXIMA ETAPA (NÃO EXECUTAR AQUI)

**ETAPA 5 — Direção Visual** (fotografia, mood, settings de geração / IA).
