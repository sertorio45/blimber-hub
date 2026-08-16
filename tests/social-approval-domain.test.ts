import { beforeEach, describe, expect, it } from 'vitest'

import {
  assertPostCanBeScheduled,
  bypassApproval,
  cancelApprovalRun,
  createRevision,
  enqueueApprovedPost,
  isMaterialContentChange,
  startApprovalWorkflow,
  submitApprovalDecision,
  SYSTEM_WORKFLOW_IDS,
} from '~/server/utils/social-approval-domain'
import { createFakeDomainClient, type FakeDatabase } from './helpers/fake-supabase-domain'

// Fixed identifiers -----------------------------------------------------------
const ids = {
  tenant: '00000000-0000-4000-8000-0000000000t1',
  otherTenant: '00000000-0000-4000-8000-0000000000t2',
  org: '00000000-0000-4000-8000-0000000000o1',
  post: '00000000-0000-4000-8000-0000000000p1',
  variant: '00000000-0000-4000-8000-0000000000v1',
  account: '00000000-0000-4000-8000-000000000ac1',
  asset: '00000000-0000-4000-8000-0000000000m1',
  author: '00000000-0000-4000-8000-0000000000a0',
  client: '00000000-0000-4000-8000-0000000000c1',
  client2: '00000000-0000-4000-8000-0000000000c2',
  internal: '00000000-0000-4000-8000-0000000000i1',
  stranger: '00000000-0000-4000-8000-0000000000x9',
  roleClient: '00000000-0000-4000-8000-00000000rc1',
  // system workflow stage ids
  stageSimpleClient: '00000000-0000-4000-8000-0000000s101',
  stageAgencyInternal: '00000000-0000-4000-8000-0000000s102',
  stageAgencyClient: '00000000-0000-4000-8000-0000000s103',
}

function seedWorkflows(db: FakeDatabase) {
  db.social_approval_workflows = [
    { id: SYSTEM_WORKFLOW_IDS.simpleClient, is_system: true, is_active: true, is_default: true, slug: 'simple_client', name: 'Aprovação simples', organization_id: null, tenant_id: null },
    { id: SYSTEM_WORKFLOW_IDS.agencyInternalClient, is_system: true, is_active: true, is_default: false, slug: 'agency_internal_client', name: 'Agência com revisão interna', organization_id: null, tenant_id: null },
    { id: SYSTEM_WORKFLOW_IDS.noApproval, is_system: true, is_active: true, is_default: false, slug: 'no_approval', name: 'Sem aprovação', organization_id: null, tenant_id: null },
  ]
  db.social_approval_workflow_stages = [
    { id: ids.stageSimpleClient, workflow_id: SYSTEM_WORKFLOW_IDS.simpleClient, position: 1, name: 'Aprovação do cliente', stage_type: 'client', mode: 'any', minimum_approvals: 1, due_hours: null, required_capability: 'marketing.social.approval.client', allow_self_approval: false, auto_advance: true, require_comment_on_reject: true, allow_rejection: true },
    { id: ids.stageAgencyInternal, workflow_id: SYSTEM_WORKFLOW_IDS.agencyInternalClient, position: 1, name: 'Revisão interna', stage_type: 'internal', mode: 'any', minimum_approvals: 1, due_hours: null, required_capability: 'marketing.social.approval.internal', allow_self_approval: false, auto_advance: true, require_comment_on_reject: true, allow_rejection: true },
    { id: ids.stageAgencyClient, workflow_id: SYSTEM_WORKFLOW_IDS.agencyInternalClient, position: 2, name: 'Aprovação do cliente', stage_type: 'client', mode: 'any', minimum_approvals: 1, due_hours: null, required_capability: 'marketing.social.approval.client', allow_self_approval: false, auto_advance: true, require_comment_on_reject: true, allow_rejection: true },
  ]
  db.social_approval_stage_assignees = [
    { id: 'as1', stage_id: ids.stageAgencyInternal, assignee_type: 'user', user_id: ids.internal, role_id: null },
    { id: 'as2', stage_id: ids.stageAgencyClient, assignee_type: 'user', user_id: ids.client, role_id: null },
  ]
}

