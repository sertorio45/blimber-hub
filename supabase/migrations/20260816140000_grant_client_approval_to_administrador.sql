-- Company Administrador (app role `cliente`) can decide client-stage
-- approvals in the Hub. Extra org role `approver` already has this grant.
-- Direct owners keep self-serve draft/schedule/publish (no forced workflow)
-- but can still approve if a request is sent to the tenant.

INSERT INTO public.role_capabilities (role, capability)
SELECT seed.role_name::public.app_role, seed.capability
FROM (
  VALUES
    ('cliente', 'marketing.social.approval.client'),
    ('cliente', 'marketing.social.approve')
) AS seed(role_name, capability)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.role_capabilities rc
  WHERE rc.role = seed.role_name::public.app_role
    AND rc.capability = seed.capability
    AND rc.tenant_id IS NULL
);

INSERT INTO public.organization_role_capabilities (role_id, capability, allowed)
SELECT r.id, c.capability, true
FROM public.organization_roles r
LEFT JOIN public.organizations o ON o.id = r.organization_id
CROSS JOIN (
  VALUES
    ('marketing.social.approval.client'),
    ('marketing.social.approve')
) AS c(capability)
WHERE r.slug = 'owner'
  AND (
    (r.organization_id IS NULL AND r.organization_type = 'direct')
    OR o.type = 'direct'
  )
ON CONFLICT (role_id, capability) DO UPDATE SET allowed = true;
