-- Blimber CMS foundation: sites, documents, immutable revisions, public routes,
-- taxonomies, media usage tracking, audit trail and the publish RPCs.
--
-- Table and RPC names mirror `lib/cms/contracts.ts` (CMS_TABLES / CMS_RPC) and
-- every column is the snake_case of the matching contract field.
--
-- Tenant integrity: child rows reference their parents through composite keys
-- that include `tenant_id` (and `site_id` where it applies), so a row can never
-- point at a site, document, revision, term or media asset of another tenant,
-- even when written with the service role (which bypasses RLS).
--
-- Custom SQLSTATE codes raised by this migration (mapped to `CmsErrorCode`):
--   P0403  immutable_record   UPDATE/DELETE on cms_revisions or cms_audit_events
--   P0404  not_found          document missing or in the trash
--   P0409  version_conflict   edit_version differs from the expected version;
--                             DETAIL carries CmsVersionConflictDetails as JSON
--   P0410  route_conflict     path already taken by another document or reserved;
--                             DETAIL carries {"path", "documentId"} as JSON
--   P0422  validation_failed  payload not publishable; DETAIL carries
--                             {"field", "reason"} as JSON

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Canonical public path: leading slash, lowercase, single slashes, no trailing
-- slash except for the root.
CREATE OR REPLACE FUNCTION public.cms_normalize_path(p_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE WHEN normalized = '' THEN '/' ELSE normalized END
  FROM (
    SELECT pg_catalog.rtrim(
      pg_catalog.regexp_replace(
        '/' || pg_catalog.lower(pg_catalog.btrim(COALESCE(p_path, ''))),
        '/{2,}', '/', 'g'
      ),
      '/'
    ) AS normalized
  ) s;
$$;

-- ---------------------------------------------------------------------------
-- Sites
-- ---------------------------------------------------------------------------

CREATE TABLE public.cms_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_key text NOT NULL,
  name text NOT NULL,
  default_locale text NOT NULL DEFAULT 'pt-BR',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  status text NOT NULL DEFAULT 'active',
  -- Route prefixes: settings->'routes'->>'article' (default 'artigos') and
  -- settings->'routes'->>'news' (default 'noticias').
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_sites_site_key_key UNIQUE (site_key),
  CONSTRAINT cms_sites_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT cms_sites_site_key_format CHECK (
    site_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(site_key) BETWEEN 3 AND 64
  ),
  CONSTRAINT cms_sites_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT cms_sites_default_locale_format CHECK (
    default_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' AND char_length(default_locale) <= 16
  ),
  CONSTRAINT cms_sites_timezone_length CHECK (char_length(timezone) BETWEEN 1 AND 80),
  CONSTRAINT cms_sites_status_check CHECK (status IN ('active', 'suspended', 'archived')),
  CONSTRAINT cms_sites_settings_object CHECK (jsonb_typeof(settings) = 'object')
);

CREATE TABLE public.cms_site_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  hostname text NOT NULL,
  environment text NOT NULL DEFAULT 'production',
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verification_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_site_domains_hostname_key UNIQUE (hostname),
  CONSTRAINT cms_site_domains_site_fkey FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.cms_sites (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_site_domains_hostname_format CHECK (
    hostname = lower(hostname)
    AND char_length(hostname) <= 253
    AND hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  ),
  CONSTRAINT cms_site_domains_environment_check CHECK (environment IN ('production', 'staging'))
);

CREATE UNIQUE INDEX cms_site_domains_one_primary_idx
  ON public.cms_site_domains (site_id, environment)
  WHERE is_primary;
CREATE INDEX cms_site_domains_site_idx ON public.cms_site_domains (site_id);
CREATE INDEX cms_site_domains_tenant_idx ON public.cms_site_domains (tenant_id);

-- ---------------------------------------------------------------------------
-- Authors
-- ---------------------------------------------------------------------------

CREATE TABLE public.cms_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  bio text,
  avatar_asset_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_authors_site_slug_key UNIQUE (site_id, slug),
  CONSTRAINT cms_authors_site_fkey FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.cms_sites (tenant_id, id) ON DELETE CASCADE,
  -- Column-list SET NULL keeps tenant_id intact when the avatar is removed.
  CONSTRAINT cms_authors_avatar_asset_fkey FOREIGN KEY (avatar_asset_id, tenant_id)
    REFERENCES public.media_assets (id, tenant_id) ON DELETE SET NULL (avatar_asset_id),
  CONSTRAINT cms_authors_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT cms_authors_slug_format CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 160
  )
);

