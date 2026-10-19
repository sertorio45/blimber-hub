-- Legacy article import. Run after `20261019120000_cms_migrate_articles.sql`.
-- The script always rolls back. Article id sequences are not used (explicit ids).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cms_article_migration.sql
--
-- Do not point DATABASE_URL at a remote project you cannot roll back.
-- A failing expectation raises and aborts the transaction.

BEGIN;

CREATE FUNCTION pg_temp.expect(p_label text, p_condition boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_condition IS NOT TRUE THEN
    RAISE EXCEPTION 'CMS MIGRATION FAILED: %', p_label;
  END IF;
END;
$$;

CREATE TEMP TABLE mig_ids AS
SELECT
  '00000000-0000-4000-8000-00000000d101'::uuid AS tenant_a,
  '00000000-0000-4000-8000-00000000d102'::uuid AS tenant_b;

INSERT INTO public.tenant (id, name, slug, is_active)
SELECT t.id, t.name, t.slug, true
FROM mig_ids m,
LATERAL (VALUES
  (m.tenant_a, 'Migração A', 'cms-p2-mig-a'),
  (m.tenant_b, 'Q7', 'q7')
) AS t(id, name, slug);

-- Short slug must still produce a valid site_key once the tenant has content.
INSERT INTO public.articles_category (id, tenant_id, title, slug)
SELECT 2000001003, m.tenant_b, 'Curta', 'curta'
FROM mig_ids m;

INSERT INTO public.articles_category (id, tenant_id, title, slug, description, publish_status)
SELECT 2000001001, m.tenant_a, 'Ação', 'acao', 'Descrição que não tem coluna no CMS', 'published'
FROM mig_ids m;

INSERT INTO public.articles_tag (id, tenant_id, title, slug, publish_status)
SELECT 2000001002, m.tenant_a, 'Destaque', 'destaque', 'draft'
FROM mig_ids m;

-- Published HTML, a duplicate slug, and statuses that must stay unpublished.
INSERT INTO public.articles (
  id, tenant_id, title, slug, content, meta_description, publish_status,
  category_id, thumb_url, created_at, update_at
)
SELECT a.id, m.tenant_a, a.title, a.slug, a.content, a.meta, a.status::public.publish_status,
       a.category_id, '', a.created_at, a.update_at
FROM mig_ids m,
LATERAL (VALUES
  (2000001101, 'Guia', 'guia', '<p>Olá <strong>mundo</strong></p>', 'Resumo do guia', 'published', 2000001001,
    '2024-01-02 03:04:05+00'::timestamptz, '2024-02-03 04:05:06+00'::timestamptz),
  (2000001102, 'Guia cópia', 'guia', '<p>Segundo</p>', NULL, 'published', NULL,
    '2024-03-01 00:00:00+00'::timestamptz, NULL),
  (2000001103, 'Rascunho', 'rascunho', '<p>Ainda não</p>', NULL, 'draft', NULL,
    '2024-04-01 00:00:00+00'::timestamptz, NULL),
  (2000001104, 'Agendado', 'agendado', '<p>Futuro</p>', NULL, 'scheduled', NULL,
    '2024-05-01 00:00:00+00'::timestamptz, NULL),
  (2000001105, 'Arquivado', 'arquivado', '<p>Velho</p>', NULL, 'arquived', NULL,
    '2024-06-01 00:00:00+00'::timestamptz, NULL),
  (2000001106, 'Sem status', NULL, '<p>Sem status</p>', NULL, NULL, NULL,
    '2024-07-01 00:00:00+00'::timestamptz, NULL)
) AS a(id, title, slug, content, meta, status, category_id, created_at, update_at);

INSERT INTO public.articles (id, title, slug, content, thumb_url, publish_status)
VALUES (2000001107, 'Órfão de tenant', 'orfao', '<p>Sem empresa</p>', '', 'published');

INSERT INTO public.articles_tag_relations (id, article_id, tag_id, tenant_id)
SELECT 2000001201, 2000001101, 2000001002, m.tenant_a
FROM mig_ids m;

-- Broken relation: tag from nowhere.
INSERT INTO public.articles_tag_relations (id, article_id, tag_id, tenant_id)
SELECT 2000001202, 2000001101, NULL, m.tenant_a
FROM mig_ids m;

SELECT public.cms_migrate_legacy_articles(NULL) AS report
INTO TEMP first_report;

SELECT pg_temp.expect(
  'one tenant site created for the company with content',
  (SELECT (report ->> 'sites_created')::int >= 1 FROM first_report)
);

SELECT pg_temp.expect(
  'published, draft, scheduled, archived and null status are all mapped',
  (SELECT (report ->> 'articles_mapped')::int >= 6 FROM first_report)
);

SELECT pg_temp.expect(
  'only publish_status = published is live',
  (
    SELECT count(*) = 2
    FROM public.cms_documents d
    JOIN public.cms_legacy_map map ON map.document_id = d.id
    JOIN mig_ids m ON map.tenant_id = m.tenant_a
    WHERE map.legacy_table = 'articles'
      AND d.public_status = 'published'
  )
);

SELECT pg_temp.expect(
  'non-published statuses have no revision and no route',
  (
    SELECT count(*) = 4
    FROM public.cms_documents d
    JOIN public.cms_legacy_map map ON map.document_id = d.id
    JOIN mig_ids m ON map.tenant_id = m.tenant_a
    WHERE map.legacy_table = 'articles'
      AND map.legacy_id IN ('2000001103', '2000001104', '2000001105', '2000001106')
      AND d.public_status = 'unpublished'
      AND d.published_revision_id IS NULL
      AND d.workflow_status = 'draft'
      AND NOT EXISTS (
        SELECT 1 FROM public.cms_routes r WHERE r.document_id = d.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cms_revisions rv WHERE rv.document_id = d.id
      )
  )
);

SELECT pg_temp.expect(
  'HTML body is preserved and blocks stay empty',
  (
    SELECT d.draft_payload ->> 'body' = '<p>Olá <strong>mundo</strong></p>'
       AND d.draft_payload -> 'blocks' = '[]'::jsonb
       AND d.draft_payload -> 'cover' = 'null'::jsonb
       AND d.draft_payload ->> 'excerpt' = 'Resumo do guia'
       AND d.kind = 'publication'
       AND d.publication_type = 'article'
       AND d.published_at = '2024-02-03 04:05:06+00'::timestamptz
    FROM public.cms_documents d
    JOIN public.cms_legacy_map map ON map.document_id = d.id
    WHERE map.legacy_table = 'articles' AND map.legacy_id = '2000001101'
  )
);

SELECT pg_temp.expect(
  'published article is routed under /artigos and keeps its category and tag',
  (
    SELECT r.path = '/artigos/guia'
       AND rv.reason = 'publish'
       AND rv.snapshot ->> 'body' = '<p>Olá <strong>mundo</strong></p>'
       AND (
         SELECT count(*)
         FROM public.cms_revision_terms rt
         WHERE rt.revision_id = rv.id
       ) = 2
    FROM public.cms_legacy_map map
    JOIN public.cms_documents d ON d.id = map.document_id
    JOIN public.cms_revisions rv ON rv.id = d.published_revision_id
    JOIN public.cms_routes r ON r.document_id = d.id AND r.route_kind = 'document'
    WHERE map.legacy_table = 'articles' AND map.legacy_id = '2000001101'
  )
);

SELECT pg_temp.expect(
  'duplicate slug receives the legacy id suffix',
  (
    SELECT d.slug = 'guia-2000001102' AND r.path = '/artigos/guia-2000001102'
    FROM public.cms_legacy_map map
    JOIN public.cms_documents d ON d.id = map.document_id
    JOIN public.cms_routes r ON r.document_id = d.id AND r.route_kind = 'document'
    WHERE map.legacy_table = 'articles' AND map.legacy_id = '2000001102'
  )
);

SELECT pg_temp.expect(
  'category description is not required and the term slug is normalized',
  (
    SELECT t.slug = 'acao' AND t.name = 'Ação'
    FROM public.cms_legacy_map map
    JOIN public.cms_terms t ON t.id = map.term_id
    JOIN mig_ids m ON map.tenant_id = m.tenant_a
    WHERE map.legacy_table = 'articles_category' AND map.legacy_id = '2000001001'
  )
);

SELECT pg_temp.expect(
  'short tenant slug becomes a valid site key',
  (
    SELECT s.site_key = 'q7-site'
    FROM public.cms_sites s
    JOIN mig_ids m ON s.tenant_id = m.tenant_b
  )
);

SELECT pg_temp.expect(
  'article without a tenant is not mapped',
  NOT EXISTS (
    SELECT 1 FROM public.cms_legacy_map map
    WHERE map.legacy_table = 'articles' AND map.legacy_id = '2000001107'
  )
);

-- Second run must not create another document for the same legacy id.
SELECT public.cms_migrate_legacy_articles((SELECT tenant_a FROM mig_ids)) AS report
INTO TEMP second_report;

SELECT pg_temp.expect(
  're-run maps nothing new for the tenant',
  (
    SELECT (report ->> 'articles_mapped')::int = 0
       AND (report ->> 'articles_skipped_mapped')::int = 6
       AND (report ->> 'categories_skipped')::int = 1
       AND (report ->> 'tags_skipped')::int = 1
       AND (report ->> 'sites_created')::int = 0
    FROM second_report
  )
);

SELECT pg_temp.expect(
  're-run does not duplicate documents',
  (
    SELECT count(*) = 6
    FROM public.cms_legacy_map map
    JOIN mig_ids m ON map.tenant_id = m.tenant_a
    WHERE map.legacy_table = 'articles'
  )
);

ROLLBACK;
