<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useWorkspace } from '~/composables/useWorkspace'

definePageMeta({
  middleware: ['auth'],
  title: 'Briefings',
})

interface BriefingLinkRow {
  id: string
  briefingId: string
  campaignId: string | null
  expiresAt: string
  revokedAt: string | null
  maxUses: number | null
  useCount: number
  requireEmailConfirm: boolean
  createdAt: string
  lastAccessedAt: string | null
  linkStatus: 'active' | 'revoked' | 'expired' | 'used'
  briefing: {
    id: string
    title: string | null
    status: string
    clientEmail: string | null
    postId: string | null
    submittedAt: string | null
  } | null
}

const social = useMarketingSocial()
const { can } = useWorkspace()
const creating = ref(false)
const revokingId = ref<string | null>(null)
const confirmRevokeOpen = ref(false)
const linkToRevoke = ref<BriefingLinkRow | null>(null)
const statusFilter = ref<'all' | 'active' | 'revoked' | 'expired'>('all')
const lastCreated = ref<{ id: string, url: string, title: string } | null>(null)

const canCreate = computed(() => can('marketing.social.briefing.create'))
const canManage = computed(() => can('marketing.social.briefing.manage'))

const { data, showSkeleton, refresh } = useMarketingFetch({
  key: () => `briefing-links-${social.tenantId.value}-${statusFilter.value}`,
  handler: () => $fetch<{ data: BriefingLinkRow[] }>('/api/marketing/social/briefings/links', {
    query: {
      tenant_id: social.tenantId.value || undefined,
      status: statusFilter.value,
    },
  }),
  default: () => ({ data: [] as BriefingLinkRow[] }),
  watch: [social.tenantId, statusFilter],
  enabled: () => Boolean(social.tenantId.value) && canManage.value,
})

const links = computed(() => data.value?.data || [])

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  awaiting_client: 'Aguardando cliente',
  submitted: 'Enviado',
  needs_info: 'Precisa de info',
  accepted: 'Aceito',
  cancelled: 'Cancelado',
}

const linkStatusLabels: Record<BriefingLinkRow['linkStatus'], string> = {
  active: 'Ativo',
  revoked: 'Excluído',
  expired: 'Expirado',
  used: 'Utilizado',
}

function linkStatusClass(status: BriefingLinkRow['linkStatus']) {
  if (status === 'active')
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  if (status === 'revoked')
    return 'bg-destructive/10 text-destructive'
  if (status === 'used')
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
  return 'bg-muted text-muted-foreground'
}