CREATE INDEX cms_authors_tenant_idx ON public.cms_authors (tenant_id);
CREATE INDEX cms_authors_avatar_asset_idx ON public.cms_authors (avatar_asset_id)
  WHERE avatar_asset_id IS NOT NULL;
CREATE INDEX cms_authors_user_idx ON public.cms_authors (user_id)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Documents and revisions
-- ---------------------------------------------------------------------------

CREATE TABLE public.cms_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  kind text NOT NULL,
  publication_type text,
  locale text NOT NULL DEFAULT 'pt-BR',
  title text NOT NULL DEFAULT '',
  slug text,
  parent_id uuid,
  is_home boolean NOT NULL DEFAULT false,
  workflow_status text NOT NULL DEFAULT 'draft',
  public_status text NOT NULL DEFAULT 'unpublished',
  draft_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  edit_version integer NOT NULL DEFAULT 0,
  published_revision_id uuid,
  published_at timestamptz,
  has_unpublished_changes boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_documents_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT cms_documents_tenant_site_id_key UNIQUE (tenant_id, site_id, id),
  CONSTRAINT cms_documents_site_fkey FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.cms_sites (tenant_id, id) ON DELETE CASCADE,
  -- Parent must live in the same site; hard-deleting it detaches the child.
  CONSTRAINT cms_documents_parent_fkey FOREIGN KEY (tenant_id, site_id, parent_id)
    REFERENCES public.cms_documents (tenant_id, site_id, id) ON DELETE SET NULL (parent_id),
  CONSTRAINT cms_documents_kind_check CHECK (kind IN ('page', 'publication')),
  CONSTRAINT cms_documents_publication_type_check CHECK (
    publication_type IS NULL OR publication_type IN ('article', 'news')
  ),
  CONSTRAINT cms_documents_publication_type_required CHECK (
    (kind = 'publication') = (publication_type IS NOT NULL)
  ),
  CONSTRAINT cms_documents_page_only_hierarchy CHECK (
    kind = 'page' OR (parent_id IS NULL AND is_home = false)
  ),
  CONSTRAINT cms_documents_home_is_root CHECK (NOT is_home OR parent_id IS NULL),
  CONSTRAINT cms_documents_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT cms_documents_locale_format CHECK (
    locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' AND char_length(locale) <= 16
  ),
  CONSTRAINT cms_documents_title_length CHECK (char_length(title) <= 200),
  CONSTRAINT cms_documents_slug_format CHECK (
    slug IS NULL OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 160)
  ),
  CONSTRAINT cms_documents_workflow_status_check CHECK (
    workflow_status IN ('draft', 'in_review', 'changes_requested', 'approved')
  ),
  CONSTRAINT cms_documents_public_status_check CHECK (
    public_status IN ('unpublished', 'published', 'withdrawn')
  ),
  CONSTRAINT cms_documents_draft_payload_object CHECK (jsonb_typeof(draft_payload) = 'object'),
  CONSTRAINT cms_documents_edit_version_check CHECK (edit_version >= 0)
);

CREATE UNIQUE INDEX cms_documents_one_home_idx
  ON public.cms_documents (site_id, locale)
  WHERE is_home AND deleted_at IS NULL;
CREATE INDEX cms_documents_listing_idx
  ON public.cms_documents (tenant_id, site_id, kind, publication_type, deleted_at);
CREATE INDEX cms_documents_public_feed_idx
  ON public.cms_documents (site_id, public_status, published_at DESC);
CREATE INDEX cms_documents_parent_idx ON public.cms_documents (parent_id)
  WHERE parent_id IS NOT NULL;
CREATE INDEX cms_documents_published_revision_idx ON public.cms_documents (published_revision_id)
  WHERE published_revision_id IS NOT NULL;
CREATE INDEX cms_documents_created_by_idx ON public.cms_documents (created_by)
  WHERE created_by IS NOT NULL;
CREATE INDEX cms_documents_updated_by_idx ON public.cms_documents (updated_by)
  WHERE updated_by IS NOT NULL;

