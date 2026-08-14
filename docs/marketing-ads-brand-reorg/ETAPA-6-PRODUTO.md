# ETAPA 6 — Retirar Ads como produto principal

**Data:** 2026-08-14  
**Escopo:** Ads deixa de ser tile/produto comercial. Continua domínio técnico + submenu de Marketing.  
**Não inclui:** 301 `/ads` → `/marketing/ads` (Etapa 7), limpeza ampla de copy (Etapa 8), migrations, OAuth, Graph/MCP.

Documento anterior: `ETAPA-5-CONFIGURACOES.md`.

---

## 1. Objetivo

O usuário percebe:

```
CRM
Inbox / WhatsApp
Marketing
```

e **não** percebe Ads como irmão no seletor, hub ou menu principal.

Ads permanece em `components/ads`, `composables/ads`, APIs `/api/marketing/*` e `/api/gpt/meta/*`.

---

## 2. O que mudou

| Área | Mudança |
|------|---------|
| `constants/menus.ts` | Removido o grupo top-level Ads (`/ads*`) |
| `resolveTenantModuleSlugs` | Sem companion `ads`; bundle `all` = 4 slugs comerciais |
| Switcher / hub | Filtra `ads`; `/ads*` resolve para módulo Marketing |
| `MODULE_META.ads` | Mantido só como metadado técnico/legado |
| Copy Marketing | “Conteúdo, calendário, Ads e aprovações” |

Rotas `/ads*` **ainda existem** (cutover na Etapa 7). Sidebar nesses bookmarks mostra o menu Marketing.

---

## 3. O que NÃO fazer nesta etapa

- Não apagar `pages/ads/*`, composables, types, GPT/MCP
- Não redirects 301 (Etapa 7)
- Não migrations / capabilities `ads.*`
- Não alterar Graph API

---

## 4. Arquivos

**Criados**

- `docs/marketing-ads-brand-reorg/ETAPA-6-PRODUTO.md` (este arquivo)

**Modificados**

- `constants/menus.ts`
- `constants/modules.ts`
- `composables/useModule.ts`
- `composables/useHubHome.ts`
- `tests/tenant-modules.test.ts`
- `tests/workspace-guard.test.ts`

**Migrations:** nenhuma.

---

## 5. Testes

```bash
pnpm exec vitest run tests/tenant-modules.test.ts tests/workspace-guard.test.ts tests/nav-flatten.test.ts
```

---

## 6. PRÓXIMA ETAPA

**ETAPA 7 — Redirects** `/ads` → `/marketing/ads` (e equivalentes), settings → destino da Etapa 5. Sem loop.
