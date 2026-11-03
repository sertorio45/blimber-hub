-- Performance: hot-path indexes + WhatsApp conversation aggregates RPC
-- Covers CRM contact company join, publication jobs, WhatsApp message listing/FKs,
-- and replaces full-table unread scans with a single grouped query.

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_crm_contact_company_id
  ON public.crm_contact (company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_publication_jobs_tenant_id
  ON public.publication_jobs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_publication_jobs_post_id
  ON public.publication_jobs (post_id);

CREATE INDEX IF NOT EXISTS idx_publication_jobs_post_status
  ON public.publication_jobs (post_id, status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_conversation_created
  ON public.whatsapp_message (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_contact_id
  ON public.whatsapp_message (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_lead_id
  ON public.whatsapp_message (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_reply_to_id
  ON public.whatsapp_message (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversation_contact_id
  ON public.whatsapp_conversation (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_assignment_tenant_id
  ON public.whatsapp_assignment (tenant_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_assignment_conversation_id
  ON public.whatsapp_assignment (conversation_id);

-- ---------------------------------------------------------------------------
-- WhatsApp conversation stats by instance (replaces client-side reduce scans)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.whatsapp_conversation_stats_by_instance(
  p_tenant_id uuid,
  p_instance_ids uuid[] DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS TABLE (
  instance_id uuid,
  conversation_count bigint,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.instance_id,
    COUNT(*)::bigint AS conversation_count,
    COALESCE(SUM(c.unread_count), 0)::bigint AS unread_count
  FROM public.whatsapp_conversation c
  WHERE c.tenant_id = p_tenant_id
    AND (p_instance_ids IS NULL OR c.instance_id = ANY (p_instance_ids))
    AND (p_assigned_to IS NULL OR c.assigned_to = p_assigned_to)
  GROUP BY c.instance_id;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_conversation_stats_by_instance(uuid, uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_conversation_stats_by_instance(uuid, uuid[], uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_sum_unread(
  p_tenant_id uuid,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(c.unread_count), 0)::bigint
  FROM public.whatsapp_conversation c
  WHERE c.tenant_id = p_tenant_id
    AND c.unread_count > 0
    AND (p_assigned_to IS NULL OR c.assigned_to = p_assigned_to);
$$;

REVOKE ALL ON FUNCTION public.whatsapp_sum_unread(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_sum_unread(uuid, uuid) TO service_role;
