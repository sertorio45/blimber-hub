import type {
  WhatsAppAgent,
  WhatsAppCampaign,
  WhatsAppCampaignAudienceFilter,
  WhatsAppCampaignRecipient,
  WhatsAppCampaignRecipientRow,
  WhatsAppCampaignRow,
  WhatsAppCampaignStats,
  WhatsAppContact,
  WhatsAppFlow,
  WhatsAppFlowExecutionSummary,
  WhatsAppFlowRow,
  WhatsAppFlowTriggerConfig,
  WhatsAppContactRow,
  WhatsAppConversation,
  WhatsAppConversationRow,
  WhatsAppGroupParticipant,
  WhatsAppGroupParticipantRow,
  WhatsAppMessage,
  WhatsAppMessageReaction,
  WhatsAppMessageRow,
} from '~/types/whatsapp'

export function mapCampaignRow(row: WhatsAppCampaignRow): WhatsAppCampaign {
  const audienceFilter = (row.audience_filter || {}) as WhatsAppCampaignAudienceFilter
  const stats = (row.stats || {}) as WhatsAppCampaignStats

  return {
    id: row.id,
    tenantId: row.tenant_id,
    instanceId: row.instance_id ?? null,
    templateId: row.template_id ?? null,
    name: row.name,
    status: row.status,
    scheduledAt: row.scheduled_at ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    audienceFilter: {
      message: audienceFilter.message || '',
      audience_type: audienceFilter.audience_type || 'all',
      opt_in_only: audienceFilter.opt_in_only ?? true,
      exclude_blocked: audienceFilter.exclude_blocked ?? true,
      tags: audienceFilter.tags || [],
      contact_ids: audienceFilter.contact_ids || [],
    },
    stats,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    instanceName: row.whatsapp_instance?.name ?? null,
  }
}

export function mapCampaignRecipientRow(row: WhatsAppCampaignRecipientRow): WhatsAppCampaignRecipient {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    contactId: row.contact_id ?? null,
    phone: row.phone,
    contactName: row.whatsapp_contact?.name ?? null,
    status: row.status,
    sentAt: row.sent_at ?? null,
    errorMessage: row.error_message ?? null,
    externalMessageId: row.external_message_id ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

export function mapFlowRow(row: WhatsAppFlowRow): WhatsAppFlow {
  const triggerConfig = (row.trigger_config || {}) as WhatsAppFlowTriggerConfig

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    triggerType: (row.trigger_type || 'message_received') as WhatsAppFlow['triggerType'],
    triggerConfig: {
      instance_ids: triggerConfig.instance_ids || [],
      keywords: triggerConfig.keywords || [],
      only_incoming: triggerConfig.only_incoming ?? true,
    },
    viewport: (row.viewport || { zoom: 1 }) as WhatsAppFlow['viewport'],
    version: row.version ?? 1,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

export function mapFlowExecutionRow(row: Record<string, any>): WhatsAppFlowExecutionSummary {
  return {
    id: row.id,
    flowId: row.flow_id,
    status: row.status,
    contactId: row.contact_id ?? null,
    conversationId: row.conversation_id ?? null,
    startedAt: row.started_at ?? row.created_at,
    completedAt: row.completed_at ?? null,
    context: row.context ?? {},
  }
}

export function mapAgentRow(row: Record<string, any>): WhatsAppAgent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? null,
    avatar: row.avatar ?? null,
    llmProvider: (row.llm_provider || 'ollama') as WhatsAppAgent['llmProvider'],
    model: row.model,
    systemPrompt: row.system_prompt,
    temperature: Number(row.temperature ?? 0.7),
    maxTokens: Number(row.max_tokens ?? 1024),
    isActive: row.is_active ?? true,
    handoffRules: row.handoff_rules ?? {},
    knowledgeBase: row.knowledge_base ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tools: Array.isArray(row.whatsapp_agent_tool)
      ? row.whatsapp_agent_tool.map(mapAgentToolRow)
      : undefined,
  }
}

