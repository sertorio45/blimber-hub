# CMS — esquema Postgres

Migrations: `supabase/migrations/20261019100000_cms_foundation.sql`, `supabase/migrations/20261019110000_cms_module_entitlement.sql`, `supabase/migrations/20261019120000_cms_event_outbox.sql`
Testes: `supabase/tests/cms_rls.sql` (`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cms_rls.sql`)

Nomes de tabelas e RPCs seguem `CMS_TABLES` / `CMS_RPC` em `lib/cms/contracts.ts`; colunas são o snake_case dos campos do contrato.

## Tabelas

| Tabela | Papel |
|---|---|
| `cms_sites` | Site por tenant; `site_key` público e único; prefixos de rota em `settings.routes.article` (padrão `artigos`) e `settings.routes.news` (padrão `noticias`). |
| `cms_site_domains` | Hostnames (minúsculos, únicos globalmente), um primário por ambiente. |
| `cms_authors` | Autores por site; avatar opcional em `media_assets`. |
| `cms_documents` | Páginas e publicações (artigo/notícia); rascunho em `draft_payload`, lock otimista em `edit_version`, lixeira em `deleted_at`. Uma home por site/locale. |
| `cms_revisions` | Snapshots imutáveis (append-only). |
| `cms_routes` | Caminhos públicos canônicos por site/locale (`document`, `reserved`, `redirect`). |
| `cms_taxonomies` / `cms_terms` / `cms_revision_terms` | Categorias e tags; termos vinculados à revisão publicada. |
| `cms_asset_usages` | Onde cada mídia é usada (`draft`, `revision`, `global`). Bloqueia excluir mídia em uso. |
| `cms_audit_events` | Trilha de auditoria append-only (referências "soft" para sobreviver a exclusões). |
| `cms_event_outbox` | Fila de invalidação do site público. Um trigger copia auditorias `publish` e `unpublish`; o payload é só o metadata da auditoria. Entrega do webhook ainda não existe. |
| `cms_legacy_map` | De-para do conteúdo legado para documentos. |

## Integridade entre tenants

Filhos referenciam pais por chaves compostas com `tenant_id` (e `site_id`), inclusive `media_assets (id, tenant_id)`. Assim, nem o service role consegue gravar uma linha apontando para site, documento, revisão, termo ou mídia de outro tenant. Em `cms_audit_events` a mesma verificação é feita por trigger no INSERT.

## Histórico imutável

`cms_revisions` e `cms_audit_events` rejeitam UPDATE e DELETE (`P0403`). O DELETE só passa quando o dono está sendo removido (cascade de tenant, site ou documento). Retenção: revisões vivem enquanto o documento existir; a auditoria vive enquanto o tenant existir.

## RLS

- Admin/Funcionário (`app_metadata.role`) e qualquer usuário com papel no tenant (direto ou via organização/agência) acessam via `private.user_has_tenant_access(tenant_id)`.
- Tabelas mutáveis: política `FOR ALL`. Revisões e auditoria: apenas SELECT e INSERT.
- `anon` sem nenhum privilégio; `TRUNCATE` revogado de `authenticated`.
- A entrega pública roda no servidor com service role.

## RPCs (somente `service_role`)

- `cms_publish_revision(p_document_id uuid, p_expected_version integer, p_actor uuid) → jsonb {revision_id, revision_number, path, published_at}`
- `cms_unpublish_document(p_document_id uuid, p_actor uuid) → jsonb {document_id, public_status, removed_paths}`
- `cms_normalize_path(text) → text` (imutável; também liberada para `authenticated`)

| SQLSTATE | Código do contrato | Quando |
|---|---|---|
| `P0404` | `not_found` | Documento inexistente ou na lixeira |
| `P0409` | `version_conflict` | `edit_version` ≠ esperado; DETAIL = `CmsVersionConflictDetails` em JSON |
| `P0410` | `route_conflict` | Caminho ocupado por outro documento ou reservado; DETAIL = `{path, documentId}` |
| `P0422` | `validation_failed` | Título/slug inválido, pai não publicado, termo de outro site; DETAIL = `{field, reason}` |
| `P0403` | — | Tentativa de alterar revisão/auditoria |

Regras de caminho: home → `/`; página → `/slug` ou `<rota do pai>/slug` (pai precisa estar publicado); publicação → `/<prefixo>/slug`. Ao mudar o caminho, o antigo vira `redirect` para o documento; redirects antigos de qualquer documento são assumidos por uma nova publicação no mesmo caminho.
