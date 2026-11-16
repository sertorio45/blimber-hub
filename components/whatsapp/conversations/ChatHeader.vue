<script setup lang="ts">
import type { Product } from '~/types/crm'
import type { WhatsAppAgent, WhatsAppConversation, WhatsAppConversationLead } from '~/types/whatsapp'

import { formatLeadCurrency, formatLeadValueInput, parseLeadValueInput } from '~/composables/crm/useCrmLeadValue'
import TeamMemberSelect from '~/components/crm/team/TeamMemberSelect.vue'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { toast } from 'vue-sonner'

const props = defineProps<{
  conversation: WhatsAppConversation
  agents: WhatsAppAgent[]
  agentsLoading?: boolean
  lead: WhatsAppConversationLead | null
  products: Product[]
  productsLoading?: boolean
}>()

const emit = defineEmits<{
  statusChange: [status: WhatsAppConversation['status']]
  syncCrm: [payload: { productId?: string | null, value?: number, serviceName?: string | null }]
  deleteConversation: []
  agentChange: [payload: { agentId: string | null, enabled: boolean }]
  assignChange: [userId: string | null]
}>()

const showCrmDialog = ref(false)
const showAgentMenu = ref(false)
const agentEnabled = ref(false)
const selectedAgentId = ref<string | null>(null)
const savingAgent = ref(false)
const selectedProductId = ref<string | null>(null)
const crmValueInput = ref('R$ 0,00')

const initials = computed(() => {
  const name = props.conversation.contactName || '?'
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
})

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  return phone
}

function syncAgentState() {
  agentEnabled.value = Boolean(props.conversation.activeAgentId)
  selectedAgentId.value = props.conversation.activeAgentId || null
}

watch(
  () => [props.conversation.id, props.conversation.activeAgentId] as const,
  syncAgentState,
  { immediate: true },
)

function openCrmDialog() {
  if (props.lead) {
    crmValueInput.value = formatLeadValueInput(props.lead.value)
    const matchedProduct = props.products.find(product => product.name === props.lead?.serviceName)
    selectedProductId.value = matchedProduct?.id ?? null
  }
  else {
    crmValueInput.value = 'R$ 0,00'
    selectedProductId.value = null
  }
  showCrmDialog.value = true
}

function handleCrmValueInput(event: Event) {
  const input = event.target as HTMLInputElement
  crmValueInput.value = formatLeadValueInput(input.value)
}

function handleCrmProductSelect(productId: string) {
  selectedProductId.value = productId
  const product = props.products.find(item => item.id === productId)
  if (product)
    crmValueInput.value = formatLeadValueInput(product.price)
}

function confirmSyncCrm() {
  showCrmDialog.value = false
  const selectedProduct = props.products.find(item => item.id === selectedProductId.value)
  emit('syncCrm', {
    productId: selectedProductId.value,
    value: parseLeadValueInput(crmValueInput.value),
    serviceName: selectedProduct?.name ?? null,
  })
}

async function handleAgentToggle(enabled: boolean) {
  if (enabled && !selectedAgentId.value) {
    toast.error('Selecione um agente antes de ativar a IA.')
    return
  }

  savingAgent.value = true
  try {
    emit('agentChange', {
      agentId: enabled ? selectedAgentId.value : null,
      enabled,
    })
  }
  finally {
    savingAgent.value = false
  }
}

async function handleAgentSelect(agentId: string) {
  selectedAgentId.value = agentId

  if (!agentEnabled.value)
    return

  savingAgent.value = true
  try {
    emit('agentChange', { agentId, enabled: true })
  }
  finally {
    savingAgent.value = false
  }
}

const activeAgents = computed(() => props.agents.filter(item => item.isActive))
const canEnableAgent = computed(() => Boolean(selectedAgentId.value) && activeAgents.value.length > 0)

const toolbarButtonClass = 'h-8 gap-1.5'
const toolbarSelectClass = 'h-8 w-[120px] text-xs'
</script>

