# Migração de artigos legados para o CMS

A migration `supabase/migrations/20261019120000_cms_migrate_articles.sql` copia o conteúdo antigo para publicações do CMS. Ela é idempotente: um id já presente em `cms_legacy_map` não é inserido de novo.

O endpoint `POST /api/cms/migrations/articles` chama a mesma função e devolve os contadores. Exige `cms.settings.manage`. Staff (`admin` / `funcionario`) também pode chamar, porque esse papel recebe todas as capabilities. Sem `tenantId`, a empresa selecionada no workspace é usada. Staff pode enviar `{ "tenantId": null }` para importar todas as empresas.

As tabelas legadas não são apagadas.

## O que é copiado

| Origem | Destino |
|---|---|
| Empresa com artigo, categoria ou tag e sem site | `cms_sites` com `site_key` derivado do slug da empresa (senão do nome). Site já existente é reutilizado (o mais antigo). |
| `articles_category` | Taxonomia `kind = category` (`categorias`) e um `cms_terms` |
| `articles_tag` | Taxonomia `kind = tag` (`tags`) e um `cms_terms` |
| `articles` com `tenant_id` | `cms_documents` `kind = publication`, `publication_type = article` |
| `articles_tag_relations` e `articles.category_id` | `draft_payload.termIds`; na revisão publicada, também `cms_revision_terms` |

Só `publish_status = 'published'` ganha revisão (`reason = publish`), rota e `public_status = published`. `draft`, `scheduled`, `arquived` e `NULL` ficam como rascunho não publicado. Status não é inferido.

O HTML de `articles.content` vai para `draft_payload.body` sem conversão para blocos (`blocks` fica `[]`).

Rota padrão do artigo publicado: `/artigos/{slug}`. Se o site reutilizado tiver `settings.routes.article`, o prefixo é esse (o mesmo caminho que `cms_publish_revision` monta). Slug repetido no site ganha o id legado: `guia`, depois `guia-15`.

`published_at` usa `update_at` e, se estiver vazio, `created_at`. Artigos não têm coluna `published_at`.

## O que não entra no payload

- `thumb_url` não é id de `media_assets`. `cover` fica `null`. A URL continua em `articles.thumb_url`.
- `articles_category.description` e `articles_tag.description` não têm coluna em `cms_terms`.
- `author_id` só vira `created_by` quando o uuid existe em `auth.users`. Não é criado `cms_authors`.
- Artigo com `tenant_id` nulo, ou apontando para empresa que não existe, não vira documento.
- Relação de tag sem artigo, sem tag, ou com empresa diferente, é contada em `relations_skipped` e não entra em `termIds`.

`cms_legacy_map.document_id` era obrigatório. A migration torna a coluna anulável e adiciona `term_id` para categorias e tags. Uma linha aponta ou para um documento ou para um termo.

Apagar o documento (ou o termo) apaga a linha do mapa, por `ON DELETE CASCADE`. A próxima execução importa aquele id de novo.

## Conferência

Rode depois de aplicar a migration. Os números da esquerda e da direita precisam fechar.

```sql
-- Artigos com empresa = documentos mapeados
SELECT count(*) AS legacy_with_tenant
FROM public.articles
WHERE tenant_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.tenant t WHERE t.id = articles.tenant_id);

SELECT count(*) AS mapped_articles
FROM public.cms_legacy_map
WHERE legacy_table = 'articles';

-- Publicados no legado = publicados no CMS
SELECT count(*) AS legacy_published
FROM public.articles
WHERE publish_status = 'published' AND tenant_id IS NOT NULL;

SELECT count(*) AS cms_published
FROM public.cms_documents d
JOIN public.cms_legacy_map m ON m.document_id = d.id
WHERE m.legacy_table = 'articles' AND d.public_status = 'published';

-- Qualquer outro status continua fora do ar
SELECT count(*) AS legacy_not_published
FROM public.articles
WHERE tenant_id IS NOT NULL
  AND publish_status IS DISTINCT FROM 'published';

SELECT count(*) AS cms_unpublished
FROM public.cms_documents d
JOIN public.cms_legacy_map m ON m.document_id = d.id
WHERE m.legacy_table = 'articles' AND d.public_status = 'unpublished';

-- HTML de amostra
SELECT a.id, a.content = d.draft_payload ->> 'body' AS body_matches
FROM public.articles a
JOIN public.cms_legacy_map m ON m.legacy_table = 'articles' AND m.legacy_id = a.id::text
JOIN public.cms_documents d ON d.id = m.document_id
ORDER BY a.id
LIMIT 20;
```

Categorias e tags:

```sql
SELECT
  (SELECT count(*) FROM public.articles_category) AS legacy_categories,
  (SELECT count(*) FROM public.cms_legacy_map WHERE legacy_table = 'articles_category') AS mapped_categories,
  (SELECT count(*) FROM public.articles_tag) AS legacy_tags,
  (SELECT count(*) FROM public.cms_legacy_map WHERE legacy_table = 'articles_tag') AS mapped_tags;
```

Uma categoria cuja empresa não tem site só entra se a empresa também tiver artigo, categoria ou tag — o que já a inclui. O que fica de fora de propósito é artigo sem `tenant_id`.

## Teste SQL

`supabase/tests/cms_article_migration.sql` cobre HTML, slug repetido, status que não publicam e a segunda execução. Termina com `ROLLBACK`.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cms_article_migration.sql
```

Os helpers de slug, payload e escopo do endpoint estão em `tests/cms-legacy-article-migration.test.ts` (`pnpm test tests/cms-legacy-article-migration.test.ts`).

## Contadores do endpoint

| Campo | Significado |
|---|---|
| `tenants` | Empresas com conteúdo legado e linha em `tenant` |
| `sitesCreated` / `sitesReused` | Site padrão criado agora, ou site que já existia |
| `taxonomiesCreated` | Taxonomias `categorias` / `tags` criadas nesta execução |
| `categoriesMapped` / `tagsMapped` | Termos novos |
| `categoriesSkipped` / `tagsSkipped` | Já estavam no mapa |
| `articlesMapped` | Documentos criados nesta execução |
| `articlesPublished` / `articlesDrafted` | Desses, os que foram ao ar e os que ficaram rascunho |
| `articlesSkippedMapped` | Artigos que já estavam no mapa |
| `articlesSkippedNoTenant` | `articles.tenant_id` nulo (só na execução global) |
| `articlesSkippedOrphan` | `tenant_id` preenchido, empresa inexistente |
| `relationsLinked` | Tags válidas gravadas em `termIds` |
| `relationsSkipped` | Relações incompletas ou de outra empresa |