function seedReadyPost(db: FakeDatabase, overrides: Record<string, any> = {}) {
  db.social_posts = [{
    id: ids.post,
    tenant_id: ids.tenant,
    title: 'Campanha de verão',
    content: 'Texto base',
    created_by: ids.author,
    editorial_status: 'draft',
    publication_status: 'not_scheduled',
    approval_policy: 'any',
    minimum_approvals: 1,
    current_version: 0,
    approved_version_id: null,
    approval_bypassed: false,
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    timezone: 'America/Sao_Paulo',
    ...overrides,
  }]
  db.social_post_variants = [{
    id: ids.variant,
    tenant_id: ids.tenant,
    post_id: ids.post,
    account_id: ids.account,
    platform: 'instagram',
    format: 'static',
    created_at: new Date().toISOString(),
  }]
  db.social_post_assets = [{
    id: 'rel1',
    tenant_id: ids.tenant,
    post_id: ids.post,
    variant_id: ids.variant,
    asset_id: ids.asset,
    position: 0,
  }]
  db.media_assets = [{ id: ids.asset, tenant_id: ids.tenant, status: 'ready', object_path: 'p/x.png', name: 'x.png', mime_type: 'image/png', purpose: 'publication', bucket: 'marketing-assets', metadata: {} }]
  db.social_accounts = [{ id: ids.account, tenant_id: ids.tenant, is_active: true }]
  db.organization_tenants = [{ organization_id: ids.org, tenant_id: ids.tenant }]
  db.organization_memberships = [
    { id: 'm1', user_id: ids.client, organization_id: ids.org, role_id: ids.roleClient, is_active: true },
    { id: 'm2', user_id: ids.internal, organization_id: ids.org, role_id: null, is_active: true },
  ]
  db.organization_roles = [{ id: ids.roleClient, name: 'Cliente Aprovador', slug: 'approver' }]
  db.content_versions = []
  db.approval_requests = []
  db.approval_request_approvers = []
  db.approval_decisions = []
  db.notifications = []
  db.publication_jobs = []
}

function makeDb(overrides: Record<string, any> = {}): FakeDatabase {
  const db: FakeDatabase = {}
  seedWorkflows(db)
  seedReadyPost(db, overrides)
  return db
}

function post(db: FakeDatabase) {
  return db.social_posts![0]!
}

