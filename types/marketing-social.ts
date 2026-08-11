export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin'

export type SocialPostStatus
  = | 'draft'
    | 'pending_approval'
    | 'changes_requested'
    | 'approved'
    | 'scheduled'
    | 'publishing'
    | 'published'
    | 'failed'
    | 'archived'

export type ApprovalPolicy = 'any' | 'all' | 'minimum'
export type ApprovalDecision = 'approved' | 'changes_requested' | 'rejected'

/** Editorial (approval) lifecycle, independent from publication. */
export type SocialEditorialStatus
  = | 'draft'
    | 'internal_review'
    | 'client_review'
    | 'changes_requested'
    | 'approved'
    | 'rejected'
    | 'cancelled'

/** Publication lifecycle, independent from editorial state. */
export type SocialPublicationStatus
  = | 'not_scheduled'
    | 'scheduled'
    | 'publishing'
    | 'published'
    | 'partially_published'
    | 'failed'
    | 'deletion_pending'
    | 'deleted'

export type ApprovalStage = 'internal' | 'client'
export type ApprovalRunStatus
  = | 'pending'
    | 'approved'
    | 'changes_requested'
    | 'rejected'
    | 'cancelled'
    | 'superseded'

export type ApprovalChangeCategory
  = | 'art'
    | 'copy'
    | 'date'
    | 'platform'
    | 'incorrect_info'
    | 'other'

export type SocialCommentVisibility = 'internal' | 'shared'

export type WorkflowStageType = 'internal' | 'client' | 'custom'
export type WorkflowStageMode = 'any' | 'all' | 'minimum'

export type MediaAssetPurpose = 'reference' | 'publication'
export type SocialPostFormat = 'static' | 'carousel' | 'video' | 'story'

/** Operational Kanban column — independent from editorial/publication. */
export const SOCIAL_PRODUCTION_STATUSES = [
  'backlog',
  'briefing_pending',
  'copy_in_progress',
  'design_in_progress',
  'internal_review',
  'awaiting_client_approval',
  'changes_requested',
  'approved',
  'scheduled',
  'published',
  'blocked',
] as const
export type SocialProductionStatus = typeof SOCIAL_PRODUCTION_STATUSES[number]

export const SOCIAL_PRODUCTION_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type SocialProductionPriority = typeof SOCIAL_PRODUCTION_PRIORITIES[number]

export const SOCIAL_PRODUCTION_TASK_TYPES = [
  'prepare_briefing',
  'write_copy',
  'create_design',
  'review',
  'send_to_client',
  'fix',
  'schedule',
  'verify_publication',
  'custom',
] as const
export type SocialProductionTaskType = typeof SOCIAL_PRODUCTION_TASK_TYPES[number]

export const SOCIAL_PRODUCTION_TASK_STATUSES = [
  'todo',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
] as const
export type SocialProductionTaskStatus = typeof SOCIAL_PRODUCTION_TASK_STATUSES[number]

export const SOCIAL_PRODUCTION_TASK_ROLES = [
  'copywriter',
  'designer',
  'social_media',
  'reviewer',
  'manager',
  'any',
] as const
export type SocialProductionTaskRole = typeof SOCIAL_PRODUCTION_TASK_ROLES[number]

export const SOCIAL_PRODUCTION_STATUS_LABELS: Record<SocialProductionStatus, string> = {
  backlog: 'Backlog',
  briefing_pending: 'Briefing pendente',
  copy_in_progress: 'Copy em produção',
  design_in_progress: 'Design em produção',
  internal_review: 'Revisão interna',
  awaiting_client_approval: 'Aguardando cliente',
  changes_requested: 'Alterações solicitadas',
  approved: 'Aprovado',
  scheduled: 'Agendado',
  published: 'Publicado',
  blocked: 'Bloqueado',
}

export const SOCIAL_PRODUCTION_PRIORITY_LABELS: Record<SocialProductionPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