export function mapAgentToolRow(row: Record<string, any>): import('~/types/whatsapp').WhatsAppAgentTool {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    agentId: row.agent_id,
    name: row.name,
    type: row.type,
    config: row.config ?? {},
    mcpServer: row.mcp_server ?? null,
    mcpToolName: row.mcp_tool_name ?? null,
    isEnabled: row.is_enabled ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapContactRow(row: WhatsAppContactRow): WhatsAppContact {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    phone: row.phone,
    name: row.name ?? null,
    profilePicture: row.profile_picture ?? null,
    crmContactId: row.crm_contact_id ?? null,
    tags: row.tags ?? [],
    customFields: row.custom_fields ?? {},
    optIn: row.opt_in ?? true,
    optInAt: row.opt_in_at ?? null,
    blocked: row.blocked ?? false,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    crmContactName: row.crm_contact?.name ?? null,
    crmContactEmail: row.crm_contact?.email ?? null,
    crmCompanyName: row.crm_contact?.company?.name ?? null,
  }
}

export function mapConversationRow(
  row: WhatsAppConversationRow,
  activeAgent?: { agentId: string, agentName: string | null } | null,
): WhatsAppConversation {
  const agentFields = activeAgent === undefined
    ? {}
    : {
        activeAgentId: activeAgent?.agentId ?? null,
        activeAgentName: activeAgent?.agentName ?? null,
      }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    instanceId: row.instance_id ?? null,
    instanceName: row.whatsapp_instance?.name ?? null,
    instancePhoneNumber: row.whatsapp_instance?.phone_number ?? null,
    instanceStatus: row.whatsapp_instance?.status ?? null,
    contactId: row.contact_id ?? null,
    remoteJid: row.remote_jid,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    isGroup: Boolean(row.is_group),
    groupSubject: row.group_subject ?? null,
    groupMetadata: row.group_metadata ?? {},
    status: row.status ?? 'open',
    assignedTo: row.assigned_to ?? null,
    lastMessagePreview: row.last_message_preview ?? '',
    lastMessageAt: row.last_message_at ?? null,
    unreadCount: row.unread_count,
    leadId: row.lead_id ?? null,
    crmContactId: row.crm_contact_id ?? null,
    priority: row.priority ?? 0,
    channel: row.channel ?? 'whatsapp',
    isOnline: row.is_online,
    profilePicture: row.profile_picture ?? null,
    ...agentFields,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

function mapReactions(raw: WhatsAppMessageReaction[] | null | undefined): WhatsAppMessageReaction[] {
  if (!Array.isArray(raw))
    return []
  return raw
    .filter(item => item && typeof item.emoji === 'string' && item.emoji)
    .map(item => ({
      emoji: item.emoji,
      participantJid: item.participantJid ?? null,
      fromMe: Boolean(item.fromMe),
    }))
}

export function mapMessageRow(row: WhatsAppMessageRow): WhatsAppMessage {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id ?? null,
    instanceId: row.instance_id,
    contactId: row.contact_id ?? null,
    externalId: row.external_id ?? null,
    remoteJid: row.remote_jid,
    fromMe: row.from_me,
    messageType: row.message_type,
    content: row.content ?? '',
    mediaUrl: row.media_url ?? null,
    mediaMime: row.media_mime ?? null,
    fileName: row.file_name ?? null,
    status: row.status,
    sentAt: row.sent_at ?? null,
    deliveredAt: row.delivered_at ?? null,
    readAt: row.read_at ?? null,
    leadId: row.lead_id ?? null,
    crmContactId: row.crm_contact_id ?? null,
    replyToId: row.reply_to_id ?? null,
    quotedExternalId: row.quoted_external_id ?? null,
    participantJid: row.participant_jid ?? null,
    participantName: row.participant_name ?? null,
    reactions: mapReactions(row.reactions),
    metadata: row.metadata ?? {},
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

export function mapGroupParticipantRow(row: WhatsAppGroupParticipantRow): WhatsAppGroupParticipant {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    participantJid: row.participant_jid,
    phone: row.phone ?? null,
    name: row.name ?? null,
    adminRole: row.admin_role ?? null,
    contactId: row.contact_id ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

export function useWhatsAppMapper() {
  return {
    mapContactRow,
    mapConversationRow,
    mapMessageRow,
    mapGroupParticipantRow,
    mapCampaignRow,
    mapCampaignRecipientRow,
    mapFlowRow,
    mapFlowExecutionRow,
  }
}
