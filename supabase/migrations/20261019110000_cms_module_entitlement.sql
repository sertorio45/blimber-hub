-- CMS commercial module: entitlement, capability catalog, role defaults and
-- CMS role presets. `article` stays a technical alias of `cms` (both ways).
-- Mirrors constants/modules.ts and constants/organization-role-matrix.ts.
-- Idempotent: every statement can run again without duplicating rows.

-- ---------------------------------------------------------------------------
-- 1) Capability catalog
-- ---------------------------------------------------------------------------

INSERT INTO public.capabilities (key, description)
VALUES
  ('cms.read', 'Visualizar o CMS do site'),
  ('cms.pages.create', 'Criar páginas do site'),
  ('cms.pages.update', 'Editar páginas do site'),
  ('cms.pages.delete', 'Excluir páginas do site'),
  ('cms.publications.create', 'Criar publicações do site'),
  ('cms.publications.update', 'Editar publicações do site'),
  ('cms.publications.delete', 'Excluir publicações do site'),
  ('cms.publish', 'Publicar páginas e publicações no site'),
  ('cms.media.read', 'Visualizar a mídia do site'),
  ('cms.media.upload', 'Enviar mídia para o site'),
  ('cms.media.delete', 'Excluir mídia do site'),
  ('cms.navigation.manage', 'Gerenciar menus do site'),
  ('cms.appearance.manage', 'Gerenciar a aparência do site'),
  ('cms.settings.manage', 'Gerenciar as configurações do site')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- 2) Entitlement: tenants with an active `article` row also get `cms`
--    (tenant_modules.module_name is plain text — no enum / CHECK to extend).
-- ---------------------------------------------------------------------------

INSERT INTO public.tenant_modules (tenant_id, module_name, is_active, activated_at)
SELECT t.id, 'cms', true, now()
FROM public.tenant t
WHERE EXISTS (
  SELECT 1
  FROM public.tenant_modules tm
  WHERE tm.tenant_id = t.id
    AND tm.module_name = 'article'
    AND tm.is_active = true
)
AND NOT EXISTS (
  SELECT 1
  FROM public.tenant_modules tm
  WHERE tm.tenant_id = t.id
    AND tm.module_name = 'cms'
)
ON CONFLICT (tenant_id, module_name) DO NOTHING;

-- `article` ⇄ `cms` alias for RLS / RPC checks, on top of the `all` bundle.
CREATE OR REPLACE FUNCTION public.is_tenant_module_active(p_tenant_id uuid, p_module_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_modules tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.is_active = true
      AND (
        tm.module_name = p_module_name
        OR tm.module_name = 'all'
        OR (
          p_module_name IN ('cms', 'article')
          AND tm.module_name IN ('cms', 'article')
        )
      )
  );
$function$;

COMMENT ON FUNCTION public.is_tenant_module_active(uuid, text) IS
  'Returns true when tenant has the module active, module_name = all (full Blimber bundle), or the cms/article alias.';

-- ---------------------------------------------------------------------------
-- 3) Legacy app_role defaults (role_capabilities, global rows)
--    staff + cliente: every cms.*; atendente: draft publications + media.
-- ---------------------------------------------------------------------------

INSERT INTO public.role_capabilities (role, capability)
SELECT seed.role_name::public.app_role, seed.capability
FROM (
  SELECT r.role_name, c.capability
  FROM (VALUES ('admin'), ('funcionario'), ('cliente')) AS r(role_name)
  CROSS JOIN (VALUES
    ('cms.read'), ('cms.pages.create'), ('cms.pages.update'), ('cms.pages.delete'),
    ('cms.publications.create'), ('cms.publications.update'), ('cms.publications.delete'),
    ('cms.publish'), ('cms.media.read'), ('cms.media.upload'), ('cms.media.delete'),
    ('cms.navigation.manage'), ('cms.appearance.manage'), ('cms.settings.manage')
  ) AS c(capability)
  UNION ALL
  SELECT 'atendente', c.capability
  FROM (VALUES
    ('cms.read'), ('cms.publications.create'), ('cms.publications.update'),
    ('cms.media.read'), ('cms.media.upload')
  ) AS c(capability)
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_capabilities rc
  WHERE rc.role = seed.role_name::public.app_role
    AND rc.capability = seed.capability
    AND rc.tenant_id IS NULL
);

-- ---------------------------------------------------------------------------
-- 4) Existing system cargos (templates + every organization copy)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS tmp_cms_tiers;
CREATE TEMP TABLE tmp_cms_tiers (
  tier text NOT NULL,
  capability text NOT NULL
);

INSERT INTO tmp_cms_tiers (tier, capability)
SELECT 'read_only', c FROM unnest(ARRAY['cms.read', 'cms.media.read']) AS c
UNION ALL
SELECT 'contributor', c FROM unnest(ARRAY[
  'cms.read', 'cms.publications.create', 'cms.publications.update',
  'cms.media.read', 'cms.media.upload'
]) AS c
UNION ALL
SELECT 'author', c FROM unnest(ARRAY[
  'cms.read', 'cms.pages.create', 'cms.pages.update',
  'cms.publications.create', 'cms.publications.update',
  'cms.media.read', 'cms.media.upload'
]) AS c
UNION ALL
SELECT 'editor', c FROM unnest(ARRAY[
  'cms.read', 'cms.pages.create', 'cms.pages.update', 'cms.pages.delete',
  'cms.publications.create', 'cms.publications.update', 'cms.publications.delete',
  'cms.media.read', 'cms.media.upload', 'cms.media.delete',
  'cms.navigation.manage'
]) AS c
UNION ALL
SELECT 'publisher', c FROM unnest(ARRAY[
  'cms.read', 'cms.pages.create', 'cms.pages.update', 'cms.pages.delete',
  'cms.publications.create', 'cms.publications.update', 'cms.publications.delete',
  'cms.publish',
  'cms.media.read', 'cms.media.upload', 'cms.media.delete',
  'cms.navigation.manage'
]) AS c
UNION ALL
SELECT 'all', key FROM public.capabilities WHERE key LIKE 'cms.%';

