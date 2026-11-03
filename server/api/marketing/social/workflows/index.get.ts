import { requireSocialContext } from '~/server/utils/social-context'

const WORKFLOW_COLUMNS = [
  'id',
  'organization_id',
  'tenant_id',
  'name',
  'slug',
  'description',
  'is_system',
  'is_default',
  'is_active',
  'created_at',
  'updated_at',
].join(', ')

const STAGE_COLUMNS = [
  'id',
  'workflow_id',
  'position',
  'name',
  'stage_type',
  'mode',
  'minimum_approvals',
  'due_hours',
  'required_capability',
  'allow_self_approval',
  'auto_advance',
  'require_comment_on_reject',
  'allow_rejection',
].join(', ')

/**
 * Lists the approval workflows available to the current tenant: the shared
 * system templates plus any org/tenant-specific workflows, each with its stages.
 */
export default defineEventHandler(async (event) => {
  const context = await requireSocialContext(event, 'marketing.social.read')
  const client = context.client
  const organizationId = context.workspace.organization?.id

  const [systemResult, tenantResult, orgResult, settingsResult] = await Promise.all([
    client
      .from('social_approval_workflows')
      .select(WORKFLOW_COLUMNS)
      .eq('is_system', true)
      .eq('is_active', true),
    client
      .from('social_approval_workflows')
      .select(WORKFLOW_COLUMNS)
      .eq('tenant_id', context.tenantId)
      .eq('is_active', true),
    organizationId
      ? client
        .from('social_approval_workflows')
        .select(WORKFLOW_COLUMNS)
        .eq('organization_id', organizationId)
        .is('tenant_id', null)
        .eq('is_active', true)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    client
      .from('social_approval_settings')
      .select('tenant_id, requires_internal_review, default_workflow_id, allow_no_approval_workflow')
      .eq('tenant_id', context.tenantId)
      .maybeSingle(),
  ])

  const merged = new Map<string, any>()
  for (const workflow of [
    ...(systemResult.data || []),
    ...(orgResult.data || []),
    ...(tenantResult.data || []),
  ]) {
    merged.set(String(workflow.id), workflow)
  }

  const workflowIds = [...merged.keys()]
  const stagesByWorkflow = new Map<string, any[]>()
  if (workflowIds.length) {
    const { data: stages } = await client
      .from('social_approval_workflow_stages')
      .select(STAGE_COLUMNS)
      .in('workflow_id', workflowIds)
      .order('position', { ascending: true })
    for (const stage of stages || []) {
      const key = String(stage.workflow_id)
      if (!stagesByWorkflow.has(key))
        stagesByWorkflow.set(key, [])
      stagesByWorkflow.get(key)!.push(stage)
    }
  }

  const data = [...merged.values()].map(workflow => ({
    ...workflow,
    stages: (stagesByWorkflow.get(String(workflow.id)) || [])
      .slice()
      .sort((a, b) => Number(a.position) - Number(b.position)),
  }))

  return { data, settings: settingsResult.data || null }
})
