<script setup lang="ts">
import { toast } from 'vue-sonner'
import {
  DEFAULT_SLA_DAYS,
  SOCIAL_SLA_STAGE_KEYS,
  SOCIAL_SLA_STAGE_LABELS,
  type SocialSlaStageKey,
} from '~/constants/social-packages'
import { useWorkspace } from '~/composables/useWorkspace'

definePageMeta({
  middleware: ['auth'],
  title: 'Pacotes',
})

const social = useMarketingSocial()
const { can } = useWorkspace()
const status = ref('all')
const dialogOpen = ref(false)
const slaDialogOpen = ref(false)
const creating = ref(false)
const savingSla = ref(false)
const selectedPackageId = ref<string | null>(null)

const canManage = computed(() => can('marketing.social.packages.manage'))
const canSla = computed(() => can('marketing.social.sla.manage'))

const form = ref({
  name: '',
  status: 'active' as 'draft' | 'active' | 'paused' | 'ended',
  startsAt: new Date().toISOString().slice(0, 10),
  endsAt: '',
  postsQuota: 12,
  reelsQuota: 4,
  storiesQuota: 20,
  campaignsQuota: 2,
  captureQuota: 1,
  notes: '',
})

const slaForm = ref(
  SOCIAL_SLA_STAGE_KEYS.map(stageKey => ({
    stageKey,
    maxBusinessDays: DEFAULT_SLA_DAYS[stageKey],
  })),
)

const { data, showSkeleton, refresh } = useMarketingFetch({
  key: () => `packages-${social.tenantId.value}-${status.value}`,
  handler: () => social.listPackages({ status: status.value }),
  default: () => ({ data: [] as any[] }),
  watch: [social.tenantId, status],
  enabled: () => Boolean(social.tenantId.value),
})

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  active: 'Ativo',
  paused: 'Pausado',
  ended: 'Encerrado',
}

function usageLabel(part: { contracted: number, produced: number, remaining: number, excess: number }) {
  if (!part.contracted)
    return `${part.produced} produzido(s) · sem cota`
  return `${part.produced}/${part.contracted} · restam ${part.remaining}${part.excess ? ` · +${part.excess} excedente` : ''}`
}

async function createPackage() {
  if (!form.value.name.trim())
    return
  creating.value = true
  try {
    await social.createPackage({
      name: form.value.name,
      status: form.value.status,
      startsAt: form.value.startsAt,
      endsAt: form.value.endsAt || null,
      postsQuota: form.value.postsQuota,
      reelsQuota: form.value.reelsQuota,
      storiesQuota: form.value.storiesQuota,
      campaignsQuota: form.value.campaignsQuota,
      captureQuota: form.value.captureQuota,
      notes: form.value.notes,
      seedDefaultSla: true,
    })
    toast.success('Pacote criado')
    dialogOpen.value = false
    await refresh()
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Falha ao criar pacote')
  }
  finally {
    creating.value = false
  }
}

async function openSla(packageId: string) {
  selectedPackageId.value = packageId
  try {
    const stages = await social.getPackageSla(packageId)
    const byKey = new Map(stages.map((s: any) => [s.stage_key, s.max_business_days]))
    slaForm.value = SOCIAL_SLA_STAGE_KEYS.map(stageKey => ({
      stageKey,
      maxBusinessDays: Number(byKey.get(stageKey) || DEFAULT_SLA_DAYS[stageKey]),
    }))
    slaDialogOpen.value = true
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Falha ao carregar SLA')
  }
}

async function saveSla() {
  if (!selectedPackageId.value)
    return
  savingSla.value = true
  try {
    await social.updatePackageSla(selectedPackageId.value, slaForm.value)
    toast.success('SLA atualizado')
    slaDialogOpen.value = false
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Falha ao salvar SLA')
  }
  finally {
    savingSla.value = false
  }
}

async function setStatus(packageId: string, next: 'active' | 'paused' | 'ended') {
  try {
    await social.updatePackage(packageId, { status: next })
    toast.success('Status atualizado')
    await refresh()
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Falha ao atualizar')
  }
}

