<script setup lang="ts">
import type { CrmCompanyLookupResult, CrmLeadLookupResult } from '~/types/crm'
import { Icon } from '#components'
import { useSupabaseClient } from '#imports'
import { computed, ref, watch } from 'vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import CompanyAddressFields from '~/components/crm/company/CompanyAddressFields.vue'
import CompanyNameAutofillInput from '~/components/crm/leads/CompanyNameAutofillInput.vue'
import LeadFunnelStageFields from '~/components/crm/leads/LeadFunnelStageFields.vue'
// Removendo import de tabs temporariamente
// import {
//   Tabs,
//   TabsContent,
//   TabsList,
//   TabsTrigger,
// } from '@/components/ui/tabs'
import LeadNameAutofillInput from '~/components/crm/leads/LeadNameAutofillInput.vue'
import LeadValuesFields from '~/components/crm/leads/LeadValuesFields.vue'
import TeamMemberSelect from '~/components/crm/team/TeamMemberSelect.vue'
import Button from '~/components/ui/button/Button.vue'
import Input from '~/components/ui/input/Input.vue'
import Label from '~/components/ui/label/Label.vue'
import Textarea from '~/components/ui/textarea/Textarea.vue'
import {
  applyCompanyAutofill,
  applyCrmLeadAutofill,
} from '~/composables/crm/useCrmLeadAutofill'
import {
  BR_PHONE_MASKS,
  formatLeadValueInput,
  normalizeLeadValues,
  parseLeadValueInput,
  parseLeadValuesInputs,
} from '~/composables/crm/useCrmLeadValue'
import { useCrmLeadWhatsapp } from '~/composables/crm/useCrmLeadWhatsapp'
import { useTenant } from '~/composables/useTenant'
import { toast } from 'vue-sonner'

// Props
interface Props {
  lead: any
}

const props = defineProps<Props>()

// Define emits
const emit = defineEmits<{
  'lead-updated': [lead: any]
  'cancel': []
}>()

const { tenantId } = useTenant()
const supabase = useSupabaseClient()

// Estados de loading
const loading = ref(false)
const isLoadingData = ref(true)

// Estado da tab ativa
const activeTab = ref<'lead' | 'contact' | 'company' | 'meeting'>('lead')

// Fetch lead sources and sales stages
const { data: leadSources, pending: leadSourcesPending } = await useLazyFetch<any[]>('/api/crm/lead_source', {
  query: computed(() => ({ tenant_id: tenantId.value })),
  watch: [tenantId],
  default: () => [],
  server: false,
})

// Computed para estado geral de loading
const isLoadingAnyData = computed(() => leadSourcesPending.value)

// Watch para gerenciar estado de loading geral
watch(leadSourcesPending, () => {
  isLoadingData.value = isLoadingAnyData.value
}, { immediate: true })

// Opções de prioridade
const priorityOptions = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
]

// Opções de status
const statusOptions = [
  { value: 'new', label: 'Novo' },
  { value: 'contacted', label: 'Contatado' },
  { value: 'qualified', label: 'Qualificado' },
  { value: 'proposal', label: 'Proposta' },
  { value: 'negotiation', label: 'Negociação' },
  { value: 'won', label: 'Ganho' },
  { value: 'lost', label: 'Perdido' },
]

const meetingTypeOptions = [
  { value: 'call', label: 'Ligação' },
  { value: 'video', label: 'Vídeo' },
  { value: 'in-person', label: 'Presencial' },
  { value: 'demo', label: 'Demonstração' },
]

// Form data - pré-preenchido com dados do lead
const leadForm = ref({
  name: '',
  source: '',
  funnel_id: '' as string | null,
  sales_stage_id: '' as string | null,
  status: 'new',
  priority: 'medium',
  valuesInputs: [''] as string[],
  closedValue: '',
  notes: '',
  assigned_to: null as string | null,
})

// Contact form data (support multiple contacts per lead)
interface LeadContactDraft {
  key: string
  id: string | null
  name: string
  email: string
  phone: string
  position: string
  notes: string
}

