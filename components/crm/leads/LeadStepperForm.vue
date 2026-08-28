<script setup lang="ts">
import type { CrmCompanyLookupResult, CrmLeadLookupResult } from '~/types/crm'
import { useSupabaseClient } from '#imports'
import { Check, Circle, Dot } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Stepper, StepperDescription, StepperItem, StepperSeparator, StepperTitle, StepperTrigger } from '@/components/ui/stepper'
import CompanyAddressFields from '~/components/crm/company/CompanyAddressFields.vue'
import CompanyNameAutofillInput from '~/components/crm/leads/CompanyNameAutofillInput.vue'
import LeadFunnelStageFields from '~/components/crm/leads/LeadFunnelStageFields.vue'
import LeadNameAutofillInput from '~/components/crm/leads/LeadNameAutofillInput.vue'
import LeadValuesFields from '~/components/crm/leads/LeadValuesFields.vue'
import Button from '~/components/ui/button/Button.vue'
import { toast } from 'vue-sonner'
import {
  firstStageIdForFunnel,
  resolveLeadStatusOnStageMove,
} from '~/utils/crm/sales-stage'
import Card from '~/components/ui/card/Card.vue'
import CardContent from '~/components/ui/card/CardContent.vue'
import CardHeader from '~/components/ui/card/CardHeader.vue'
import CardTitle from '~/components/ui/card/CardTitle.vue'
import Input from '~/components/ui/input/Input.vue'
import Label from '~/components/ui/label/Label.vue'
import Textarea from '~/components/ui/textarea/Textarea.vue'
import {
  applyCompanyAutofill,
  applyCrmLeadAutofill,
} from '~/composables/crm/useCrmLeadAutofill'
import {
  BR_PHONE_MASKS,
  parseLeadValueInput,
  parseLeadValuesInputs,
} from '~/composables/crm/useCrmLeadValue'
import { useTenant } from '~/composables/useTenant'

const props = withDefaults(
  defineProps<{
    defaultFunnelId?: string | null
    /** @deprecated use defaultFunnelId */
    defaultPipelineId?: string | null
    defaultSalesStageId?: string | null
  }>(),
  { defaultFunnelId: null, defaultPipelineId: null, defaultSalesStageId: null },
)

// Define emits
const emit = defineEmits<{
  'lead-created': [lead: any]
}>()

const { tenantId } = useTenant()
const supabase = useSupabaseClient()

// Estados de loading
const isLoadingData = ref(true)
const dataError = ref<string | null>(null)

// Fetch lead sources and sales stages baseado no tenant com lazy loading
const { data: leadSources, pending: leadSourcesPending, error: leadSourcesError } = await useLazyFetch<any[]>('/api/crm/lead_source', {
  query: computed(() => ({ tenant_id: tenantId.value })),
  watch: [tenantId],
  default: () => [],
  server: false,
})

const { data: salesStages, pending: salesStagesPending, error: salesStagesError } = await useLazyFetch<any[]>('/api/crm/sales_stage', {
  query: computed(() => ({
    tenant_id: tenantId.value,
    active_only: 'true', // Filtrar apenas estágios de pipelines ativos
  })),
  watch: [tenantId],
  default: () => [],
  server: false,
})

// Buscar pipeline ativo para usar como default
const { data: activePipelines, pending: pipelinesPending, error: pipelinesError } = await useLazyFetch<any[]>('/api/crm/funnel', {
  query: computed(() => ({ tenant_id: tenantId.value })),
  watch: [tenantId],
  default: () => [],
  server: false,
})

// Computed para estado geral de loading
const isLoadingAnyData = computed(() =>
  leadSourcesPending.value || salesStagesPending.value || pipelinesPending.value,
)

// Computed para verificar se há algum erro
const hasDataError = computed(() =>
  leadSourcesError.value || salesStagesError.value || pipelinesError.value,
)

// Watch para gerenciar estado de loading geral
watch([leadSourcesPending, salesStagesPending, pipelinesPending], () => {
  isLoadingData.value = isLoadingAnyData.value

  if (hasDataError.value) {
    dataError.value = 'Erro ao carregar dados. Tente novamente.'
  }
  else {
    dataError.value = null
  }
}, { immediate: true })

