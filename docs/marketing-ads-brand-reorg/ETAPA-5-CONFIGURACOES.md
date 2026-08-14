# ETAPA 5 — Configurações (Ads dentro de Marketing)

**Data:** 2026-08-14  
**Escopo:** encaixar configurações de Ads no hub Marketing. **Não** é a ETAPA 5 histórica (Direção Visual).  
**Não inclui:** remoção do produto Ads no seletor, 301 `/ads` → `/marketing/ads`, reescrita OAuth.

Documento anterior: `ETAPA-4-BRAND-CONTEXT.md`. Spec original: não havia `pages/ads/settings.vue` — só Integrações 301.

---

## 1. Objetivo

```
Marketing
└── Configurações
    ├── Marca
    ├── Contas sociais
    ├── Contas de anúncios
    └── Integrações
```

Evitar um submenu **Ads → Configurações**. OAuth permanece único em `/settings/integrations`.

---

## 2. Achado (settings de Ads)

| Superfície | Estado |
|------------|--------|
| `/ads/settings` | **Não existia** (404). Bookmark agora 301 → `/marketing/settings` |
| `/ads/integrations` | Já 301 → `/settings/integrations` (inalterado) |
| Painel OAuth | `SocialProvidersPanel` em `/settings/integrations` (Meta, LinkedIn, Google Ads, GA) |

**Decisão:** não separar três painéis OAuth. Contas sociais e Integrações apontam para o mesmo painel. Contas de anúncios é uma página de orientação + CTA para esse painel.

---

## 3. O que mudou

| Área | Mudança |
|------|---------|
| Menu | `Configurações` `keepGroup`; Marca sai do top-level Marketing |
| Hub `/marketing/settings` | Cards Marca / Contas sociais / Contas de anúncios / Integrações (+ atalho Ads) |
| `/marketing/settings/ad-accounts` | Página thin (sem OAuth) |
| `/marketing/settings/integrations` | 301 → `/settings/integrations` |
| `/ads/settings` | 301 → `/marketing/settings` |
| Brand Center | Breadcrumb Marketing → Configurações → Marca |

---

## 4. O que NÃO fazer nesta etapa

- Não recriar OAuth / tokens / providers
- Não remover o tile Ads nem as rotas `/ads*`
- Não 301 `/ads` → `/marketing/ads`
- Não migrations / Graph / MCP

---

## 5. Arquivos

**Criados**

- `pages/marketing/settings/ad-accounts.vue`
- `pages/marketing/settings/integrations.vue`
- `pages/ads/settings.vue`
- `docs/marketing-ads-brand-reorg/ETAPA-5-CONFIGURACOES.md` (este arquivo)

**Modificados**

- `constants/menus.ts`
- `constants/ads-domain.ts`
- `constants/marketing-audience.ts`
- `pages/marketing/settings.vue`
- `pages/marketing/brand.vue`
- `tests/workspace-guard.test.ts`
- `tests/nav-flatten.test.ts`
- `tests/ads-brand.test.ts`

**Migrations:** nenhuma.

---

## 6. Testes

```bash
pnpm exec vitest run tests/workspace-guard.test.ts tests/nav-flatten.test.ts tests/ads-brand.test.ts tests/ads-shell.test.ts
```

---

## 7. PRÓXIMA ETAPA

**ETAPA 6 — Retirar Ads como produto principal** (seletor, menu top-level, hub tiles). Manter domínio técnico, APIs e capabilities.