function createEmptyContact(): LeadContactDraft {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    id: null,
    name: '',
    email: '',
    phone: '',
    position: '',
    notes: '',
  }
}

const contacts = ref<LeadContactDraft[]>([createEmptyContact()])
const removedContactIds = ref<string[]>([])
const companyId = ref<string | null>(null)
const whatsappConversationId = ref<string | null>(null)
const whatsappConversationStatus = ref<string | null>(null)

const companyForm = ref({
  name: '',
  website: '',
  address: '',
  address_number: '',
  address_complement: '',
  cep: '',
  city: '',
  country: '',
  notes: '',
})

const primaryContact = computed(() => contacts.value[0] || createEmptyContact())

const {
  isSyncingWhatsapp,
  canOpenWhatsappConversation,
  canSyncWhatsapp,
  openWhatsappForLead,
  syncWhatsappForLead,
} = useCrmLeadWhatsapp({
  onLeadUpdated: (_leadId, patch) => {
    whatsappConversationId.value = patch.whatsapp_conversation_id
    whatsappConversationStatus.value = patch.whatsapp_conversation_status
  },
})

const leadWhatsappState = computed(() => ({
  id: props.lead?.id as string,
  phone: primaryContact.value.phone || props.lead?.phone || null,
  whatsapp_conversation_id: whatsappConversationId.value,
  whatsapp_conversation_status: whatsappConversationStatus.value,
}))

function emptyCompanyForm() {
  return {
    name: '',
    website: '',
    address: '',
    address_number: '',
    address_complement: '',
    cep: '',
    city: '',
    country: '',
    notes: '',
  }
}

async function loadLeadContacts(leadId: string) {
  if (!tenantId.value)
    return

  const { data, error } = await supabase
    .from('crm_contact')
    .select('id, name, email, phone, position, notes, company_id, company:crm_company(id, name, website, address, address_number, address_complement, cep, city, country, notes)')
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId.value)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('Falha ao carregar contatos do lead:', error)
  }

  removedContactIds.value = []

  if (data?.length) {
    contacts.value = data.map(row => ({
      key: String(row.id),
      id: row.id,
      name: row.name || '',
      email: row.email || '',
      phone: row.phone || '',
      position: row.position || '',
      notes: row.notes || '',
    }))

    const withCompany = data.find(row => row.company_id || row.company)
    const company = withCompany
      ? (Array.isArray(withCompany.company) ? withCompany.company[0] : withCompany.company)
      : null

    companyId.value = company?.id || withCompany?.company_id || null
    companyForm.value = company
      ? {
          name: company.name || '',
          website: company.website || '',
          address: company.address || '',
          address_number: company.address_number || '',
          address_complement: company.address_complement || '',
          cep: company.cep || '',
          city: company.city || '',
          country: company.country || '',
          notes: company.notes || '',
        }
      : emptyCompanyForm()
    return
  }

  companyId.value = null
  contacts.value = [{
    ...createEmptyContact(),
    name: props.lead?.contact_name || '',
    email: props.lead?.email || '',
    phone: props.lead?.phone || '',
    position: props.lead?.contact_position || '',
  }]
  companyForm.value = emptyCompanyForm()
}

function addContact() {
  contacts.value = [...contacts.value, createEmptyContact()]
}

function removeContact(index: number) {
  const target = contacts.value[index]
  if (!target)
    return

  if (target.id)
    removedContactIds.value = [...removedContactIds.value, target.id]

  if (contacts.value.length <= 1) {
    contacts.value = [createEmptyContact()]
    return
  }

  contacts.value = contacts.value.filter((_, i) => i !== index)
}

function startNewCompany() {
  companyId.value = null
  companyForm.value = emptyCompanyForm()
}

function handleCompanyAutofill(match: CrmCompanyLookupResult) {
  applyCompanyAutofill(match, companyForm, {
    onCompanyId: (id) => { companyId.value = id },
  })
}