-- Append-only. `created_by` is a soft reference (no FK) so removing an auth
-- user never has to rewrite history; `updated_at` exists for the project-wide
-- column convention and always equals `created_at`.
CREATE TABLE public.cms_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  document_id uuid NOT NULL,
  revision_number integer NOT NULL,
  snapshot jsonb NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_revisions_document_number_key UNIQUE (document_id, revision_number),
  CONSTRAINT cms_revisions_id_document_key UNIQUE (id, document_id),
  CONSTRAINT cms_revisions_tenant_site_id_key UNIQUE (tenant_id, site_id, id),
  CONSTRAINT cms_revisions_document_fkey FOREIGN KEY (tenant_id, site_id, document_id)
    REFERENCES public.cms_documents (tenant_id, site_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_revisions_revision_number_check CHECK (revision_number > 0),
  CONSTRAINT cms_revisions_snapshot_object CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT cms_revisions_reason_check CHECK (
    reason IN ('checkpoint', 'review', 'publish', 'restore')
  )
);

CREATE INDEX cms_revisions_document_number_desc_idx
  ON public.cms_revisions (document_id, revision_number DESC);
CREATE INDEX cms_revisions_site_idx ON public.cms_revisions (site_id);

-- The published revision must belong to the document itself.
ALTER TABLE public.cms_documents
  ADD CONSTRAINT cms_documents_published_revision_fkey
  FOREIGN KEY (published_revision_id, id)
  REFERENCES public.cms_revisions (id, document_id)
  ON DELETE SET NULL (published_revision_id);

-- ---------------------------------------------------------------------------
-- Routes
-- ---------------------------------------------------------------------------

CREATE TABLE public.cms_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  locale text NOT NULL DEFAULT 'pt-BR',
  path text NOT NULL,
  document_id uuid,
  revision_id uuid,
  route_kind text NOT NULL DEFAULT 'document',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_routes_site_locale_path_key UNIQUE (site_id, locale, path),
  CONSTRAINT cms_routes_site_fkey FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.cms_sites (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_routes_document_fkey FOREIGN KEY (tenant_id, site_id, document_id)
    REFERENCES public.cms_documents (tenant_id, site_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_routes_revision_fkey FOREIGN KEY (revision_id, document_id)
    REFERENCES public.cms_revisions (id, document_id) ON DELETE SET NULL (revision_id),
  CONSTRAINT cms_routes_path_format CHECK (
    path ~ '^/$|^(/[a-z0-9][a-z0-9._~-]*)+$' AND char_length(path) <= 1024
  ),
  CONSTRAINT cms_routes_locale_format CHECK (
    locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' AND char_length(locale) <= 16
  ),
  CONSTRAINT cms_routes_route_kind_check CHECK (route_kind IN ('document', 'reserved', 'redirect')),
  CONSTRAINT cms_routes_target_matches_kind CHECK (
    (route_kind = 'reserved') = (document_id IS NULL)
  ),
  CONSTRAINT cms_routes_revision_requires_document CHECK (
    revision_id IS NULL OR document_id IS NOT NULL
  )
);

CREATE INDEX cms_routes_document_idx ON public.cms_routes (document_id, locale)
  WHERE document_id IS NOT NULL;
CREATE INDEX cms_routes_revision_idx ON public.cms_routes (revision_id)
  WHERE revision_id IS NOT NULL;
CREATE INDEX cms_routes_tenant_idx ON public.cms_routes (tenant_id);

-- ---------------------------------------------------------------------------
-- Taxonomies
-- ---------------------------------------------------------------------------

CREATE TABLE public.cms_taxonomies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_taxonomies_site_kind_slug_key UNIQUE (site_id, kind, slug),
  CONSTRAINT cms_taxonomies_tenant_site_id_key UNIQUE (tenant_id, site_id, id),
  CONSTRAINT cms_taxonomies_site_fkey FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.cms_sites (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_taxonomies_kind_check CHECK (kind IN ('category', 'tag')),
  CONSTRAINT cms_taxonomies_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT cms_taxonomies_slug_format CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 160
  )
);

CREATE TABLE public.cms_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  taxonomy_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  parent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_terms_taxonomy_slug_key UNIQUE (taxonomy_id, slug),
  CONSTRAINT cms_terms_taxonomy_id_key UNIQUE (taxonomy_id, id),
  CONSTRAINT cms_terms_tenant_site_id_key UNIQUE (tenant_id, site_id, id),
  CONSTRAINT cms_terms_taxonomy_fkey FOREIGN KEY (tenant_id, site_id, taxonomy_id)
    REFERENCES public.cms_taxonomies (tenant_id, site_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_terms_parent_fkey FOREIGN KEY (taxonomy_id, parent_id)
    REFERENCES public.cms_terms (taxonomy_id, id) ON DELETE SET NULL (parent_id),
  CONSTRAINT cms_terms_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT cms_terms_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT cms_terms_slug_format CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 160
  )
);

