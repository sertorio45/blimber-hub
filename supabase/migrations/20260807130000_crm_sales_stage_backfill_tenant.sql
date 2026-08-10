-- Backfill tenant_id on stages that inherited null from shared/default funnels,
-- so reorder (PUT by tenant) and RLS-friendly queries work consistently.
UPDATE public.crm_sales_stage AS stage
SET tenant_id = funnel.tenant_id
FROM public.crm_funnel AS funnel
WHERE stage.funnel_id = funnel.id
  AND stage.tenant_id IS NULL
  AND funnel.tenant_id IS NOT NULL;
