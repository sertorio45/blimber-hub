-- Fix remaining auth_rls_initplan warnings: wrap auth.uid()/auth.jwt() in (select ...)
-- so Postgres evaluates them once per statement instead of per row.

-- oauth_states
DROP POLICY IF EXISTS oauth_states_own ON public.oauth_states;
CREATE POLICY oauth_states_own ON public.oauth_states
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND private.user_has_tenant_access(tenant_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND private.user_has_tenant_access(tenant_id)
  );

-- marketing_integrations (legacy dashboard_* policy names)
DROP POLICY IF EXISTS dashboard_integrations_admin_func_all ON public.marketing_integrations;
CREATE POLICY dashboard_integrations_admin_func_all ON public.marketing_integrations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(tenant_id, role)
      WHERE tr.role = ANY (ARRAY['admin'::text, 'funcionario'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(tenant_id, role)
      WHERE tr.role = ANY (ARRAY['admin'::text, 'funcionario'::text])
    )
  );

DROP POLICY IF EXISTS dashboard_integrations_cliente_tenant ON public.marketing_integrations;
CREATE POLICY dashboard_integrations_cliente_tenant ON public.marketing_integrations
  FOR ALL TO authenticated
  USING (
    (tenant_id)::text IN (
      SELECT tr.key
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(key, value)
      WHERE tr.value = 'cliente'::text
    )
  )
  WITH CHECK (
    (tenant_id)::text IN (
      SELECT tr.key
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(key, value)
      WHERE tr.value = 'cliente'::text
    )
  );

-- marketing_campaign_cache
DROP POLICY IF EXISTS dashboard_cache_admin_func_all ON public.marketing_campaign_cache;
CREATE POLICY dashboard_cache_admin_func_all ON public.marketing_campaign_cache
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(tenant_id, role)
      WHERE tr.role = ANY (ARRAY['admin'::text, 'funcionario'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(tenant_id, role)
      WHERE tr.role = ANY (ARRAY['admin'::text, 'funcionario'::text])
    )
  );

DROP POLICY IF EXISTS dashboard_cache_cliente_tenant ON public.marketing_campaign_cache;
CREATE POLICY dashboard_cache_cliente_tenant ON public.marketing_campaign_cache
  FOR ALL TO authenticated
  USING (
    (tenant_id)::text IN (
      SELECT tr.key
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(key, value)
      WHERE tr.value = 'cliente'::text
    )
  )
  WITH CHECK (
    (tenant_id)::text IN (
      SELECT tr.key
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(key, value)
      WHERE tr.value = 'cliente'::text
    )
  );

-- marketing_report_logs
DROP POLICY IF EXISTS dashboard_reports_admin_func_all ON public.marketing_report_logs;
CREATE POLICY dashboard_reports_admin_func_all ON public.marketing_report_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(tenant_id, role)
      WHERE tr.role = ANY (ARRAY['admin'::text, 'funcionario'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(tenant_id, role)
      WHERE tr.role = ANY (ARRAY['admin'::text, 'funcionario'::text])
    )
  );

DROP POLICY IF EXISTS dashboard_reports_cliente_tenant ON public.marketing_report_logs;
CREATE POLICY dashboard_reports_cliente_tenant ON public.marketing_report_logs
  FOR ALL TO authenticated
  USING (
    (tenant_id)::text IN (
      SELECT tr.key
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(key, value)
      WHERE tr.value = 'cliente'::text
    )
  )
  WITH CHECK (
    (tenant_id)::text IN (
      SELECT tr.key
      FROM jsonb_each_text(
        COALESCE((((SELECT auth.jwt()) -> 'app_metadata') -> 'tenant_roles'), '{}'::jsonb)
      ) tr(key, value)
      WHERE tr.value = 'cliente'::text
    )
  );
