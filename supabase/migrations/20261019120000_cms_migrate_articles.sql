-- Import legacy articles into CMS publications.
--
-- Source tables (pre-existing; not created in this repo's migrations):
--   public.articles
--   public.articles_category
--   public.articles_tag
--   public.articles_tag_relations
-- Shape taken from types/database.types.ts.
--
-- Idempotent: cms_legacy_map is the skip key. Mapped article ids are not
-- inserted again. Categories and tags use the same map (term_id) so a re-run
-- does not mint a second term when a slug was renamed by hand.
--
-- Published means publish_status = 'published' only. draft, scheduled,
-- arquived and null stay unpublished drafts — status is never inferred.
-- Article HTML is copied into draft_payload.body. blocks stays [].
-- thumb_url is not a media_assets id, so cover is null.

-- ---------------------------------------------------------------------------
-- Legacy map can point at a term as well as a document
-- ---------------------------------------------------------------------------

ALTER TABLE public.cms_legacy_map
  ADD COLUMN IF NOT EXISTS term_id uuid;

ALTER TABLE public.cms_legacy_map
  ALTER COLUMN document_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'cms_legacy_map_term_fkey'
      AND conrelid = 'public.cms_legacy_map'::regclass
  ) THEN
    ALTER TABLE public.cms_legacy_map
      ADD CONSTRAINT cms_legacy_map_term_fkey
      FOREIGN KEY (tenant_id, site_id, term_id)
      REFERENCES public.cms_terms (tenant_id, site_id, id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'cms_legacy_map_target_check'
      AND conrelid = 'public.cms_legacy_map'::regclass
  ) THEN
    ALTER TABLE public.cms_legacy_map
      ADD CONSTRAINT cms_legacy_map_target_check
      CHECK (
        (document_id IS NOT NULL AND term_id IS NULL)
        OR (document_id IS NULL AND term_id IS NOT NULL)
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS cms_legacy_map_term_idx
  ON public.cms_legacy_map (term_id)
  WHERE term_id IS NOT NULL;

COMMENT ON COLUMN public.cms_legacy_map.term_id IS
  'Set for legacy categories and tags. Article rows keep document_id and leave term_id null.';

-- ---------------------------------------------------------------------------
-- Slug helpers (mirror server/utils/cms/legacy-migration.ts)
-- Portuguese diacritics are translated explicitly; unaccent is not required.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.cms_legacy_slugify(p_value text, p_max integer DEFAULT 160)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.regexp_replace(
    pg_catalog.left(slugged, GREATEST(COALESCE(p_max, 160), 0)),
    '-+$',
    ''
  )
  FROM (
    SELECT pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.translate(
          pg_catalog.btrim(COALESCE(p_value, '')),
          'áàâãäåéèêëíìîïóòôõöúùûüýÿçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÝÇÑ',
          'aaaaaaeeeeiiiiooooouuuuyycnAAAAAAEEEEIIIIOOOOOUUUUYCN'
        )),
        '[^a-z0-9]+', '-', 'g'
      ),
      '^-+', ''
    ) AS slugged
  ) s;
$$;

CREATE OR REPLACE FUNCTION private.cms_legacy_site_key(p_slug text, p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN base = '' THEN 'site'
    WHEN pg_catalog.char_length(base) < 3 THEN base || '-site'
    ELSE base
  END
  FROM (
    SELECT private.cms_legacy_slugify(
      COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_slug, '')), ''), p_name),
      48
    ) AS base
  ) s;
$$;

