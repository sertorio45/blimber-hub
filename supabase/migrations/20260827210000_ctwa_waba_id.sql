-- CTWA business_messaging: Meta requires whatsapp_business_account_id alongside ctwa_clid

ALTER TABLE public.whatsapp_attribution
  ADD COLUMN IF NOT EXISTS waba_id text;

ALTER TABLE public.crm_lead
  ADD COLUMN IF NOT EXISTS meta_waba_id text;

COMMENT ON COLUMN public.whatsapp_attribution.waba_id IS
  'WhatsApp Business Account id (Cloud API entry.id) captured with the CTWA click';

COMMENT ON COLUMN public.crm_lead.meta_waba_id IS
  'WABA id required by Meta CAPI business_messaging events together with meta_ctwa_clid';
