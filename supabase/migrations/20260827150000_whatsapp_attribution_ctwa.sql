-- CTWA WhatsApp attribution: silent capture + CRM lead match fields

CREATE TABLE IF NOT EXISTS public.whatsapp_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.whatsapp_instance (id) ON DELETE SET NULL,
  phone_e164 text NOT NULL,
  ctwa_clid text NOT NULL,
  source_id text,
  source_type text,
  headline text,
  body text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  meta_campaign_name text,
  meta_adset_name text,
  meta_ad_name text,
  received_at timestamptz NOT NULL DEFAULT now(),
  matched_lead_id uuid REFERENCES public.crm_lead (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_attribution_tenant_phone_clid_unique
    UNIQUE (tenant_id, phone_e164, ctwa_clid)
);

CREATE INDEX IF NOT EXISTS whatsapp_attribution_phone_match_idx
  ON public.whatsapp_attribution (tenant_id, phone_e164, received_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_attribution_unmatched_idx
  ON public.whatsapp_attribution (tenant_id, phone_e164, received_at DESC)
  WHERE matched_lead_id IS NULL;

COMMENT ON TABLE public.whatsapp_attribution IS
  'CTWA referral capture from WhatsApp webhooks for later CRM lead matching by phone';

ALTER TABLE public.whatsapp_attribution ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.whatsapp_attribution;
CREATE POLICY tenant_isolation ON public.whatsapp_attribution
  FOR ALL TO authenticated
  USING (private.user_has_tenant_access(tenant_id))
  WITH CHECK (private.user_has_tenant_access(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_attribution TO authenticated;
GRANT ALL ON public.whatsapp_attribution TO service_role;

ALTER TABLE public.crm_lead
  ADD COLUMN IF NOT EXISTS meta_ctwa_clid text,
  ADD COLUMN IF NOT EXISTS meta_source_id text,
  ADD COLUMN IF NOT EXISTS meta_campaign_id text,
  ADD COLUMN IF NOT EXISTS meta_adset_id text,
  ADD COLUMN IF NOT EXISTS meta_ad_id text,
  ADD COLUMN IF NOT EXISTS meta_campaign_name text,
  ADD COLUMN IF NOT EXISTS meta_adset_name text,
  ADD COLUMN IF NOT EXISTS meta_ad_name text,
  ADD COLUMN IF NOT EXISTS attribution_method text,
  ADD COLUMN IF NOT EXISTS attribution_date timestamptz,
  ADD COLUMN IF NOT EXISTS attribution_channel text;

COMMENT ON COLUMN public.crm_lead.meta_ctwa_clid IS 'Click-to-WhatsApp click id from Meta referral webhook';
COMMENT ON COLUMN public.crm_lead.meta_source_id IS 'Meta referral source_id (usually ad id)';
COMMENT ON COLUMN public.crm_lead.attribution_method IS 'How attribution was resolved (e.g. ctwa_clid)';
COMMENT ON COLUMN public.crm_lead.attribution_channel IS 'Channel of attribution (e.g. whatsapp)';
