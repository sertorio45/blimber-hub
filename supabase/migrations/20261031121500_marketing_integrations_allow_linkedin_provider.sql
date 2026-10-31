-- LinkedIn OAuth upsert failed: provider check still lacked 'linkedin'
-- (legacy constraint name dashboard_integrations_provider_check after rename).
ALTER TABLE public.marketing_integrations
  DROP CONSTRAINT IF EXISTS dashboard_integrations_provider_check;

ALTER TABLE public.marketing_integrations
  ADD CONSTRAINT dashboard_integrations_provider_check
  CHECK (provider = ANY (ARRAY[
    'google'::text,
    'google_ads'::text,
    'google_analytics'::text,
    'meta'::text,
    'linkedin'::text
  ]));
