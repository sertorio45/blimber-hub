-- CMS foundation: tenant isolation, integrity constraints and publish RPCs.
--
-- RLS assertions run as the `authenticated` / `anon` database roles, so only the
-- policies and the `private.*` predicates decide what is visible. RPC assertions
-- run as `service_role`, the only role allowed to execute them. Everything
-- happens inside a transaction that is always rolled back, which makes the
-- script safe to run against any environment.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cms_rls.sql
--
-- A failing expectation raises an exception, aborting the transaction and
-- returning a non-zero exit code.

BEGIN;

-- ---------------------------------------------------------------------------
-- Harness
-- ---------------------------------------------------------------------------

CREATE FUNCTION pg_temp.expect(p_label text, p_condition boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_condition IS NOT TRUE THEN
    RAISE EXCEPTION 'CMS FALHOU: %', p_label;
  END IF;
END;
$$;

-- Runs a statement that must fail with the given SQLSTATE.
CREATE FUNCTION pg_temp.expect_error(p_label text, p_sql text, p_sqlstate text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = p_sqlstate THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'CMS FALHOU: % (esperado %, recebido %: %)', p_label, p_sqlstate, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'CMS FALHOU: % (nenhum erro, esperado %)', p_label, p_sqlstate;
END;
$$;

-- Impersonates a user the same way GoTrue does, through the request claims.
CREATE FUNCTION pg_temp.login(p_user uuid, p_global_role text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_user::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', p_global_role)
    )::text,
    true
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE fixture_ids AS
SELECT
  '00000000-0000-4000-8000-0000000c0001'::uuid AS staff,
  '00000000-0000-4000-8000-0000000c0002'::uuid AS client_a,
  '00000000-0000-4000-8000-0000000c0003'::uuid AS client_b,
  '00000000-0000-4000-8000-0000000ca101'::uuid AS tenant_a,
  '00000000-0000-4000-8000-0000000cb101'::uuid AS tenant_b,
  '00000000-0000-4000-8000-0000000ca201'::uuid AS site_a,
  '00000000-0000-4000-8000-0000000cb201'::uuid AS site_b,
  '00000000-0000-4000-8000-0000000ca301'::uuid AS doc_a_home,
  '00000000-0000-4000-8000-0000000ca302'::uuid AS doc_a_about,
  '00000000-0000-4000-8000-0000000ca303'::uuid AS doc_a_about_dup,
  '00000000-0000-4000-8000-0000000ca304'::uuid AS doc_a_article,
  '00000000-0000-4000-8000-0000000ca305'::uuid AS doc_a_client,
  '00000000-0000-4000-8000-0000000cb301'::uuid AS doc_b_page,
  '00000000-0000-4000-8000-0000000ca401'::uuid AS taxonomy_a,
  '00000000-0000-4000-8000-0000000ca501'::uuid AS term_a,
  '00000000-0000-4000-8000-0000000cb401'::uuid AS taxonomy_b,
  '00000000-0000-4000-8000-0000000cb501'::uuid AS term_b,
  '00000000-0000-4000-8000-0000000cb601'::uuid AS asset_b;

-- The assertions below run as other roles, which still need to read the ids.
GRANT SELECT ON fixture_ids TO authenticated, anon, service_role;

INSERT INTO auth.users (id)
SELECT unnest(ARRAY[staff, client_a, client_b]) FROM fixture_ids;

INSERT INTO public.tenant (id, name, slug, is_active)
SELECT t.id, t.name, t.slug, true
FROM fixture_ids f,
LATERAL (VALUES
  (f.tenant_a, 'CMS Cliente A', 'cms-rls-cliente-a'),
  (f.tenant_b, 'CMS Cliente B', 'cms-rls-cliente-b')
) AS t(id, name, slug);

INSERT INTO public.user_tenant_role (user_id, tenant_id, role)
SELECT u.user_id, u.tenant_id, 'cliente'::public.app_role
FROM fixture_ids f,
LATERAL (VALUES (f.client_a, f.tenant_a), (f.client_b, f.tenant_b)) AS u(user_id, tenant_id);

INSERT INTO public.cms_sites (id, tenant_id, site_key, name, settings)
SELECT s.id, s.tenant_id, s.site_key, s.name, s.settings
FROM fixture_ids f,
LATERAL (VALUES
  (f.site_a, f.tenant_a, 'cms-rls-site-a', 'Site A', '{}'::jsonb),
  (f.site_b, f.tenant_b, 'cms-rls-site-b', 'Site B', '{"routes":{"news":"imprensa"}}'::jsonb)
) AS s(id, tenant_id, site_key, name, settings);

INSERT INTO public.cms_documents (id, tenant_id, site_id, kind, publication_type, is_home, draft_payload)
SELECT d.id, d.tenant_id, d.site_id, d.kind, d.publication_type, d.is_home, d.payload
FROM fixture_ids f,
LATERAL (VALUES
  (f.doc_a_home, f.tenant_a, f.site_a, 'page', NULL, true,
    '{"title":"Início"}'::jsonb),
  (f.doc_a_about, f.tenant_a, f.site_a, 'page', NULL, false,
    '{"title":"Sobre","slug":"sobre"}'::jsonb),
  (f.doc_a_about_dup, f.tenant_a, f.site_a, 'page', NULL, false,
    '{"title":"Sobre (cópia)","slug":"sobre"}'::jsonb),
  (f.doc_a_article, f.tenant_a, f.site_a, 'publication', 'article', false,
    jsonb_build_object('title', 'Lançamento', 'slug', 'lancamento', 'termIds', jsonb_build_array(f.term_a))),
  (f.doc_b_page, f.tenant_b, f.site_b, 'publication', 'news', false,
    '{"title":"Nota B","slug":"nota-b"}'::jsonb)
) AS d(id, tenant_id, site_id, kind, publication_type, is_home, payload);

INSERT INTO public.cms_taxonomies (id, tenant_id, site_id, kind, name, slug)
SELECT t.id, t.tenant_id, t.site_id, 'category', t.name, 'geral'
FROM fixture_ids f,
LATERAL (VALUES
  (f.taxonomy_a, f.tenant_a, f.site_a, 'Categorias A'),
  (f.taxonomy_b, f.tenant_b, f.site_b, 'Categorias B')
) AS t(id, tenant_id, site_id, name);

INSERT INTO public.cms_terms (id, tenant_id, site_id, taxonomy_id, name, slug)
SELECT t.id, t.tenant_id, t.site_id, t.taxonomy_id, 'Notícias', 'noticias'
FROM fixture_ids f,
LATERAL (VALUES
  (f.term_a, f.tenant_a, f.site_a, f.taxonomy_a),
  (f.term_b, f.tenant_b, f.site_b, f.taxonomy_b)
) AS t(id, tenant_id, site_id, taxonomy_id);

INSERT INTO public.media_assets (id, tenant_id, name, object_path, mime_type, created_by)
SELECT asset_b, tenant_b, 'cms-rls.png', 'cms-rls/' || asset_b::text || '.png', 'image/png', client_b
FROM fixture_ids;

-- ---------------------------------------------------------------------------
-- Tenant isolation (RLS)
-- ---------------------------------------------------------------------------

SET LOCAL ROLE authenticated;

-- Cliente: CRUD apenas no próprio tenant.
SELECT pg_temp.login(client_a, NULL) FROM fixture_ids;

SELECT pg_temp.expect(
  'cliente A vê o próprio site',
  (SELECT count(*) FROM public.cms_sites s, fixture_ids f WHERE s.id = f.site_a) = 1
);
SELECT pg_temp.expect(
  'cliente A não vê o site do tenant B',
  (SELECT count(*) FROM public.cms_sites s, fixture_ids f WHERE s.id = f.site_b) = 0
);
SELECT pg_temp.expect(
  'cliente A não vê documentos do tenant B',
  (SELECT count(*) FROM public.cms_documents d, fixture_ids f WHERE d.tenant_id = f.tenant_b) = 0
);

INSERT INTO public.cms_documents (id, tenant_id, site_id, kind, title, slug, created_by)
SELECT doc_a_client, tenant_a, site_a, 'page', 'Contato', 'contato', client_a FROM fixture_ids;

UPDATE public.cms_documents d
SET title = 'Fale conosco', edit_version = d.edit_version + 1
FROM fixture_ids f
WHERE d.id = f.doc_a_client;

SELECT pg_temp.expect(
  'cliente A cria e edita documento no próprio site',
  (SELECT d.title = 'Fale conosco' AND d.edit_version = 1
   FROM public.cms_documents d, fixture_ids f WHERE d.id = f.doc_a_client)
);

UPDATE public.cms_sites s SET name = 'Site A (editado)' FROM fixture_ids f WHERE s.id = f.site_a;
UPDATE public.cms_sites s SET name = 'Invadido' FROM fixture_ids f WHERE s.id = f.site_b;

SELECT pg_temp.expect(
  'cliente A edita o próprio site',
  (SELECT s.name = 'Site A (editado)' FROM public.cms_sites s, fixture_ids f WHERE s.id = f.site_a)
);

SELECT pg_temp.expect_error(
  'cliente A não insere documento no tenant B',
  $sql$
    INSERT INTO public.cms_documents (tenant_id, site_id, kind, title)
    SELECT tenant_b, site_b, 'page', 'Invasão' FROM fixture_ids
  $sql$,
  '42501'
);

INSERT INTO public.cms_revisions (tenant_id, site_id, document_id, revision_number, snapshot, reason, created_by)
SELECT tenant_a, site_a, doc_a_client, 1, '{"title":"Fale conosco"}'::jsonb, 'checkpoint', client_a
FROM fixture_ids;

SELECT pg_temp.expect(
  'cliente A cria checkpoint de revisão',
  (SELECT count(*) FROM public.cms_revisions r, fixture_ids f WHERE r.document_id = f.doc_a_client) = 1
);
SELECT pg_temp.expect_error(
  'cliente A não altera revisões',
  'UPDATE public.cms_revisions SET reason = ''restore''',
  '42501'
);
SELECT pg_temp.expect_error(
  'cliente A não apaga eventos de auditoria',
  'DELETE FROM public.cms_audit_events',
  '42501'
);
SELECT pg_temp.expect_error(
  'cliente A não executa o RPC de publicação',
  $sql$ SELECT public.cms_publish_revision(doc_a_client, 1, client_a) FROM fixture_ids $sql$,
  '42501'
);

-- Cliente B continua isolado do tenant A.
SELECT pg_temp.login(client_b, NULL) FROM fixture_ids;

SELECT pg_temp.expect(
  'cliente B não vê documentos do tenant A',
  (SELECT count(*) FROM public.cms_documents d, fixture_ids f WHERE d.tenant_id = f.tenant_a) = 0
);
SELECT pg_temp.expect(
  'cliente B não vê revisões do tenant A',
  (SELECT count(*) FROM public.cms_revisions r, fixture_ids f WHERE r.tenant_id = f.tenant_a) = 0
);

-- Staff (admin/funcionario em app_metadata): todos os tenants.
SELECT pg_temp.login(staff, 'funcionario') FROM fixture_ids;

SELECT pg_temp.expect(
  'staff vê os sites dos dois tenants',
  (SELECT count(*) FROM public.cms_sites s, fixture_ids f WHERE s.id IN (f.site_a, f.site_b)) = 2
);
SELECT pg_temp.expect(
  'staff vê documentos dos dois tenants',
  (SELECT count(DISTINCT d.tenant_id) FROM public.cms_documents d, fixture_ids f
   WHERE d.tenant_id IN (f.tenant_a, f.tenant_b)) = 2
);

-- user_metadata nunca concede acesso.
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', client_a::text,
    'role', 'authenticated',
    'user_metadata', json_build_object('role', 'admin')
  )::text,
  true
) FROM fixture_ids;

