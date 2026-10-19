-- Cache-invalidation queue for the public site renderer.
--
-- Publish and unpublish already append `cms_audit_events` inside their RPCs.
-- This trigger copies those two actions into `cms_event_outbox` in the same
-- transaction. The row is a job stub: nothing delivers it yet. Payloads stay
-- limited to the audit metadata, so `draft_payload` never lands here.
--
-- The function is SECURITY INVOKER and lives in `private` so it is not a
-- public API. `service_role` (the publish RPC) can insert; `authenticated`
-- can only read its own tenant.

CREATE TABLE public.cms_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  site_id uuid,
  document_id uuid,
  revision_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_event_outbox_event_type_check CHECK (event_type IN ('publish', 'unpublish')),
  CONSTRAINT cms_event_outbox_status_check CHECK (status IN ('pending', 'delivered', 'failed')),
  CONSTRAINT cms_event_outbox_attempts_check CHECK (attempts >= 0),
  CONSTRAINT cms_event_outbox_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX cms_event_outbox_pending_idx
  ON public.cms_event_outbox (available_at, created_at)
  WHERE status = 'pending';

CREATE INDEX cms_event_outbox_tenant_created_idx
  ON public.cms_event_outbox (tenant_id, created_at DESC);

CREATE TRIGGER set_cms_event_outbox_updated_at
  BEFORE UPDATE ON public.cms_event_outbox
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE OR REPLACE FUNCTION private.cms_enqueue_invalidation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.cms_event_outbox (
    tenant_id, site_id, document_id, revision_id, event_type, payload
  )
  VALUES (
    NEW.tenant_id,
    NEW.site_id,
    NEW.document_id,
    NEW.revision_id,
    NEW.action,
    pg_catalog.jsonb_build_object(
      'auditId', NEW.id,
      'metadata', COALESCE(NEW.metadata, '{}'::jsonb)
    )
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.cms_enqueue_invalidation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER cms_audit_events_enqueue_invalidation
  AFTER INSERT ON public.cms_audit_events
  FOR EACH ROW
  WHEN (NEW.action IN ('publish', 'unpublish'))
  EXECUTE FUNCTION private.cms_enqueue_invalidation();

ALTER TABLE public.cms_event_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cms_event_outbox FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.cms_event_outbox FROM authenticated;
GRANT SELECT ON public.cms_event_outbox TO authenticated;
GRANT ALL ON public.cms_event_outbox TO service_role;

CREATE POLICY cms_event_outbox_tenant_select
  ON public.cms_event_outbox
  FOR SELECT
  TO authenticated
  USING (private.user_has_tenant_access(tenant_id));