export const SOCIAL_PRODUCTION_TASK_TYPE_LABELS: Record<SocialProductionTaskType, string> = {
  prepare_briefing: 'Preparar briefing',
  write_copy: 'Escrever copy',
  create_design: 'Criar design',
  review: 'Revisar',
  send_to_client: 'Enviar ao cliente',
  fix: 'Corrigir',
  schedule: 'Agendar',
  verify_publication: 'Verificar publicação',
  custom: 'Personalizada',
}

export const SOCIAL_PRODUCTION_TASK_STATUS_LABELS: Record<SocialProductionTaskStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  blocked: 'Bloqueada',
  done: 'Concluída',
  cancelled: 'Cancelada',
}

export const SOCIAL_PRODUCTION_TASK_ROLE_LABELS: Record<SocialProductionTaskRole, string> = {
  copywriter: 'Copywriter',
  designer: 'Designer',
  social_media: 'Social media',
  reviewer: 'Revisão',
  manager: 'Gestão',
  any: 'Qualquer',
}

export interface SocialProductionTaskChecklistItem {
  id: string
  label: string
  done: boolean
}

export interface SocialProductionTask {
  id: string
  tenantId: string
  postId: string
  taskType: SocialProductionTaskType
  title: string
  description: string
  status: SocialProductionTaskStatus
  priority: SocialProductionPriority
  roleScope: SocialProductionTaskRole
  assigneeId: string | null
  dueAt: string | null
  checklist: SocialProductionTaskChecklistItem[]
  dependsOn: string[]
  assetIds: string[]
  blockedReason: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SocialAccount {
  id: string
  tenantId: string
  platform: SocialPlatform
  provider: 'meta' | 'linkedin'
  externalAccountId: string
  name: string
  username: string | null
  avatarUrl: string | null
  capabilities: string[]
  isActive: boolean
  tokenExpiresAt: string | null
}

export interface MediaAsset {
  id: string
  tenantId: string
  name: string
  bucket: string
  objectPath: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  status: 'uploading' | 'ready' | 'processing' | 'failed' | 'archived'
  purpose: MediaAssetPurpose
  category?: string | null
  previewUrl?: string | null
  createdAt: string
}

export interface SocialPostVariantInput {
  id?: string
  accountId: string
  platform: SocialPlatform
  format: SocialPostFormat
  caption: string
  linkUrl?: string
  hashtags?: string[]
  /** CTA / art text and other per-platform extras live in platformConfig for MVP. */
  platformConfig?: Record<string, unknown> & {
    artText?: string
    cta?: string
  }
  assetIds?: string[]
}

export interface SocialPost {
  id: string
  tenantId: string
  title: string
  content: string
  status: SocialPostStatus
  currentVersion: number
  approvalPolicy: ApprovalPolicy
  minimumApprovals: number
  scheduledAt: string | null
  timezone: string
  publishedAt: string | null
  createdBy: string
  assignedTo: string | null
  variants: SocialPostVariant[]
  createdAt: string
  updatedAt: string
}

export interface SocialPostVariant {
  id: string
  accountId: string
  platform: SocialPlatform
  format: SocialPostFormat
  caption: string
  linkUrl: string | null
  hashtags: string[]
  platformConfig: Record<string, unknown>
  externalPostId: string | null
  externalPostUrl: string | null
  assets?: MediaAsset[]
}

export interface SocialPostInput {
  title: string
  content?: string
  /** Shared art/overlay text applied to variants when they omit platformConfig.artText. */
  artText?: string | null
  /** Shared CTA applied to variants when they omit platformConfig.cta. */
  cta?: string | null
  /** Shared hashtags when variants do not override. */
  hashtags?: string[]
  campaignId?: string | null
  assignedTo?: string | null
  /** @deprecated Prefer schedules[]; kept as primary/legacy single date. */
  scheduledAt?: string | null
  /** Multi-date planning slots (reels/stories/feed can share one content). */
  schedules?: Array<{
    id?: string
    variantId?: string | null
    platform?: SocialPlatform | null
    format?: SocialPostFormat | null
    scheduledAt: string
    timezone?: string
    notes?: string | null
  }>
  timezone?: string
  approvalPolicy?: ApprovalPolicy
  minimumApprovals?: number
  /** Operational owners — agency/equipe only. */
  copyOwnerId?: string | null
  designOwnerId?: string | null
  publishOwnerId?: string | null
  productionPriority?: SocialProductionPriority
  productionDueAt?: string | null
  variants?: SocialPostVariantInput[]
  referenceAssetIds?: string[]
}

export interface ApprovalRequest {
  id: string
  postId: string
  versionId: string
  status: 'pending' | 'approved' | 'changes_requested' | 'rejected' | 'cancelled'
  policy: ApprovalPolicy
  minimumApprovals: number
  requestedBy: string
  dueAt: string | null
  approverIds: string[]
  /** Workflow stage this run belongs to (internal review vs client review). */
  stage: ApprovalStage
  workflowId: string | null
  workflowStageId: string | null
  runGroupId: string
  stagePosition: number
  runStatus: ApprovalRunStatus
  decisions: Array<{
    approverId: string
    decision: ApprovalDecision
    comment: string | null
    changeCategory?: ApprovalChangeCategory | null
    createdAt: string
  }>
  createdAt: string
}

export interface SocialApprovalWorkflow {
  id: string
  organizationId: string | null
  tenantId: string | null
  name: string
  slug: string
  description: string
  isSystem: boolean
  isDefault: boolean
  isActive: boolean
  stages: SocialApprovalWorkflowStage[]
}

export interface SocialApprovalWorkflowStage {
  id: string
  workflowId: string
  position: number
  name: string
  stageType: WorkflowStageType
  mode: WorkflowStageMode
  minimumApprovals: number
  requiredCapability: string | null
  allowSelfApproval: boolean
  autoAdvance: boolean
  requireCommentOnReject: boolean
  allowRejection: boolean
}

export interface MarketingSocialOverview {
  drafts: number
  pendingApproval: number
  approved: number
  scheduled: number
  published: number
  failed: number
}

export const SOCIAL_EDITORIAL_STATUS_LABELS: Record<SocialEditorialStatus, string> = {
  draft: 'Rascunho',
  internal_review: 'Revisão interna',
  client_review: 'Aprovação do cliente',
  changes_requested: 'Ajustes solicitados',
  approved: 'Aprovado',
  rejected: 'Reprovado',
  cancelled: 'Cancelado',
}

export const SOCIAL_PUBLICATION_STATUS_LABELS: Record<SocialPublicationStatus, string> = {
  not_scheduled: 'Sem agendamento',
  scheduled: 'Agendado',
  publishing: 'Publicando',
  published: 'Publicado',
  partially_published: 'Publicado parcialmente',
  failed: 'Falha na publicação',
  deletion_pending: 'Exclusão pendente',
  deleted: 'Excluído',
}

export const APPROVAL_STAGE_LABELS: Record<ApprovalStage, string> = {
  internal: 'Revisão interna',
  client: 'Aprovação do cliente',
}

export const APPROVAL_CHANGE_CATEGORY_LABELS: Record<ApprovalChangeCategory, string> = {
  art: 'Arte',
  copy: 'Texto',
  date: 'Data',
  platform: 'Plataforma',
  incorrect_info: 'Informação incorreta',
  other: 'Outro',
}

export const APPROVAL_REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  changes_requested: 'Alterações solicitadas',
  rejected: 'Reprovado',
  cancelled: 'Cancelado',
  superseded: 'Substituído',
}

export const SOCIAL_STATUS_LABELS: Record<SocialPostStatus, string> = {
  draft: 'Rascunho',
  pending_approval: 'Aguardando aprovação',
  changes_requested: 'Ajustes solicitados',
  approved: 'Aprovado',
  scheduled: 'Agendado',
  publishing: 'Publicando',
  published: 'Publicado',
  failed: 'Falha',
  archived: 'Arquivado',
}