// Opções de prioridade para leads
const priorityOptions = [
  { value: 'low', label: 'Baixa', color: 'bg-gray-100 text-gray-800' },
  { value: 'medium', label: 'Média', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'high', label: 'Alta', color: 'bg-red-100 text-red-800' },
]

const steps = [
  {
    step: 1,
    title: 'Lead',
    description: 'Informações do lead (obrigatório)',
    required: true,
  },
  {
    step: 2,
    title: 'Contato',
    description: 'Detalhes do contato (obrigatório)',
    required: true,
  },
  {
    step: 3,
    title: 'Empresa',
    description: 'Informações da empresa (opcional)',
    required: false,
  },
  {
    step: 4,
    title: 'Reunião',
    description: 'Detalhes da reunião (opcional)',
    required: false,
  },
]

const step = ref(0)
const totalSteps = steps.length

// Estados reativos para cada etapa
const leadForm = ref({
  name: '',
  source: '',
  priority: 'medium', // Valor padrão
  valuesInputs: [''] as string[],
  closedValue: '',
  notes: '',
})
const selectedFunnelId = ref<string | null>(null)
const selectedSalesStageId = ref<string | null>(null)
const contactForm = ref({
  name: '',
  email: '',
  phone: '',
  position: '',
  notes: '',
})
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
const companyId = ref<string | null>(null)
const meetingForm = ref({
  date: '',
  time: '',
  type: '',
  duration: '',
  agenda: '',
})

const loading = ref(false)

function handleLeadAutofill(match: CrmLeadLookupResult, scope: 'lead' | 'contact' = 'lead') {
  applyCrmLeadAutofill(match, { leadForm, contactForm, companyForm }, {
    leadSources: leadSources.value || [],
    fillLeadFields: scope === 'lead',
    onCompanyId: (id) => { companyId.value = id },
  })
}

function handleCompanyAutofill(match: CrmCompanyLookupResult) {
  applyCompanyAutofill(match, companyForm, {
    onCompanyId: (id) => { companyId.value = id },
  })
}