SELECT pg_temp.expect(
  'role em user_metadata não vira staff',
  (SELECT count(*) FROM public.cms_sites s, fixture_ids f WHERE s.id = f.site_b) = 0
);

RESET ROLE;

-- Anônimo: sem acesso direto às tabelas nem aos RPCs.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT pg_temp.expect_error(
  'anônimo não lê cms_sites',
  'SELECT count(*) FROM public.cms_sites',
  '42501'
);
SELECT pg_temp.expect_error(
  'anônimo não lê cms_routes',
  'SELECT count(*) FROM public.cms_routes',
  '42501'
);
SELECT pg_temp.expect_error(
  'anônimo não executa o RPC de publicação',
  $sql$ SELECT public.cms_publish_revision(doc_a_about, 0, NULL) FROM fixture_ids $sql$,
  '42501'
);

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Integrity (independent of RLS)
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect(
  'UPDATE do cliente A não alcançou o site do tenant B',
  (SELECT s.name = 'Site B' FROM public.cms_sites s, fixture_ids f WHERE s.id = f.site_b)
);

SELECT pg_temp.expect_error(
  'documento com tenant diferente do site é rejeitado',
  $sql$
    INSERT INTO public.cms_documents (tenant_id, site_id, kind)
    SELECT tenant_b, site_a, 'page' FROM fixture_ids
  $sql$,
  '23503'
);
SELECT pg_temp.expect_error(
  'publicação sem publication_type é rejeitada',
  $sql$
    INSERT INTO public.cms_documents (tenant_id, site_id, kind)
    SELECT tenant_a, site_a, 'publication' FROM fixture_ids
  $sql$,
  '23514'
);
SELECT pg_temp.expect_error(
  'página com publication_type é rejeitada',
  $sql$
    INSERT INTO public.cms_documents (tenant_id, site_id, kind, publication_type)
    SELECT tenant_a, site_a, 'page', 'news' FROM fixture_ids
  $sql$,
  '23514'
);
SELECT pg_temp.expect_error(
  'duas homes no mesmo site/locale são rejeitadas',
  $sql$
    INSERT INTO public.cms_documents (tenant_id, site_id, kind, is_home)
    SELECT tenant_a, site_a, 'page', true FROM fixture_ids
  $sql$,
  '23505'
);
SELECT pg_temp.expect_error(
  'rota fora do formato canônico é rejeitada',
  $sql$
    INSERT INTO public.cms_routes (tenant_id, site_id, path, route_kind)
    SELECT tenant_a, site_a, '/Sobre/', 'reserved' FROM fixture_ids
  $sql$,
  '23514'
);
SELECT pg_temp.expect_error(
  'uso de mídia de outro tenant é rejeitado',
  $sql$
    INSERT INTO public.cms_asset_usages (tenant_id, site_id, asset_id, usage_kind)
    SELECT tenant_a, site_a, asset_b, 'global' FROM fixture_ids
  $sql$,
  '23503'
);
SELECT pg_temp.expect_error(
  'auditoria apontando para documento de outro tenant é rejeitada',
  $sql$
    INSERT INTO public.cms_audit_events (tenant_id, action, document_id)
    SELECT tenant_a, 'test', doc_b_page FROM fixture_ids
  $sql$,
  '23503'
);
SELECT pg_temp.expect(
  'cms_normalize_path canoniza caminhos',
  public.cms_normalize_path('  //Blog//Artigos/ ') = '/blog/artigos'
    AND public.cms_normalize_path('') = '/'
    AND public.cms_normalize_path('/') = '/'
);

