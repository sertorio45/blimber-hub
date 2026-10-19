-- CMS collections MVP: a versioned schema per site and the entries that follow it.
--
-- `cms.schemas.manage` gates writes (definitions and entries). Listing stays on
-- `cms.read`. Document publish (`cms.publish`) is a different capability and is
-- not granted here.
--
-- Child rows reference the parent through (tenant_id, site_id, id), so an entry
-- cannot point at a collection from another tenant or site even via service role.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.cms_collection_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  -- { "version": 1, "fields": [{ "key", "label", "type", "required" }] }
  schema jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_collection_definitions_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT cms_collection_definitions_tenant_site_id_key UNIQUE (tenant_id, site_id, id),
  CONSTRAINT cms_collection_definitions_site_key_key UNIQUE (site_id, key),
  CONSTRAINT cms_collection_definitions_site_fkey FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.cms_sites (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_collection_definitions_key_format CHECK (
    key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(key) BETWEEN 1 AND 64
  ),
  CONSTRAINT cms_collection_definitions_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT cms_collection_definitions_schema_v1 CHECK (
    jsonb_typeof(schema) = 'object'
    AND schema->>'version' = '1'
    AND jsonb_typeof(schema->'fields') = 'array'
  )
);

CREATE INDEX cms_collection_definitions_tenant_site_idx
  ON public.cms_collection_definitions (tenant_id, site_id);

COMMENT ON TABLE public.cms_collection_definitions IS
  'Per-site collection schema. schema.version is 1 (text, number, boolean, media).';

CREATE TABLE public.cms_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  definition_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_entries_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT cms_entries_site_fkey FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.cms_sites (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_entries_definition_fkey FOREIGN KEY (tenant_id, site_id, definition_id)
    REFERENCES public.cms_collection_definitions (tenant_id, site_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_entries_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT cms_entries_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX cms_entries_tenant_idx ON public.cms_entries (tenant_id);
CREATE INDEX cms_entries_definition_updated_idx
  ON public.cms_entries (definition_id, updated_at DESC, id DESC);

COMMENT ON TABLE public.cms_entries IS
  'One record of a collection. status is draft|published and is not the document publish flow.';

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.cms_collection_definitions
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.cms_entries
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges and tenant-scoped RLS
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_table_name text;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY['cms_collection_definitions', 'cms_entries']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', v_table_name);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', v_table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', v_table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_table_name);
    EXECUTE format(
      'CREATE POLICY cms_tenant_all ON public.%I FOR ALL TO authenticated USING (private.user_has_tenant_access(tenant_id)) WITH CHECK (private.user_has_tenant_access(tenant_id))',
      v_table_name
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Capability catalog + seeds
-- Staff and cliente (legacy app_role) and system cargos that already hold every
-- cms.* (owner, agency_admin, cms_site_admin). Contributors stay read-only here.
-- ---------------------------------------------------------------------------

INSERT INTO public.capabilities (key, description)
VALUES ('cms.schemas.manage', 'Gerenciar coleções e registros estruturados do site')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_capabilities (role, capability)
SELECT seed.role_name::public.app_role, 'cms.schemas.manage'
FROM (VALUES ('admin'), ('funcionario'), ('cliente')) AS seed(role_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_capabilities rc
  WHERE rc.role = seed.role_name::public.app_role
    AND rc.capability = 'cms.schemas.manage'
    AND rc.tenant_id IS NULL
);

INSERT INTO public.organization_role_capabilities (role_id, capability, allowed)
SELECT r.id, 'cms.schemas.manage', true
FROM public.organization_roles r
LEFT JOIN public.organizations o ON o.id = r.organization_id
WHERE r.is_system = true
  AND r.slug IN ('owner', 'agency_admin', 'cms_site_admin')
  AND COALESCE(r.organization_type, o.type) IN ('agency', 'direct')
  AND (
    r.slug <> 'agency_admin'
    OR COALESCE(r.organization_type, o.type) = 'agency'
  )
ON CONFLICT (role_id, capability) DO NOTHING;