DROP TABLE IF EXISTS tmp_cms_role_tiers;
CREATE TEMP TABLE tmp_cms_role_tiers (
  organization_type public.organization_type NOT NULL,
  slug text NOT NULL,
  tier text NOT NULL
);

INSERT INTO tmp_cms_role_tiers (organization_type, slug, tier)
VALUES
  ('agency', 'owner', 'all'),
  ('agency', 'agency_admin', 'all'),
  ('agency', 'marketing_manager', 'contributor'),
  ('agency', 'social_media', 'contributor'),
  ('agency', 'designer', 'contributor'),
  ('agency', 'copywriter', 'contributor'),
  ('agency', 'internal_approver', 'read_only'),
  ('agency', 'analyst', 'read_only'),
  ('direct', 'owner', 'all'),
  ('direct', 'editor', 'contributor'),
  ('direct', 'approver', 'read_only'),
  ('direct', 'viewer', 'read_only'),
  ('agency', 'cms_author', 'author'),
  ('agency', 'cms_editor', 'editor'),
  ('agency', 'cms_publisher', 'publisher'),
  ('agency', 'cms_site_admin', 'all'),
  ('direct', 'cms_author', 'author'),
  ('direct', 'cms_editor', 'editor'),
  ('direct', 'cms_publisher', 'publisher'),
  ('direct', 'cms_site_admin', 'all');

-- ---------------------------------------------------------------------------
-- 5) CMS role presets as system templates (organization_id IS NULL)
-- ---------------------------------------------------------------------------

INSERT INTO public.organization_roles (
  organization_id, name, slug, description, organization_type,
  is_system, is_default, is_editable, is_protected, legacy_app_role
)
SELECT NULL, v.name, v.slug, v.description, t.organization_type,
  true, false, true, false, 'atendente'::public.app_role
FROM (VALUES
  ('Autor CMS', 'cms_author',
   'Cria e edita páginas e publicações do site e envia mídia. Sem excluir nem publicar.'),
  ('Editor CMS', 'cms_editor',
   'Tudo do Autor, mais excluir conteúdo e mídia e gerenciar menus do site. Sem publicar.'),
  ('Publicador CMS', 'cms_publisher',
   'Tudo do Editor, mais publicar páginas e publicações no site.'),
  ('Administrador do site', 'cms_site_admin',
   'Acesso total ao CMS, incluindo aparência e configurações do site.')
) AS v(name, slug, description)
CROSS JOIN (VALUES
  ('agency'::public.organization_type),
  ('direct'::public.organization_type)
) AS t(organization_type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_roles r
  WHERE r.organization_id IS NULL
    AND r.organization_type = t.organization_type
    AND r.slug = v.slug
);

-- Copy only the new presets into existing organizations. Re-running
-- copy_organization_role_templates would also re-add caps an organization
-- removed from its customized cargos. New organizations get them via trigger.
INSERT INTO public.organization_roles (
  organization_id, name, slug, description, organization_type,
  is_system, is_default, is_editable, is_protected, legacy_app_role
)
SELECT o.id, tpl.name, tpl.slug, tpl.description, o.type,
  tpl.is_system, tpl.is_default, tpl.is_editable, tpl.is_protected, tpl.legacy_app_role
FROM public.organizations o
JOIN public.organization_roles tpl
  ON tpl.organization_id IS NULL
 AND tpl.organization_type = o.type
 AND tpl.slug IN ('cms_author', 'cms_editor', 'cms_publisher', 'cms_site_admin')
WHERE o.type IN ('agency', 'direct')
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_roles r
    WHERE r.organization_id = o.id
      AND r.slug = tpl.slug
  );

-- Scope caps so preset holders can reach the tenant, matching other templates.
INSERT INTO public.organization_role_capabilities (role_id, capability, allowed)
SELECT r.id, base.capability, true
FROM public.organization_roles r
LEFT JOIN public.organizations o ON o.id = r.organization_id
JOIN (VALUES
  ('agency'::public.organization_type, 'organization.read'),
  ('agency'::public.organization_type, 'organization.tenants.read'),
  ('agency'::public.organization_type, 'agency.clients.read'),
  ('direct'::public.organization_type, 'organization.read')
) AS base(organization_type, capability)
  ON base.organization_type = COALESCE(r.organization_type, o.type)
WHERE r.is_system = true
  AND r.slug IN ('cms_author', 'cms_editor', 'cms_publisher', 'cms_site_admin')
ON CONFLICT (role_id, capability) DO NOTHING;

-- cms.* tiers for existing system cargos and the new presets, in templates
-- and every organization copy. DO NOTHING keeps explicit denies untouched.
INSERT INTO public.organization_role_capabilities (role_id, capability, allowed)
SELECT r.id, tier.capability, true
FROM public.organization_roles r
LEFT JOIN public.organizations o ON o.id = r.organization_id
JOIN tmp_cms_role_tiers rt
  ON rt.slug = r.slug
 AND rt.organization_type = COALESCE(r.organization_type, o.type)
JOIN tmp_cms_tiers tier ON tier.tier = rt.tier
WHERE r.is_system = true
ON CONFLICT (role_id, capability) DO NOTHING;

DROP TABLE IF EXISTS tmp_cms_role_tiers;
DROP TABLE IF EXISTS tmp_cms_tiers;