-- ---------------------------------------------------------------------------
-- Publish / unpublish RPCs (service role)
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE publish_result (r jsonb);
GRANT SELECT, INSERT ON publish_result TO service_role;

SET LOCAL ROLE service_role;

SELECT pg_temp.expect_error(
  'versão divergente gera version_conflict (P0409)',
  $sql$ SELECT public.cms_publish_revision(doc_a_about, 5, client_a) FROM fixture_ids $sql$,
  'P0409'
);

INSERT INTO publish_result
SELECT public.cms_publish_revision(doc_a_about, 0, client_a) FROM fixture_ids;

SELECT pg_temp.expect(
  'publicar retorna o caminho e a revisão 1',
  (SELECT r ->> 'path' = '/sobre' AND (r ->> 'revision_number')::int = 1
     AND r ->> 'revision_id' IS NOT NULL AND r ->> 'published_at' IS NOT NULL
   FROM publish_result)
);
SELECT pg_temp.expect(
  'publicar cria revisão imutável com motivo publish',
  (SELECT count(*) FROM public.cms_revisions rv, fixture_ids f
   WHERE rv.document_id = f.doc_a_about AND rv.reason = 'publish') = 1
);
SELECT pg_temp.expect(
  'publicar cria a rota do documento',
  (SELECT count(*) FROM public.cms_routes rt, fixture_ids f, publish_result p
   WHERE rt.document_id = f.doc_a_about AND rt.path = '/sobre'
     AND rt.route_kind = 'document' AND rt.revision_id = (p.r ->> 'revision_id')::uuid) = 1
);
SELECT pg_temp.expect(
  'publicar registra auditoria',
  (SELECT count(*) FROM public.cms_audit_events a, fixture_ids f
   WHERE a.document_id = f.doc_a_about AND a.action = 'publish') = 1
);
SELECT pg_temp.expect(
  'publicar atualiza o documento',
  (SELECT d.public_status = 'published' AND d.slug = 'sobre' AND d.title = 'Sobre'
     AND d.published_revision_id = (p.r ->> 'revision_id')::uuid
     AND d.has_unpublished_changes = false AND d.published_at IS NOT NULL
   FROM public.cms_documents d, fixture_ids f, publish_result p WHERE d.id = f.doc_a_about)
);

