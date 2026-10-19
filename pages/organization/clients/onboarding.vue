<script setup lang="ts">
import type { AgencyOnboarding, OrganizationMember } from '~/types/workspace'

import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useWorkspace } from '~/composables/useWorkspace'
import { MODULE_LABELS_PT } from '~/constants/modules'
import { AGENCY_ONBOARDING_STEPS } from '~/constants/workspace'
import { slugify } from '~/utils/slugify'

definePageMeta({
  middleware: ['auth', 'organization'],
  requiredCapability: 'agency.clients.manage',
  allowedOrganizationTypes: ['agency'],
  title: 'Onboarding de cliente',
  alias: ['/agency/clients/onboarding'],
})

const STEP_LABELS: Record<string, string> = {
  client_data: 'Dados do cliente',
  tenant: 'Empresa',
  modules: 'Módulos',
  agency_owners: 'Responsáveis',
  client_invite: 'Convite',
  approval_flow: 'Aprovações',
  social_connect: 'Redes sociais',
  review: 'Revisão',
}

const STEP_HINTS: Record<string, string> = {
  client_data: 'Nome comercial e identidade visual do cliente.',
  tenant: 'Ambiente da empresa no Blimber (nome e identificador).',
  modules: 'Quais produtos este cliente poderá usar.',
  agency_owners: 'Quem da agência acompanha esta conta.',
  client_invite: 'E-mail oficial para o cliente criar senha e acessar.',
  approval_flow: 'Regras de revisão interna e do cliente.',
  social_connect: 'Canais que devem ser conectados depois.',
  review: 'Confira tudo antes de provisionar.',
}

const MODULE_OPTIONS = ['marketing', 'crm', 'whatsapp', 'cms'] as const

const { organization } = useWorkspace()
const organizationId = computed(() => organization.value?.id ?? null)

const onboardingId = ref<string | null>(null)
const stepIndex = ref(0)
const saving = ref(false)
const completing = ref(false)

const form = ref({
  displayName: '',
  logoUrl: '',
  tenantMode: 'create' as 'create' | 'select',
  tenantName: '',
  tenantSlug: '',
  tenantId: '',
  modules: ['marketing'] as string[],
  internalOwnerUserId: '',
  agencyOwnerMembershipIds: [] as string[],
  inviteEmail: '',
  inviteName: '',
  approvalPolicy: 'any',
  minimumApprovals: 1,
  requireInternal: true,
  requireClient: true,
  connectInstagram: true,
  connectFacebook: true,
})

const currentStep = computed(() => AGENCY_ONBOARDING_STEPS[stepIndex.value])
const progressPct = computed(() =>
  Math.round(((stepIndex.value + 1) / AGENCY_ONBOARDING_STEPS.length) * 100),
)

const { data: members } = await useAsyncData<OrganizationMember[]>(
  'agency-onboarding-members',
  async () => {
    if (!organizationId.value)
      return []
    const response = await $fetch<{ data: OrganizationMember[] }>(
      `/api/organizations/${organizationId.value}/members`,
    )
    return response.data
  },
  { default: () => [], watch: [organizationId] },
)

const slugManuallyEdited = ref(false)

watch(() => form.value.displayName, (name) => {
  if (form.value.tenantMode !== 'create')
    return
  form.value.tenantName = name
  if (!slugManuallyEdited.value)
    form.value.tenantSlug = slugify(name)
})

watch(() => form.value.tenantName, (name) => {
  if (form.value.tenantMode !== 'create' || slugManuallyEdited.value)
    return
  form.value.tenantSlug = slugify(name)
})

watch(() => form.value.tenantSlug, (slug, previous) => {
  if (form.value.tenantMode !== 'create')
    return
  const expected = slugify(form.value.tenantName || form.value.displayName)
  if (previous !== undefined && slug !== expected)
    slugManuallyEdited.value = true
})

