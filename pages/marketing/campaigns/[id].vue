<script setup lang="ts">
import type { SocialCampaignInput, SocialCampaignStatus } from '~/types/marketing-social'
import { toast } from 'vue-sonner'
import { useWorkspace } from '~/composables/useWorkspace'
import MarketingMvpStatusBadge from '~/components/marketing/MarketingMvpStatusBadge.vue'
import { resolveMarketingMvpStatus } from '~/utils/marketing-mvp-status'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'
import { SOCIAL_CAMPAIGN_STATUS_LABELS } from '~/types/marketing-social'

definePageMeta({
  middleware: ['auth'],
  title: 'Campanha',
})

const route = useRoute()
const { can } = useWorkspace()
const campaignId = computed(() => String(route.params.id))
const canBriefing = computed(() => can('marketing.social.briefing.create'))
const canCreate = computed(() => can('marketing.social.create'))
const canManage = computed(() => can('marketing.social.campaigns.manage'))

const {
  campaign,
  showSkeleton,
  refresh,
  updateCampaign,
  deleteCampaign,
} = useMarketingCampaignDetail(campaignId)

const linkUrl = ref('')
const creatingLink = ref(false)
const editOpen = ref(false)
const saving = ref(false)

const editForm = ref<SocialCampaignInput>({
  name: '',
  objective: '',
  status: 'draft',
  startsAt: '',
  endsAt: '',
  briefingSummary: '',
})

function toDateInput(value?: string | null) {
  if (!value)
    return ''
  return value.slice(0, 10)
}

function openEdit() {
  if (!campaign.value)
    return
  editForm.value = {
    name: campaign.value.name,
    objective: campaign.value.objective || '',
    status: campaign.value.status,
    startsAt: toDateInput(campaign.value.startsAt),
    endsAt: toDateInput(campaign.value.endsAt),
    briefingSummary: campaign.value.briefingSummary || '',
  }
  editOpen.value = true
}

async function handleSaveEdit() {
  if (!editForm.value.name.trim()) {
    toast.error('Informe o nome da campanha')
    return
  }
  saving.value = true
  try {
    await updateCampaign({
      name: editForm.value.name.trim(),
      objective: editForm.value.objective || '',
      status: editForm.value.status,
      startsAt: editForm.value.startsAt || null,
      endsAt: editForm.value.endsAt || null,
      briefingSummary: editForm.value.briefingSummary || '',
    })
    toast.success('Campanha atualizada')
    editOpen.value = false
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível atualizar a campanha')
  }
  finally {
    saving.value = false
  }
}

async function handleDelete() {
  if (!campaign.value)
    return
  const ok = await deleteWithConfirm(
    () => deleteCampaign(),
    {
      title: 'Excluir campanha?',
      description: `Tem certeza que deseja excluir "${campaign.value.name}"? Os posts vinculados permanecerão, mas sem campanha. Esta ação não pode ser desfeita.`,
      successMessage: 'Campanha excluída com sucesso.',
      errorMessage: 'Não foi possível excluir a campanha.',
    },
  )
  if (ok)
    await navigateTo('/marketing/campaigns')
}

async function createBriefingLink() {
  creatingLink.value = true
  try {
    const response = await $fetch<{ data: { url: string } }>('/api/marketing/social/briefings/link', {
      method: 'POST',
      body: {
        title: `Briefing · ${campaign.value?.name || 'Campanha'}`,
        campaignId: campaignId.value,
        requireEmailConfirm: true,
      },
    })
    linkUrl.value = response.data.url
    await navigator.clipboard.writeText(response.data.url)
    toast.success('Link de briefing copiado')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Falha ao gerar link')
  }
  finally {
    creatingLink.value = false
    await refresh()
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <Button variant="ghost" class="-ml-3" @click="navigateTo('/marketing/campaigns')">
      <Icon name="lucide:arrow-left" class="mr-2 h-4 w-4" />
      Campanhas
    </Button>

    <div v-if="showSkeleton">
      <MarketingPageSkeleton variant="detail" />
    </div>

    <template v-else-if="campaign">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-bold tracking-tight">
              {{ campaign.name }}
            </h1>
            <Badge variant="secondary">
              {{ SOCIAL_CAMPAIGN_STATUS_LABELS[campaign.status] || campaign.status }}
            </Badge>
          </div>
          <p class="text-muted-foreground">
            {{ campaign.objective || 'Sem objetivo' }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{ campaign.startsAt || campaign.endsAt
              ? `${toDateInput(campaign.startsAt) || '—'} → ${toDateInput(campaign.endsAt) || '—'}`
              : 'Sem período definido' }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            v-if="canManage"
            variant="outline"
            @click="openEdit"
          >
            <Icon name="lucide:pencil" class="mr-2 h-4 w-4" />
            Editar
          </Button>
          <Button
            v-if="canCreate"
            variant="outline"
            @click="navigateTo(`/marketing/content/new?campaignId=${campaignId}`)"
          >
            <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
            Novo conteúdo
          </Button>
          <Button v-if="canBriefing" :disabled="creatingLink" @click="createBriefingLink">
            <Icon name="lucide:link" class="mr-2 h-4 w-4" />
            Link de briefing
          </Button>
          <Button
            v-if="canManage"
            variant="destructive"
            @click="handleDelete"
          >
            <Icon name="lucide:trash-2" class="mr-2 h-4 w-4" />
            Excluir
          </Button>
        </div>
      </div>

      <Card v-if="campaign.briefingSummary">
        <CardHeader>
          <CardTitle>Briefing</CardTitle>
        </CardHeader>
        <CardContent class="whitespace-pre-wrap text-sm text-muted-foreground">
          {{ campaign.briefingSummary }}
        </CardContent>
      </Card>

      <Card v-if="linkUrl">
        <CardContent class="p-4 text-sm">
          <p class="mb-1 font-medium">
            Link gerado (Blimber)
          </p>
          <code class="break-all text-xs text-muted-foreground">{{ linkUrl }}</code>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conteúdos da campanha</CardTitle>
        </CardHeader>
        <CardContent class="space-y-2">
          <div
            v-for="post in campaign.posts || []"
            :key="post.id"
            class="flex items-center justify-between rounded-lg border p-3"
          >
            <div class="min-w-0 space-y-1">
              <p class="font-medium">
                {{ post.title }}
              </p>
              <MarketingMvpStatusBadge :status="resolveMarketingMvpStatus(post)" />
            </div>
            <Button size="sm" variant="outline" @click="navigateTo(`/marketing/content/${post.id}`)">
              Abrir
            </Button>
          </div>
          <p v-if="!(campaign.posts || []).length" class="text-sm text-muted-foreground">
            Nenhum conteúdo vinculado ainda.
          </p>
        </CardContent>
      </Card>
    </template>

    <div v-else class="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      Campanha não encontrada.
    </div>

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
