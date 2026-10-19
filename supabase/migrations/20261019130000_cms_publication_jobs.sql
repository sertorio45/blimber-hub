-- CMS publication scheduling.
--
-- Redirects stay in cms_routes (route_kind = 'redirect'). There is no
-- cms_redirects table: publish already turns an old path into a redirect, and
-- the helper RPCs below cover manual ones.
--
-- Due jobs are dispatched the same way as marketing publication jobs:
-- pg_cron → pg_net HTTP POST → /api/cms/jobs/process with x-worker-secret.
-- Vault names: cms_worker_base_url, cms_worker_secret.
-- The worker calls cms_publish_revision (draft pin) or cms_publish_pinned_revision
-- (snapshot pin). Claiming and the "already live" short-circuit live in
-- server/utils/cms/publication-jobs.ts so a replay does not publish twice.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- Queue
-- ---------------------------------------------------------------------------

CREATE TABLE public.cms_publication_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  document_id uuid NOT NULL,
  -- Exactly one pin: a frozen revision snapshot, or the draft edit_version.
  revision_id uuid,
  edit_version integer,
  -- Absolute instant. `timezone` is the IANA zone the editor used to pick it.
  run_at timestamptz NOT NULL,
  timezone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  result_revision_id uuid,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_publication_jobs_pin_check CHECK (
    ((revision_id IS NOT NULL)::integer + (edit_version IS NOT NULL)::integer) = 1
  ),
  CONSTRAINT cms_publication_jobs_edit_version_check CHECK (
    edit_version IS NULL OR edit_version >= 0
  ),
  CONSTRAINT cms_publication_jobs_status_check CHECK (
    status IN ('pending', 'processing', 'retrying', 'published', 'failed', 'cancelled')
  ),
  CONSTRAINT cms_publication_jobs_attempts_check CHECK (
    attempts >= 0 AND attempts <= 20 AND max_attempts BETWEEN 1 AND 10
  ),
  CONSTRAINT cms_publication_jobs_timezone_check CHECK (
    char_length(btrim(timezone)) BETWEEN 1 AND 80
  ),
  CONSTRAINT cms_publication_jobs_last_error_length CHECK (
    last_error IS NULL OR char_length(last_error) <= 500
  ),
  CONSTRAINT cms_publication_jobs_locked_by_length CHECK (
    locked_by IS NULL OR char_length(locked_by) <= 120
  ),
  CONSTRAINT cms_publication_jobs_site_fkey FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.cms_sites (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_publication_jobs_document_fkey FOREIGN KEY (tenant_id, site_id, document_id)
    REFERENCES public.cms_documents (tenant_id, site_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_publication_jobs_revision_fkey FOREIGN KEY (revision_id, document_id)
    REFERENCES public.cms_revisions (id, document_id) ON DELETE CASCADE,
  CONSTRAINT cms_publication_jobs_result_revision_fkey FOREIGN KEY (result_revision_id, document_id)
    REFERENCES public.cms_revisions (id, document_id) ON DELETE SET NULL (result_revision_id)
);

-- One in-flight schedule per document. Finished rows stay as history.
CREATE UNIQUE INDEX cms_publication_jobs_one_open_idx
  ON public.cms_publication_jobs (document_id)
  WHERE status IN ('pending', 'processing', 'retrying');

CREATE INDEX cms_publication_jobs_due_idx
  ON public.cms_publication_jobs (run_at)
  WHERE status IN ('pending', 'retrying');

CREATE INDEX cms_publication_jobs_processing_idx
  ON public.cms_publication_jobs (locked_at)
  WHERE status = 'processing';

CREATE INDEX cms_publication_jobs_document_created_idx
  ON public.cms_publication_jobs (document_id, created_at DESC);

CREATE INDEX cms_publication_jobs_tenant_created_idx
  ON public.cms_publication_jobs (tenant_id, created_at DESC);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.cms_publication_jobs
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

COMMENT ON TABLE public.cms_publication_jobs IS
  'Scheduled CMS publishes. run_at is UTC; timezone is the IANA zone used when the editor picked the instant.';

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- Writes go through the service role (the API checks cms.publish). Members
-- may read their tenant's jobs.
-- ---------------------------------------------------------------------------

ALTER TABLE public.cms_publication_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cms_publication_jobs FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER, INSERT, UPDATE, DELETE ON public.cms_publication_jobs FROM authenticated;
GRANT SELECT ON public.cms_publication_jobs TO authenticated;
GRANT ALL ON public.cms_publication_jobs TO service_role;

CREATE POLICY cms_tenant_select ON public.cms_publication_jobs
  FOR SELECT TO authenticated
  USING (private.user_has_tenant_access(tenant_id));

-- ---------------------------------------------------------------------------
-- Activate an existing revision snapshot without cloning it.
-- Idempotent when that revision is already the live one.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cms_publish_pinned_revision(
  p_document_id uuid,
  p_revision_id uuid,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_doc public.cms_documents%ROWTYPE;
  v_site public.cms_sites%ROWTYPE;
  v_revision public.cms_revisions%ROWTYPE;
  v_payload jsonb;
  v_title text;
  v_slug text;
  v_prefix text;
  v_parent_path text;
  v_path text;
  v_conflict public.cms_routes%ROWTYPE;
  v_old_paths text[];
  v_published_at timestamptz;
BEGIN
  SELECT * INTO v_doc
  FROM public.cms_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0404';
  END IF;

  SELECT * INTO v_revision
  FROM public.cms_revisions
  WHERE id = p_revision_id
    AND document_id = v_doc.id
    AND tenant_id = v_doc.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0404';
  END IF;

  IF v_doc.public_status = 'published' AND v_doc.published_revision_id = v_revision.id THEN
    SELECT r.path INTO v_path
    FROM public.cms_routes r
    WHERE r.document_id = v_doc.id
      AND r.locale = v_doc.locale
      AND r.route_kind = 'document'
    LIMIT 1;

    RETURN pg_catalog.jsonb_build_object(
      'revision_id', v_revision.id,
      'revision_number', v_revision.revision_number,
      'path', COALESCE(v_path, '/'),
      'published_at', v_doc.published_at,
      'idempotent', true
    );
  END IF;

  SELECT * INTO STRICT v_site FROM public.cms_sites WHERE id = v_doc.site_id;
  v_payload := v_revision.snapshot;

  IF pg_catalog.jsonb_typeof(v_payload -> 'title') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = '{"field":"title","reason":"required"}';
  END IF;
  v_title := pg_catalog.btrim(v_payload ->> 'title');
  IF v_title = '' OR pg_catalog.char_length(v_title) > 200 THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = '{"field":"title","reason":"invalid_length"}';
  END IF;

  v_slug := NULLIF(pg_catalog.btrim(COALESCE(v_payload ->> 'slug', '')), '');
  IF v_slug IS NULL AND NOT v_doc.is_home THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = '{"field":"slug","reason":"required"}';
  END IF;
  IF v_slug IS NOT NULL AND (
    v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR pg_catalog.char_length(v_slug) > 160
  ) THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = '{"field":"slug","reason":"invalid_format"}';
  END IF;

  IF v_doc.kind = 'page' THEN
    IF v_doc.is_home THEN
      v_path := '/';
    ELSIF v_doc.parent_id IS NOT NULL THEN
      SELECT r.path INTO v_parent_path
      FROM public.cms_routes r
      JOIN public.cms_documents p ON p.id = r.document_id
      WHERE r.document_id = v_doc.parent_id
        AND r.locale = v_doc.locale
        AND r.route_kind = 'document'
        AND p.public_status = 'published'
        AND p.deleted_at IS NULL
      LIMIT 1;

      IF v_parent_path IS NULL THEN
        RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
          DETAIL = '{"field":"parentId","reason":"parent_not_published"}';
      END IF;
      v_path := CASE WHEN v_parent_path = '/' THEN '' ELSE v_parent_path END || '/' || v_slug;
    ELSE
      v_path := '/' || v_slug;
    END IF;
  ELSE
    IF v_doc.publication_type IS NULL THEN
      RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
        DETAIL = '{"field":"publicationType","reason":"required"}';
    END IF;
    v_prefix := NULLIF(pg_catalog.btrim(v_site.settings -> 'routes' ->> v_doc.publication_type), '');
    v_prefix := COALESCE(
      v_prefix,
      CASE v_doc.publication_type WHEN 'article' THEN 'artigos' ELSE 'noticias' END
    );
    v_path := public.cms_normalize_path(v_prefix);
    v_path := CASE WHEN v_path = '/' THEN '' ELSE v_path END || '/' || v_slug;
  END IF;

  IF v_path !~ '^/$|^(/[a-z0-9][a-z0-9._~-]*)+$' OR pg_catalog.char_length(v_path) > 1024 THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = pg_catalog.jsonb_build_object('field', 'path', 'reason', 'invalid_format', 'path', v_path)::text;
  END IF;

  SELECT * INTO v_conflict
  FROM public.cms_routes r
  WHERE r.site_id = v_doc.site_id
    AND r.locale = v_doc.locale
    AND r.path = v_path
    AND r.route_kind IN ('document', 'reserved')
    AND r.document_id IS DISTINCT FROM v_doc.id;

  IF FOUND THEN
    RAISE EXCEPTION 'route_conflict' USING ERRCODE = 'P0410',
      DETAIL = pg_catalog.jsonb_build_object('path', v_path, 'documentId', v_conflict.document_id)::text;
  END IF;

  WITH removed AS (
    DELETE FROM public.cms_routes r
    WHERE r.document_id = v_doc.id
      AND r.locale = v_doc.locale
      AND r.route_kind = 'document'
    RETURNING r.path
  )
  SELECT COALESCE(pg_catalog.array_agg(removed.path), '{}') INTO v_old_paths FROM removed;

  DELETE FROM public.cms_routes r
  WHERE r.site_id = v_doc.site_id
    AND r.locale = v_doc.locale
    AND r.path = v_path
    AND r.route_kind = 'redirect';

  BEGIN
    INSERT INTO public.cms_routes (
      tenant_id, site_id, locale, path, document_id, revision_id, route_kind
    )
    VALUES (
      v_doc.tenant_id, v_doc.site_id, v_doc.locale, v_path, v_doc.id, v_revision.id, 'document'
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'route_conflict' USING ERRCODE = 'P0410',
      DETAIL = pg_catalog.jsonb_build_object('path', v_path, 'documentId', NULL::uuid)::text;
  END;

  INSERT INTO public.cms_routes (tenant_id, site_id, locale, path, document_id, route_kind)
  SELECT v_doc.tenant_id, v_doc.site_id, v_doc.locale, old_path, v_doc.id, 'redirect'
  FROM pg_catalog.unnest(v_old_paths) AS old_path
  WHERE old_path <> v_path
  ON CONFLICT (site_id, locale, path) DO NOTHING;

  UPDATE public.cms_documents
  SET published_revision_id = v_revision.id,
      public_status = 'published',
      published_at = COALESCE(published_at, pg_catalog.now()),
      has_unpublished_changes = draft_payload IS DISTINCT FROM v_payload,
      title = v_title,
      slug = v_slug,
      updated_by = COALESCE(p_actor, updated_by)
  WHERE id = v_doc.id
  RETURNING published_at INTO v_published_at;

  INSERT INTO public.cms_audit_events (
    tenant_id, site_id, actor_user_id, action, document_id, revision_id, metadata
  )
  VALUES (
    v_doc.tenant_id, v_doc.site_id, p_actor, 'publish', v_doc.id, v_revision.id,
    pg_catalog.jsonb_build_object(
      'revisionNumber', v_revision.revision_number,
      'path', v_path,
      'previousPaths', pg_catalog.to_jsonb(v_old_paths),
      'pinnedRevision', true
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'revision_id', v_revision.id,
    'revision_number', v_revision.revision_number,
    'path', v_path,
    'published_at', v_published_at,
    'idempotent', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Manual redirects on cms_routes. Automatic ones still come from publish.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cms_upsert_redirect(
  p_site_id uuid,
  p_path text,
  p_document_id uuid,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_doc public.cms_documents%ROWTYPE;
  v_path text;
  v_conflict public.cms_routes%ROWTYPE;
  v_route_id uuid;
BEGIN
  SELECT * INTO v_doc
  FROM public.cms_documents
  WHERE id = p_document_id
    AND site_id = p_site_id
  FOR UPDATE;

  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0404';
  END IF;

  v_path := public.cms_normalize_path(p_path);
  IF v_path !~ '^/$|^(/[a-z0-9][a-z0-9._~-]*)+$' OR pg_catalog.char_length(v_path) > 1024 THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = '{"field":"path","reason":"invalid_format"}';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cms_routes r
    WHERE r.document_id = v_doc.id
      AND r.locale = v_doc.locale
      AND r.path = v_path
      AND r.route_kind = 'document'
  ) THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = '{"field":"path","reason":"canonical"}';
  END IF;

  SELECT * INTO v_conflict
  FROM public.cms_routes r
  WHERE r.site_id = v_doc.site_id
    AND r.locale = v_doc.locale
    AND r.path = v_path
    AND r.route_kind IN ('document', 'reserved');

  IF FOUND THEN
    RAISE EXCEPTION 'route_conflict' USING ERRCODE = 'P0410',
      DETAIL = pg_catalog.jsonb_build_object('path', v_path, 'documentId', v_conflict.document_id)::text;
  END IF;

  UPDATE public.cms_routes r
  SET document_id = v_doc.id,
      revision_id = NULL
  WHERE r.site_id = v_doc.site_id
    AND r.locale = v_doc.locale
    AND r.path = v_path
    AND r.route_kind = 'redirect'
  RETURNING r.id INTO v_route_id;

  IF v_route_id IS NULL THEN
    BEGIN
      INSERT INTO public.cms_routes (
        tenant_id, site_id, locale, path, document_id, route_kind
      )
      VALUES (
        v_doc.tenant_id, v_doc.site_id, v_doc.locale, v_path, v_doc.id, 'redirect'
      )
      RETURNING id INTO v_route_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'route_conflict' USING ERRCODE = 'P0410',
        DETAIL = pg_catalog.jsonb_build_object('path', v_path, 'documentId', NULL::uuid)::text;
    END;
  END IF;

  INSERT INTO public.cms_audit_events (
    tenant_id, site_id, actor_user_id, action, document_id, metadata
  )
  VALUES (
    v_doc.tenant_id, v_doc.site_id, p_actor, 'redirect.upsert', v_doc.id,
    pg_catalog.jsonb_build_object('path', v_path, 'routeId', v_route_id, 'locale', v_doc.locale)
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_route_id,
    'path', v_path,
    'document_id', v_doc.id,
    'locale', v_doc.locale
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cms_delete_redirect(
  p_route_id uuid,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_route public.cms_routes%ROWTYPE;
BEGIN
  SELECT * INTO v_route
  FROM public.cms_routes
  WHERE id = p_route_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0404';
  END IF;

  IF v_route.route_kind <> 'redirect' THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = '{"field":"routeId","reason":"not_redirect"}';
  END IF;

  DELETE FROM public.cms_routes WHERE id = v_route.id;

  INSERT INTO public.cms_audit_events (
    tenant_id, site_id, actor_user_id, action, document_id, metadata
  )
  VALUES (
    v_route.tenant_id, v_route.site_id, p_actor, 'redirect.delete', v_route.document_id,
    pg_catalog.jsonb_build_object('path', v_route.path, 'routeId', v_route.id, 'locale', v_route.locale)
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_route.id,
    'path', v_route.path,
    'document_id', v_route.document_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cms_publish_pinned_revision(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cms_upsert_redirect(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cms_delete_redirect(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cms_publish_pinned_revision(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cms_upsert_redirect(uuid, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cms_delete_redirect(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- pg_cron → HTTP worker (same shape as marketing_dispatch_publication_jobs)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.cms_dispatch_publication_jobs()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base_url text;
  v_secret text;
  v_due_count integer;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_base_url
  FROM vault.decrypted_secrets
  WHERE name = 'cms_worker_base_url';

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cms_worker_secret';

  IF v_base_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'cms worker secrets not configured in vault';
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_due_count
  FROM public.cms_publication_jobs
  WHERE status IN ('pending', 'retrying')
    AND run_at <= pg_catalog.now()
    AND (next_attempt_at IS NULL OR next_attempt_at <= pg_catalog.now());

  IF v_due_count = 0 THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := pg_catalog.rtrim(v_base_url, '/') || '/api/cms/jobs/process',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', v_secret
    ),
    body := pg_catalog.jsonb_build_object('workerId', 'pg_cron', 'limit', 25),
    timeout_milliseconds := 25000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.cms_dispatch_publication_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cms_dispatch_publication_jobs() FROM anon, authenticated;

SELECT cron.schedule(
  'cms-dispatch-publication-jobs',
  '* * * * *',
  $job$SELECT private.cms_dispatch_publication_jobs()$job$
);