watch(() => form.value.tenantMode, (mode) => {
  if (mode === 'create') {
    slugManuallyEdited.value = false
    const source = form.value.tenantName || form.value.displayName
    if (source)
      form.value.tenantSlug = slugify(source)
  }
})

function buildPayload() {
  return {
    client_data: {
      displayName: form.value.displayName,
      logoUrl: form.value.logoUrl || null,
    },
    tenant: {
      mode: form.value.tenantMode,
      name: form.value.tenantName,
      slug: form.value.tenantSlug,
      tenantId: form.value.tenantId || null,
    },
    modules: form.value.modules,
    agency_owners: {
      internalOwnerUserId: form.value.internalOwnerUserId || null,
      membershipIds: form.value.agencyOwnerMembershipIds,
    },
    client_invite: form.value.inviteEmail
      ? { email: form.value.inviteEmail, name: form.value.inviteName || undefined }
      : null,
    approval_flow: {
      policy: form.value.approvalPolicy,
      minimumApprovals: form.value.minimumApprovals,
      requireInternal: form.value.requireInternal,
      requireClient: form.value.requireClient,
    },
    social_connect: {
      instagram: form.value.connectInstagram,
      facebook: form.value.connectFacebook,
    },
  }
}

async function ensureDraft() {
  if (!organizationId.value)
    throw new Error('Organização ausente')
  if (onboardingId.value)
    return onboardingId.value

  const response = await $fetch<{ data: AgencyOnboarding }>(
    `/api/organizations/${organizationId.value}/onboardings`,
    {
      method: 'POST',
      body: {
        currentStep: currentStep.value,
        payload: buildPayload(),
      },
    },
  )
  onboardingId.value = response.data.id
  return response.data.id
}

async function saveDraft(advance = false) {
  if (!organizationId.value)
    return

  if (advance && currentStep.value === 'client_data' && !form.value.displayName.trim()) {
    toast.error('Informe o nome comercial do cliente.')
    return
  }

  if (advance && currentStep.value === 'tenant') {
    if (form.value.tenantMode === 'create' && (!form.value.tenantName.trim() || !form.value.tenantSlug.trim())) {
      toast.error('Informe o nome e o identificador da empresa.')
      return
    }
    if (form.value.tenantMode === 'select' && !form.value.tenantId.trim()) {
      toast.error('Informe o ID da empresa existente.')
      return
    }
  }

  if (advance && currentStep.value === 'client_invite' && !form.value.inviteEmail.trim()) {
    toast.error('Informe o e-mail do aprovador para enviar o convite oficial.')
    return
  }

  saving.value = true
  try {
    const id = await ensureDraft()
    const nextIndex = advance ? Math.min(stepIndex.value + 1, AGENCY_ONBOARDING_STEPS.length - 1) : stepIndex.value
    await $fetch(`/api/organizations/${organizationId.value}/onboardings/${id}`, {
      method: 'PUT',
      body: {
        currentStep: AGENCY_ONBOARDING_STEPS[nextIndex],
        payload: buildPayload(),
        status: 'in_progress',
      },
    })
    if (advance)
      stepIndex.value = nextIndex
    else
      toast.success('Rascunho salvo')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível salvar o rascunho')
  }
  finally {
    saving.value = false
  }
}

