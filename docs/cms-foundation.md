# CMS Blimber — Fundação (Fases 0–1)

Branch de trabalho: `feat/cms-foundation`.

## O que esta entrega inclui

- **Módulo comercial `cms`**, com alias técnico bidirecional para `article`.
- **Capabilities** `cms.*` e presets de cargos (Autor, Editor, Publicador, Administrador do site).
- **Schema** (`cms_sites`, `cms_documents`, `cms_revisions`, rotas, taxonomias, usos de mídia, auditoria, mapa legado) com RLS e RPCs `cms_publish_revision` / `cms_unpublish_document` (somente `service_role`).
- **Estado público e rotas** escritas apenas pelas RPCs: `authenticated` não altera `public_status` nem `cms_routes` diretamente.
- **Hardening dos artigos legados**: tenant só do contexto, isolamento por empresa, `category_id` e `meta_description` corrigidos, TinyMCE client-only.
- **Mídia compartilhada** entre Marketing e CMS (`server/utils/media/*`, `/api/cms/media`).
- **APIs administrativas** `/api/cms/**` e **entrega pública** `/api/public/cms/v1/**`.
- **Painel** `/cms` (visão geral, páginas, publicações, editor simples com autosave, mídia, configurações).

## Fora desta entrega

Editor rico de publicações, construtor de blocos, migração dos dados de artigos, preview/SEO/cache do site público, agendamento, webhooks e coleções.

## Migrations (ainda não aplicadas em produção)

1. `supabase/migrations/20261019100000_cms_foundation.sql`
2. `supabase/migrations/20261019110000_cms_module_entitlement.sql`

Ordem: foundation primeiro, entitlement depois.

Validação local da foundation (PGlite) e `supabase/tests/cms_rls.sql` passaram em ambiente simulado. **Antes de produção:** aplicar numa branch Supabase de desenvolvimento e rodar:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cms_rls.sql
```

## Contratos compartilhados

- Tipos e Zod: [`lib/cms/contracts.ts`](../lib/cms/contracts.ts)
- Documentação de schema: [`docs/cms-schema.md`](./cms-schema.md)

## Como publicar (servidor)

1. Autorizar com `requireCmsContext` + `cms.publish`.
2. Validar o rascunho (`cmsPublishablePayloadSchema`).
3. Chamar `cms_publish_revision(document_id, expected_version, actor)`.
4. A API pública só lê revisão publicada; nunca `draft_payload`.

## Painel

Rotas: `/cms`, `/cms/pages`, `/cms/publications`, `/cms/documents/:id`, `/cms/media`, `/cms/settings`.

O seletor de site só aparece quando há mais de um. Trocar de empresa cancela requisições CMS em voo e invalida o cache da empresa anterior.
