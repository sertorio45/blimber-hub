-- Editable Marketing Report layouts (Meta Ads / Google Ads) per tenant.
-- Do not apply to production without explicit approval.

CREATE TABLE IF NOT EXISTS public.marketing_report_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('meta', 'google_ads')),
  template_base_id text NOT NULL,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  name text NOT NULL DEFAULT 'Personalizado',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_report_layouts_tenant_provider_template_unique
    UNIQUE (tenant_id, provider, template_base_id)
);

CREATE INDEX IF NOT EXISTS marketing_report_layouts_tenant_provider_idx
  ON public.marketing_report_layouts (tenant_id, provider);

COMMENT ON TABLE public.marketing_report_layouts IS
  'Custom Marketing Reports board layouts (KPI/chart/table blocks) per tenant + provider + template.';

COMMENT ON COLUMN public.marketing_report_layouts.layout IS
  'JSON: { version: 1, templateBaseId, blocks: [{ id, type, enabled?, metricKeys?, title? }] }';

ALTER TABLE public.marketing_report_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.marketing_report_layouts;
CREATE POLICY tenant_isolation ON public.marketing_report_layouts
  FOR ALL TO authenticated
  USING (private.user_has_tenant_access(tenant_id))
  WITH CHECK (private.user_has_tenant_access(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_report_layouts TO authenticated;
GRANT ALL ON public.marketing_report_layouts TO service_role;