function handleLeadAutofill(match: CrmLeadLookupResult, scope: 'lead' | 'contact' = 'lead') {
  const contactTarget = { value: { ...primaryContact.value } }
  applyCrmLeadAutofill(match, {
    leadForm,
    contactForm: contactTarget,
    companyForm,
  }, {
    leadSources: leadSources.value || [],
    fillLeadFields: scope === 'lead',
    onCompanyId: (id) => { companyId.value = id },
  })

  contacts.value = [
    {
      ...primaryContact.value,
      ...contactTarget.value,
      key: primaryContact.value.key,
      id: primaryContact.value.id,
    },
    ...contacts.value.slice(1),
  ]
}

function handleContactAutofill(index: number, match: CrmLeadLookupResult) {
  const current = contacts.value[index]
  if (!current)
    return

  contacts.value[index] = {
    ...current,
    name: match.contact_name || match.name || '',
    email: match.email || '',
    phone: match.phone || '',
    position: match.position || '',
    notes: match.contact_notes || '',
  }

  if (match.company_id || match.company_name) {
    companyId.value = match.company_id
    companyForm.value = {
      name: match.company_name || '',
      website: match.company_website || '',
      address: match.company_address || '',
      address_number: '',
      address_complement: '',
      cep: match.company_cep || '',
      city: match.company_city || '',
      country: match.company_country || '',
      notes: match.company_notes || '',
    }
  }
}

// Meeting form data
const meetingForm = ref({
  date: '',
  time: '',
  type: '',
  duration: '',
  agenda: '',
})

function resolveValuesInputs(lead: any): string[] {
  const fromArray = normalizeLeadValues(lead?.values)
  if (fromArray.length)
    return fromArray.map(formatLeadValueInput)
  if (lead?.value)
    return [formatLeadValueInput(lead.value)]
  return ['']
}

function buildLeadValuePayload() {
  const proposalValues = parseLeadValuesInputs(leadForm.value.valuesInputs)
  const closed = parseLeadValueInput(leadForm.value.closedValue)
  return {
    values: proposalValues,
    value: closed > 0
      ? closed
      : (proposalValues.length ? Math.max(...proposalValues) : (Number(props.lead?.value) || 0)),
  }
}

// Watch para pré-preencher todos os formulários quando os dados carregarem
watch([() => props.lead, leadSources], () => {
  if (props.lead) {
    // Pré-preencher lead form
    leadForm.value = {
      name: props.lead.name || '',
      source: findLeadSourceId(props.lead.source_id || props.lead.source) || '',
      funnel_id: props.lead.funnel_id || null,
      sales_stage_id: props.lead.sales_stage_id || '',
      status: props.lead.status || 'new',
      priority: props.lead.priority || 'medium',
      valuesInputs: resolveValuesInputs(props.lead),
      closedValue: props.lead.value ? formatLeadValueInput(props.lead.value) : '',
      notes: props.lead.notes || '',
      assigned_to: props.lead.assigned_to || props.lead.assignedTo || null,
    }

    whatsappConversationId.value = props.lead.whatsapp_conversation_id ?? null
    whatsappConversationStatus.value = props.lead.whatsapp_conversation_status ?? null

    loadLeadContacts(props.lead.id)

    meetingForm.value = {
      date: '',
      time: '',
      type: '',
      duration: '',
      agenda: '',
    }
  }
}, { immediate: true })

// Função para encontrar o ID do lead source baseado no valor enum
function findLeadSourceId(sourceEnum: string): string {
  if (!sourceEnum || !leadSources.value)
    return ''

  const exactId = leadSources.value.find(s => s.id === sourceEnum)
  if (exactId)
    return exactId.id

  const exactName = leadSources.value.find(s => s.name.toLowerCase() === sourceEnum.toLowerCase())
  if (exactName)
    return exactName.id

  const source = leadSources.value.find((s) => {
    const sourceName = s.name.toLowerCase()
    const enumValue = sourceEnum.toLowerCase()

    if (enumValue === 'website' && (sourceName.includes('website') || sourceName.includes('web')))
      return true
    if (enumValue === 'referral' && (sourceName.includes('referral') || sourceName.includes('indica')))
      return true
    if (enumValue === 'social' && (sourceName.includes('social') || sourceName.includes('redes')))
      return true
    if (enumValue === 'email' && (sourceName.includes('email') || sourceName.includes('e-mail')))
      return true
    if (enumValue === 'phone' && (sourceName.includes('phone') || sourceName.includes('telefone') || sourceName.includes('whatsapp') || sourceName.includes('whats')))
      return true
    if (enumValue === 'other' && (sourceName.includes('other') || sourceName.includes('outro')))
      return true

    return false
  })

  return source?.id || ''
}