CREATE INDEX cms_terms_site_idx ON public.cms_terms (site_id);
CREATE INDEX cms_terms_parent_idx ON public.cms_terms (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE TABLE public.cms_revision_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  term_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_revision_terms_revision_term_key UNIQUE (revision_id, term_id),
  CONSTRAINT cms_revision_terms_revision_fkey FOREIGN KEY (tenant_id, site_id, revision_id)
    REFERENCES public.cms_revisions (tenant_id, site_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_revision_terms_term_fkey FOREIGN KEY (tenant_id, site_id, term_id)
    REFERENCES public.cms_terms (tenant_id, site_id, id) ON DELETE CASCADE
);

CREATE INDEX cms_revision_terms_term_idx ON public.cms_revision_terms (term_id);
CREATE INDEX cms_revision_terms_site_idx ON public.cms_revision_terms (site_id);
CREATE INDEX cms_revision_terms_tenant_idx ON public.cms_revision_terms (tenant_id);

-- ---------------------------------------------------------------------------
-- Media usage
-- ---------------------------------------------------------------------------

-- The asset FK uses the default NO ACTION so a referenced asset cannot be
-- deleted directly, while tenant deletion (which cascades both sides within
-- one statement) still succeeds.
CREATE TABLE public.cms_asset_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  document_id uuid,
  revision_id uuid,
  usage_kind text NOT NULL,
  field_path text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_asset_usages_unique_usage
    UNIQUE NULLS NOT DISTINCT (asset_id, document_id, revision_id, usage_kind, field_path),
  CONSTRAINT cms_asset_usages_site_fkey FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.cms_sites (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_asset_usages_asset_fkey FOREIGN KEY (asset_id, tenant_id)
    REFERENCES public.media_assets (id, tenant_id),
  CONSTRAINT cms_asset_usages_document_fkey FOREIGN KEY (tenant_id, site_id, document_id)
    REFERENCES public.cms_documents (tenant_id, site_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_asset_usages_revision_fkey FOREIGN KEY (revision_id, document_id)
    REFERENCES public.cms_revisions (id, document_id) ON DELETE CASCADE,
  CONSTRAINT cms_asset_usages_usage_kind_check CHECK (usage_kind IN ('draft', 'revision', 'global')),
  CONSTRAINT cms_asset_usages_target_matches_kind CHECK (
    (usage_kind = 'draft' AND document_id IS NOT NULL AND revision_id IS NULL)
    OR (usage_kind = 'revision' AND document_id IS NOT NULL AND revision_id IS NOT NULL)
    OR (usage_kind = 'global' AND document_id IS NULL AND revision_id IS NULL)
  ),
  CONSTRAINT cms_asset_usages_field_path_length CHECK (char_length(field_path) <= 512)
);

CREATE INDEX cms_asset_usages_document_idx ON public.cms_asset_usages (document_id)
  WHERE document_id IS NOT NULL;
CREATE INDEX cms_asset_usages_revision_idx ON public.cms_asset_usages (revision_id)
  WHERE revision_id IS NOT NULL;
CREATE INDEX cms_asset_usages_site_idx ON public.cms_asset_usages (site_id);
CREATE INDEX cms_asset_usages_tenant_idx ON public.cms_asset_usages (tenant_id);

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

-- Append-only. site/document/revision/actor are soft references so the trail
-- survives hard deletes; tenant consistency is checked on insert instead.
CREATE TABLE public.cms_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  document_id uuid,
  revision_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_audit_events_action_format CHECK (
    action ~ '^[a-z][a-z0-9_.]*$' AND char_length(action) <= 80
  ),
  CONSTRAINT cms_audit_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX cms_audit_events_tenant_created_idx
  ON public.cms_audit_events (tenant_id, created_at DESC);
CREATE INDEX cms_audit_events_document_created_idx
  ON public.cms_audit_events (document_id, created_at DESC)
  WHERE document_id IS NOT NULL;
CREATE INDEX cms_audit_events_site_created_idx
  ON public.cms_audit_events (site_id, created_at DESC)
  WHERE site_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Legacy import map
-- ---------------------------------------------------------------------------

CREATE TABLE public.cms_legacy_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  legacy_table text NOT NULL,
  legacy_id text NOT NULL,
  document_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_legacy_map_legacy_key UNIQUE (legacy_table, legacy_id),
  CONSTRAINT cms_legacy_map_document_fkey FOREIGN KEY (tenant_id, site_id, document_id)
    REFERENCES public.cms_documents (tenant_id, site_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_legacy_map_legacy_table_length CHECK (char_length(legacy_table) BETWEEN 1 AND 120),
  CONSTRAINT cms_legacy_map_legacy_id_length CHECK (char_length(legacy_id) BETWEEN 1 AND 200)
);

CREATE INDEX cms_legacy_map_document_idx ON public.cms_legacy_map (document_id);
CREATE INDEX cms_legacy_map_site_idx ON public.cms_legacy_map (site_id);
CREATE INDEX cms_legacy_map_tenant_idx ON public.cms_legacy_map (tenant_id);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- Hierarchy is a page concern: a page may only be nested under another page.
CREATE OR REPLACE FUNCTION private.cms_documents_validate_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.cms_documents p
    WHERE p.id = NEW.parent_id
      AND p.kind = 'page'
  ) THEN
    RAISE EXCEPTION 'cms_documents.parent_id must reference a page'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cms_documents_validate_parent
  BEFORE INSERT OR UPDATE OF parent_id, kind ON public.cms_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.cms_documents_validate_parent();

-- Revisions and audit events never change. Deletes are only accepted while an
-- owning row is being removed (cascade from tenant, site or document), which is
-- detectable because the parent row is no longer visible to the RI query.
-- Security definer so RLS can never hide the parent and fake that condition.
CREATE OR REPLACE FUNCTION private.cms_block_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.tenant t WHERE t.id = OLD.tenant_id) THEN
      RETURN OLD;
    END IF;

    IF TG_TABLE_NAME = 'cms_revisions' AND (
      NOT EXISTS (SELECT 1 FROM public.cms_documents d WHERE d.id = OLD.document_id)
      OR NOT EXISTS (SELECT 1 FROM public.cms_sites s WHERE s.id = OLD.site_id)
    ) THEN
      RETURN OLD;
    END IF;
  END IF;

  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'P0403', HINT = 'immutable_record';
