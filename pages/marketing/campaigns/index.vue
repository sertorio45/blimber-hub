<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useWorkspace } from '~/composables/useWorkspace'

definePageMeta({
  middleware: ['auth'],
  title: 'Campanhas editoriais',
})

const social = useMarketingSocial()
const { can } = useWorkspace()
const search = ref('')
const status = ref('all')
const creating = ref(false)
const dialogOpen = ref(false)
const form = ref({
  name: '',
  objective: '',
  status: 'draft' as 'draft' | 'active' | 'paused' | 'completed' | 'cancelled',
  startsAt: '',
  endsAt: '',
  briefingSummary: '',
})

const canManage = computed(() => can('marketing.social.campaigns.manage'))

const { data, showSkeleton, refresh } = useMarketingFetch({
  key: () => `campaigns-${social.tenantId.value}-${status.value}-${search.value}`,
  handler: () => $fetch<{ data: any[] }>('/api/marketing/social/campaigns', {
    query: {
      tenant_id: social.tenantId.value || undefined,
      status: status.value,
      search: search.value || undefined,
    },
  }),
  default: () => ({ data: [] as any[] }),
  watch: [social.tenantId, status],
  enabled: () => Boolean(social.tenantId.value),
})

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer)
    clearTimeout(searchTimer)
  searchTimer = setTimeout(() => refresh(), 300)
})

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

async function createCampaign() {
  if (!form.value.name.trim())
    return
  creating.value = true
  try {
    const response = await $fetch<{ data: any }>('/api/marketing/social/campaigns', {
      method: 'POST',
      body: {
        name: form.value.name,
        objective: form.value.objective,
        status: form.value.status,
        startsAt: form.value.startsAt || null,
        endsAt: form.value.endsAt || null,
        briefingSummary: form.value.briefingSummary,
      },
    })
    toast.success('Campanha criada')
    dialogOpen.value = false
    form.value = { name: '', objective: '', status: 'draft', startsAt: '', endsAt: '', briefingSummary: '' }
    await refresh()
    navigateTo(`/marketing/campaigns/${response.data.id}`)
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível criar a campanha')
  }
  finally {
    creating.value = false
  }
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
      <Button v-if="canManage" @click="dialogOpen = true">
        <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
        Nova campanha
      </Button>
    </div>

    <Card>
      <CardContent class="flex flex-col gap-3 p-4 md:flex-row">
        <div class="relative flex-1">
          <Icon name="lucide:search" class="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input v-model="search" class="pl-9" placeholder="Buscar campanha" />
        </div>
        <Select v-model="status">
          <SelectTrigger class="w-full md:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Todos
            </SelectItem>
            <SelectItem v-for="(label, value) in statusLabels" :key="value" :value="value">
              {{ label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>

    <MarketingPageSkeleton v-if="showSkeleton" variant="list" />

    <div v-else-if="!(data?.data || []).length" class="rounded-xl border p-8 text-center text-sm text-muted-foreground">
      Nenhuma campanha ainda.
    </div>

    <div v-else class="grid gap-3 md:grid-cols-2">
      <Card
        v-for="campaign in data?.data || []"
        :key="campaign.id"
        class="cursor-pointer transition hover:border-primary/40"
        @click="navigateTo(`/marketing/campaigns/${campaign.id}`)"
      >
        <CardContent class="space-y-2 p-4">
          <div class="flex items-start justify-between gap-2">
            <h2 class="font-semibold">
              {{ campaign.name }}
            </h2>
            <Badge variant="secondary">
              {{ statusLabels[campaign.status] || campaign.status }}
            </Badge>
          </div>
          <p class="line-clamp-2 text-sm text-muted-foreground">
            {{ campaign.objective || 'Sem objetivo definido' }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{ campaign.postsCount }} conteúdos
          </p>
        </CardContent>
      </Card>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
        </DialogHeader>
        <div class="space-y-3">
          <Input v-model="form.name" placeholder="Nome da campanha" />
          <Textarea v-model="form.objective" placeholder="Objetivo" rows="3" />
          <Textarea v-model="form.briefingSummary" placeholder="Resumo do briefing" rows="3" />
          <div class="grid grid-cols-2 gap-3">
            <Input v-model="form.startsAt" type="date" />
            <Input v-model="form.endsAt" type="date" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">
            Cancelar
          </Button>
          <Button :disabled="creating || !form.name.trim()" @click="createCampaign">
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