async function complete() {
  if (!organizationId.value)
    return

  if (!form.value.inviteEmail?.trim()) {
    toast.error('Informe o e-mail do aprovador do cliente para enviar o convite.')
    return
  }

  completing.value = true
  try {
    const id = await ensureDraft()
    await $fetch(`/api/organizations/${organizationId.value}/onboardings/${id}`, {
      method: 'PUT',
      body: { currentStep: 'review', payload: buildPayload() },
    })

    const response = await $fetch<{ data: { tenant_id: string, invite: { email: string, invite_sent: boolean, existing_user: boolean } | null } }>(
      `/api/organizations/${organizationId.value}/onboardings/${id}/complete`,
      {
        method: 'POST',
        body: {
          tenantMode: form.value.tenantMode,
          tenantId: form.value.tenantId || undefined,
          tenantName: form.value.tenantName || undefined,
          tenantSlug: form.value.tenantSlug || undefined,
          displayName: form.value.displayName,
          logoUrl: form.value.logoUrl || null,
          internalOwnerUserId: form.value.internalOwnerUserId || null,
          modules: form.value.modules,
          agencyOwnerMembershipIds: form.value.agencyOwnerMembershipIds,
          clientInvite: {
            email: form.value.inviteEmail.trim(),
            name: form.value.inviteName || undefined,
          },
          approvalFlow: {
            policy: form.value.approvalPolicy,
            minimumApprovals: form.value.minimumApprovals,
            requireInternal: form.value.requireInternal,
            requireClient: form.value.requireClient,
          },
          metadata: {
            social_connect: {
              instagram: form.value.connectInstagram,
              facebook: form.value.connectFacebook,
            },
          },
        },
      },
    )

    if (response.data.invite?.invite_sent) {
      toast.success(`Cliente criado. Convite enviado para ${response.data.invite.email}.`)
    }
    else if (response.data.invite?.existing_user) {
      toast.success(`Cliente criado. O usuário ${response.data.invite.email} já existia e foi vinculado.`)
    }
    else {
      toast.success('Cliente provisionado com sucesso')
    }
    await navigateTo('/agency/clients')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Falha ao concluir o onboarding')
  }
  finally {
    completing.value = false
  }
}

function toggleModule(moduleName: string) {
  const set = new Set(form.value.modules)
  if (set.has(moduleName))
    set.delete(moduleName)
  else set.add(moduleName)
  form.value.modules = [...set]
}

function toggleMembership(membershipId: string) {
  const set = new Set(form.value.agencyOwnerMembershipIds)
  if (set.has(membershipId))
    set.delete(membershipId)
  else set.add(membershipId)
  form.value.agencyOwnerMembershipIds = [...set]
}