// Função para converter lead source ID para enum value
function getSourceEnumValue(sourceId: string | null): 'website' | 'referral' | 'social' | 'email' | 'phone' | 'other' {
  if (!sourceId || !leadSources.value) {
    return 'other'
  }

  const source = leadSources.value.find(s => s.id === sourceId)
  if (!source) {
    return 'other'
  }

  const sourceName = source.name.toLowerCase()
  if (sourceName.includes('website') || sourceName.includes('web'))
    return 'website'
  if (sourceName.includes('referral') || sourceName.includes('indica'))
    return 'referral'
  if (sourceName.includes('social') || sourceName.includes('redes'))
    return 'social'
  if (sourceName.includes('email') || sourceName.includes('e-mail'))
    return 'email'
  if (sourceName.includes('phone') || sourceName.includes('telefone') || sourceName.includes('whatsapp') || sourceName.includes('whats'))
    return 'phone'

  return 'other'
}

// Função para validar formulário
function validateForm() {
  return !!leadForm.value.name && !!leadForm.value.funnel_id && !!leadForm.value.sales_stage_id
}

// Função para atualizar lead e entidades relacionadas
async function updateLead() {
  if (!tenantId.value || !props.lead?.id) {
    return
  }

  loading.value = true
  try {
    // Validar campos obrigatórios
    if (!leadForm.value.name) {
      throw new Error('Preencha todos os campos obrigatórios')
    }

    // 1. Atualizar Lead
    const valuePayload = buildLeadValuePayload()
    const leadUpdateData = {
      id: props.lead.id,
      name: leadForm.value.name,
      source: getSourceEnumValue(leadForm.value.source),
      source_id: leadForm.value.source || null,
      funnel_id: leadForm.value.funnel_id || null,
      sales_stage_id: leadForm.value.sales_stage_id || null,
      status: leadForm.value.status,
      priority: leadForm.value.priority,
      value: valuePayload.value,
      values: valuePayload.values,
      notes: leadForm.value.notes || null,
      assigned_to: leadForm.value.assigned_to,
      tenant_id: tenantId.value,
    }

    if (!leadUpdateData.funnel_id) {
      throw new Error('Selecione um funil')
    }
    if (!leadUpdateData.sales_stage_id) {
      throw new Error('Selecione um estágio de vendas')
    }

    const leadResponse = await $fetch('/api/crm/lead', {
      method: 'PUT',
      body: leadUpdateData,
    })

    // A API retorna { statusCode: 200, body: data }
    const updatedLead = leadResponse.body || leadResponse

    // 2. Criar/Atualizar Company (se preenchido) — before contacts so we can link company_id
    if (companyForm.value.name) {
      const companyData = {
        name: companyForm.value.name,
        website: companyForm.value.website || null,
        address: companyForm.value.address || null,
        address_number: companyForm.value.address_number || null,
        address_complement: companyForm.value.address_complement || null,
        cep: companyForm.value.cep || null,
        city: companyForm.value.city || null,
        country: companyForm.value.country || null,
        notes: companyForm.value.notes || null,
        tenant_id: tenantId.value,
      }

      try {
        if (companyId.value) {
          await $fetch(`/api/crm/company/${companyId.value}`, {
            method: 'PUT',
            body: companyData,
          })
        }
        else {
          const companyResponse = await $fetch<{ data: { id: string } }>('/api/crm/company', {
            method: 'POST',
            body: companyData,
          })
          companyId.value = companyResponse.data?.id ?? null
        }
      }
      catch (companyErr: any) {
        throw new Error(
          companyErr?.data?.statusMessage
          || companyErr?.message
          || 'Falha ao salvar a empresa',
        )
      }
    }

    // 3. Remover contatos excluídos
    for (const removedId of removedContactIds.value) {
      try {
        await $fetch(`/api/crm/contacts/${removedId}`, {
          method: 'DELETE',
          query: { tenant_id: tenantId.value },
        })
      }
      catch (deleteErr) {
        console.warn('Falha ao remover contato:', deleteErr)
      }
    }
    removedContactIds.value = []

    // 4. Criar/Atualizar contatos vinculados ao lead
    for (const contact of contacts.value) {
      const hasAnyField = contact.name.trim() || contact.email.trim() || contact.phone.trim() || contact.position.trim() || contact.notes.trim()
      if (!hasAnyField)
        continue

      if (!contact.name.trim() || !contact.email.trim()) {
        throw new Error('Cada contato preenchido precisa de nome e e-mail')
      }

      const contactData = {
        name: contact.name,
        email: contact.email,
        phone: contact.phone || '',
        position: contact.position,
        notes: contact.notes,
        tenant_id: tenantId.value,
        lead_id: props.lead.id,
        company_id: companyId.value,
      }

      try {
        if (contact.id) {
          await $fetch(`/api/crm/contacts/${contact.id}`, {
            method: 'PUT',
            body: contactData,
          })
        }
        else {
          const contactResponse = await $fetch<{ data: { id: string } }>('/api/crm/contacts', {
            method: 'POST',
            body: contactData,
          })
          contact.id = contactResponse.data?.id ?? null
          contact.key = contact.id || contact.key
        }
      }
      catch (contactErr) {
        console.warn('Falha ao criar/atualizar contato:', contactErr)
      }
    }

    // 5. Criar/Atualizar Meeting (se preenchido)
    if (meetingForm.value.date && meetingForm.value.time) {
      const meetingData = {
        date: meetingForm.value.date,
        time: meetingForm.value.time,
        type: meetingForm.value.type,
        duration: meetingForm.value.duration ? Number(meetingForm.value.duration) : null,
        agenda: meetingForm.value.agenda,
        tenant_id: tenantId.value,
      }

      try {
        await $fetch('/api/crm/meetings', {
          method: 'POST',
          body: meetingData,
        })
      }
      catch (meetingErr) {
        console.warn('Falha ao criar/atualizar reunião:', meetingErr)
      }
    }

    // Emitir evento para o componente pai
    toast.success('Lead atualizado com sucesso!')
    emit('lead-updated', updatedLead)
  }
  catch (err: any) {
    console.error('Erro ao atualizar lead:', err)
    toast.error(
      err?.data?.statusMessage
      || err?.statusMessage
      || err?.message
      || 'Falha ao atualizar lead',
    )
  }
  finally {
    loading.value = false
  }
}