<template>
  <div class="border-b bg-background px-4 py-3">
    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
      <Avatar class="h-9 w-9 shrink-0">
        <AvatarImage :src="conversation.profilePicture || undefined" />
        <AvatarFallback class="text-xs">{{ initials }}</AvatarFallback>
      </Avatar>

      <div class="min-w-0 flex-1 basis-32">
        <p class="truncate text-sm font-medium">
          <span v-if="conversation.isGroup" class="i-lucide-users mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          {{ conversation.isGroup ? (conversation.groupSubject || conversation.contactName) : conversation.contactName }}
        </p>
        <p class="truncate text-xs text-muted-foreground">
          {{ conversation.isGroup ? 'Grupo do WhatsApp' : formatPhone(conversation.contactPhone) }}
          <span v-if="conversation.isOnline && !conversation.isGroup"> · online</span>
        </p>
        <p
          v-if="conversation.instanceName"
          class="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground"
        >
          <span class="i-lucide-smartphone h-3 w-3 shrink-0" />
          {{ conversation.instanceName }}
          <span v-if="conversation.instancePhoneNumber">· {{ formatPhone(conversation.instancePhoneNumber) }}</span>
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button
          v-if="!conversation.isGroup"
          variant="outline"
          size="sm"
          :class="toolbarButtonClass"
          @click="openCrmDialog"
        >
          <span class="i-lucide-user-plus h-4 w-4" />
          CRM
        </Button>

        <Button
          v-if="!conversation.isGroup"
          :variant="conversation.activeAgentId ? 'secondary' : 'outline'"
          size="sm"
          :class="toolbarButtonClass"
          :title="conversation.activeAgentName ? `IA ativa: ${conversation.activeAgentName}` : 'Configurar atendimento por IA'"
          @click="showAgentMenu = true"
        >
          <span class="i-lucide-bot h-4 w-4" />
          IA
        </Button>

        <Button
          variant="outline"
          size="sm"
          :class="toolbarButtonClass"
          @click="emit('deleteConversation')"
        >
          <span class="i-lucide-trash-2 h-4 w-4" />
          Excluir
        </Button>

        <TeamMemberSelect
          :model-value="conversation.assignedTo || null"
          include-unassigned
          placeholder="Responsável"
          class="h-8 w-[160px] text-xs"
          @update:model-value="emit('assignChange', $event)"
        />

        <Select
          @update:model-value="emit('statusChange', $event as WhatsAppConversation['status'])"
        >
          <SelectTrigger :class="toolbarSelectClass">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">
              Aberta
            </SelectItem>
            <SelectItem value="pending">
              Pendente
            </SelectItem>
            <SelectItem value="resolved">
              Resolvida
            </SelectItem>
            <SelectItem value="spam">
              Spam
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <Dialog v-model:open="showCrmDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ lead ? 'CRM / Lead' : 'Enviar ao CRM' }}</DialogTitle>
          <DialogDescription>
            {{ lead ? 'Lead vinculado ao funil.' : 'Sincronize o contato e crie o lead no funil ativo.' }}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-3 rounded-lg border p-4 text-sm">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <p class="text-muted-foreground">
                Nome
              </p>
              <p class="font-medium">
                {{ conversation.contactName || 'Sem nome' }}
              </p>
            </div>
            <div>
              <p class="text-muted-foreground">
                Telefone
              </p>
              <p class="font-medium">
                {{ formatPhone(conversation.contactPhone) }}
              </p>
            </div>
          </div>

          <template v-if="lead">
            <div class="rounded-md bg-muted/40 px-3 py-2 text-xs">
              <p class="font-medium">
                {{ lead.name }}
              </p>
              <p class="mt-1 text-muted-foreground">
                {{ lead.funnelName || 'Funil' }}
                <span v-if="lead.stageName"> · {{ lead.stageName }}</span>
              </p>
              <p v-if="lead.serviceName || lead.value" class="mt-1 text-muted-foreground">
                {{ lead.serviceName || 'Sem serviço' }}
                <span v-if="lead.value"> · {{ formatLeadCurrency(lead.value) }}</span>
              </p>
            </div>
          </template>
          <template v-else>
            <div class="space-y-1.5">
              <Label class="text-xs">Serviço / produto</Label>
              <Select
                :model-value="selectedProductId || undefined"
                :disabled="productsLoading"
                @update:model-value="handleCrmProductSelect(String($event))"
              >
                <SelectTrigger class="h-9">
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="product in products"
                    :key="product.id"
                    :value="product.id"
                  >
                    {{ product.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs">Valor estimado</Label>
              <Input
                :model-value="crmValueInput"
                class="h-9"
                inputmode="numeric"
                placeholder="R$ 0,00"
                @input="handleCrmValueInput"
              />
            </div>
          </template>
        </div>

        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" @click="showCrmDialog = false">
            Cancelar
          </Button>
          <Button v-if="!lead" @click="confirmSyncCrm">
            Confirmar envio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="showAgentMenu">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Atendimento por IA</DialogTitle>
          <DialogDescription>
            Escolha o agente e ative para respostas automáticas nesta conversa. Em fluxos automatizados, a IA segue o agente configurado no fluxo.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label class="text-sm">Agente</Label>
            <Select
              :model-value="selectedAgentId || undefined"
              :disabled="savingAgent || agentsLoading || !activeAgents.length"
              @update:model-value="handleAgentSelect(String($event))"
            >
              <SelectTrigger class="h-9">
                <SelectValue placeholder="Selecione um agente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="agent in activeAgents"
                  :key="agent.id"
                  :value="agent.id"
                >
                  {{ agent.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-if="!agentsLoading && !activeAgents.length" class="text-xs text-muted-foreground">
              Nenhum agente ativo. Crie um em WhatsApp → Agentes IA.
            </p>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div>
              <Label class="text-sm font-normal">Ativar nesta conversa</Label>
              <p class="text-xs text-muted-foreground">
                {{ selectedAgentId ? 'Responde automaticamente às mensagens recebidas.' : 'Selecione um agente acima.' }}
              </p>
            </div>
            <Switch
              :checked="agentEnabled"
              :disabled="savingAgent || agentsLoading || (!agentEnabled && !canEnableAgent)"
              @update:checked="handleAgentToggle"
            />
          </div>
        </div>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" @click="showAgentMenu = false">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