function stageLabel(key: SocialSlaStageKey) {
  return SOCIAL_SLA_STAGE_LABELS[key]
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Pacotes contratados
        </h1>
        <p class="mt-1 text-muted-foreground">
          Cotas, consumo e SLA por etapa de produção.
        </p>
      </div>
      <Button v-if="canManage" @click="dialogOpen = true">
        <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
        Novo pacote
      </Button>
    </div>

    <Card>
      <CardContent class="p-4">
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

    <div v-else class="space-y-3">
      <Card v-for="pkg in data?.data || []" :key="pkg.id">
        <CardContent class="space-y-4 p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-lg font-semibold">
                  {{ pkg.name }}
                </p>
                <Badge :variant="pkg.status === 'active' ? 'default' : 'secondary'">
                  {{ statusLabels[pkg.status] || pkg.status }}
                </Badge>
                <Badge v-if="pkg.usage?.overQuota" variant="destructive">
                  Acima da cota
                </Badge>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ pkg.starts_at }}
                <span v-if="pkg.ends_at"> → {{ pkg.ends_at }}</span>
                <span v-else> → sem fim</span>
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button v-if="canSla" size="sm" variant="outline" @click="openSla(pkg.id)">
                SLA
              </Button>
              <Button
                v-if="canManage && pkg.status === 'active'"
                size="sm"
                variant="outline"
                @click="setStatus(pkg.id, 'paused')"
              >
                Pausar
              </Button>
              <Button
                v-if="canManage && pkg.status === 'paused'"
                size="sm"
                variant="outline"
                @click="setStatus(pkg.id, 'active')"
              >
                Reativar
              </Button>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-lg border p-3">
              <p class="text-xs text-muted-foreground">
                Posts
              </p>
              <p class="mt-1 text-sm font-medium">
                {{ usageLabel(pkg.usage.posts) }}
              </p>
              <p class="mt-1 text-[11px] text-muted-foreground">
                Aprovados {{ pkg.usage.posts.approved }} · Publicados {{ pkg.usage.posts.published }}
              </p>
            </div>
            <div class="rounded-lg border p-3">
              <p class="text-xs text-muted-foreground">
                Reels
              </p>
              <p class="mt-1 text-sm font-medium">
                {{ usageLabel(pkg.usage.reels) }}
              </p>
            </div>
            <div class="rounded-lg border p-3">
              <p class="text-xs text-muted-foreground">
                Stories
              </p>
              <p class="mt-1 text-sm font-medium">
                {{ usageLabel(pkg.usage.stories) }}
              </p>
            </div>
            <div class="rounded-lg border p-3">
              <p class="text-xs text-muted-foreground">
                Campanhas
              </p>
              <p class="mt-1 text-sm font-medium">
                {{ usageLabel(pkg.usage.campaigns) }}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <p v-if="!(data?.data || []).length" class="text-sm text-muted-foreground">
        Nenhum pacote cadastrado para este cliente.
      </p>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo pacote</DialogTitle>
          <DialogDescription>
            Defina cotas e validade. O SLA padrão será criado automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3 py-2">
          <div>
            <Label>Nome</Label>
            <Input v-model="form.name" placeholder="Pacote mensal" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <BaseDatePicker v-model="form.startsAt" label="Início" placeholder="Data de início" />
            <BaseDatePicker v-model="form.endsAt" label="Fim" placeholder="Data de fim" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <Label>Posts</Label>
              <Input v-model.number="form.postsQuota" type="number" min="0" />
            </div>
            <div>
              <Label>Reels</Label>
              <Input v-model.number="form.reelsQuota" type="number" min="0" />
            </div>
            <div>
              <Label>Stories</Label>
              <Input v-model.number="form.storiesQuota" type="number" min="0" />
            </div>
            <div>
              <Label>Campanhas</Label>
              <Input v-model.number="form.campaignsQuota" type="number" min="0" />
            </div>
            <div>
              <Label>Captações</Label>
              <Input v-model.number="form.captureQuota" type="number" min="0" />
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea v-model="form.notes" rows="2" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">
            Cancelar
          </Button>
          <Button :disabled="creating" @click="createPackage">
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="slaDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>SLA por etapa</DialogTitle>
          <DialogDescription>
            Prazo máximo em dias úteis para cada etapa.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3 py-2">
          <div v-for="stage in slaForm" :key="stage.stageKey" class="flex items-center justify-between gap-3">
            <Label class="min-w-28">
              {{ stageLabel(stage.stageKey) }}
            </Label>
            <Input v-model.number="stage.maxBusinessDays" class="w-24" type="number" min="1" max="90" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="slaDialogOpen = false">
            Cancelar
          </Button>
          <Button :disabled="savingSla" @click="saveSla">
            Salvar SLA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
