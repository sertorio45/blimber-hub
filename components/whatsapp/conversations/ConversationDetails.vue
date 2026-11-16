<script setup lang="ts">
import type { WhatsAppConversation, WhatsAppConversationLead, WhatsAppGroupParticipant } from '~/types/whatsapp'

import { formatLeadCurrency } from '~/composables/crm/useCrmLeadValue'
import WhatsAppStatusBadge from '~/components/whatsapp/shared/WhatsAppStatusBadge.vue'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

const props = defineProps<{
  conversation: WhatsAppConversation | null
  lead: WhatsAppConversationLead | null
}>()

const { tenantId } = useTenant()
const participants = ref<WhatsAppGroupParticipant[]>([])
const participantsLoading = ref(false)

async function loadParticipants() {
  if (!props.conversation?.isGroup || !props.conversation.id || !tenantId.value) {
    participants.value = []
    return
  }

  participantsLoading.value = true
  try {
    const response = await $fetch<{ data: WhatsAppGroupParticipant[] }>(
      `/api/whatsapp/conversations/${props.conversation.id}/participants`,
      { query: { tenant_id: tenantId.value } },
    )
    participants.value = response.data || []
  }
  catch {
    participants.value = []
  }
  finally {
    participantsLoading.value = false
  }
}

watch(
  () => [props.conversation?.id, props.conversation?.isGroup] as const,
  () => {
    loadParticipants()
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="conversation" class="hidden h-full min-h-0 flex-col border-l bg-background xl:flex xl:w-64">
    <div class="border-b px-4 py-3">
      <h3 class="text-sm font-medium">
        Detalhes
      </h3>
    </div>
    <div class="flex-1 overflow-y-auto p-4">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-xs font-medium text-muted-foreground">
            {{ conversation.isGroup ? 'Grupo' : 'Contato' }}
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-1.5 text-sm">
          <p class="font-medium">
            {{ conversation.isGroup ? (conversation.groupSubject || conversation.contactName) : conversation.contactName }}
          </p>
          <p v-if="!conversation.isGroup" class="text-xs text-muted-foreground">
            {{ conversation.contactPhone }}
          </p>
          <p v-else class="text-xs text-muted-foreground">
            {{ participants.length || '—' }} participantes
          </p>
          <WhatsAppStatusBadge :status="conversation.status" />
        </CardContent>
      </Card>

      <Card v-if="conversation.instanceName" class="mt-3">
        <CardHeader class="pb-2">
          <CardTitle class="text-xs font-medium text-muted-foreground">
            Caixa de entrada
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-1 text-sm">
          <p class="font-medium">
            {{ conversation.instanceName }}
          </p>
          <p v-if="conversation.instancePhoneNumber" class="text-xs text-muted-foreground">
            {{ conversation.instancePhoneNumber }}
          </p>
          <NuxtLink
            v-if="conversation.instanceId"
            :to="`/whatsapp/conversations?inbox=${conversation.instanceId}`"
            class="inline-block pt-1 text-xs text-primary hover:underline"
          >
            Ver caixa →
          </NuxtLink>
        </CardContent>
      </Card>

      <Card v-if="conversation.isGroup" class="mt-3">
        <CardHeader class="pb-2">
          <CardTitle class="text-xs font-medium text-muted-foreground">
            Participantes
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-2 text-sm">
          <p v-if="participantsLoading" class="text-xs text-muted-foreground">
            Carregando...
          </p>
          <p v-else-if="!participants.length" class="text-xs text-muted-foreground">
            Nenhum participante sincronizado ainda
          </p>
          <div
            v-for="participant in participants"
            :key="participant.id"
            class="flex items-start justify-between gap-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">
                {{ participant.name || participant.phone || participant.participantJid }}
              </p>
              <p v-if="participant.phone" class="truncate text-[11px] text-muted-foreground">
                {{ participant.phone }}
              </p>
            </div>
            <span v-if="participant.adminRole" class="shrink-0 text-[10px] uppercase text-muted-foreground">
              {{ participant.adminRole }}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card v-if="!conversation.isGroup && lead" class="mt-3">
        <CardHeader class="pb-2">
          <CardTitle class="text-xs font-medium text-muted-foreground">
            Lead
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-1 text-xs text-muted-foreground">
          <p class="text-sm font-medium text-foreground">
            {{ lead.name }}
          </p>
          <p>{{ lead.funnelName }} · {{ lead.stageName }}</p>
          <p v-if="lead.serviceName">
            {{ lead.serviceName }}
          </p>
          <p v-if="lead.value">
            {{ formatLeadCurrency(lead.value) }}
          </p>
          <NuxtLink to="/crm/funnel" class="inline-block pt-1 text-primary hover:underline">
            Funil →
          </NuxtLink>
        </CardContent>
      </Card>

      <div
        v-if="!conversation.isGroup && (conversation.crmContactId || conversation.activeAgentName)"
        class="mt-3 space-y-1 px-1 text-xs text-muted-foreground"
      >
        <p v-if="conversation.crmContactId">
          CRM vinculado
        </p>
        <p v-if="conversation.activeAgentName">
          IA: {{ conversation.activeAgentName }}
        </p>
      </div>
    </div>
  </div>
</template>