function startNewCompany() {
  companyId.value = null
  companyForm.value = {
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

// Função para recarregar dados
function refreshData() {
  dataError.value = null
  // Simplesmente recarrega a página de forma suave para refetch
  window.location.reload()
}

function nextStep() {
  if (step.value < totalSteps - 1) {
    step.value++
  }
}
function prevStep() {
  if (step.value > 0) {
    step.value--
  }
}

function validateStep() {
  if (step.value === 0) {
    return !!leadForm.value.name && !!selectedFunnelId.value && !!selectedSalesStageId.value
  }

  if (step.value === 1) {
    return !!contactForm.value.name && !!contactForm.value.email
  }

  return true
}

// Mapeamento para converter lead source ID para enum value
function getSourceEnumValue(sourceId: string | null): 'website' | 'referral' | 'social' | 'email' | 'phone' | 'other' {
  if (!sourceId || !leadSources.value) {
    return 'other'
  }

  const source = leadSources.value.find(s => s.id === sourceId)
  if (!source) {
    return 'other'
  }

  // Mapear nome do source da tabela para valor do enum da crm_lead.source
  const sourceName = source.name.toLowerCase()
  if (sourceName.includes('website') || sourceName.includes('web')) {
    return 'website'
  }
  if (sourceName.includes('referral') || sourceName.includes('indica')) {
    return 'referral'
  }
  if (sourceName.includes('social') || sourceName.includes('redes')) {
    return 'social'
  }
  if (sourceName.includes('email') || sourceName.includes('e-mail')) {
    return 'email'
  }
  if (sourceName.includes('phone') || sourceName.includes('telefone') || sourceName.includes('whatsapp') || sourceName.includes('whats')) {
    return 'phone'
  }

  return 'other'
}

function resolveDefaultFunnelId(): string | null {
  if (props.defaultFunnelId || props.defaultPipelineId)
    return props.defaultFunnelId || props.defaultPipelineId || null
  if (!activePipelines.value || activePipelines.value.length === 0)
    return null
  const activeFunnel = activePipelines.value.find(p => p.is_active === true)
  return activeFunnel?.id ?? activePipelines.value[0]?.id ?? null
}

function applyFunnelStageDefaults() {
  const funnelId = resolveDefaultFunnelId()
  selectedFunnelId.value = funnelId

  if (props.defaultSalesStageId) {
    const stageBelongsToFunnel = (salesStages.value || []).some(
      (stage: { id: string, funnel_id?: string }) =>
        stage.id === props.defaultSalesStageId && (!funnelId || stage.funnel_id === funnelId),
    )
    if (stageBelongsToFunnel) {
      selectedSalesStageId.value = props.defaultSalesStageId
      return
    }
  }

  selectedSalesStageId.value = firstStageIdForFunnel(salesStages.value || [], funnelId)
}

watch(
  [() => props.defaultFunnelId, () => props.defaultPipelineId, () => props.defaultSalesStageId, activePipelines, salesStages],
  () => {
    if (!selectedFunnelId.value || props.defaultFunnelId || props.defaultPipelineId || props.defaultSalesStageId)
      applyFunnelStageDefaults()
  },
  { immediate: true },
)

async function submitLead() {
  if (!tenantId.value) {
    console.error('Tenant not found')
    toast.error('Tenant não identificado.')
    return
  }

  loading.value = true
  try {
    // Validar campos obrigatórios
    if (!leadForm.value.name || !contactForm.value.name || !contactForm.value.email) {
      throw new Error('Preencha todos os campos obrigatórios')
    }

    const funnelId = selectedFunnelId.value || resolveDefaultFunnelId()
    const salesStageId = selectedSalesStageId.value
      ?? firstStageIdForFunnel(salesStages.value || [], funnelId)

    if (!funnelId) {
      throw new Error('Selecione um funil')
    }
    if (!salesStageId) {
      throw new Error('Selecione um estágio de vendas')
    }

    const stage = (salesStages.value || []).find((s: { id: string }) => s.id === salesStageId)
    const stageStatus = resolveLeadStatusOnStageMove(stage?.name || '', 'new')

    const proposalValues = parseLeadValuesInputs(leadForm.value.valuesInputs)
    const closedAmount = parseLeadValueInput(leadForm.value.closedValue)
    const scalarValue = closedAmount > 0
      ? closedAmount
      : (proposalValues.length ? Math.max(...proposalValues) : 0)

    // 1. Cria o Lead (funnel + estágio escolhidos no formulário)
    const leadData = {
      name: leadForm.value.name,
      source: getSourceEnumValue(leadForm.value.source),
      source_id: leadForm.value.source || null,
      sales_stage_id: salesStageId,
      funnel_id: funnelId,
      status: stageStatus.status as any,
      closed_at: stageStatus.closed_at,
      priority: (leadForm.value.priority as any) || 'medium',
      value: scalarValue,
      values: proposalValues,
      notes: leadForm.value.notes || null,
      tenant_id: tenantId.value,
      tags: [] as string[],
    }

    const { data: lead, error: leadError } = await supabase
      .from('crm_lead')
      .insert([leadData])
      .select()
      .single()

    if (leadError) {
      console.error('Erro ao criar lead:', leadError)
      throw new Error(`Falha ao criar lead: ${leadError.message}`)
    }

    if (!lead) {
      throw new Error('Falha ao criar lead: nenhum dado retornado')
    }

    // 2. Resolve company via API (enforces unique name + address fields)
    let resolvedCompanyId = companyId.value
    if (companyForm.value.name && companyForm.value.name.trim()) {
      const companyPayload = {
        name: companyForm.value.name.trim(),
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
        if (resolvedCompanyId) {
          await $fetch(`/api/crm/company/${resolvedCompanyId}`, {
            method: 'PUT',
            body: companyPayload,
          })
        }
        else {
          const companyResponse = await $fetch<{ data: { id: string } }>('/api/crm/company', {
            method: 'POST',
            body: companyPayload,
          })
          resolvedCompanyId = companyResponse.data?.id ?? null
        }
      }
      catch (companyErr: any) {
        console.error('Erro ao criar empresa:', companyErr)
        throw new Error(
          companyErr?.data?.statusMessage
          || companyErr?.message
          || 'Falha ao salvar a empresa',
        )
      }
    }

    // 3. Cria o Contact vinculado ao lead
    const { data: contact, error: contactError } = await supabase
      .from('crm_contact')
      .insert([{
        name: contactForm.value.name,
        email: contactForm.value.email,
        phone: contactForm.value.phone || '',
        position: contactForm.value.position,
        notes: contactForm.value.notes,
        tenant_id: tenantId.value,
        lead_id: lead.id,
        company_id: resolvedCompanyId,
      }])
      .select()
      .single()

    if (contactError) {
      console.error('Erro ao criar contato:', contactError)
      throw new Error(`Falha ao criar contato: ${contactError.message}`)
    }

    if (!contact) {
      throw new Error('Falha ao criar contato: nenhum dado retornado')
    }

    // Resetar formulário
    leadForm.value = {
      name: '',
      source: '',
      priority: 'medium',
      valuesInputs: [''],
      closedValue: '',
      notes: '',
    }
    contactForm.value = {
      name: '',
      email: '',
      phone: '',
      position: '',
      notes: '',
    }
    companyForm.value = {
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
    companyId.value = null
    meetingForm.value = {
      date: '',
      time: '',
      type: '',
      duration: '',
      agenda: '',
    }

    step.value = 0
    applyFunnelStageDefaults()

    toast.success('Lead criado com sucesso!')

    // Silent CTWA attribution match by contact phone (does not change agent workflow).
    if (contact.phone) {
      try {
        await $fetch(`/api/crm/lead/${lead.id}/ctwa-match`, {
          method: 'POST',
          body: { tenant_id: tenantId.value, phone: contact.phone },
        })
      }
      catch (ctwaErr) {
        console.warn('[CTWA] Match after lead create failed', ctwaErr)
      }
    }

    // Emitir evento para o componente pai (inclui dados do contato para exibição imediata)
    emit('lead-created', {
      ...lead,
      email: contact.email,
      phone: contact.phone,
      funnel_id: funnelId,
      sales_stage_id: salesStageId,
    })
  }
  catch (err: any) {
    console.error('Erro ao criar lead:', err)
    toast.error(err?.message || 'Falha ao criar lead')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <!-- Loading State with Skeleton -->
    <div v-if="isLoadingData" class="space-y-6">
      <!-- Stepper Skeleton -->
      <div class="mb-8 flex justify-center">
        <div class="max-w-3xl w-full flex items-center space-x-8">
          <div v-for="i in 4" :key="i" class="flex flex-col items-center space-y-2">
            <div class="h-10 w-10 animate-pulse rounded-full bg-muted" />
            <div class="h-3 w-16 animate-pulse rounded bg-muted" />
            <div class="h-2 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>

      <!-- Form Skeleton -->
      <div class="mx-auto max-w-3xl">
        <div class="border rounded-lg p-6 space-y-6">
          <div class="space-y-2">
            <div class="h-5 w-32 animate-pulse rounded bg-muted" />
            <div class="h-10 w-full animate-pulse rounded bg-muted" />
          </div>

          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div v-for="i in 4" :key="i" class="space-y-2">
              <div class="h-4 w-24 animate-pulse rounded bg-muted" />
              <div class="h-10 w-full animate-pulse rounded bg-muted" />
            </div>
          </div>

          <div class="space-y-2">
            <div class="h-4 w-16 animate-pulse rounded bg-muted" />
            <div class="h-20 w-full animate-pulse rounded bg-muted" />
          </div>

          <div class="flex justify-between pt-4">
            <div class="h-10 w-20 animate-pulse rounded bg-muted" />
            <div class="h-10 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>

      <!-- Loading text -->
      <div class="text-center">
        <p class="text-sm text-muted-foreground">
          Carregando dados do formulário...
        </p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="dataError" class="flex flex-col items-center justify-center py-12 space-y-4">
      <div class="h-12 w-12 flex items-center justify-center rounded-full bg-destructive/10">
        <svg class="h-6 w-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <div class="text-center">
        <h3 class="text-sm text-destructive font-medium">
          Falha ao carregar dados
        </h3>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ dataError }}
        </p>
      </div>
      <Button variant="outline" size="sm" @click="refreshData">
        <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Tentar novamente
      </Button>
    </div>

    <!-- Main Form Content -->
    <div v-else>
      <!-- Stepper Horizontal -->
      <div class="w-full flex flex-col items-center">
        <Stepper v-model="step" orientation="horizontal" class="mb-8 max-w-3xl w-full flex flex-row justify-between gap-0">
          <StepperItem
            v-for="(item, index) in steps"
            :key="index"
            v-slot="{ state }"
            class="relative flex flex-1 flex-col items-center"
            :step="index"
          >
            <StepperTrigger as-child>
              <Button
                :variant="state === 'completed' || state === 'active' ? 'default' : 'outline'"
                size="icon"
                class="z-10 shrink-0 rounded-full"
                :class="[state === 'active' && 'ring-2 ring-ring ring-offset-2 ring-offset-background']"
              >
                <Check v-if="state === 'completed'" class="size-5" />
                <Circle v-else-if="state === 'active'" />
                <Dot v-else />
              </Button>
            </StepperTrigger>
            <StepperTitle
              :class="[state === 'active' && 'text-primary']"
              class="mt-2 text-center text-sm font-semibold transition lg:text-base"
            >
              {{ item.title }}<span v-if="item.required" class="ml-1 text-xs text-destructive">*</span>
            </StepperTitle>
            <StepperDescription
              :class="[state === 'active' && 'text-primary']"
              class="text-center text-xs text-muted-foreground transition lg:text-sm"
            >
              {{ item.description }}
            </StepperDescription>
            <StepperSeparator
              v-if="index !== steps.length - 1"
              class="absolute left-auto right-0 top-5 h-0.5 w-full bg-muted group-data-[state=completed]:bg-primary"
              style="left: 50%; right: -50%; width: 100%; height: 2px; top: 24px; z-index: 0;"
            />
          </StepperItem>
        </Stepper>
      </div>
      <!-- Step Content -->
      <div class="w-full flex justify-center">
        <Card class="max-w-3xl w-full border p-2 shadow-lg">
          <CardHeader class="mb-4">
            <CardTitle>
              <span v-if="step === 0">Informações do lead <span class="text-destructive">*</span></span>
              <span v-else-if="step === 1">Detalhes do contato <span class="text-destructive">*</span></span>
              <span v-else-if="step === 2">Informações da empresa</span>
              <span v-else>Detalhes da reunião</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <template v-if="step === 0">
              <!-- Lead Information Form -->
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div class="space-y-2">
                  <Label for="lead-name">Nome do lead <span class="text-destructive">*</span></Label>
                  <LeadNameAutofillInput
                    v-model="leadForm.name"
                    input-id="lead-name"
                    placeholder="Nome do lead"
                    required
                    @autofill="handleLeadAutofill"
                  />
                </div>
                <div class="space-y-2">
                  <Label for="lead-priority">Prioridade</Label>
                  <Select v-model="leadForm.priority">
                    <SelectTrigger id="lead-priority" class="w-full">
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
                    <SelectTrigger id="lead-source" class="w-full">
                      <SelectValue placeholder="Selecione a origem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="source in leadSources" :key="source.id" :value="source.id">
                        {{ source.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <LeadFunnelStageFields
                  v-model:funnel-id="selectedFunnelId"
                  v-model:sales-stage-id="selectedSalesStageId"
                  required
                  id-prefix="create-lead"
                />
                <div class="md:col-span-2">
                  <LeadValuesFields
                    v-model="leadForm.valuesInputs"
                    v-model:closed-value="leadForm.closedValue"
                    show-closed-value
                    id-prefix="step-lead-value"
                  />
                </div>
                <div class="md:col-span-2 space-y-2">
                  <Label for="lead-notes">Observações</Label>
                  <Textarea id="lead-notes" v-model="leadForm.notes" placeholder="Observações sobre o lead" rows="3" />
                </div>
              </div>
            </template>
            <template v-else-if="step === 1">
              <!-- Contact Details Form -->
              <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div class="space-y-2">
                  <Label for="contact-name">Nome do contato <span class="text-destructive">*</span></Label>
                  <LeadNameAutofillInput
                    v-model="contactForm.name"
                    input-id="contact-name"
                    placeholder="Nome do contato"
                    search-field="contact"
                    required
                    @autofill="handleLeadAutofill"
                  />
                </div>
                <div class="space-y-2">
                  <Label for="contact-email">E-mail <span class="text-destructive">*</span></Label>
                  <Input id="contact-email" v-model="contactForm.email" placeholder="email@exemplo.com" type="email" required />
                </div>
                <div class="space-y-2">
                  <Label for="contact-phone">Telefone</Label>
                  <Input
                    id="contact-phone"
                    v-model="contactForm.phone"
                    v-maska="{ mask: [...BR_PHONE_MASKS] }"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div class="space-y-2">
                  <Label for="contact-position">Cargo</Label>
                  <Input id="contact-position" v-model="contactForm.position" placeholder="Cargo do contato" />
                </div>
                <div class="md:col-span-2 space-y-2">
                  <Label for="contact-notes">Observações</Label>
                  <Textarea id="contact-notes" v-model="contactForm.notes" placeholder="Observações sobre o contato" rows="3" />
                </div>
              </div>
            </template>
            <template v-else-if="step === 2">
              <!-- Company Info Form -->
              <div class="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-medium">
                    Empresa
                  </h3>
                  <p class="text-xs text-muted-foreground">
                    Busque uma empresa cadastrada ou crie uma nova.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" class="h-8 shrink-0" @click="startNewCompany">
                  <Icon name="lucide:plus" class="mr-1 h-4 w-4" />
                  Nova empresa
                </Button>
              </div>
              <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div class="md:col-span-2 space-y-2">
                  <Label for="company-name">Nome da empresa</Label>
                  <CompanyNameAutofillInput
                    v-model="companyForm.name"
                    input-id="company-name"
                    placeholder="Digite para buscar empresas do tenant"
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
                <div class="md:col-span-2 space-y-2">
                  <Label for="company-notes">Observações</Label>
                  <Textarea id="company-notes" v-model="companyForm.notes" placeholder="Observações sobre a empresa" rows="3" />
                </div>
              </div>
            </template>
            <template v-else>
              <!-- Meeting Details Form -->
              <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
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
                      <SelectItem value="call">
                        Ligação
                      </SelectItem>
                      <SelectItem value="video">
                        Vídeo
                      </SelectItem>
                      <SelectItem value="in-person">
                        Presencial
                      </SelectItem>
                      <SelectItem value="demo">
                        Demonstração
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="space-y-2">
                  <Label for="meeting-duration">Duração (minutos)</Label>
                  <Input id="meeting-duration" v-model="meetingForm.duration" type="number" placeholder="30" />
                </div>
                <div class="md:col-span-2 space-y-2">
                  <Label for="meeting-agenda">Pauta</Label>
                  <Textarea id="meeting-agenda" v-model="meetingForm.agenda" placeholder="Descreva a pauta da reunião" rows="3" />
                </div>
              </div>
            </template>
          </CardContent>
          <div class="flex justify-between gap-2 px-5 py-2">
            <Button variant="outline" :disabled="step === 0" @click="prevStep">
              Voltar
            </Button>
            <Button v-if="step < totalSteps - 1" :disabled="!validateStep()" @click="nextStep">
              Próximo
            </Button>
            <Button v-else :loading="loading" :disabled="!validateStep()" @click="submitLead">
              Salvar lead
            </Button>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>