END;
$$;

CREATE TRIGGER cms_revisions_immutable
  BEFORE UPDATE OR DELETE ON public.cms_revisions
  FOR EACH ROW
  EXECUTE FUNCTION private.cms_block_history_mutation();

CREATE TRIGGER cms_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.cms_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION private.cms_block_history_mutation();

-- Audit rows keep soft references, so tenant consistency is verified here.
CREATE OR REPLACE FUNCTION private.cms_audit_events_validate_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cms_sites s
    WHERE s.id = NEW.site_id AND s.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'cms_audit_events.site_id does not belong to tenant'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cms_documents d
    WHERE d.id = NEW.document_id
      AND d.tenant_id = NEW.tenant_id
      AND (NEW.site_id IS NULL OR d.site_id = NEW.site_id)
  ) THEN
    RAISE EXCEPTION 'cms_audit_events.document_id does not belong to tenant/site'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cms_revisions r
    WHERE r.id = NEW.revision_id
      AND r.tenant_id = NEW.tenant_id
      AND (NEW.document_id IS NULL OR r.document_id = NEW.document_id)
  ) THEN
    RAISE EXCEPTION 'cms_audit_events.revision_id does not belong to tenant/document'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cms_audit_events_validate_refs
  BEFORE INSERT ON public.cms_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION private.cms_audit_events_validate_refs();

REVOKE ALL ON FUNCTION private.cms_documents_validate_parent() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cms_block_history_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cms_audit_events_validate_refs() FROM PUBLIC;

-- Mutable tables share the project-wide updated_at trigger.
DO $$
DECLARE
  v_table_name text;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'cms_sites',
    'cms_site_domains',
    'cms_authors',
    'cms_documents',
    'cms_routes',
    'cms_taxonomies',
    'cms_terms',
    'cms_revision_terms',
    'cms_asset_usages',
    'cms_legacy_map'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.set_updated_at()',
      v_table_name
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------
-- Staff (admin/funcionario in app_metadata) and every user with a role on the
-- tenant (direct or through an agency organization) go through the existing
-- `private.user_has_tenant_access`. Anonymous visitors never touch these tables:
-- public delivery runs on the server with the service role. TRUNCATE is revoked
-- because it bypasses RLS.