SELECT pg_temp.expect_error(
  'slug já publicado por outro documento gera route_conflict (P0410)',
  $sql$ SELECT public.cms_publish_revision(doc_a_about_dup, 0, client_a) FROM fixture_ids $sql$,
  'P0410'
);

SELECT pg_temp.expect(
  'home publica em /',
  (SELECT public.cms_publish_revision(doc_a_home, 0, client_a) ->> 'path' FROM fixture_ids) = '/'
);
SELECT pg_temp.expect(
  'artigo publica sob o prefixo padrão',
  (SELECT public.cms_publish_revision(doc_a_article, 0, client_a) ->> 'path' FROM fixture_ids)
    = '/artigos/lancamento'
);
SELECT pg_temp.expect(
  'termos do rascunho são vinculados à revisão',
  (SELECT count(*) FROM public.cms_revision_terms rt
   JOIN public.cms_documents d ON d.published_revision_id = rt.revision_id
   JOIN fixture_ids f ON d.id = f.doc_a_article AND rt.term_id = f.term_a) = 1
);
SELECT pg_temp.expect(
  'notícia usa o prefixo configurado no site',
  (SELECT public.cms_publish_revision(doc_b_page, 0, client_b) ->> 'path' FROM fixture_ids)
    = '/imprensa/nota-b'
);

