import type {
  ApprovalDecision,
  ApprovalRequest,
  MediaAsset,
  MediaAssetPurpose,
  SocialAccount,
  SocialApprovalWorkflow,
  SocialPost,
  SocialPostInput,
} from '~/types/marketing-social'

export function useMarketingSocial() {
  const supabase = useSupabaseClient()
  const { tenantId } = useTenant()

  function tenantQuery(extra: Record<string, unknown> = {}) {
    return { tenant_id: tenantId.value || undefined, ...extra }
  }

  async function listPosts(filters: Record<string, unknown> = {}) {
    return $fetch<{ data: SocialPost[], pagination: Record<string, number> }>(
      '/api/marketing/social/posts',
      { query: tenantQuery(filters) },
    )
  }

  async function getPost(id: string) {
    const response = await $fetch<{ data: SocialPost }>(`/api/marketing/social/posts/${id}`, {
      query: tenantQuery(),
    })
    return response.data
  }

  async function createPost(input: SocialPostInput) {
    const response = await $fetch<{ data: SocialPost }>('/api/marketing/social/posts', {
      method: 'POST',
      body: { ...input, tenant_id: tenantId.value || undefined },
    })
    return response.data
  }

  async function updatePost(id: string, input: SocialPostInput) {
    const response = await $fetch<{ data: SocialPost }>(`/api/marketing/social/posts/${id}`, {
      method: 'PUT',
      body: { ...input, tenant_id: tenantId.value || undefined },
    })
    return response.data
  }

  async function deletePost(id: string, options?: {
    mode?: 'cancel_draft' | 'system_and_remote' | 'system_only' | 'retry_remote'
    reason?: string | null
    confirmRemoteDeletion?: boolean
    confirmLocalOnly?: boolean
    forceCompleteLocal?: boolean
    manualConfirmations?: Array<{ variantId: string, confirmed: boolean }>
    /** @deprecated use mode */
    force?: boolean
    /** @deprecated use mode */
    deleteRemote?: boolean
  }) {
    const mode = options?.mode
      || (options?.deleteRemote === false
        ? 'system_only'
        : options?.force
          ? 'system_and_remote'
          : 'system_and_remote')

    return $fetch(`/api/marketing/social/posts/${id}`, {
      method: 'DELETE',
      body: {
        tenant_id: tenantId.value || undefined,
        mode,
        reason: options?.reason || null,
        confirmRemoteDeletion: options?.confirmRemoteDeletion ?? (mode === 'system_and_remote'),
        confirmLocalOnly: options?.confirmLocalOnly ?? (mode === 'system_only'),
        forceCompleteLocal: options?.forceCompleteLocal ?? Boolean(options?.force),
        manualConfirmations: options?.manualConfirmations,
      },
    })
  }

  async function shareToStories(id: string, options?: { publishNow?: boolean, scheduledAt?: string | null, accountIds?: string[] }) {
    return $fetch<{ data: { storyPostId: string } }>(`/api/marketing/social/posts/${id}/share-stories`, {
      method: 'POST',
      body: {
        tenant_id: tenantId.value || undefined,
        publishNow: options?.publishNow !== false,
        scheduledAt: options?.scheduledAt || null,
        accountIds: options?.accountIds,
      },
    })
  }

  async function submitForApproval(
    id: string,
    approverIds: string[],
    dueAt?: string | null,
    workflowId?: string | null,
  ) {
    const response = await $fetch<{ data: ApprovalRequest, meta: { mode: string, workflowId: string } }>(
      `/api/marketing/social/posts/${id}/submit`,
      {
        method: 'POST',
        body: {
          tenant_id: tenantId.value || undefined,
          approverIds,
          dueAt: dueAt || null,
          workflowId: workflowId || null,
        },
      },
    )
    return response.data
  }

  async function bypassApproval(id: string, justification: string) {
    return $fetch(`/api/marketing/social/posts/${id}/bypass`, {
      method: 'POST',
      body: {
        tenant_id: tenantId.value || undefined,
        justification,
      },
    })
  }

  async function cancelApproval(id: string, reason?: string | null, options?: { tenantId?: string | null }) {
    return $fetch(`/api/marketing/social/posts/${id}/cancel-approval`, {
      method: 'POST',
      body: {
        tenant_id: options?.tenantId || tenantId.value || undefined,
        reason: reason || null,
      },
    })
  }

  async function listWorkflows() {
    const response = await $fetch<{ data: SocialApprovalWorkflow[] }>('/api/marketing/social/workflows', {
      query: tenantQuery(),
    })
    return response.data
  }

  async function schedulePost(id: string, scheduledAt?: string | null, options?: { publishNow?: boolean }) {
    return $fetch(`/api/marketing/social/posts/${id}/schedule`, {
      method: 'POST',
      body: {
        tenant_id: tenantId.value || undefined,
        scheduledAt: options?.publishNow ? null : (scheduledAt || null),
        publishNow: Boolean(options?.publishNow),
      },
    })
  }

  async function listApprovals(filters: Record<string, unknown> = {}) {
    const response = await $fetch<{ data: any[], meta?: Record<string, unknown> }>('/api/marketing/social/approvals', {
      query: tenantQuery(filters),
    })
    return response
  }

  async function getApproval(id: string, extra: Record<string, unknown> = {}) {
    const response = await $fetch<{ data: any }>(`/api/marketing/social/approvals/${id}`, {
      query: tenantQuery(extra),
    })
    return response.data
  }

  async function decide(
    requestId: string,
    decision: ApprovalDecision,
    comment?: string | null,
    options?: { changeCategory?: string | null, tenantId?: string | null },
  ) {
    return $fetch(`/api/marketing/social/approvals/${requestId}/decision`, {
      method: 'POST',
      body: {
        tenant_id: options?.tenantId || tenantId.value || undefined,
        decision,
        comment: comment || null,
        changeCategory: options?.changeCategory || null,
      },
    })
  }

  async function addComment(
    postId: string,
    body: string,
    options?: {
      versionId?: string | null
      visibility?: 'internal' | 'shared'
      tenantId?: string | null
      anchorType?: 'none' | 'image' | 'carousel' | 'video'
      xPercent?: number | null
      yPercent?: number | null
      slideIndex?: number | null
      mediaTimeMs?: number | null
      assetId?: string | null
    },
  ) {
    return $fetch(`/api/marketing/social/posts/${postId}/comments`, {
      method: 'POST',
      body: {
        tenant_id: options?.tenantId || tenantId.value || undefined,
        body,
        versionId: options?.versionId || null,
        visibility: options?.visibility || 'shared',
        anchorType: options?.anchorType || 'none',
        xPercent: options?.xPercent ?? null,
        yPercent: options?.yPercent ?? null,
        slideIndex: options?.slideIndex ?? null,
        mediaTimeMs: options?.mediaTimeMs ?? null,
        assetId: options?.assetId ?? null,
      },
    })
  }

  async function createReviewLink(
    requestId: string,
    options?: {
      tenantId?: string | null
      expiresInHours?: number
      afterDecision?: 'read_only' | 'invalidate'
      requireEmailConfirm?: boolean
    },
  ) {
    return $fetch<{ data: { id: string, url: string, path: string, expiresAt: string, token: string } }>(
      `/api/marketing/social/approvals/${requestId}/review-link`,
      {
        method: 'POST',
        body: {
          tenant_id: options?.tenantId || tenantId.value || undefined,
          expiresInHours: options?.expiresInHours,
          afterDecision: options?.afterDecision,
          requireEmailConfirm: options?.requireEmailConfirm,
        },
      },
    )
  }

  async function revokeReviewLink(linkId: string, options?: { tenantId?: string | null }) {
    return $fetch(`/api/marketing/social/review-links/${linkId}/revoke`, {
      method: 'POST',
      body: { tenant_id: options?.tenantId || tenantId.value || undefined },
    })
  }

  async function batchDecide(
    items: Array<{
      requestId: string
      decision: ApprovalDecision
      comment?: string | null
      changeCategory?: string | null
    }>,
    options?: { tenantId?: string | null },
  ) {
    return $fetch<{ data: { total: number, succeeded: number, failed: number, results: any[] } }>(
      '/api/marketing/social/approvals/batch-decision',
      {
        method: 'POST',
        body: {
          tenant_id: options?.tenantId || tenantId.value || undefined,
          items,
        },
      },
    )
  }

  async function listAssets(filters: Record<string, unknown> = {}) {
    const response = await $fetch<{ data: MediaAsset[] }>('/api/marketing/social/assets', {
      query: tenantQuery(filters),
    })
    return response.data
  }

  async function uploadAsset(
    file: File,
    purpose: MediaAssetPurpose = 'reference',
    options?: { category?: string | null },
  ) {
    if (!tenantId.value)
      throw new Error('Selecione uma empresa')

    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const objectPath = `${tenantId.value}/${crypto.randomUUID()}/original.${extension}`
    const { error: uploadError } = await supabase.storage
      .from('marketing-assets')
      .upload(objectPath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      })
    if (uploadError)
      throw uploadError

    try {
      const response = await $fetch<{ data: MediaAsset }>('/api/marketing/social/assets', {
        method: 'POST',
        body: {
          tenant_id: tenantId.value,
          name: file.name,
          objectPath,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          purpose,
          category: options?.category || undefined,
        },
      })
      return response.data
    }
    catch (error) {
      await supabase.storage.from('marketing-assets').remove([objectPath])
      throw error
    }
  }

  async function deleteAsset(id: string) {
    return $fetch(`/api/marketing/social/assets/${id}`, {
      method: 'DELETE',
      query: tenantQuery(),
    })
  }

  async function listAccounts() {
    const response = await $fetch<{ data: SocialAccount[] }>('/api/marketing/social/accounts', {
      query: tenantQuery(),
    })
    return response.data
  }

  async function listLogs(filters: Record<string, unknown> = {}) {
    return $fetch<{
      data: Array<Record<string, unknown>>
      pagination: { page: number, pageSize: number, total: number, totalPages: number }
    }>('/api/marketing/social/logs', {
      query: tenantQuery(filters),
    })
  }

  async function reschedulePost(
    id: string,
    scheduledAt: string,
    options?: { scheduleId?: string },
  ) {
    const response = await $fetch<{ data: { id: string, scheduled_at: string } }>(
      `/api/marketing/social/posts/${id}/reschedule`,
      {
        method: 'POST',
        body: {
          scheduledAt,
          scheduleId: options?.scheduleId,
          tenant_id: tenantId.value || undefined,
        },
      },
    )
    return response.data
  }

  async function duplicatePost(id: string, scheduledAt?: string | null) {
    const response = await $fetch<{ data: SocialPost }>(
      `/api/marketing/social/posts/${id}/duplicate`,
      {
        method: 'POST',
        body: { scheduledAt: scheduledAt || null, tenant_id: tenantId.value || undefined },
      },
    )
    return response.data
  }

  async function listPackages(filters: Record<string, unknown> = {}) {
    return $fetch<{ data: any[] }>('/api/marketing/social/packages', {
      query: tenantQuery(filters),
    })
  }

  async function createPackage(input: Record<string, unknown>) {
    const response = await $fetch<{ data: any }>('/api/marketing/social/packages', {
      method: 'POST',
      body: { ...input, tenant_id: tenantId.value || undefined },
    })
    return response.data
  }

  async function updatePackage(id: string, input: Record<string, unknown>) {
    const response = await $fetch<{ data: any }>(`/api/marketing/social/packages/${id}`, {
      method: 'PUT',
      body: { ...input, tenant_id: tenantId.value || undefined },
    })
    return response.data
  }

  async function getPackageSla(id: string) {
    const response = await $fetch<{ data: any[] }>(`/api/marketing/social/packages/${id}/sla`, {
      query: tenantQuery(),
    })
    return response.data
  }

  async function updatePackageSla(id: string, stages: Array<{ stageKey: string, maxBusinessDays: number }>) {
    const response = await $fetch<{ data: any[] }>(`/api/marketing/social/packages/${id}/sla`, {
      method: 'PUT',
      body: { stages, tenant_id: tenantId.value || undefined },
    })
    return response.data
  }

  async function getOpsMetrics(filters: Record<string, unknown> = {}) {
    const response = await $fetch<{ data: any }>('/api/marketing/social/ops-metrics', {
      query: tenantQuery(filters),
    })
    return response.data
  }

  return {
    tenantId,
    listPosts,
    getPost,
    createPost,
    updatePost,
    deletePost,
    shareToStories,
    submitForApproval,
    bypassApproval,
    cancelApproval,
    listWorkflows,
    schedulePost,
    reschedulePost,
    duplicatePost,
    listApprovals,
    getApproval,
    decide,
    batchDecide,
    addComment,
    createReviewLink,
    revokeReviewLink,
    listAssets,
    uploadAsset,
    deleteAsset,
    listAccounts,
    listLogs,
    listPackages,
    createPackage,
    updatePackage,
    getPackageSla,
    updatePackageSla,
    getOpsMetrics,
  }
}