describe('social approval domain', () => {
  let db: FakeDatabase
  let client: ReturnType<typeof createFakeDomainClient>

  beforeEach(() => {
    db = makeDb()
    client = createFakeDomainClient(db)
  })

  it('1. simple client flow: single approval marks the post approved', async () => {
    const started = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      approverIds: [ids.client],
    })
    expect(started.mode).toBe('stage')
    expect(post(db).editorial_status).toBe('client_review')

    const result = await submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: started.request!.id,
      userId: ids.client,
      decision: 'approved',
      capabilities: ['marketing.social.approval.client'],
    })

    expect(result.status).toBe('approved')
    expect(post(db).editorial_status).toBe('approved')
    expect(post(db).approved_version_id).toBe(started.versionId)
  })

  it('2. agency flow: internal approval advances to the client stage', async () => {
    const started = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      workflowId: SYSTEM_WORKFLOW_IDS.agencyInternalClient,
    })
    expect(post(db).editorial_status).toBe('internal_review')

    const advance = await submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: started.request!.id,
      userId: ids.internal,
      decision: 'approved',
      capabilities: ['marketing.social.approval.internal'],
    })
    expect(advance.status).toBe('advanced')
    expect(post(db).editorial_status).toBe('client_review')

    // A brand new request was opened in the same run group for the client stage.
    const clientRequest = db.approval_requests!.find(r => r.stage === 'client' && r.run_status === 'pending')!
    expect(clientRequest).toBeTruthy()
    expect(clientRequest.run_group_id).toBe(started.request!.run_group_id)

    const final = await submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: clientRequest.id,
      userId: ids.client,
      decision: 'approved',
      capabilities: ['marketing.social.approval.client'],
    })
    expect(final.status).toBe('approved')
    expect(post(db).editorial_status).toBe('approved')
  })

  it('2b. client capability cannot close an internal stage even if assigned', async () => {
    const started = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      workflowId: SYSTEM_WORKFLOW_IDS.agencyInternalClient,
      approverIds: [ids.client],
    })

    await expect(submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: started.request!.id,
      userId: ids.client,
      decision: 'approved',
      capabilities: ['marketing.social.approval.client', 'marketing.social.approve'],
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('3. changes requested returns to draft and a resubmit creates a new version', async () => {
    const first = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      approverIds: [ids.client],
    })

    await submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: first.request!.id,
      userId: ids.client,
      decision: 'changes_requested',
      comment: 'Ajustar a cor da chamada',
      capabilities: ['marketing.social.approval.client'],
    })
    expect(post(db).editorial_status).toBe('changes_requested')

    // Author revises the material content, then resubmits.
    await createRevision(client, { tenantId: ids.tenant, postId: ids.post })
    expect(post(db).editorial_status).toBe('draft')

    const second = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      approverIds: [ids.client],
    })

    expect(db.content_versions!.length).toBe(2)
    expect(second.versionId).not.toBe(first.versionId)
    expect(post(db).editorial_status).toBe('client_review')
  })

  it('4. a superseded request can no longer be decided (old version)', async () => {
    const first = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      approverIds: [ids.client],
    })

    // Editing while pending supersedes the open run.
    await createRevision(client, { tenantId: ids.tenant, postId: ids.post })
    const superseded = db.approval_requests!.find(r => r.id === first.request!.id)!
    expect(superseded.run_status).toBe('superseded')

    await expect(submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: first.request!.id,
      userId: ids.client,
      decision: 'approved',
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('5. a non-assigned approver is rejected with 403', async () => {
    const started = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      approverIds: [ids.client],
    })

    await expect(submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: started.request!.id,
      userId: ids.stranger,
      decision: 'approved',
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('5b. company admin with client capability can decide without being assigned', async () => {
    const started = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      approverIds: [ids.client],
    })

    const result = await submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: started.request!.id,
      userId: ids.client2,
      decision: 'approved',
      capabilities: ['marketing.social.approval.client'],
    })

    expect(result.status).toBe('approved')
    expect(post(db).editorial_status).toBe('approved')
  })

  it('5c. reject and request-changes require a reason', async () => {
    const started = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      approverIds: [ids.client],
    })

    await expect(submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: started.request!.id,
      userId: ids.client,
      decision: 'rejected',
      capabilities: ['marketing.social.approval.client'],
    })).rejects.toMatchObject({ statusCode: 400 })

    await expect(submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: started.request!.id,
      userId: ids.client,
      decision: 'changes_requested',
      capabilities: ['marketing.social.approval.client'],
    })).rejects.toMatchObject({ statusCode: 400 })

    const result = await submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: started.request!.id,
      userId: ids.client,
      decision: 'rejected',
      comment: 'A arte não representa a marca',
      capabilities: ['marketing.social.approval.client'],
    })
    expect(result.status).toBe('rejected')
  })

  it('6. deciding with a mismatched tenant is rejected', async () => {
    const started = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      approverIds: [ids.client],
    })

    await expect(submitApprovalDecision(client, {
      tenantId: ids.otherTenant,
      requestId: started.request!.id,
      userId: ids.client,
      decision: 'approved',
    })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('7. once a stage is resolved a second decision cannot advance it again', async () => {
    const started = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      approverIds: [ids.client],
    })

    await submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: started.request!.id,
      userId: ids.client,
      decision: 'approved',
      capabilities: ['marketing.social.approval.client'],
    })

    // The run is no longer pending, so the lock guard rejects the second call.
    await expect(submitApprovalDecision(client, {
      tenantId: ids.tenant,
      requestId: started.request!.id,
      userId: ids.client,
      decision: 'approved',
      capabilities: ['marketing.social.approval.client'],
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('8. an unapproved post cannot be scheduled', async () => {
    await expect(assertPostCanBeScheduled(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      capabilities: ['marketing.social.schedule'],
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('9. bypass requires a justification and grants approval when authorized', async () => {
    await expect(bypassApproval(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      justification: '   ',
      capabilities: ['marketing.social.approval.bypass'],
    })).rejects.toMatchObject({ statusCode: 400 })

    await expect(bypassApproval(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      justification: 'Cliente aprovou por telefone',
      capabilities: ['marketing.social.read'],
    })).rejects.toMatchObject({ statusCode: 403 })

    const result = await bypassApproval(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      justification: 'Cliente aprovou por telefone, urgência de campanha',
      capabilities: ['marketing.social.approval.bypass'],
    })

    expect(post(db).approval_bypassed).toBe(true)
    expect(post(db).editorial_status).toBe('approved')
    expect(post(db).approved_version_id).toBe(result.versionId)
  })

  it('10. the approver role name is snapshotted at assignment time', async () => {
    await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      approverIds: [ids.client],
    })

    const snapshot = db.approval_request_approvers!.find(row => row.user_id === ids.client)!
    expect(snapshot.role_name).toBe('Cliente Aprovador')

    // Renaming the role afterwards must not rewrite history.
    db.organization_roles![0]!.name = 'Outro nome'
    expect(snapshot.role_name).toBe('Cliente Aprovador')
  })

  it('11. publication enqueues jobs against the approved version id', async () => {
    const versionId = '00000000-0000-4000-8000-00000000ver1'
    db = makeDb({ editorial_status: 'approved', approved_version_id: versionId, current_version: 1 })
    db.content_versions = [{ id: versionId, tenant_id: ids.tenant, post_id: ids.post, version: 1 }]
    client = createFakeDomainClient(db)

    const jobs = await enqueueApprovedPost(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      capabilities: ['marketing.social.schedule'],
    })

    expect(jobs.length).toBe(1)
    expect(jobs[0].version_id).toBe(versionId)
    expect(jobs[0].idempotency_key).toContain(versionId)
    expect(post(db).publication_status).toBe('scheduled')
  })

  it('12. self-serve release auto-approves a draft before enqueue', async () => {
    const { ensureSelfServeApproved, isSelfServeSocialRelease } = await import('~/server/utils/social-approval-domain')

    expect(isSelfServeSocialRelease({
      organizationType: 'direct',
      effectiveRole: 'cliente',
      capabilities: ['marketing.social.approval.client', 'marketing.social.schedule'],
    })).toBe(true)
    expect(isSelfServeSocialRelease({
      organizationType: 'agency',
      effectiveRole: 'admin',
      isPlatformStaff: true,
    })).toBe(false)

    const jobs = await enqueueApprovedPost(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      capabilities: ['marketing.social.schedule'],
      selfServe: true,
      userId: ids.author,
    })

    expect(post(db).editorial_status).toBe('approved')
    expect(post(db).approved_version_id).toBeTruthy()
    expect(post(db).workflow_id).toBe(SYSTEM_WORKFLOW_IDS.noApproval)
    expect(jobs.length).toBe(1)
    expect(jobs[0].version_id).toBe(post(db).approved_version_id)

    // Idempotent when already approved with matching version
    await ensureSelfServeApproved(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
    })
    expect(db.content_versions!.length).toBe(1)
  })

  it('cancelApprovalRun returns the post to draft', async () => {
    const started = await startApprovalWorkflow(client, {
      tenantId: ids.tenant,
      postId: ids.post,
      userId: ids.author,
      approverIds: [ids.client],
    })
    await cancelApprovalRun(client, { tenantId: ids.tenant, postId: ids.post })
    const request = db.approval_requests!.find(r => r.id === started.request!.id)!
    expect(request.run_status).toBe('cancelled')
    expect(post(db).editorial_status).toBe('draft')
  })

  it('isMaterialContentChange detects publishable differences only', () => {
    const base = { title: 'A', content: 'B', variants: [{ accountId: '1', caption: 'x' }], referenceAssetIds: ['r1'] }
    expect(isMaterialContentChange(base, { ...base })).toBe(false)
    expect(isMaterialContentChange(base, { ...base, content: 'C' })).toBe(true)
    expect(isMaterialContentChange(base, { ...base, variants: [{ accountId: '1', caption: 'y' }] })).toBe(true)
  })
})