UPDATE public.cms_documents d
SET draft_payload = jsonb_build_object('title', 'Lançamento', 'slug', 'lancamento', 'termIds', jsonb_build_array(f.term_b)),
    edit_version = 1
FROM fixture_ids f
WHERE d.id = f.doc_a_article;

SELECT pg_temp.expect_error(
  'termo de outro site gera validation_failed (P0422)',
  $sql$ SELECT public.cms_publish_revision(doc_a_article, 1, client_a) FROM fixture_ids $sql$,
  'P0422'
);

UPDATE public.cms_documents d
SET draft_payload = '{"title":"   ","slug":"vazio"}'::jsonb
FROM fixture_ids f
WHERE d.id = f.doc_a_about_dup;

SELECT pg_temp.expect_error(
  'título vazio gera validation_failed (P0422)',
  $sql$ SELECT public.cms_publish_revision(doc_a_about_dup, 0, client_a) FROM fixture_ids $sql$,
  'P0422'
);

-- Changing the slug keeps the old path as a redirect.
UPDATE public.cms_documents d
SET draft_payload = '{"title":"Quem somos","slug":"quem-somos"}'::jsonb,
    edit_version = 1,
    has_unpublished_changes = true
FROM fixture_ids f
WHERE d.id = f.doc_a_about;

