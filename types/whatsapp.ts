// WhatsApp module domain types (UI layer — camelCase)

import type { DrawflowExport } from '~/types/drawflow'

export type WhatsAppProvider = 'evolution' | 'cloud_api'
export type WhatsAppInstanceStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type WhatsAppConversationStatus = 'open' | 'pending' | 'resolved' | 'spam'
export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'template'
  | 'interactive'
export type WhatsAppMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
export type WhatsAppCampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
export type WhatsAppFlowNodeType =
  | 'trigger'
  | 'message'
  | 'condition'
  | 'delay'
  | 'wait_reply'
  | 'action'
  | 'ai_agent'
  | 'handoff'
  | 'webhook'
  | 'tag'
  | 'crm_update'
export type WhatsAppFlowStatus = 'draft' | 'active' | 'paused' | 'archived'
export type WhatsAppAgentToolType = 'mcp' | 'internal' | 'api'
export type WhatsAppLlmProvider = 'ollama' | 'openai'

export interface WhatsAppInstance {
  id: string
  tenantId: string
  name: string
  provider: WhatsAppProvider
  phoneNumber?: string | null
  status: WhatsAppInstanceStatus
  qrCode?: string | null
  connectionState: Record<string, unknown>
  isDefault: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WhatsAppIntegration {
  id: string
  tenantId: string
  instanceId: string
  provider: WhatsAppProvider
  apiUrl?: string | null
  webhookSecret?: string | null
  cloudPhoneId?: string | null
  cloudBusinessId?: string | null
  settings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WhatsAppContact {
  id: string
  tenantId: string
  phone: string
  name?: string | null
  profilePicture?: string | null
  crmContactId?: string | null
  tags: string[]
  customFields: Record<string, unknown>
  optIn: boolean
  optInAt?: string | null
  blocked: boolean
  createdAt: string
  updatedAt: string
  /** Joined from CRM */
  crmContactName?: string | null
  crmContactEmail?: string | null
  crmCompanyName?: string | null
}

export interface WhatsAppContactDetail extends WhatsAppContact {
  conversationsCount?: number
  lastConversationAt?: string | null
}

export interface CreateWhatsAppContactPayload {
  tenant_id?: string
  phone: string
  name?: string
  tags?: string[]
  opt_in?: boolean
  blocked?: boolean
  custom_fields?: Record<string, unknown>
}

export interface UpdateWhatsAppContactPayload {
  tenant_id?: string
  phone?: string
  name?: string
  tags?: string[]
  opt_in?: boolean
  blocked?: boolean
  custom_fields?: Record<string, unknown>
}

export interface WhatsAppConversation {
  id: string
  tenantId: string
  instanceId?: string | null
  instanceName?: string | null
  instancePhoneNumber?: string | null
  instanceStatus?: WhatsAppInstanceStatus | null
  contactId?: string | null
  remoteJid: string
  contactName: string
  contactPhone: string
  status: WhatsAppConversationStatus
  assignedTo?: string | null
  lastMessagePreview: string
  lastMessageAt?: string | null
  unreadCount: number
  leadId?: string | null
  crmContactId?: string | null
  priority: number
  channel: string
  isOnline: boolean
  profilePicture?: string | null
  activeAgentId?: string | null
  activeAgentName?: string | null
  createdAt: string
  updatedAt: string
}

export interface WhatsAppConversationLead {
  id: string
  name: string
  value: number
  serviceName: string | null
  stageName: string | null
  funnelName: string | null
  status: string
  priority: string
}

export interface WhatsAppMessage {
  id: string
  tenantId: string
  conversationId?: string | null
  instanceId: string
  contactId?: string | null
  externalId?: string | null
  remoteJid: string
  fromMe: boolean
  messageType: WhatsAppMessageType | string
  content: string
  mediaUrl?: string | null
  mediaMime?: string | null
  fileName?: string | null
  status: WhatsAppMessageStatus | string
  sentAt?: string | null
  deliveredAt?: string | null
  readAt?: string | null
  leadId?: string | null
  crmContactId?: string | null
  replyToId?: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WhatsAppTag {
  id: string
  tenantId: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

export interface WhatsAppTemplate {
  id: string
  tenantId: string
  instanceId?: string | null
  name: string
  language: string
  category?: string | null
  status: string
  components: unknown[]
  externalId?: string | null
  provider?: WhatsAppProvider | null
  createdAt: string
  updatedAt: string
}

export interface WhatsAppCampaign {
  id: string
  tenantId: string
  instanceId?: string | null
  templateId?: string | null
  name: string
  status: WhatsAppCampaignStatus
  scheduledAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  audienceFilter: WhatsAppCampaignAudienceFilter
  stats: WhatsAppCampaignStats
  createdAt: string
  updatedAt: string
  instanceName?: string | null
}

export type WhatsAppCampaignRecipientStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export interface WhatsAppCampaignAudienceFilter {
  message: string
  audience_type?: 'all' | 'tags' | 'selected'
  opt_in_only?: boolean
  exclude_blocked?: boolean
  tags?: string[]
  contact_ids?: string[]
}

export interface WhatsAppCampaignStats {
  total?: number
  sent?: number
  failed?: number
  pending?: number
  skipped?: number
}

export interface WhatsAppCampaignRecipient {
  id: string
  tenantId: string
  campaignId: string
  contactId?: string | null
  phone: string
  contactName?: string | null
  status: WhatsAppCampaignRecipientStatus | string
  sentAt?: string | null
  errorMessage?: string | null
  externalMessageId?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateWhatsAppCampaignPayload {
  tenant_id?: string
  name: string
  instance_id: string
  audience_filter: WhatsAppCampaignAudienceFilter
  scheduled_at?: string | null
}

export interface UpdateWhatsAppCampaignPayload {
  tenant_id?: string
  name?: string
  instance_id?: string
  audience_filter?: WhatsAppCampaignAudienceFilter
  scheduled_at?: string | null
}

export interface WhatsAppFlow {
  id: string
  tenantId: string
  name: string
  description?: string | null
  status: WhatsAppFlowStatus
  triggerType: WhatsAppFlowTriggerType
  triggerConfig: WhatsAppFlowTriggerConfig
  viewport: WhatsAppFlowViewport
  version: number
  createdAt: string
  updatedAt: string
  executionsCount?: number
  lastTriggeredAt?: string | null
}

export type WhatsAppFlowTriggerType = 'message_received' | 'manual' | 'keyword'

export interface WhatsAppFlowTriggerConfig {
  instance_ids?: string[]
  keywords?: string[]
  only_incoming?: boolean
}

export interface WhatsAppFlowViewport {
  zoom?: number
  drawflow?: DrawflowExport['drawflow']
}

export interface WhatsAppFlowExecutionSummary {
  id: string
  flowId: string
  status: string
  contactId?: string | null
  conversationId?: string | null
  startedAt: string
  completedAt?: string | null
  context: Record<string, unknown>
}

export interface WhatsAppFlowExecutionLogEntry {
  id: string
  action: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  error?: string | null
  executedAt: string
}

export interface WhatsAppFlowExecutionDetail extends WhatsAppFlowExecutionSummary {
  logs: WhatsAppFlowExecutionLogEntry[]
}

export interface CreateWhatsAppFlowPayload {
  tenant_id?: string
  name: string
  description?: string
  trigger_type?: WhatsAppFlowTriggerType
  trigger_config?: WhatsAppFlowTriggerConfig
}

export interface UpdateWhatsAppFlowPayload {
  tenant_id?: string
  name?: string
  description?: string | null
  trigger_type?: WhatsAppFlowTriggerType
  trigger_config?: WhatsAppFlowTriggerConfig
  status?: WhatsAppFlowStatus
}

export interface SaveWhatsAppFlowCanvasPayload {
  tenant_id?: string
  canvas: DrawflowExport
  zoom?: number
}

export interface WhatsAppFlowNode {
  id: string
  tenantId: string
  flowId: string
  type: WhatsAppFlowNodeType
  label: string
  position: { x: number, y: number }
  data: Record<string, unknown>
  nodeKey: string
  createdAt: string
  updatedAt: string
}

export interface WhatsAppFlowEdge {
  id: string
  tenantId: string
  flowId: string
  sourceNodeId: string
  targetNodeId: string
  sourceHandle?: string | null
  targetHandle?: string | null
  condition: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WhatsAppAgent {
  id: string
  tenantId: string
  name: string
  description?: string | null
  avatar?: string | null
  llmProvider: WhatsAppLlmProvider
  model: string
  systemPrompt: string
  temperature: number
  maxTokens: number
  isActive: boolean
  handoffRules: Record<string, unknown>
  knowledgeBase: unknown[]
  createdAt: string
  updatedAt: string
  tools?: WhatsAppAgentTool[]
}

export interface WhatsAppAgentTool {
  id: string
  tenantId: string
  agentId: string
  name: string
  type: WhatsAppAgentToolType
  config: Record<string, unknown>
  mcpServer?: string | null
  mcpToolName?: string | null
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface WhatsAppDashboardOverview {
  totalConversations: number
  openConversations: number
  unreadMessages: number
  messagesToday: number
  activeCampaigns: number
  activeAgents: number
  avgResponseTimeSec: number
  connectedInstances: number
  totalContacts: number
  messagesSentPeriod: number
  messagesReceivedPeriod: number
}

export interface WhatsAppMessagesByDay {
  date: string
  label: string
  sent: number
  received: number
}

export interface WhatsAppConversationsByStatus {
  status: string
  label: string
  count: number
}

export interface WhatsAppRecentActivity {
  id: string
  contactName: string
  contactPhone: string
  lastMessagePreview: string
  lastMessageAt: string | null
  unreadCount: number
  status: string
}

export interface WhatsAppDashboardAnalytics {
  overview: WhatsAppDashboardOverview
  messagesByDay: WhatsAppMessagesByDay[]
  conversationsByStatus: WhatsAppConversationsByStatus[]
  recentActivity: WhatsAppRecentActivity[]
  periodDays: number
}

export interface WhatsAppCampaignReportStat {
  id: string
  name: string
  status: string
  sent: number
  failed: number
  pending: number
  total: number
}

export interface WhatsAppFlowReportStat {
  total: number
  completed: number
  failed: number
  waiting: number
  running: number
}

export interface WhatsAppAgentUsageStat {
  agentId: string
  agentName: string
  sessions: number
  tokensUsed: number
}

export interface WhatsAppReportsAnalytics extends WhatsAppDashboardAnalytics {
  campaigns: WhatsAppCampaignReportStat[]
  flows: WhatsAppFlowReportStat
  agents: {
    totalSessions: number
    totalTokens: number
    topAgents: WhatsAppAgentUsageStat[]
  }
}

export interface WhatsAppGeneralSettings {
  welcome_message: string
  auto_resolve_hours: number
  default_priority: number
  business_hours_enabled: boolean
  business_hours_start: string
  business_hours_end: string
  business_hours_timezone: string
  notify_new_conversation: boolean
}

export interface WhatsAppLlmSettings {
  default_provider: WhatsAppLlmProvider
  default_model: string
}

export interface WhatsAppModuleSettings {
  general: WhatsAppGeneralSettings
  llm: WhatsAppLlmSettings
  ollamaConfigured: boolean
}

export interface WhatsAppInstanceIntegrationView {
  id: string
  provider: WhatsAppProvider
  apiUrl?: string | null
  cloudPhoneId?: string | null
  cloudBusinessId?: string | null
  settings: Record<string, unknown>
  hasApiToken: boolean
  hasCloudToken: boolean
  maskedApiToken?: string | null
  webhookSecret?: string | null
}

export interface WhatsAppInstanceView {
  id: string
  tenantId: string
  name: string
  provider: WhatsAppProvider
  phoneNumber?: string | null
  status: WhatsAppInstanceStatus
  qrCode?: string | null
  connectionState: Record<string, unknown>
  isDefault: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  integration?: WhatsAppInstanceIntegrationView | null
  conversationCount?: number
  unreadCount?: number
}

export interface CreateWhatsAppInstancePayload {
  tenant_id?: string
  name: string
  provider: WhatsAppProvider
  is_default?: boolean
  api_url?: string
  api_token?: string
  evolution_instance_name?: string
  link_existing?: boolean
  cloud_phone_id?: string
  cloud_business_id?: string
  cloud_access_token?: string
  cloud_app_secret?: string
}

export interface EvolutionRemoteInstanceView {
  instanceName: string
  status: string
  phoneNumber?: string | null
  isConnected: boolean
}

// Evolution API webhook payloads (provider layer)
export interface EvolutionAPIConfig {
  instanceId: string
  token: string
  baseUrl: string
  webhookUrl?: string
}

export interface EvolutionAPIMessage {
  key: {
    remoteJid: string
    fromMe: boolean
    id: string
  }
  messageType: string
  message: {
    conversation?: string
    imageMessage?: {
      url: string
      caption?: string
    }
    documentMessage?: {
      url: string
      fileName: string
      caption?: string
    }
  }
  messageTimestamp: number
  status: string
  instanceId: string
}

export interface EvolutionAPIWebhook {
  event: 'messages.upsert' | 'messages.update' | 'connection.update'
  instance: string
  data: Record<string, unknown>
}

// DB row shapes (snake_case) for mapper input
export interface WhatsAppContactRow {
  id: string
  tenant_id: string
  phone: string
  name?: string | null
  profile_picture?: string | null
  crm_contact_id?: string | null
  tags?: string[]
  custom_fields?: Record<string, unknown>
  opt_in?: boolean
  opt_in_at?: string | null
  blocked?: boolean
  created_at?: string
  updated_at?: string
  crm_contact?: {
    name?: string | null
    email?: string | null
    company?: { name?: string | null } | null
  } | null
}

export interface WhatsAppConversationRow {
  id: string
  tenant_id: string
  instance_id?: string | null
  contact_id?: string | null
  remote_jid: string
  contact_name: string
  contact_phone: string
  status?: WhatsAppConversationStatus
  assigned_to?: string | null
  last_message_preview?: string
  last_message_at?: string | null
  unread_count: number
  lead_id?: string | null
  crm_contact_id?: string | null
  priority?: number
  channel?: string
  is_online: boolean
  profile_picture?: string | null
  created_at?: string
  updated_at?: string
  whatsapp_instance?: {
    id?: string | null
    name?: string | null
    phone_number?: string | null
    status?: WhatsAppInstanceStatus | null
  } | null
}

export interface WhatsAppMessageRow {
  id: string
  tenant_id: string
  conversation_id?: string | null
  instance_id: string
  contact_id?: string | null
  external_id?: string | null
  remote_jid: string
  from_me: boolean
  message_type: string
  content?: string
  media_url?: string | null
  media_mime?: string | null
  file_name?: string | null
  status: string
  sent_at?: string | null
  delivered_at?: string | null
  read_at?: string | null
  lead_id?: string | null
  crm_contact_id?: string | null
  reply_to_id?: string | null
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface WhatsAppCampaignRow {
  id: string
  tenant_id: string
  instance_id?: string | null
  template_id?: string | null
  name: string
  status: WhatsAppCampaignStatus
  scheduled_at?: string | null
  started_at?: string | null
  completed_at?: string | null
  audience_filter?: WhatsAppCampaignAudienceFilter | Record<string, unknown>
  stats?: WhatsAppCampaignStats | Record<string, unknown>
  created_at?: string
  updated_at?: string
  whatsapp_instance?: { name?: string | null } | null
}

export interface WhatsAppCampaignRecipientRow {
  id: string
  tenant_id: string
  campaign_id: string
  contact_id?: string | null
  phone: string
  status: string
  sent_at?: string | null
  error_message?: string | null
  external_message_id?: string | null
  created_at?: string
  updated_at?: string
  whatsapp_contact?: { name?: string | null } | null
}

export interface WhatsAppFlowRow {
  id: string
  tenant_id: string
  name: string
  description?: string | null
  status: WhatsAppFlowStatus
  trigger_type: string
  trigger_config?: WhatsAppFlowTriggerConfig | Record<string, unknown>
  viewport?: { x: number, y: number, zoom: number }
  version?: number
  created_at?: string
  updated_at?: string
}

export interface WhatsAppFlowExecutionRow {
  id: string
  tenant_id: string
  flow_id: string
  contact_id?: string | null
  conversation_id?: string | null
  status: string
  context?: Record<string, unknown>
  started_at?: string
  completed_at?: string | null
  created_at?: string
}
