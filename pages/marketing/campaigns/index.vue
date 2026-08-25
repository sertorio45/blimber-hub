<script setup lang="ts">
import type { SocialCampaign, SocialCampaignInput, SocialCampaignStatus } from '~/types/marketing-social'
import { toast } from 'vue-sonner'
import { columns } from '~/components/marketing/campaigns/columns'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'
import { useWorkspace } from '~/composables/useWorkspace'
import { SOCIAL_CAMPAIGN_STATUS_LABELS } from '~/types/marketing-social'
import DataTable from '~/components/ui/table/DataTable.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Campanhas editoriais',
})

const { can } = useWorkspace()
const canManage = computed(() => can('marketing.social.campaigns.manage'))

const {
  campaigns,
  showSkeleton,
  search,
  statusFilter,
  refresh,
  createCampaign,
  updateCampaign,
  deleteCampaign,
} = useMarketingCampaigns()

const creating = ref(false)
const saving = ref(false)
const createOpen = ref(false)
const editOpen = ref(false)
const editingCampaign = ref<SocialCampaign | null>(null)

const emptyForm = (): SocialCampaignInput => ({
  name: '',
  objective: '',
  status: 'draft',
  startsAt: '',
  endsAt: '',
  briefingSummary: '',
})

const createForm = ref(emptyForm())
const editForm = ref(emptyForm())

function toDateInput(value?: string | null) {
  if (!value)
    return ''
  return value.slice(0, 10)
}

function handleView(campaign: SocialCampaign) {
  navigateTo(`/marketing/campaigns/${campaign.id}`)
}

function openEdit(campaign: SocialCampaign) {
  editingCampaign.value = campaign
  editForm.value = {
    name: campaign.name,
    objective: campaign.objective || '',
    status: campaign.status,
    startsAt: toDateInput(campaign.startsAt),
    endsAt: toDateInput(campaign.endsAt),
    briefingSummary: campaign.briefingSummary || '',
  }
  editOpen.value = true
}

async function handleCreate() {
  if (!createForm.value.name.trim()) {
    toast.error('Informe o nome da campanha')
    return
  }
  creating.value = true
  try {
    const created = await createCampaign({
      name: createForm.value.name.trim(),
      objective: createForm.value.objective || '',
      status: createForm.value.status || 'draft',
      startsAt: createForm.value.startsAt || null,
      endsAt: createForm.value.endsAt || null,
      briefingSummary: createForm.value.briefingSummary || '',
    })
    toast.success('Campanha criada')
    createOpen.value = false
    createForm.value = emptyForm()
    navigateTo(`/marketing/campaigns/${created.id}`)
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível criar a campanha')
  }
  finally {
    creating.value = false
  }
}

async function handleSaveEdit() {
  if (!editingCampaign.value)
    return
  if (!editForm.value.name.trim()) {
    toast.error('Informe o nome da campanha')
    return
  }
  saving.value = true
  try {
    await updateCampaign(editingCampaign.value.id, {
      name: editForm.value.name.trim(),
      objective: editForm.value.objective || '',
      status: editForm.value.status,
      startsAt: editForm.value.startsAt || null,
      endsAt: editForm.value.endsAt || null,
      briefingSummary: editForm.value.briefingSummary || '',
    })
    toast.success('Campanha atualizada')
    editOpen.value = false
    editingCampaign.value = null
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível atualizar a campanha')
  }
  finally {
    saving.value = false
  }
}

async function handleDelete(campaign: SocialCampaign) {
  await deleteWithConfirm(
    () => deleteCampaign(campaign.id),
    {
      title: 'Excluir campanha?',
      description: `Tem certeza que deseja excluir "${campaign.name}"? Os posts vinculados permanecerão, mas sem campanha. Esta ação não pode ser desfeita.`,
      successMessage: 'Campanha excluída com sucesso.',
      errorMessage: 'Não foi possível excluir a campanha.',
    },
  )
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Campanhas editoriais
        </h1>
        <p class="mt-1 text-muted-foreground">
          Agrupe posts, briefings e entregas em uma campanha editorial.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" @click="refresh()">
          <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" />
          Atualizar
        </Button>
        <Button v-if="canManage" @click="createOpen = true">
          <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
          Nova campanha
        </Button>
      </div>
    </div>

    <Card>
      <CardContent class="flex flex-col gap-3 p-4 md:flex-row">
        <div class="relative flex-1">
          <Icon name="lucide:search" class="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input v-model="search" class="pl-9" placeholder="Buscar campanha" />
        </div>
        <Select v-model="statusFilter">
          <SelectTrigger class="w-full md:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Todos
            </SelectItem>
            <SelectItem
              v-for="(label, value) in SOCIAL_CAMPAIGN_STATUS_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>

    <MarketingPageSkeleton v-if="showSkeleton" variant="list" />

    <div
      v-else-if="!campaigns.length"
      class="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"
    >
      Nenhuma campanha ainda.
    </div>

    <DataTable
      v-else
      :data="campaigns"
      :columns="columns"
      :meta="{
        onView: handleView,
        onEdit: openEdit,
        onDelete: handleDelete,
        canManage,
      }"
    />

    <Dialog v-model:open="createOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
        </DialogHeader>
        <div class="space-y-3">
          <Input v-model="createForm.name" placeholder="Nome da campanha" />
          <Textarea v-model="createForm.objective" placeholder="Objetivo" rows="3" />
          <Textarea v-model="createForm.briefingSummary" placeholder="Resumo do briefing" rows="3" />
          <Select v-model="createForm.status">
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="(label, value) in SOCIAL_CAMPAIGN_STATUS_LABELS"
                :key="value"
                :value="(value as SocialCampaignStatus)"
              >
                {{ label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <div class="grid grid-cols-2 gap-3">
            <Input v-model="createForm.startsAt" type="date" />
            <Input v-model="createForm.endsAt" type="date" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="createOpen = false">
            Cancelar
          </Button>
          <Button :disabled="creating || !createForm.name?.trim()" @click="handleCreate">
            {{ creating ? 'Criando…' : 'Criar' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="editOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar campanha</DialogTitle>
        </DialogHeader>
        <div class="space-y-3">
          <Input v-model="editForm.name" placeholder="Nome da campanha" />
          <Textarea v-model="editForm.objective" placeholder="Objetivo" rows="3" />
          <Textarea v-model="editForm.briefingSummary" placeholder="Resumo do briefing" rows="3" />
          <Select v-model="editForm.status">
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="(label, value) in SOCIAL_CAMPAIGN_STATUS_LABELS"
                :key="value"
                :value="(value as SocialCampaignStatus)"
              >
                {{ label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <div class="grid grid-cols-2 gap-3">
            <Input v-model="editForm.startsAt" type="date" />
            <Input v-model="editForm.endsAt" type="date" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editOpen = false">
            Cancelar
          </Button>
          <Button :disabled="saving || !editForm.name?.trim()" @click="handleSaveEdit">
            {{ saving ? 'Salvando…' : 'Salvar' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