REVOKE ALL ON FUNCTION private.cms_legacy_slugify(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cms_legacy_site_key(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.cms_legacy_slugify(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION private.cms_legacy_site_key(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Migration
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cms_migrate_legacy_articles(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tenant record;
  v_term record;
  v_article record;
  v_key text;
  v_name text;
  v_suffix text;
  v_compact text;
  v_head text;
  v_room integer;
  v_site_id uuid;
  v_locale text;
  v_prefix text;
  v_taxonomy_id uuid;
  v_term_id uuid;
  v_root text;
  v_candidate text;
  v_slug text;
  v_path text;
  v_attempt integer;
  v_title text;
  v_excerpt text;
  v_seo jsonb;
  v_payload jsonb;
  v_term_json jsonb;
  v_term_ids uuid[];
  v_category_term uuid;
  v_doc_id uuid;
  v_revision_id uuid;
  v_actor uuid;
  v_publish boolean;
  v_published_at timestamptz;
  v_linked integer;
  v_n integer;
  v_tenants integer := 0;
  v_sites_created integer := 0;
  v_sites_reused integer := 0;
  v_taxonomies_created integer := 0;
  v_categories_mapped integer := 0;
  v_categories_skipped integer := 0;
  v_tags_mapped integer := 0;
  v_tags_skipped integer := 0;
  v_articles_mapped integer := 0;
  v_articles_published integer := 0;
  v_articles_drafted integer := 0;
  v_articles_skipped_mapped integer := 0;
  v_articles_skipped_no_tenant integer := 0;
  v_articles_skipped_orphan integer := 0;
  v_relations_linked integer := 0;
  v_relations_skipped integer := 0;
BEGIN
  -- One importer at a time. The legacy-map unique key is the real guard.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms_migrate_legacy_articles', 0));

  DROP TABLE IF EXISTS pg_temp.cms_mig_site;
  DROP TABLE IF EXISTS pg_temp.cms_mig_taxonomy;
  DROP TABLE IF EXISTS pg_temp.cms_mig_term;
  DROP TABLE IF EXISTS pg_temp.cms_mig_term_slug;
  DROP TABLE IF EXISTS pg_temp.cms_mig_slug;
  DROP TABLE IF EXISTS pg_temp.cms_mig_path;

  CREATE TEMP TABLE cms_mig_site (
    tenant_id uuid PRIMARY KEY,
    site_id uuid NOT NULL,
    created boolean NOT NULL,
    locale text NOT NULL,
    prefix text NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE cms_mig_taxonomy (
    site_id uuid NOT NULL,
    kind text NOT NULL,
    taxonomy_id uuid NOT NULL,
    PRIMARY KEY (site_id, kind)
  ) ON COMMIT DROP;

  CREATE TEMP TABLE cms_mig_term (
    legacy_table text NOT NULL,
    legacy_id text NOT NULL,
    tenant_id uuid NOT NULL,
    term_id uuid NOT NULL,
    PRIMARY KEY (legacy_table, legacy_id)
  ) ON COMMIT DROP;

  CREATE TEMP TABLE cms_mig_term_slug (
    taxonomy_id uuid NOT NULL,
    slug text NOT NULL,
    PRIMARY KEY (taxonomy_id, slug)
  ) ON COMMIT DROP;

  CREATE TEMP TABLE cms_mig_slug (
    site_id uuid NOT NULL,
    slug text NOT NULL,
    PRIMARY KEY (site_id, slug)
  ) ON COMMIT DROP;

  CREATE TEMP TABLE cms_mig_path (
    site_id uuid NOT NULL,
    path text NOT NULL,
    PRIMARY KEY (site_id, path)
  ) ON COMMIT DROP;

  SELECT count(*) INTO v_articles_skipped_no_tenant
  FROM public.articles a
  WHERE a.tenant_id IS NULL
    AND p_tenant_id IS NULL;

  SELECT count(*) INTO v_articles_skipped_orphan
  FROM public.articles a
  WHERE a.tenant_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.tenant t WHERE t.id = a.tenant_id)
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);

  -- Tenants that already have a site: reuse the oldest one.
  INSERT INTO pg_temp.cms_mig_site (tenant_id, site_id, created, locale, prefix)
  SELECT scoped.tenant_id, site.id, false, site.default_locale, site.prefix
  FROM (
    SELECT DISTINCT src.tenant_id
    FROM (
      SELECT a.tenant_id
      FROM public.articles a
      WHERE a.tenant_id IS NOT NULL
      UNION
      SELECT c.tenant_id FROM public.articles_category c
      UNION
      SELECT g.tenant_id FROM public.articles_tag g
    ) src
    JOIN public.tenant t ON t.id = src.tenant_id
    WHERE p_tenant_id IS NULL OR src.tenant_id = p_tenant_id
  ) scoped
  JOIN LATERAL (
    SELECT
      s.id,
      s.default_locale,
      COALESCE(NULLIF(pg_catalog.btrim(s.settings -> 'routes' ->> 'article'), ''), 'artigos') AS prefix
    FROM public.cms_sites s
    WHERE s.tenant_id = scoped.tenant_id
    ORDER BY s.created_at, s.id
    LIMIT 1
  ) site ON true;

  GET DIAGNOSTICS v_sites_reused = ROW_COUNT;

  FOR v_tenant IN
    SELECT t.id, t.slug, t.name
    FROM public.tenant t
    WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
      AND t.id IN (
        SELECT a.tenant_id FROM public.articles a WHERE a.tenant_id IS NOT NULL
        UNION
        SELECT c.tenant_id FROM public.articles_category c
        UNION
        SELECT g.tenant_id FROM public.articles_tag g
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_temp.cms_mig_site m WHERE m.tenant_id = t.id
      )
  LOOP
    v_key := private.cms_legacy_site_key(v_tenant.slug, v_tenant.name);
    IF EXISTS (SELECT 1 FROM public.cms_sites s WHERE s.site_key = v_key) THEN
      v_compact := pg_catalog.replace(v_tenant.id::text, '-', '');
      v_suffix := pg_catalog.left(v_compact, 8);
      v_room := 64 - pg_catalog.char_length(v_suffix) - 1;
      v_head := pg_catalog.regexp_replace(pg_catalog.left(v_key, GREATEST(v_room, 1)), '-+$', '');
      IF v_head = '' THEN
        v_head := 'site';
      END IF;
      v_key := pg_catalog.left(
        pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(v_head || '-' || v_suffix, '-{2,}', '-', 'g'),
          '(^-+|-+$)', '', 'g'
        ),
        64
      );
    END IF;

    IF EXISTS (SELECT 1 FROM public.cms_sites s WHERE s.site_key = v_key) THEN
      v_compact := pg_catalog.replace(v_tenant.id::text, '-', '');
      v_room := 64 - pg_catalog.char_length(v_compact) - 1;
      v_head := pg_catalog.regexp_replace(pg_catalog.left(private.cms_legacy_site_key(v_tenant.slug, v_tenant.name), GREATEST(v_room, 1)), '-+$', '');
      IF v_head = '' THEN
        v_head := 'site';
      END IF;
      v_key := pg_catalog.left(
        pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(v_head || '-' || v_compact, '-{2,}', '-', 'g'),
          '(^-+|-+$)', '', 'g'
        ),
        64
      );
    END IF;

    IF EXISTS (SELECT 1 FROM public.cms_sites s WHERE s.site_key = v_key)
       OR v_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       OR pg_catalog.char_length(v_key) < 3 THEN
      RAISE EXCEPTION 'cms legacy migration: site_key % is not available for tenant %', v_key, v_tenant.id
        USING ERRCODE = 'P0422';
    END IF;

    v_name := pg_catalog.left(pg_catalog.btrim(COALESCE(v_tenant.name, '')), 160);
    IF v_name = '' THEN
      v_name := 'Site';
    END IF;

    INSERT INTO public.cms_sites (tenant_id, site_key, name, settings)
    VALUES (v_tenant.id, v_key, v_name, '{}'::jsonb)
    RETURNING id, default_locale INTO v_site_id, v_locale;

    INSERT INTO pg_temp.cms_mig_site (tenant_id, site_id, created, locale, prefix)
    VALUES (v_tenant.id, v_site_id, true, v_locale, 'artigos');

    v_sites_created := v_sites_created + 1;
  END LOOP;

  SELECT count(*) INTO v_tenants FROM pg_temp.cms_mig_site;

  INSERT INTO public.cms_taxonomies (tenant_id, site_id, kind, name, slug)
  SELECT s.tenant_id, s.site_id, 'category', 'Categorias', 'categorias'
  FROM pg_temp.cms_mig_site s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.cms_taxonomies x
    WHERE x.site_id = s.site_id AND x.kind = 'category'
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_taxonomies_created := v_taxonomies_created + v_n;

  INSERT INTO public.cms_taxonomies (tenant_id, site_id, kind, name, slug)
  SELECT s.tenant_id, s.site_id, 'tag', 'Tags', 'tags'
  FROM pg_temp.cms_mig_site s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.cms_taxonomies x
    WHERE x.site_id = s.site_id AND x.kind = 'tag'
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_taxonomies_created := v_taxonomies_created + v_n;

  INSERT INTO pg_temp.cms_mig_taxonomy (site_id, kind, taxonomy_id)
  SELECT DISTINCT ON (x.site_id, x.kind) x.site_id, x.kind, x.id
  FROM public.cms_taxonomies x
  JOIN pg_temp.cms_mig_site s ON s.site_id = x.site_id
  WHERE x.kind IN ('category', 'tag')
  ORDER BY x.site_id, x.kind,
    CASE
      WHEN x.kind = 'category' AND x.slug = 'categorias' THEN 0
      WHEN x.kind = 'tag' AND x.slug = 'tags' THEN 0
      ELSE 1
    END,
    x.created_at, x.id;

  SELECT count(*) INTO v_categories_skipped
  FROM public.articles_category c
  JOIN pg_temp.cms_mig_site s ON s.tenant_id = c.tenant_id
  WHERE EXISTS (
    SELECT 1 FROM public.cms_legacy_map m
    WHERE m.legacy_table = 'articles_category'
      AND m.legacy_id = c.id::text
  );

  SELECT count(*) INTO v_tags_skipped
  FROM public.articles_tag g
  JOIN pg_temp.cms_mig_site s ON s.tenant_id = g.tenant_id
  WHERE EXISTS (
    SELECT 1 FROM public.cms_legacy_map m
    WHERE m.legacy_table = 'articles_tag'
      AND m.legacy_id = g.id::text
  );

  INSERT INTO pg_temp.cms_mig_term (legacy_table, legacy_id, tenant_id, term_id)
  SELECT m.legacy_table, m.legacy_id, m.tenant_id, m.term_id
  FROM public.cms_legacy_map m
  JOIN pg_temp.cms_mig_site s ON s.tenant_id = m.tenant_id
  WHERE m.term_id IS NOT NULL
    AND m.legacy_table IN ('articles_category', 'articles_tag');

  INSERT INTO pg_temp.cms_mig_term_slug (taxonomy_id, slug)
  SELECT t.taxonomy_id, t.slug
  FROM public.cms_terms t
  JOIN pg_temp.cms_mig_taxonomy tax ON tax.taxonomy_id = t.taxonomy_id;

  FOR v_term IN
    SELECT *
    FROM (
      SELECT
        c.id,
        c.tenant_id,
        c.title,
        c.slug,
        'articles_category'::text AS legacy_table,
        'category'::text AS kind,
        s.site_id
      FROM public.articles_category c
      JOIN pg_temp.cms_mig_site s ON s.tenant_id = c.tenant_id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.cms_legacy_map m
        WHERE m.legacy_table = 'articles_category' AND m.legacy_id = c.id::text
      )
      UNION ALL
      SELECT
        g.id,
        g.tenant_id,
        g.title,
        g.slug,
        'articles_tag'::text,
        'tag'::text,
        s.site_id
      FROM public.articles_tag g
      JOIN pg_temp.cms_mig_site s ON s.tenant_id = g.tenant_id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.cms_legacy_map m
        WHERE m.legacy_table = 'articles_tag' AND m.legacy_id = g.id::text
      )
    ) src
    ORDER BY legacy_table, id
  LOOP
    SELECT tax.taxonomy_id INTO v_taxonomy_id
    FROM pg_temp.cms_mig_taxonomy tax
    WHERE tax.site_id = v_term.site_id AND tax.kind = v_term.kind;

    IF v_taxonomy_id IS NULL THEN
      RAISE EXCEPTION 'cms legacy migration: missing % taxonomy for site %', v_term.kind, v_term.site_id
        USING ERRCODE = 'P0422';
    END IF;

    v_name := pg_catalog.left(pg_catalog.btrim(COALESCE(v_term.title, '')), 160);
    IF v_name = '' THEN
      v_name := pg_catalog.left(
        CASE WHEN v_term.kind = 'category' THEN 'Categoria ' ELSE 'Tag ' END || v_term.id::text,
        160
      );
    END IF;

    v_root := private.cms_legacy_slugify(
      COALESCE(NULLIF(pg_catalog.btrim(COALESCE(v_term.slug, '')), ''), v_term.title),
      160
    );
    IF v_root = '' THEN
      v_root := CASE WHEN v_term.kind = 'category' THEN 'categoria-' ELSE 'tag-' END || v_term.id::text;
    END IF;

    v_slug := NULL;
    FOR v_attempt IN 0..50 LOOP
      IF v_attempt = 0 THEN
        v_candidate := v_root;
      ELSE
        v_suffix := CASE
          WHEN v_attempt = 1 THEN v_term.id::text
          ELSE v_term.id::text || '-' || v_attempt::text
        END;
        v_candidate := pg_catalog.regexp_replace(pg_catalog.left(v_root || '-' || v_suffix, 160), '-+$', '');
      END IF;

      IF v_candidate !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_temp.cms_mig_term_slug taken
        WHERE taken.taxonomy_id = v_taxonomy_id AND taken.slug = v_candidate
      ) THEN
        CONTINUE;
      END IF;

      v_slug := v_candidate;
      EXIT;
    END LOOP;

    IF v_slug IS NULL THEN
      RAISE EXCEPTION 'cms legacy migration: no free slug for % %', v_term.legacy_table, v_term.id
        USING ERRCODE = 'P0422';
    END IF;

    INSERT INTO public.cms_terms (tenant_id, site_id, taxonomy_id, name, slug)
    VALUES (v_term.tenant_id, v_term.site_id, v_taxonomy_id, v_name, v_slug)
    RETURNING id INTO v_term_id;

    INSERT INTO public.cms_legacy_map (tenant_id, site_id, legacy_table, legacy_id, term_id)
    VALUES (v_term.tenant_id, v_term.site_id, v_term.legacy_table, v_term.id::text, v_term_id);

    INSERT INTO pg_temp.cms_mig_term (legacy_table, legacy_id, tenant_id, term_id)
    VALUES (v_term.legacy_table, v_term.id::text, v_term.tenant_id, v_term_id);

    INSERT INTO pg_temp.cms_mig_term_slug (taxonomy_id, slug)
    VALUES (v_taxonomy_id, v_slug);

    IF v_term.kind = 'category' THEN
      v_categories_mapped := v_categories_mapped + 1;
    ELSE
      v_tags_mapped := v_tags_mapped + 1;
    END IF;
  END LOOP;

  INSERT INTO pg_temp.cms_mig_slug (site_id, slug)
  SELECT d.site_id, d.slug
  FROM public.cms_documents d
  JOIN pg_temp.cms_mig_site s ON s.site_id = d.site_id
  WHERE d.slug IS NOT NULL
    AND d.deleted_at IS NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO pg_temp.cms_mig_path (site_id, path)
  SELECT r.site_id, r.path
  FROM public.cms_routes r
  JOIN pg_temp.cms_mig_site s ON s.site_id = r.site_id
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO v_articles_skipped_mapped
  FROM public.articles a
  JOIN pg_temp.cms_mig_site s ON s.tenant_id = a.tenant_id
  WHERE EXISTS (
    SELECT 1 FROM public.cms_legacy_map m
    WHERE m.legacy_table = 'articles' AND m.legacy_id = a.id::text
  );

  SELECT count(*) INTO v_relations_skipped
  FROM public.articles_tag_relations r
  LEFT JOIN public.articles a ON a.id = r.article_id
  LEFT JOIN public.articles_tag tag ON tag.id = r.tag_id
  WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id OR a.tenant_id = p_tenant_id)
    AND (
      r.article_id IS NULL
      OR r.tag_id IS NULL
      OR a.id IS NULL
      OR a.tenant_id IS NULL
      OR tag.id IS NULL
      OR tag.tenant_id IS DISTINCT FROM a.tenant_id
      OR (r.tenant_id IS NOT NULL AND r.tenant_id IS DISTINCT FROM a.tenant_id)
    );

  FOR v_article IN
    SELECT
      a.id,
      a.tenant_id,
      a.title,
      a.slug,
      a.content,
      a.meta_description,
      a.publish_status::text AS publish_status,
      a.category_id,
      a.author_id,
      a.created_at,
      a.update_at,
      s.site_id,
      s.locale,
      s.prefix
    FROM public.articles a
    JOIN pg_temp.cms_mig_site s ON s.tenant_id = a.tenant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.cms_legacy_map m
      WHERE m.legacy_table = 'articles' AND m.legacy_id = a.id::text
    )
    ORDER BY a.id
  LOOP
    v_root := private.cms_legacy_slugify(
      COALESCE(NULLIF(pg_catalog.btrim(COALESCE(v_article.slug, '')), ''), v_article.title),
      160
    );
    IF v_root = '' OR v_root !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
      v_root := 'artigo-' || v_article.id::text;
    END IF;

    v_slug := NULL;
    v_path := NULL;
    FOR v_attempt IN 0..50 LOOP
      IF v_attempt = 0 THEN
        v_candidate := v_root;
      ELSE
        v_suffix := CASE
          WHEN v_attempt = 1 THEN v_article.id::text
          ELSE v_article.id::text || '-' || v_attempt::text
        END;
        v_candidate := pg_catalog.regexp_replace(pg_catalog.left(v_root || '-' || v_suffix, 160), '-+$', '');
      END IF;

      IF v_candidate !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
        CONTINUE;
      END IF;

      v_path := public.cms_normalize_path(v_article.prefix);
      IF v_path !~ '^/[a-z0-9][a-z0-9._~-]*$' THEN
        v_path := public.cms_normalize_path('artigos');
      END IF;
      v_path := CASE WHEN v_path = '/' THEN '' ELSE v_path END || '/' || v_candidate;
      IF v_path !~ '^/$|^(/[a-z0-9][a-z0-9._~-]*)+$' THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_temp.cms_mig_slug taken
        WHERE taken.site_id = v_article.site_id AND taken.slug = v_candidate
      ) OR EXISTS (
        SELECT 1 FROM pg_temp.cms_mig_path taken
        WHERE taken.site_id = v_article.site_id AND taken.path = v_path
      ) THEN
        CONTINUE;
      END IF;

      v_slug := v_candidate;
      EXIT;
    END LOOP;

    IF v_slug IS NULL OR v_path IS NULL THEN
      RAISE EXCEPTION 'cms legacy migration: no free slug for article %', v_article.id
        USING ERRCODE = 'P0422';
    END IF;

    v_title := pg_catalog.left(pg_catalog.btrim(COALESCE(v_article.title, '')), 200);
    IF v_title = '' THEN
      v_title := pg_catalog.left('Artigo ' || v_article.id::text, 200);
    END IF;

    v_excerpt := NULLIF(pg_catalog.left(pg_catalog.btrim(COALESCE(v_article.meta_description, '')), 600), '');
    v_seo := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'title', NULLIF(pg_catalog.left(v_title, 120), ''),
      'description', NULLIF(pg_catalog.left(pg_catalog.btrim(COALESCE(v_article.meta_description, '')), 320), '')
    ));

    v_category_term := NULL;
    IF v_article.category_id IS NOT NULL THEN
      SELECT tm.term_id INTO v_category_term
      FROM pg_temp.cms_mig_term tm
      JOIN public.articles_category c
        ON c.id::text = tm.legacy_id
       AND c.tenant_id = v_article.tenant_id
      WHERE tm.legacy_table = 'articles_category'
        AND tm.legacy_id = v_article.category_id::text
        AND tm.tenant_id = v_article.tenant_id;
    END IF;

    SELECT COALESCE(pg_catalog.array_agg(DISTINCT tm.term_id), '{}'::uuid[])
    INTO v_term_ids
    FROM public.articles_tag_relations r
    JOIN public.articles_tag tag ON tag.id = r.tag_id
    JOIN pg_temp.cms_mig_term tm
      ON tm.legacy_table = 'articles_tag'
     AND tm.legacy_id = tag.id::text
     AND tm.tenant_id = v_article.tenant_id
    WHERE r.article_id = v_article.id
      AND tag.tenant_id = v_article.tenant_id
      AND (r.tenant_id IS NULL OR r.tenant_id = v_article.tenant_id);

    v_linked := COALESCE(pg_catalog.array_length(v_term_ids, 1), 0);
    v_relations_linked := v_relations_linked + v_linked;

    -- Category first, then tag ids. A null category contributes no element.
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(term_id::text) ORDER BY ord, term_id), '[]'::jsonb)
    INTO v_term_json
    FROM (
      SELECT v_category_term AS term_id, 0 AS ord
      WHERE v_category_term IS NOT NULL
      UNION ALL
      SELECT tag_term, 1
      FROM pg_catalog.unnest(v_term_ids) AS tag_term
      WHERE tag_term IS DISTINCT FROM v_category_term
    ) ordered;

    v_payload := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'title', v_title,
      'slug', v_slug,
      'excerpt', v_excerpt,
      'body', COALESCE(v_article.content, ''),
      'blocks', '[]'::jsonb,
      'termIds', v_term_json,
      'seo', v_seo
    ));
    v_payload := v_payload || pg_catalog.jsonb_build_object('cover', NULL, 'blocks', '[]'::jsonb);

    v_publish := COALESCE(v_article.publish_status = 'published', false);

    v_actor := NULL;
    -- author_id is an optional uuid with no FK. Ignore anything that is not a user.
    IF v_article.author_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT u.id INTO v_actor
      FROM auth.users u
      WHERE u.id = v_article.author_id::text::uuid;
    END IF;

    INSERT INTO public.cms_documents (
      tenant_id, site_id, kind, publication_type, locale, title, slug,
      workflow_status, public_status, draft_payload, edit_version,
      has_unpublished_changes, created_by, updated_by, created_at
    )
    VALUES (
      v_article.tenant_id,
      v_article.site_id,
      'publication',
      'article',
      v_article.locale,
      v_title,
      v_slug,
      CASE WHEN v_publish THEN 'approved' ELSE 'draft' END,
      'unpublished',
      v_payload,
      0,
      false,
      v_actor,
      v_actor,
      COALESCE(v_article.created_at, pg_catalog.now())
    )
    RETURNING id INTO v_doc_id;

    v_revision_id := NULL;
    IF v_publish THEN
      v_published_at := COALESCE(v_article.update_at, v_article.created_at, pg_catalog.now());

      INSERT INTO public.cms_revisions (
        tenant_id, site_id, document_id, revision_number, snapshot, reason, created_by
      )
      VALUES (
        v_article.tenant_id, v_article.site_id, v_doc_id, 1, v_payload, 'publish', v_actor
      )
      RETURNING id INTO v_revision_id;

      INSERT INTO public.cms_revision_terms (tenant_id, site_id, revision_id, term_id)
      SELECT v_article.tenant_id, v_article.site_id, v_revision_id, term_id::uuid
      FROM pg_catalog.jsonb_array_elements_text(v_term_json) AS term_id;

      INSERT INTO public.cms_routes (
        tenant_id, site_id, locale, path, document_id, revision_id, route_kind
      )
      VALUES (
        v_article.tenant_id, v_article.site_id, v_article.locale, v_path,
        v_doc_id, v_revision_id, 'document'
      );

      UPDATE public.cms_documents
      SET published_revision_id = v_revision_id,
          public_status = 'published',
          published_at = v_published_at,
          has_unpublished_changes = false,
          title = v_title,
          slug = v_slug
      WHERE id = v_doc_id;

      v_articles_published := v_articles_published + 1;
    ELSE
      v_articles_drafted := v_articles_drafted + 1;
    END IF;

    INSERT INTO public.cms_audit_events (
      tenant_id, site_id, actor_user_id, action, document_id, revision_id, metadata
    )
    VALUES (
      v_article.tenant_id,
      v_article.site_id,
      NULL,
      'legacy.import',
      v_doc_id,
      v_revision_id,
      pg_catalog.jsonb_build_object(
        'legacyTable', 'articles',
        'legacyId', v_article.id::text,
        'publishStatus', v_article.publish_status,
        'published', v_publish
      )
    );

    INSERT INTO public.cms_legacy_map (tenant_id, site_id, legacy_table, legacy_id, document_id)
    VALUES (v_article.tenant_id, v_article.site_id, 'articles', v_article.id::text, v_doc_id);

    INSERT INTO pg_temp.cms_mig_slug (site_id, slug) VALUES (v_article.site_id, v_slug);
    INSERT INTO pg_temp.cms_mig_path (site_id, path) VALUES (v_article.site_id, v_path);

    v_articles_mapped := v_articles_mapped + 1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'tenants', v_tenants,
    'sites_created', v_sites_created,
    'sites_reused', v_sites_reused,
    'taxonomies_created', v_taxonomies_created,
    'categories_mapped', v_categories_mapped,
    'categories_skipped', v_categories_skipped,
    'tags_mapped', v_tags_mapped,
    'tags_skipped', v_tags_skipped,
    'articles_mapped', v_articles_mapped,
    'articles_published', v_articles_published,
    'articles_drafted', v_articles_drafted,
    'articles_skipped_mapped', v_articles_skipped_mapped,
    'articles_skipped_no_tenant', v_articles_skipped_no_tenant,
    'articles_skipped_orphan', v_articles_skipped_orphan,
    'relations_linked', v_relations_linked,
    'relations_skipped', v_relations_skipped
  );
END;
$$;

COMMENT ON FUNCTION public.cms_migrate_legacy_articles(uuid) IS
  'Copies legacy articles into CMS publications. Pass NULL to import every tenant. Skips legacy ids already present in cms_legacy_map.';

REVOKE ALL ON FUNCTION public.cms_migrate_legacy_articles(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cms_migrate_legacy_articles(uuid) TO service_role;

-- The service-role endpoint re-runs the function. SELECT is enough; RLS stays on.
GRANT SELECT ON
  public.articles,
  public.articles_category,
  public.articles_tag,
  public.articles_tag_relations
TO service_role;

-- Apply once as part of this migration. A later call is a no-op for mapped ids.
DO $migrate$
DECLARE
  v_report jsonb;
BEGIN
  v_report := public.cms_migrate_legacy_articles(NULL);
  RAISE NOTICE 'cms legacy article migration %', v_report;
END
$migrate$;