function goToStep(index: number) {
  if (index <= stepIndex.value)
    stepIndex.value = index
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="space-y-1">
        <Button
          variant="ghost"
          size="sm"
          class="-ml-2 h-8 px-2 text-muted-foreground"
          @click="navigateTo('/agency/clients')"
        >
          <Icon name="lucide:arrow-left" class="mr-1 h-4 w-4" />
          Clientes
        </Button>
        <h1 class="text-2xl font-bold tracking-tight">
          Novo cliente
        </h1>
        <p class="text-muted-foreground">
          Fluxo em etapas com rascunho. A empresa só é criada ao concluir.
        </p>
      </div>
      <div class="rounded-lg border bg-card px-3 py-2 text-right text-xs text-muted-foreground">
        <p class="font-medium text-foreground">
          Etapa {{ stepIndex + 1 }} de {{ AGENCY_ONBOARDING_STEPS.length }}
        </p>
        <p>{{ progressPct }}% concluído</p>
      </div>
    </div>

    <div class="space-y-3">
      <div class="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-all duration-300"
          :style="{ width: `${progressPct}%` }"
        />
      </div>
      <div class="flex gap-1.5 overflow-x-auto pb-1">
        <button
          v-for="(step, index) in AGENCY_ONBOARDING_STEPS"
          :key="step"
          type="button"
          class="shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors"
          :class="index === stepIndex
            ? 'bg-primary text-primary-foreground'
            : index < stepIndex
              ? 'bg-muted text-foreground hover:bg-muted/80'
              : 'bg-transparent text-muted-foreground'"
          :disabled="index > stepIndex"
          @click="goToStep(index)"
        >
          {{ index + 1 }}. {{ STEP_LABELS[step] }}
        </button>
      </div>
    </div>

    <Card class="overflow-hidden">
      <CardHeader class="border-b bg-muted/30">
        <CardTitle class="text-lg">
          {{ STEP_LABELS[currentStep] }}
        </CardTitle>
        <CardDescription>
          {{ STEP_HINTS[currentStep] }}
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-5 pt-6">
        <template v-if="currentStep === 'client_data'">
          <div class="space-y-2">
            <Label>Nome comercial</Label>
            <Input v-model="form.displayName" placeholder="Ex.: Padaria Central" />
          </div>
          <div class="space-y-2">
            <Label>URL do logotipo <span class="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input v-model="form.logoUrl" placeholder="https://..." />
          </div>
        </template>

        <template v-else-if="currentStep === 'tenant'">
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              class="rounded-xl border p-4 text-left transition-colors"
              :class="form.tenantMode === 'create' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'"
              @click="form.tenantMode = 'create'"
            >
              <p class="text-sm font-medium">
                Criar empresa
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                Novo ambiente no Blimber para este cliente.
              </p>
            </button>
            <button
              type="button"
              class="rounded-xl border p-4 text-left transition-colors"
              :class="form.tenantMode === 'select' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'"
              @click="form.tenantMode = 'select'"
            >
              <p class="text-sm font-medium">
                Usar empresa existente
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                Vincular uma empresa que já está no sistema.
              </p>
            </button>
          </div>

          <template v-if="form.tenantMode === 'create'">
            <div class="space-y-2">
              <Label>Nome da empresa</Label>
              <Input v-model="form.tenantName" placeholder="Mesmo nome comercial, ou ajuste" />
            </div>
            <div class="space-y-2">
              <Label>Identificador (slug)</Label>
              <Input v-model="form.tenantSlug" placeholder="ex.: padaria-central" />
              <p class="text-xs text-muted-foreground">
                Usado internamente nas URLs e no sistema. Gere automaticamente a partir do nome.
              </p>
            </div>
          </template>
          <div v-else class="space-y-2">
            <Label>ID da empresa existente</Label>
            <Input v-model="form.tenantId" placeholder="UUID da empresa" />
            <p class="text-xs text-muted-foreground">
              A empresa não pode estar vinculada a outra agência ativa.
            </p>
          </div>
        </template>

        <template v-else-if="currentStep === 'modules'">
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="moduleName in MODULE_OPTIONS"
              :key="moduleName"
              type="button"
              class="flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors"
              :class="form.modules.includes(moduleName) ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'"
              @click="toggleModule(moduleName)"
            >
              <span class="text-sm font-medium">{{ MODULE_LABELS_PT[moduleName] || moduleName }}</span>
              <Icon
                :name="form.modules.includes(moduleName) ? 'lucide:check-circle-2' : 'lucide:circle'"
                class="h-4 w-4"
                :class="form.modules.includes(moduleName) ? 'text-primary' : 'text-muted-foreground'"
              />
            </button>
          </div>
        </template>

        <template v-else-if="currentStep === 'agency_owners'">
          <div class="space-y-2">
            <Label>Responsável interno <span class="font-normal text-muted-foreground">(user id, opcional)</span></Label>
            <Input v-model="form.internalOwnerUserId" placeholder="UUID do usuário da agência" />
          </div>
          <div class="space-y-2">
            <Label>Atribuir membros da agência</Label>
            <div class="max-h-52 space-y-1 overflow-y-auto rounded-xl border p-2">
              <label
                v-for="member in members"
                :key="member.id"
                class="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  class="accent-primary"
                  :checked="form.agencyOwnerMembershipIds.includes(member.id)"
                  @change="toggleMembership(member.id)"
                >
                <span class="min-w-0 flex-1 truncate">
                  {{ member.email || member.user_id }}
                </span>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {{ member.role_name || member.role }}
                </span>
              </label>
              <p v-if="!members?.length" class="px-2 py-3 text-xs text-muted-foreground">
                Nenhum membro encontrado nesta agência.
              </p>
            </div>
          </div>
        </template>

        <template v-else-if="currentStep === 'client_invite'">
          <div class="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Enviamos o convite oficial do Auth. O cliente abre o link, cria a senha e entra no hub.
            Depois você pode reenviar o e-mail na lista de clientes, sem recriar a empresa.
          </div>
          <div class="space-y-2">
            <Label>E-mail do administrador / aprovador <span class="text-destructive">*</span></Label>
            <Input v-model="form.inviteEmail" type="email" required placeholder="cliente@empresa.com" />
          </div>
          <div class="space-y-2">
            <Label>Nome</Label>
            <Input v-model="form.inviteName" placeholder="Nome do aprovador" />
          </div>
        </template>

        <template v-else-if="currentStep === 'approval_flow'">
          <div class="space-y-3 rounded-xl border p-4">
            <label class="flex cursor-pointer items-center gap-3 text-sm">
              <input id="req-internal" v-model="form.requireInternal" type="checkbox" class="accent-primary">
              Exigir aprovação interna da agência
            </label>
            <label class="flex cursor-pointer items-center gap-3 text-sm">
              <input id="req-client" v-model="form.requireClient" type="checkbox" class="accent-primary">
              Exigir aprovação do cliente
            </label>
          </div>
          <div class="space-y-2">
            <Label>Mínimo de aprovações</Label>
            <Input v-model.number="form.minimumApprovals" type="number" min="1" max="10" class="max-w-[8rem]" />
          </div>
        </template>

        <template v-else-if="currentStep === 'social_connect'">
          <p class="text-sm text-muted-foreground">
            A conexão OAuth acontece depois, no ambiente da empresa. Marque o que deve ser configurado.
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              class="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm"
              :class="form.connectInstagram ? 'border-primary bg-primary/5' : ''"
            >
              <input v-model="form.connectInstagram" type="checkbox" class="accent-primary">
              Instagram
            </label>
            <label
              class="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm"
              :class="form.connectFacebook ? 'border-primary bg-primary/5' : ''"
            >
              <input v-model="form.connectFacebook" type="checkbox" class="accent-primary">
              Facebook
            </label>
          </div>
        </template>

        <template v-else>
          <dl class="divide-y rounded-xl border text-sm">
            <div class="flex justify-between gap-4 px-4 py-3">
              <dt class="text-muted-foreground">
                Cliente
              </dt>
              <dd class="text-right font-medium">
                {{ form.displayName || '—' }}
              </dd>
            </div>
            <div class="flex justify-between gap-4 px-4 py-3">
              <dt class="text-muted-foreground">
                Empresa
              </dt>
              <dd class="text-right font-medium">
                {{ form.tenantMode === 'create' ? `${form.tenantName} (${form.tenantSlug})` : form.tenantId || '—' }}
              </dd>
            </div>
            <div class="flex justify-between gap-4 px-4 py-3">
              <dt class="text-muted-foreground">
                Módulos
              </dt>
              <dd class="text-right font-medium">
                {{ form.modules.map(m => MODULE_LABELS_PT[m] || m).join(', ') || '—' }}
              </dd>
            </div>
            <div class="flex justify-between gap-4 px-4 py-3">
              <dt class="text-muted-foreground">
                Convite
              </dt>
              <dd class="text-right font-medium">
                {{ form.inviteEmail || '—' }}
              </dd>
            </div>
          </dl>
        </template>
      </CardContent>
      <CardFooter class="flex flex-wrap justify-between gap-2 border-t bg-muted/20">
        <Button variant="outline" :disabled="stepIndex === 0 || saving || completing" @click="stepIndex -= 1">
          Voltar
        </Button>
        <div class="flex gap-2">
          <Button variant="secondary" :disabled="saving || completing" @click="saveDraft(false)">
            Salvar rascunho
          </Button>
          <Button
            v-if="stepIndex < AGENCY_ONBOARDING_STEPS.length - 1"
            :disabled="saving || completing"
            @click="saveDraft(true)"
          >
            Continuar
          </Button>
          <Button
            v-else
            :disabled="saving || completing || !form.displayName"
            @click="complete"
          >
            {{ completing ? 'Concluindo…' : 'Concluir e enviar convite' }}
          </Button>
        </div>
      </CardFooter>
    </Card>
  </div>
</template>