DO $$
DECLARE
  v_table_name text;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'cms_sites',
    'cms_site_domains',
    'cms_authors',
    'cms_documents',
    'cms_revisions',
    'cms_routes',
    'cms_taxonomies',
    'cms_terms',
    'cms_revision_terms',
    'cms_asset_usages',
    'cms_audit_events',
    'cms_legacy_map'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', v_table_name);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', v_table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_table_name);

    IF v_table_name IN ('cms_revisions', 'cms_audit_events') THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON public.%I FROM authenticated', v_table_name);
      EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', v_table_name);
      EXECUTE format(
        'CREATE POLICY cms_tenant_select ON public.%I FOR SELECT TO authenticated USING (private.user_has_tenant_access(tenant_id))',
        v_table_name
      );
      EXECUTE format(
        'CREATE POLICY cms_tenant_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (private.user_has_tenant_access(tenant_id))',
        v_table_name
      );
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', v_table_name);
      EXECUTE format(
        'CREATE POLICY cms_tenant_all ON public.%I FOR ALL TO authenticated USING (private.user_has_tenant_access(tenant_id)) WITH CHECK (private.user_has_tenant_access(tenant_id))',
        v_table_name
      );
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- RPCs (service role only; the server authorizes the caller first)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cms_publish_revision(
  p_document_id uuid,
  p_expected_version integer,
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
  v_payload jsonb;
  v_title text;
  v_slug text;
  v_prefix text;
  v_parent_path text;
  v_path text;
  v_conflict public.cms_routes%ROWTYPE;
  v_old_paths text[];
  v_term_ids uuid[];
  v_revision_id uuid;
  v_revision_number integer;
  v_published_at timestamptz;
BEGIN
  SELECT * INTO v_doc
  FROM public.cms_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0404';
  END IF;

  IF p_expected_version IS NULL OR v_doc.edit_version <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict'
      USING ERRCODE = 'P0409',
        DETAIL = pg_catalog.jsonb_build_object(
          'currentVersion', v_doc.edit_version,
          'updatedAt', v_doc.updated_at,
          'updatedBy', v_doc.updated_by
        )::text;
  END IF;

  SELECT * INTO STRICT v_site FROM public.cms_sites WHERE id = v_doc.site_id;

  -- Publish validation (mirrors cmsPublishablePayloadSchema).
  v_payload := v_doc.draft_payload;

  IF pg_catalog.jsonb_typeof(v_payload -> 'title') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = '{"field":"title","reason":"required"}';
  END IF;
  v_title := pg_catalog.btrim(v_payload ->> 'title');
  IF v_title = '' OR pg_catalog.char_length(v_title) > 200 THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = '{"field":"title","reason":"invalid_length"}';
  END IF;

  IF v_payload ? 'slug' AND v_payload -> 'slug' <> 'null'::jsonb
     AND pg_catalog.jsonb_typeof(v_payload -> 'slug') <> 'string' THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = '{"field":"slug","reason":"invalid_type"}';
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

  -- Public path.
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
    v_prefix := NULLIF(pg_catalog.btrim(v_site.settings -> 'routes' ->> v_doc.publication_type), '');
    v_prefix := COALESCE(
      v_prefix,
      CASE v_doc.publication_type WHEN 'article' THEN 'artigos' ELSE 'noticias' END
    );
    v_path := public.cms_normalize_path(v_prefix);
    v_path := CASE WHEN v_path = '/' THEN '' ELSE v_path END || '/' || v_slug;
  END IF;

  IF v_path !~ '^/$|^(/[a-z0-9][a-z0-9._~-]*)+$' THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = pg_catalog.jsonb_build_object('field', 'path', 'reason', 'invalid_format', 'path', v_path)::text;
  END IF;

  -- Terms must belong to the same site.
  IF v_payload ? 'termIds' AND v_payload -> 'termIds' <> 'null'::jsonb THEN
    IF pg_catalog.jsonb_typeof(v_payload -> 'termIds') <> 'array' OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(v_payload -> 'termIds') e(value)
      WHERE pg_catalog.jsonb_typeof(e.value) <> 'string'
        OR (e.value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) THEN
      RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
        DETAIL = '{"field":"termIds","reason":"invalid_format"}';
    END IF;

    SELECT COALESCE(pg_catalog.array_agg(DISTINCT (e.value)::uuid), '{}')
    INTO v_term_ids
    FROM pg_catalog.jsonb_array_elements_text(v_payload -> 'termIds') e(value);
  ELSE
    v_term_ids := '{}';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.cms_terms t
    WHERE t.id = ANY (v_term_ids)
      AND t.site_id = v_doc.site_id
      AND t.tenant_id = v_doc.tenant_id
  ) <> COALESCE(pg_catalog.array_length(v_term_ids, 1), 0) THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'P0422',
      DETAIL = '{"field":"termIds","reason":"unknown_term"}';
  END IF;

  -- Route conflicts: another document's live route or a reserved path blocks
  -- publishing; a stale redirect of any document is taken over.
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

  -- Revision.
  SELECT COALESCE(MAX(r.revision_number), 0) + 1 INTO v_revision_number
  FROM public.cms_revisions r
  WHERE r.document_id = v_doc.id;

  INSERT INTO public.cms_revisions (
    tenant_id, site_id, document_id, revision_number, snapshot, reason, created_by
  )
  VALUES (
    v_doc.tenant_id, v_doc.site_id, v_doc.id, v_revision_number, v_payload, 'publish', p_actor
  )
  RETURNING id INTO v_revision_id;

  -- Routes: replace this document's live route; old paths become redirects.
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
      v_doc.tenant_id, v_doc.site_id, v_doc.locale, v_path, v_doc.id, v_revision_id, 'document'
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

  INSERT INTO public.cms_revision_terms (tenant_id, site_id, revision_id, term_id)
  SELECT v_doc.tenant_id, v_doc.site_id, v_revision_id, term_id
  FROM pg_catalog.unnest(v_term_ids) AS term_id;

  UPDATE public.cms_documents
  SET published_revision_id = v_revision_id,
      public_status = 'published',
      published_at = COALESCE(published_at, pg_catalog.now()),
      has_unpublished_changes = false,
      title = v_title,
      slug = v_slug,
      updated_by = COALESCE(p_actor, updated_by)
  WHERE id = v_doc.id
  RETURNING published_at INTO v_published_at;

  INSERT INTO public.cms_audit_events (
    tenant_id, site_id, actor_user_id, action, document_id, revision_id, metadata
  )
  VALUES (
    v_doc.tenant_id, v_doc.site_id, p_actor, 'publish', v_doc.id, v_revision_id,
    pg_catalog.jsonb_build_object(
      'revisionNumber', v_revision_number,
      'path', v_path,
      'previousPaths', pg_catalog.to_jsonb(v_old_paths)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'revision_id', v_revision_id,
    'revision_number', v_revision_number,
    'path', v_path,
    'published_at', v_published_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cms_unpublish_document(
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
  v_removed_paths text[];
  v_public_status text;
BEGIN
  SELECT * INTO v_doc
  FROM public.cms_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0404';
  END IF;

  WITH removed AS (
    DELETE FROM public.cms_routes r
    WHERE r.document_id = v_doc.id
      AND r.route_kind = 'document'
    RETURNING r.path
  )
  SELECT COALESCE(pg_catalog.array_agg(removed.path), '{}') INTO v_removed_paths FROM removed;

  v_public_status := CASE
    WHEN v_doc.public_status = 'published' THEN 'withdrawn'
    ELSE v_doc.public_status
  END;

  IF v_public_status IS DISTINCT FROM v_doc.public_status THEN
    UPDATE public.cms_documents
    SET public_status = v_public_status,
        updated_by = COALESCE(p_actor, updated_by)
    WHERE id = v_doc.id;
  END IF;

  IF v_public_status IS DISTINCT FROM v_doc.public_status
     OR COALESCE(pg_catalog.array_length(v_removed_paths, 1), 0) > 0 THEN
    INSERT INTO public.cms_audit_events (
      tenant_id, site_id, actor_user_id, action, document_id, revision_id, metadata
    )
    VALUES (
      v_doc.tenant_id, v_doc.site_id, p_actor, 'unpublish', v_doc.id, v_doc.published_revision_id,
      pg_catalog.jsonb_build_object('removedPaths', pg_catalog.to_jsonb(v_removed_paths))
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'document_id', v_doc.id,
    'public_status', v_public_status,
    'removed_paths', pg_catalog.to_jsonb(v_removed_paths)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cms_publish_revision(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cms_unpublish_document(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cms_normalize_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cms_publish_revision(uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cms_unpublish_document(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cms_normalize_path(text) TO authenticated, service_role;
