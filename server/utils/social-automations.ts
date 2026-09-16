/**
 * Domain automations for marketing production (Etapa 5).
 * Rules are opt-out: missing tenant row means enabled.
 */

import process from 'node:process'

import { createSocialNotification } from '~/server/utils/social-audit'
import { moveProductionCard } from '~/server/utils/social-production'
import { createReviewLink } from '~/server/utils/social-review-links'

export const SOCIAL_AUTOMATION_TRIGGERS = [
  'briefing.submitted',
  'task.copy.completed',
  'task.design.completed',
  'task.review.completed',
  'approval.overdue',
  'approval.changes_requested',
  'editorial.approved',
  'publication.failed',
  'content.stalled',
] as const

export type SocialAutomationTrigger = typeof SOCIAL_AUTOMATION_TRIGGERS[number]

export const SOCIAL_AUTOMATION_CATALOG: Array<{
  triggerKey: SocialAutomationTrigger
  title: string
  description: string
}> = [
  {
    triggerKey: 'briefing.submitted',
    title: 'Briefing enviado',
    description: 'Garante tarefas de copy/design e move o card para produção de copy.',
  },
  {
    triggerKey: 'task.copy.completed',
    title: 'Copy concluída',
    description: 'Notifica o designer responsável.',
  },
  {
    triggerKey: 'task.design.completed',
    title: 'Design concluído',
    description: 'Se copy e design estiverem prontos, envia para revisão interna.',
  },
  {
    triggerKey: 'task.review.completed',
    title: 'Revisão interna concluída',
    description: 'Move para aprovação do cliente e tenta gerar o link mágico.',
  },
  {
    triggerKey: 'approval.overdue',
    title: 'Aprovação atrasada',
    description: 'Envia lembrete aos aprovadores com prazo vencido.',
  },
  {
    triggerKey: 'approval.changes_requested',
    title: 'Alterações solicitadas',
    description: 'Reabre tarefas de correção e move o Kanban.',
  },
  {
    triggerKey: 'editorial.approved',
    title: 'Conteúdo aprovado',
    description: 'Move o Kanban. Se a publicação já foi enfileirada na aprovação do cliente, não cria tarefa de agendar.',
  },
  {
    triggerKey: 'publication.failed',
    title: 'Falha de publicação',
    description: 'Cria tarefa para investigar e corrigir a falha.',
  },
  {
    triggerKey: 'content.stalled',
    title: 'Conteúdo parado',
    description: 'Alerta responsáveis quando o prazo de produção venceu.',
  },
]

export interface AutomationEmitInput {
  tenantId: string
  trigger: SocialAutomationTrigger
  actorId?: string | null
  postId?: string | null
  entityType?: string | null
  entityId?: string | null
  payload?: Record<string, unknown>
  /** Public origin for magic links, e.g. https://app.blimber.com.br */
  origin?: string | null
}

function appOrigin(fallback?: string | null) {
  return String(
    fallback
    || process.env.NUXT_PUBLIC_SITE_URL
    || process.env.SITE_URL
    || process.env.NUXT_PUBLIC_API_URL
    || '',
  ).replace(/\/$/, '')
}