SELECT pg_temp.expect(
  'republicar gera a revisão 2 no novo caminho',
  (SELECT r ->> 'path' = '/quem-somos' AND (r ->> 'revision_number')::int = 2
   FROM (SELECT public.cms_publish_revision(doc_a_about, 1, client_a) AS r FROM fixture_ids) x)
);
SELECT pg_temp.expect(
  'caminho antigo vira redirect para o documento',
  (SELECT count(*) FROM public.cms_routes rt, fixture_ids f
   WHERE rt.path = '/sobre' AND rt.route_kind = 'redirect' AND rt.document_id = f.doc_a_about) = 1
);
SELECT pg_temp.expect(
  'documento mantém uma única rota viva',
  (SELECT count(*) FROM public.cms_routes rt, fixture_ids f
   WHERE rt.document_id = f.doc_a_about AND rt.route_kind = 'document') = 1
);

SELECT pg_temp.expect(
  'despublicar retira a rota e marca withdrawn',
  (SELECT r ->> 'public_status' = 'withdrawn'
   FROM (SELECT public.cms_unpublish_document(doc_a_about, client_a) AS r FROM fixture_ids) x)
);
SELECT pg_temp.expect(
  'documento despublicado não tem rota viva',
  (SELECT count(*) FROM public.cms_routes rt, fixture_ids f
   WHERE rt.document_id = f.doc_a_about AND rt.route_kind = 'document') = 0
);
SELECT pg_temp.expect(
  'despublicar preserva o histórico e registra auditoria',
  (SELECT d.published_revision_id IS NOT NULL FROM public.cms_documents d, fixture_ids f WHERE d.id = f.doc_a_about)
  AND (SELECT count(*) FROM public.cms_audit_events a, fixture_ids f
       WHERE a.document_id = f.doc_a_about AND a.action = 'unpublish') = 1
);

UPDATE public.cms_documents d SET deleted_at = now() FROM fixture_ids f WHERE d.id = f.doc_a_client;

SELECT pg_temp.expect_error(
  'documento na lixeira gera not_found (P0404)',
  $sql$ SELECT public.cms_publish_revision(doc_a_client, 1, client_a) FROM fixture_ids $sql$,
  'P0404'
);

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Append-only history
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect_error(
  'UPDATE em cms_revisions é bloqueado mesmo sem RLS',
  $sql$
    UPDATE public.cms_revisions r SET reason = 'restore'
    FROM fixture_ids f WHERE r.document_id = f.doc_a_about
  $sql$,
  'P0403'
);
SELECT pg_temp.expect_error(
  'DELETE direto em cms_revisions é bloqueado',
  $sql$
    DELETE FROM public.cms_revisions r
    USING fixture_ids f WHERE r.document_id = f.doc_a_about
  $sql$,
  'P0403'
);
SELECT pg_temp.expect_error(
  'UPDATE em cms_audit_events é bloqueado',
  $sql$
    UPDATE public.cms_audit_events a SET action = 'tampered'
    FROM fixture_ids f WHERE a.tenant_id = f.tenant_a
  $sql$,
  'P0403'
);

-- Hard-deleting the owner still cascades through the history.
DELETE FROM public.cms_documents d USING fixture_ids f WHERE d.id = f.doc_a_about;

SELECT pg_temp.expect(
  'excluir o documento remove as revisões em cascata',
  (SELECT count(*) FROM public.cms_revisions r, fixture_ids f WHERE r.document_id = f.doc_a_about) = 0
);
SELECT pg_temp.expect(
  'a auditoria sobrevive à exclusão do documento',
  (SELECT count(*) FROM public.cms_audit_events a, fixture_ids f WHERE a.document_id = f.doc_a_about) = 3
);

DELETE FROM public.tenant t USING fixture_ids f WHERE t.id = f.tenant_b;

SELECT pg_temp.expect(
  'excluir o tenant remove todo o CMS dele',
  (SELECT count(*) FROM public.cms_sites s, fixture_ids f WHERE s.tenant_id = f.tenant_b) = 0
  AND (SELECT count(*) FROM public.cms_revisions r, fixture_ids f WHERE r.tenant_id = f.tenant_b) = 0
  AND (SELECT count(*) FROM public.cms_audit_events a, fixture_ids f WHERE a.tenant_id = f.tenant_b) = 0
);

SELECT 'cms_rls: todas as expectativas passaram' AS resultado;

ROLLBACK;