function formatDate(value?: string | null) {
  if (!value)
    return '—'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function createLink() {
  creating.value = true
  try {
    const response = await social.createBriefingLink({
      title: 'Briefing do cliente',
      requireEmailConfirm: true,
      maxUses: 1,
    })
    lastCreated.value = {
      id: response.data.id,
      url: response.data.url,
      title: 'Briefing do cliente',
    }
    await navigator.clipboard.writeText(response.data.url)
    toast.success('Link gerado e copiado')
    await refresh()
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Falha ao gerar link')
  }
  finally {
    creating.value = false
  }
}

async function copyLastUrl() {
  if (!lastCreated.value?.url)
    return
  await navigator.clipboard.writeText(lastCreated.value.url)
  toast.success('Link copiado')
}

function askRevoke(link: BriefingLinkRow) {
  linkToRevoke.value = link
  confirmRevokeOpen.value = true
}

async function confirmRevoke() {
  const link = linkToRevoke.value
  if (!link)
    return
  revokingId.value = link.id
  try {
    await social.revokeBriefingLink(link.id)
    toast.success('Link excluído')
    if (lastCreated.value?.id === link.id)
      lastCreated.value = null
    confirmRevokeOpen.value = false
    linkToRevoke.value = null
    await refresh()
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Falha ao excluir link')
  }
  finally {
    revokingId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Briefings
        </h1>
        <p class="mt-1 text-muted-foreground">
          Gere, copie e gerencie links mágicos para o cliente preencher o briefing.
        </p>
      </div>
      <Button v-if="canCreate" :disabled="creating" @click="createLink">
        <Icon :name="creating ? 'lucide:loader-circle' : 'lucide:link'" class="mr-2 h-4 w-4" :class="{ 'animate-spin': creating }" />
        {{ creating ? 'Gerando…' : 'Gerar link mágico' }}
      </Button>
    </div>

    <Card v-if="lastCreated" class="border-primary/30 bg-primary/5">
      <CardContent class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0 space-y-1">
          <p class="text-sm font-medium">
            Link pronto para enviar
          </p>
          <code class="block truncate text-xs text-muted-foreground">{{ lastCreated.url }}</code>
          <p class="text-xs text-muted-foreground">
            O token só é exibido agora — copie e envie ao cliente.
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" @click="copyLastUrl">
            <Icon name="lucide:copy" class="mr-2 h-4 w-4" />
            Copiar
          </Button>
          <Button type="button" variant="ghost" size="sm" @click="lastCreated = null">
            Dispensar
          </Button>
        </div>
      </CardContent>
    </Card>

    <div class="flex flex-wrap items-center gap-2">
      <Button
        v-for="option in ([
          { value: 'all', label: 'Todos' },
          { value: 'active', label: 'Ativos' },
          { value: 'expired', label: 'Expirados / usados' },
          { value: 'revoked', label: 'Excluídos' },
        ] as const)"
        :key="option.value"
        type="button"
        size="sm"
        :variant="statusFilter === option.value ? 'secondary' : 'ghost'"
        @click="statusFilter = option.value"
      >
        {{ option.label }}
      </Button>
    </div>

    <MarketingPageSkeleton v-if="showSkeleton" variant="list" />

    <div v-else class="space-y-2">
      <Card v-for="item in links" :key="item.id" class="border-border/60">
        <CardContent class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">
                {{ item.briefing?.title || 'Briefing' }}
              </p>
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="linkStatusClass(item.linkStatus)"
              >
                {{ linkStatusLabels[item.linkStatus] }}
              </span>
              <span class="text-xs text-muted-foreground">
                {{ statusLabels[item.briefing?.status || ''] || item.briefing?.status }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground">
              Criado {{ formatDate(item.createdAt) }}
              · Expira {{ formatDate(item.expiresAt) }}
              <span v-if="item.maxUses != null"> · Usos {{ item.useCount }}/{{ item.maxUses }}</span>
              <span v-if="item.briefing?.clientEmail"> · {{ item.briefing.clientEmail }}</span>
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <Button
              v-if="item.briefing?.postId"
              size="sm"
              variant="outline"
              @click="navigateTo(`/marketing/content/${item.briefing.postId}`)"
            >
              <Icon name="lucide:file-text" class="mr-2 h-4 w-4" />
              Abrir conteúdo
            </Button>
            <Button
              v-if="canManage && item.linkStatus === 'active'"
              size="sm"
              variant="ghost"
              class="text-destructive hover:bg-destructive/10 hover:text-destructive"
              :disabled="revokingId === item.id"
              @click="askRevoke(item)"
            >
              <Icon name="lucide:trash-2" class="mr-2 h-4 w-4" />
              Excluir link
            </Button>
          </div>
        </CardContent>
      </Card>

      <div
        v-if="!links.length"
        class="flex flex-col items-center justify-center gap-3 border rounded-xl border-dashed px-6 py-16 text-center"
      >
        <div class="h-12 w-12 flex items-center justify-center rounded-full bg-muted">
          <Icon name="lucide:link-2" class="h-5 w-5 text-muted-foreground" />
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium">
            Nenhum link de briefing
          </p>
          <p class="text-sm text-muted-foreground">
            Gere um link mágico e envie ao cliente para coletar o briefing.
          </p>
        </div>
        <Button v-if="canCreate" size="sm" :disabled="creating" @click="createLink">
          Gerar primeiro link
        </Button>
      </div>
    </div>

    <AlertDialog v-model:open="confirmRevokeOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Excluir este link?
          </AlertDialogTitle>
          <AlertDialogDescription>
            O link deixará de funcionar imediatamente. O briefing associado permanece no histórico.
            <span v-if="linkToRevoke?.briefing?.title" class="mt-2 block text-foreground font-medium">
              {{ linkToRevoke.briefing.title }}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="Boolean(revokingId)">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            :disabled="Boolean(revokingId)"
            @click.prevent="confirmRevoke"
          >
            {{ revokingId ? 'Excluindo…' : 'Excluir link' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