async function isEnabled(client: any, tenantId: string, trigger: SocialAutomationTrigger) {
  const { data } = await client
    .from('social_automation_rules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('trigger_key', trigger)
    .maybeSingle()
  if (!data)
    return true
  return Boolean(data.enabled)
}

async function logRun(
  client: any,
  input: AutomationEmitInput,
  status: 'succeeded' | 'skipped' | 'failed',
  message: string,
) {
  await client.from('social_automation_runs').insert({
    tenant_id: input.tenantId,
    trigger_key: input.trigger,
    status,
    post_id: input.postId || null,
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    actor_id: input.actorId || null,
    message: message.slice(0, 500),
    payload: input.payload || {},
  })
}

async function ensureTask(
  client: any,
  input: {
    tenantId: string
    postId: string
    taskType: string
    title: string
    roleScope: string
    createdBy: string
    assigneeId?: string | null
  },
) {
  const { data: existing } = await client
    .from('social_production_tasks')
    .select('id, status')
    .eq('tenant_id', input.tenantId)
    .eq('post_id', input.postId)
    .eq('task_type', input.taskType)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    if (['done', 'cancelled'].includes(String(existing.status))) {
      await client.from('social_production_tasks').update({
        status: 'todo',
        completed_at: null,
        completed_by: null,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    }
    return existing.id as string
  }

  const { data, error } = await client
    .from('social_production_tasks')
    .insert({
      tenant_id: input.tenantId,
      post_id: input.postId,
      task_type: input.taskType,
      title: input.title,
      role_scope: input.roleScope,
      status: 'todo',
      priority: 'normal',
      assignee_id: input.assigneeId || null,
      created_by: input.createdBy,
    })
    .select('id')
    .single()

  if (error)
    throw new Error(error.message)
  return data.id as string
}

async function loadPost(client: any, tenantId: string, postId: string) {
  const { data } = await client
    .from('social_posts')
    .select('id, title, created_by, production_status, publication_status, copy_owner_id, design_owner_id, publish_owner_id, assigned_to')
    .eq('tenant_id', tenantId)
    .eq('id', postId)
    .maybeSingle()
  return data
}

async function openTasksDone(
  client: any,
  tenantId: string,
  postId: string,
  taskTypes: string[],
) {
  const { data } = await client
    .from('social_production_tasks')
    .select('task_type, status')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .in('task_type', taskTypes)

  const rows = data || []
  return taskTypes.every((type) => {
    const matches = rows.filter((row: any) => row.task_type === type)
    if (!matches.length)
      return false
    return matches.some((row: any) => row.status === 'done')
  })
}

async function handleBriefingSubmitted(client: any, input: AutomationEmitInput) {
  const postId = String(input.postId || input.payload?.postId || '')
  if (!postId)
    return 'skipped: sem post'

  const post = await loadPost(client, input.tenantId, postId)
  if (!post)
    return 'skipped: post não encontrado'

  const actor = String(input.actorId || post.created_by)
  await ensureTask(client, {
    tenantId: input.tenantId,
    postId,
    taskType: 'write_copy',
    title: 'Escrever copy',
    roleScope: 'copywriter',
    createdBy: actor,
    assigneeId: post.copy_owner_id,
  })
  await ensureTask(client, {
    tenantId: input.tenantId,
    postId,
    taskType: 'create_design',
    title: 'Criar design',
    roleScope: 'designer',
    createdBy: actor,
    assigneeId: post.design_owner_id,
  })

  if (post.production_status === 'backlog' || post.production_status === 'briefing_pending') {
    await moveProductionCard(client, {
      postId,
      tenantId: input.tenantId,
      toStatus: 'copy_in_progress',
      userId: actor,
      note: 'Automação: briefing enviado',
    })
  }

  return 'tarefas garantidas + card em copy'
}

async function handleCopyCompleted(client: any, input: AutomationEmitInput) {
  const postId = String(input.postId || '')
  const post = await loadPost(client, input.tenantId, postId)
  if (!post)
    return 'skipped: post não encontrado'

  const target = post.design_owner_id || post.assigned_to || post.created_by
  if (target) {
    await createSocialNotification(client, {
      tenantId: input.tenantId,
      userId: String(target),
      type: 'automation.copy_done',
      title: 'Copy pronta para design',
      body: `${post.title}: a copy foi concluída.`,
      actionUrl: `/marketing/content/${postId}`,
      metadata: { postId, trigger: input.trigger },
      idempotencyKey: `auto:copy_done:${postId}:${input.entityId || 'x'}`,
    })
  }

  if (post.production_status === 'copy_in_progress') {
    await moveProductionCard(client, {
      postId,
      tenantId: input.tenantId,
      toStatus: 'design_in_progress',
      userId: String(input.actorId || post.created_by),
      note: 'Automação: copy concluída',
    })
  }

  return target ? 'designer notificado' : 'sem designer para notificar'
}

async function handleDesignCompleted(client: any, input: AutomationEmitInput) {
  const postId = String(input.postId || '')
  const post = await loadPost(client, input.tenantId, postId)
  if (!post)
    return 'skipped: post não encontrado'

  const bothDone = await openTasksDone(client, input.tenantId, postId, ['write_copy', 'create_design'])
  if (!bothDone)
    return 'skipped: copy ainda pendente'

  const actor = String(input.actorId || post.created_by)
  await ensureTask(client, {
    tenantId: input.tenantId,
    postId,
    taskType: 'review',
    title: 'Revisão interna',
    roleScope: 'reviewer',
    createdBy: actor,
  })

  if (!['internal_review', 'awaiting_client_approval', 'approved', 'scheduled', 'published'].includes(String(post.production_status))) {
    await moveProductionCard(client, {
      postId,
      tenantId: input.tenantId,
      toStatus: 'internal_review',
      userId: actor,
      note: 'Automação: copy + design concluídos',
    })
  }

  if (post.created_by) {
    await createSocialNotification(client, {
      tenantId: input.tenantId,
      userId: String(post.created_by),
      type: 'automation.ready_for_review',
      title: 'Pronto para revisão interna',
      body: `${post.title}: copy e design concluídos.`,
      actionUrl: `/marketing/content/${postId}`,
      idempotencyKey: `auto:ready_review:${postId}`,
    })
  }

  return 'enviado para revisão interna'
}

async function handleReviewCompleted(client: any, input: AutomationEmitInput) {
  const postId = String(input.postId || '')
  const post = await loadPost(client, input.tenantId, postId)
  if (!post)
    return 'skipped: post não encontrado'

  const actor = String(input.actorId || post.created_by)
  await moveProductionCard(client, {
    postId,
    tenantId: input.tenantId,
    toStatus: 'awaiting_client_approval',
    userId: actor,
    note: 'Automação: revisão interna concluída',
  })

  const { data: request } = await client
    .from('approval_requests')
    .select('id')
    .eq('tenant_id', input.tenantId)
    .eq('post_id', postId)
    .eq('run_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let linkMsg = 'sem solicitação pendente para link'
  if (request?.id) {
    try {
      const created = await createReviewLink(client, {
        tenantId: input.tenantId,
        approvalRequestId: request.id,
        userId: actor,
        expiresInHours: 168,
        requireEmailConfirm: true,
      })
      const origin = appOrigin(input.origin)
      const url = origin ? `${origin}${created.path}` : created.path
      const notifyUser = post.created_by || actor
      if (notifyUser) {
        await createSocialNotification(client, {
          tenantId: input.tenantId,
          userId: String(notifyUser),
          type: 'automation.review_link',
          title: 'Link de aprovação gerado',
          body: `${post.title}: ${url}`,
          actionUrl: `/marketing/approvals/${request.id}`,
          metadata: { postId, url, path: created.path },
          idempotencyKey: `auto:review_link:${request.id}`,
        })
      }
      linkMsg = 'link mágico gerado'
    }
    catch (error: any) {
      await ensureTask(client, {
        tenantId: input.tenantId,
        postId,
        taskType: 'send_to_client',
        title: 'Enviar link ao cliente',
        roleScope: 'social_media',
        createdBy: actor,
      })
      linkMsg = `link falhou (${error?.message || 'erro'}); tarefa criada`
    }
  }
  else {
    await ensureTask(client, {
      tenantId: input.tenantId,
      postId,
      taskType: 'send_to_client',
      title: 'Enviar para aprovação do cliente',
      roleScope: 'social_media',
      createdBy: actor,
    })
    linkMsg = 'tarefa de envio ao cliente criada'
  }

  return `card em aprovação cliente · ${linkMsg}`
}

async function handleChangesRequested(client: any, input: AutomationEmitInput) {
  const postId = String(input.postId || '')
  const post = await loadPost(client, input.tenantId, postId)
  if (!post)
    return 'skipped: post não encontrado'

  const actor = String(input.actorId || post.created_by)
  await moveProductionCard(client, {
    postId,
    tenantId: input.tenantId,
    toStatus: 'changes_requested',
    userId: actor,
    note: 'Automação: alterações solicitadas',
  })

  await ensureTask(client, {
    tenantId: input.tenantId,
    postId,
    taskType: 'fix',
    title: 'Aplicar correções',
    roleScope: 'any',
    createdBy: actor,
    assigneeId: post.assigned_to || post.copy_owner_id || post.design_owner_id,
  })

  return 'Kanban em alterações + tarefa de correção'
}

async function handleEditorialApproved(client: any, input: AutomationEmitInput) {
  const postId = String(input.postId || '')
  const post = await loadPost(client, input.tenantId, postId)
  if (!post)
    return 'skipped: post não encontrado'

  const actor = String(input.actorId || post.created_by)
  const alreadyQueued = String(post.publication_status || '') === 'scheduled'

  if (alreadyQueued) {
    if (!['scheduled', 'published'].includes(String(post.production_status))) {
      await moveProductionCard(client, {
        postId,
        tenantId: input.tenantId,
        toStatus: 'scheduled',
        userId: actor,
        note: 'Automação: aprovado pelo cliente e enfileirado',
      })
    }
    return 'produção agendada automaticamente após aprovação do cliente'
  }

  if (!['approved', 'scheduled', 'published'].includes(String(post.production_status))) {
    await moveProductionCard(client, {
      postId,
      tenantId: input.tenantId,
      toStatus: 'approved',
      userId: actor,
      note: 'Automação: conteúdo aprovado editorialmente',
    })
  }

  await ensureTask(client, {
    tenantId: input.tenantId,
    postId,
    taskType: 'schedule',
    title: 'Agendar publicação',
    roleScope: 'social_media',
    createdBy: actor,
    assigneeId: post.publish_owner_id || post.assigned_to,
  })

  return 'produção aprovada + tarefa de agendamento'
}

async function handlePublicationFailed(client: any, input: AutomationEmitInput) {
  const postId = String(input.postId || '')
  const post = await loadPost(client, input.tenantId, postId)
  if (!post)
    return 'skipped: post não encontrado'

  const actor = String(input.actorId || post.created_by || post.publish_owner_id)
  if (!actor)
    return 'skipped: sem responsável para criar tarefa'

  await ensureTask(client, {
    tenantId: input.tenantId,
    postId,
    taskType: 'verify_publication',
    title: 'Corrigir falha de publicação',
    roleScope: 'social_media',
    createdBy: actor,
    assigneeId: post.publish_owner_id || post.created_by,
  })

  return 'tarefa de falha criada'
}

async function handleApprovalOverdue(client: any, input: AutomationEmitInput) {
  const requestId = String(input.entityId || input.payload?.requestId || '')
  if (!requestId)
    return 'skipped: sem request'

  const { data: request } = await client
    .from('approval_requests')
    .select('id, post_id, due_at, run_status')
    .eq('tenant_id', input.tenantId)
    .eq('id', requestId)
    .maybeSingle()

  if (!request || request.run_status !== 'pending')
    return 'skipped: request não pendente'

  const { data: approvers } = await client
    .from('approval_request_approvers')
    .select('approver_id')
    .eq('request_id', requestId)

  const post = await loadPost(client, input.tenantId, String(request.post_id))
  let notified = 0
  for (const row of approvers || []) {
    if (!row.approver_id)
      continue
    await createSocialNotification(client, {
      tenantId: input.tenantId,
      userId: String(row.approver_id),
      type: 'automation.approval_overdue',
      title: 'Aprovação atrasada',
      body: `${post?.title || 'Publicação'}: prazo de aprovação vencido.`,
      actionUrl: `/marketing/approvals/${requestId}`,
      idempotencyKey: `auto:approval_overdue:${requestId}:${row.approver_id}`,
    })
    notified += 1
  }
  return `lembrete enviado a ${notified} aprovador(es)`
}

async function handleContentStalled(client: any, input: AutomationEmitInput) {
  const postId = String(input.postId || '')
  const post = await loadPost(client, input.tenantId, postId)
  if (!post)
    return 'skipped: post não encontrado'

  const targets = [...new Set([
    post.assigned_to,
    post.copy_owner_id,
    post.design_owner_id,
    post.created_by,
  ].filter(Boolean).map(String))]

  for (const userId of targets) {
    await createSocialNotification(client, {
      tenantId: input.tenantId,
      userId,
      type: 'automation.content_stalled',
      title: 'Conteúdo parado',
      body: `${post.title}: prazo de produção vencido (${post.production_status}).`,
      actionUrl: `/marketing/content/${postId}`,
      idempotencyKey: `auto:stalled:${postId}:${userId}:${new Date().toISOString().slice(0, 10)}`,
    })
  }

  return `alerta enviado a ${targets.length} responsável(is)`
}

const HANDLERS: Record<SocialAutomationTrigger, (client: any, input: AutomationEmitInput) => Promise<string>> = {
  'briefing.submitted': handleBriefingSubmitted,
  'task.copy.completed': handleCopyCompleted,
  'task.design.completed': handleDesignCompleted,
  'task.review.completed': handleReviewCompleted,
  'approval.overdue': handleApprovalOverdue,
  'approval.changes_requested': handleChangesRequested,
  'editorial.approved': handleEditorialApproved,
  'publication.failed': handlePublicationFailed,
  'content.stalled': handleContentStalled,
}

/** Fire-and-record a domain automation. Never throws to the caller. */
export async function emitSocialAutomation(client: any, input: AutomationEmitInput) {
  try {
    const enabled = await isEnabled(client, input.tenantId, input.trigger)
    if (!enabled) {
      await logRun(client, input, 'skipped', 'regra desabilitada')
      return { status: 'skipped' as const, message: 'regra desabilitada' }
    }

    const message = await HANDLERS[input.trigger](client, input)
    const status = message.startsWith('skipped') ? 'skipped' as const : 'succeeded' as const
    await logRun(client, input, status, message)
    return { status, message }
  }
  catch (error: any) {
    const message = error?.message || 'falha na automação'
    try {
      await logRun(client, input, 'failed', message)
    }
    catch {
      console.error('Falha ao registrar social_automation_runs', message)
    }
    console.error(`Automação ${input.trigger} falhou`, message)
    return { status: 'failed' as const, message }
  }
}

export async function listAutomationRules(client: any, tenantId: string) {
  const { data } = await client
    .from('social_automation_rules')
    .select('*')
    .eq('tenant_id', tenantId)

  const byKey = new Map((data || []).map((row: any) => [row.trigger_key, row]))
  return SOCIAL_AUTOMATION_CATALOG.map((item) => {
    const row = byKey.get(item.triggerKey)
    return {
      triggerKey: item.triggerKey,
      title: item.title,
      description: item.description,
      enabled: row ? Boolean(row.enabled) : true,
      config: row?.config || {},
      id: row?.id || null,
      updatedAt: row?.updated_at || null,
    }
  })
}

export async function upsertAutomationRule(
  client: any,
  input: { tenantId: string, triggerKey: SocialAutomationTrigger, enabled: boolean, config?: Record<string, unknown> },
) {
  const { data, error } = await client
    .from('social_automation_rules')
    .upsert({
      tenant_id: input.tenantId,
      trigger_key: input.triggerKey,
      enabled: input.enabled,
      config: input.config || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,trigger_key' })
    .select('*')
    .single()

  if (error)
    throw error
  return data
}

/** Cron/worker: overdue approvals + stalled production cards. */
export async function processDueAutomations(client: any, limit = 40) {
  const now = new Date().toISOString()
  const results: Array<{ trigger: string, status: string, message: string }> = []

  const { data: overdueApprovals } = await client
    .from('approval_requests')
    .select('id, tenant_id, post_id, due_at')
    .eq('run_status', 'pending')
    .lt('due_at', now)
    .order('due_at')
    .limit(limit)

  for (const row of overdueApprovals || []) {
    const result = await emitSocialAutomation(client, {
      tenantId: row.tenant_id,
      trigger: 'approval.overdue',
      postId: row.post_id,
      entityType: 'approval_request',
      entityId: row.id,
      payload: { requestId: row.id, dueAt: row.due_at },
    })
    results.push({ trigger: 'approval.overdue', status: result.status, message: result.message })
  }

  const { data: stalled } = await client
    .from('social_posts')
    .select('id, tenant_id, production_status, production_due_at')
    .is('deleted_at', null)
    .lt('production_due_at', now)
    .not('production_status', 'in', '("approved","scheduled","published")')
    .order('production_due_at')
    .limit(limit)

  for (const row of stalled || []) {
    const result = await emitSocialAutomation(client, {
      tenantId: row.tenant_id,
      trigger: 'content.stalled',
      postId: row.id,
      entityType: 'social_post',
      entityId: row.id,
      payload: { productionStatus: row.production_status, dueAt: row.production_due_at },
    })
    results.push({ trigger: 'content.stalled', status: result.status, message: result.message })
  }

  return results
}

/** Map a completed production task to the matching automation trigger. */
export function triggerForCompletedTask(taskType: string): SocialAutomationTrigger | null {
  if (taskType === 'write_copy')
    return 'task.copy.completed'
  if (taskType === 'create_design')
    return 'task.design.completed'
  if (taskType === 'review')
    return 'task.review.completed'
  return null
}
