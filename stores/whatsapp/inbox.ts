import { defineStore } from 'pinia'

import type { WhatsAppConversationStatus, WhatsAppMessage } from '~/types/whatsapp'

export type WhatsAppChatTypeFilter = 'all' | 'direct' | 'group'

export interface WhatsAppInboxFilters {
  status?: WhatsAppConversationStatus | 'all'
  chatType?: WhatsAppChatTypeFilter
  assignedToMe?: boolean
  unreadOnly?: boolean
  search?: string
}

/** null = todas as caixas; string = instância específica */
export type WhatsAppActiveInboxId = string | null

export const useWhatsAppInboxStore = defineStore('whatsapp-inbox', {
  state: () => ({
    activeConversationId: null as string | null,
    activeInstanceId: null as WhatsAppActiveInboxId,
    replyToMessage: null as WhatsAppMessage | null,
    filters: {
      status: 'all' as WhatsAppInboxFilters['status'],
      chatType: 'all' as WhatsAppChatTypeFilter,
      assignedToMe: false,
      unreadOnly: false,
      search: '',
    } as WhatsAppInboxFilters,
    sidebarCollapsed: false,
  }),

  actions: {
    setActiveConversation(id: string | null) {
      this.activeConversationId = id
      if (!id)
        this.replyToMessage = null
    },

    setActiveInstance(id: WhatsAppActiveInboxId) {
      this.activeInstanceId = id
    },

    setReplyToMessage(message: WhatsAppMessage | null) {
      this.replyToMessage = message
    },

    setFilters(filters: Partial<WhatsAppInboxFilters>) {
      this.filters = { ...this.filters, ...filters }
    },

    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },

    reset() {
      this.activeConversationId = null
      this.activeInstanceId = null
      this.replyToMessage = null
      this.filters = {
        status: 'all',
        chatType: 'all',
        assignedToMe: false,
        unreadOnly: false,
        search: '',
      }
      this.sidebarCollapsed = false
    },
  },
})