// Função para cancelar edição
function cancel() {
  emit('cancel')
}
</script>

<template>
  <div>
    <!-- Loading State -->
    <div v-if="isLoadingData" class="space-y-6">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div v-for="i in 6" :key="i" class="space-y-2">
          <div class="h-4 w-24 animate-pulse rounded bg-muted" />
          <div class="h-10 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div class="space-y-2">
        <div class="h-4 w-16 animate-pulse rounded bg-muted" />
        <div class="h-20 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>

    <!-- Edit Form with Custom Tabs -->
    <div v-else class="space-y-6">
      <!-- Custom Tab Navigation -->
      <div class="flex border-b border-border">
        <button
          v-for="tab in ['lead', 'contact', 'company', 'meeting']"
          :key="tab"
          class="border-b-2 px-4 py-2 text-sm font-medium transition-colors" :class="[
            activeTab === tab
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground',
          ]"
          @click="activeTab = tab as any"
        >
          {{ ({ lead: 'Lead', contact: 'Contatos', company: 'Empresa', meeting: 'Reunião' } as Record<string, string>)[tab] }}
        </button>
      </div>

      <!-- Lead Tab -->
      <div v-if="activeTab === 'lead'" class="space-y-6">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <Label for="lead-name">Nome do lead <span class="text-destructive">*</span></Label>
            <LeadNameAutofillInput
              v-model="leadForm.name"
              input-id="lead-name"
              placeholder="Nome do lead"
              :exclude-lead-id="props.lead?.id"
              required
              @autofill="handleLeadAutofill"
            />
          </div>

          <div class="space-y-2">
            <Label for="lead-priority">Prioridade</Label>
            <Select v-model="leadForm.priority">
              <SelectTrigger id="lead-priority">
                <SelectValue placeholder="Selecione a prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="priority in priorityOptions" :key="priority.value" :value="priority.value">
                  {{ priority.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label for="lead-source">Origem</Label>
            <Select v-model="leadForm.source">
              <SelectTrigger id="lead-source">
                <SelectValue placeholder="Selecione a origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="source in leadSources" :key="source.id" :value="source.id">
                  {{ source.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label for="lead-status">Status</Label>
            <Select v-model="leadForm.status">
              <SelectTrigger id="lead-status">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="status in statusOptions" :key="status.value" :value="status.value">
                  {{ status.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <LeadFunnelStageFields
            v-model:funnel-id="leadForm.funnel_id"
            v-model:sales-stage-id="leadForm.sales_stage_id"
            required
            id-prefix="edit-lead"
          />

          <div class="space-y-2">
            <Label for="lead-assigned">Responsável</Label>
            <TeamMemberSelect
              id="lead-assigned"
              v-model="leadForm.assigned_to"
              include-unassigned
              placeholder="Selecionar responsável"
            />
          </div>

          <div class="md:col-span-2">
            <LeadValuesFields
              v-model="leadForm.valuesInputs"
              v-model:closed-value="leadForm.closedValue"
              show-closed-value
              id-prefix="edit-lead-value"
            />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="lead-notes">Observações</Label>
          <Textarea id="lead-notes" v-model="leadForm.notes" placeholder="Observações sobre o lead" rows="3" />
        </div>
      </div>

      <!-- Contact Tab -->
      <div v-if="activeTab === 'contact'" class="space-y-6">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-medium">
              Contatos do lead
            </h3>
            <p class="text-xs text-muted-foreground">
              Adicione um ou mais contatos vinculados a este lead.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" class="h-8 shrink-0" @click="addContact">
            <Icon name="lucide:plus" class="mr-1 h-4 w-4" />
            Adicionar contato
          </Button>
        </div>

        <div
          v-for="(contact, index) in contacts"
          :key="contact.key"
          class="border border-border rounded-lg p-4 space-y-4"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-medium">
              Contato {{ index + 1 }}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-8 text-muted-foreground hover:text-destructive"
              @click="removeContact(index)"
            >
              <Icon name="lucide:trash-2" class="mr-1 h-4 w-4" />
              Remover
            </Button>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <Label :for="`contact-name-${index}`">Nome do contato</Label>
              <LeadNameAutofillInput
                v-model="contact.name"
                :input-id="`contact-name-${index}`"
                placeholder="Nome do contato"
                search-field="contact"
                :exclude-lead-id="props.lead?.id"
                @autofill="(match) => handleContactAutofill(index, match)"
              />
            </div>

            <div class="space-y-2">
              <Label :for="`contact-email-${index}`">E-mail</Label>
              <Input
                :id="`contact-email-${index}`"
                v-model="contact.email"
                placeholder="email@exemplo.com"
                type="email"
              />
            </div>

            <div class="space-y-2">
              <Label :for="`contact-phone-${index}`">Telefone</Label>
              <Input
                :id="`contact-phone-${index}`"
                v-model="contact.phone"
                v-maska="{ mask: [...BR_PHONE_MASKS] }"
                placeholder="(00) 00000-0000"
              />
            </div>

            <div class="space-y-2">
              <Label :for="`contact-position-${index}`">Cargo</Label>
              <Input
                :id="`contact-position-${index}`"
                v-model="contact.position"
                placeholder="Cargo do contato"
              />
            </div>
          </div>

          <div class="space-y-2">
            <Label :for="`contact-notes-${index}`">Observações</Label>
            <Textarea
              :id="`contact-notes-${index}`"
              v-model="contact.notes"
              placeholder="Observações sobre o contato"
              rows="3"
            />
          </div>
        </div>
      </div>

      <!-- Company Tab -->
      <div v-if="activeTab === 'company'" class="space-y-6">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-medium">
              Empresa
            </h3>
            <p class="text-xs text-muted-foreground">
              Busque uma empresa cadastrada pelo nome ou crie uma nova.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" class="h-8 shrink-0" @click="startNewCompany">
            <Icon name="lucide:plus" class="mr-1 h-4 w-4" />
            Nova empresa
          </Button>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="md:col-span-2 space-y-2">
            <Label for="company-name">Nome da empresa</Label>
            <CompanyNameAutofillInput
              v-model="companyForm.name"
              input-id="company-name"
              placeholder="Digite para buscar empresas do tenant"
              :exclude-id="null"
              @autofill="handleCompanyAutofill"
            />
          </div>

          <div class="md:col-span-2 space-y-2">
            <Label for="company-website">Site</Label>
            <Input id="company-website" v-model="companyForm.website" placeholder="https://exemplo.com" />
          </div>

          <div class="md:col-span-2">
            <CompanyAddressFields
              :model-value="{
                cep: companyForm.cep || '',
                address: companyForm.address || '',
                address_number: companyForm.address_number || '',
                address_complement: companyForm.address_complement || '',
                city: companyForm.city || '',
                country: companyForm.country || '',
              }"
              @update:model-value="(value) => {
                companyForm.cep = value.cep
                companyForm.address = value.address
                companyForm.address_number = value.address_number
                companyForm.address_complement = value.address_complement
                companyForm.city = value.city
                companyForm.country = value.country
              }"
            />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="company-notes">Observações</Label>
          <Textarea id="company-notes" v-model="companyForm.notes" placeholder="Observações sobre a empresa" rows="3" />
        </div>
      </div>

      <!-- Meeting Tab -->
      <div v-if="activeTab === 'meeting'" class="space-y-6">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <Label for="meeting-date">Data</Label>
            <Input id="meeting-date" v-model="meetingForm.date" type="date" />
          </div>

          <div class="space-y-2">
            <Label for="meeting-time">Horário</Label>
            <Input id="meeting-time" v-model="meetingForm.time" type="time" />
          </div>

          <div class="space-y-2">
            <Label for="meeting-type">Tipo de reunião</Label>
            <Select v-model="meetingForm.type">
              <SelectTrigger id="meeting-type">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="type in meetingTypeOptions" :key="type.value" :value="type.value">
                  {{ type.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label for="meeting-duration">Duração (minutos)</Label>
            <Input id="meeting-duration" v-model="meetingForm.duration" type="number" placeholder="30" />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="meeting-agenda">Pauta</Label>
          <Textarea id="meeting-agenda" v-model="meetingForm.agenda" placeholder="Descreva a pauta da reunião" rows="3" />
        </div>
      </div>

      <!-- Action Buttons -->
      <div
        class="flex flex-wrap items-center gap-2 pt-4"
        :class="canOpenWhatsappConversation(leadWhatsappState, primaryContact.phone) || canSyncWhatsapp(leadWhatsappState, primaryContact.phone) ? 'justify-between' : 'justify-end'"
      >
        <div class="flex gap-2">
          <Button
            v-if="canOpenWhatsappConversation(leadWhatsappState, primaryContact.phone)"
            variant="outline"
            size="sm"
            class="gap-2"
            @click="openWhatsappForLead(leadWhatsappState, primaryContact.phone)"
          >
            <Icon name="lucide:message-circle" class="h-4 w-4" />
            Abrir conversa
          </Button>
          <Button
            v-else-if="canSyncWhatsapp(leadWhatsappState, primaryContact.phone)"
            variant="outline"
            size="sm"
            class="gap-2"
            :disabled="isSyncingWhatsapp"
            @click="syncWhatsappForLead(leadWhatsappState, primaryContact.phone)"
          >
            <Icon name="lucide:refresh-cw" class="h-4 w-4" :class="{ 'animate-spin': isSyncingWhatsapp }" />
            Sincronizar no WhatsApp
          </Button>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" @click="cancel">
            Cancelar
          </Button>
          <Button :loading="loading" :disabled="!validateForm()" @click="updateLead">
            Atualizar lead
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
