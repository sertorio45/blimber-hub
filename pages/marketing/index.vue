<script setup lang="ts">
import {
  emptyMarketingMvpOverviewCounts,
  MARKETING_MVP_STATUS_LABELS,
  type MarketingMvpOverviewCounts,
  type MarketingMvpStatus,
} from '~/types/marketing-mvp'
import MarketingMvpStatusBadge from '~/components/marketing/MarketingMvpStatusBadge.vue'
import { useMarketingAudience } from '~/composables/marketing/useMarketingAudience'
import {
  isImageAsset,
  platformIcon,
  previewUrl,
  uniqueApprovalPreviewAssets,
} from '@/utils/marketing-social-preview'
import { shouldShowClientApproveAction } from '~/utils/marketing-client-content'

definePageMeta({
  middleware: ['auth'],
  title: 'Marketing',
})

const { tenantId } = useTenant()
const workspace = useWorkspace()
const social = useMarketingSocial()
const { isClientExperience } = useMarketingAudience()

const canCreate = computed(() => workspace.can('marketing.social.create'))
const canReports = computed(() => workspace.can('marketing.social.reports'))
const canIntegrations = computed(() => workspace.can('marketing.social.integrations'))
const canClientApprove = computed(() =>
  isClientExperience.value && workspace.can('marketing.social.approval.client'),
)

const { data: overview, showSkeleton } = useMarketingFetch({
  key: () => `marketing-mvp-overview-${tenantId.value}`,
  handler: async () => {
    const response = await $fetch<{ data: MarketingMvpOverviewCounts }>('/api/marketing/mvp/overview', {
      query: { tenant_id: tenantId.value || undefined },
    })
    return response.data
  },
  default: () => emptyMarketingMvpOverviewCounts(),
  watch: [tenantId],
  enabled: () => Boolean(tenantId.value),
})

const { data: pendingApprovals } = useMarketingFetch({
  key: () => `marketing-overview-client-approvals-${tenantId.value}`,
  handler: async () => {
    const response = await social.listApprovals({
      inbox: 'client',
      status: 'pending',
    })
    return (response.data || []).filter((item: any) => item.can_decide !== false)
  },
  default: () => [] as any[],
  watch: [tenantId, canClientApprove],
  enabled: () => Boolean(tenantId.value) && canClientApprove.value,
})

const pendingApprovalCount = computed(() => pendingApprovals.value.length)
const showClientApproveAction = computed(() =>
  shouldShowClientApproveAction(pendingApprovalCount.value),
)
const pendingApprovalPreviews = computed(() =>
  pendingApprovals.value.slice(0, 3).map((item: any) => {
    const assets = uniqueApprovalPreviewAssets(item.raw || {
      content_versions: { snapshot: item.preview_snapshot },
    })
    const thumb = assets.find(asset => isImageAsset(asset) && previewUrl(asset)) || assets[0]
    return {
      id: item.id,
      title: item.title || 'Sem título',
      platforms: (item.platforms || []) as string[],
      thumbUrl: thumb ? previewUrl(thumb) : null,
    }
  }),
)

const statusCards = computed(() => {
  const byStatus = overview.value.contents_by_mvp_status
  const order: MarketingMvpStatus[] = isClientExperience.value
    ? ['aprovacao', 'agendado', 'publicado', 'erro']
    : ['rascunho', 'producao', 'aprovacao', 'agendado', 'publicado', 'erro']

  const linkFor = (status: MarketingMvpStatus): string | null => {
    if (status === 'aprovacao' && canClientApprove.value)
      return showClientApproveAction.value ? '/marketing/approvals' : null

    if (status === 'aprovacao' && !isClientExperience.value)
      return '/marketing/approvals'

    if (isClientExperience.value)
      return `/marketing/content?mvp_status=${status}`

    if (status === 'producao')
      return '/marketing/production'
    if (status === 'agendado' || status === 'publicado' || status === 'erro')
      return `/marketing/publishing?mvp_status=${status}`
    return `/marketing/content?mvp_status=${status}`
  }

  return order.map(status => ({
    status,
    label: MARKETING_MVP_STATUS_LABELS[status],
    value: status === 'aprovacao' && canClientApprove.value
      ? pendingApprovalCount.value
      : (byStatus?.[status] || 0),
    link: linkFor(status),
    highlight: (status === 'aprovacao' || status === 'erro') && (
      status === 'aprovacao' && canClientApprove.value
        ? showClientApproveAction.value
        : (byStatus?.[status] || 0) > 0
    ),
  }))
})
</script>

<template>
  <MarketingPageSkeleton v-if="showSkeleton" variant="dashboard" />
  <div v-else class="space-y-8">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Visão geral
        </h1>
        <p class="mt-1 text-muted-foreground">
          <template v-if="isClientExperience">
            Aprove peças, acompanhe a agenda e veja o que já está no ar.
          </template>
          <template v-else>
            Planejamento, produção, aprovação e publicação em um único fluxo.
          </template>
        </p>
      </div>
      <Button v-if="canCreate" @click="navigateTo('/marketing/content/new')">
        <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
        Novo conteúdo
      </Button>
      <Button v-else @click="navigateTo('/marketing/calendar')">
        <Icon name="lucide:calendar-days" class="mr-2 h-4 w-4" />
        Calendário
      </Button>
    </div>

    <Card
      v-if="canClientApprove"
      :class="{ 'border-primary/40': pendingApprovalCount > 0 }"
    >
      <CardHeader class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Aguardando sua aprovação</CardTitle>
          <CardDescription>
            {{ pendingApprovalCount
              ? `${pendingApprovalCount} peça${pendingApprovalCount === 1 ? '' : 's'} para revisar.`
              : 'Nada para aprovar agora' }}
          </CardDescription>
        </div>
        <Button
          v-if="showClientApproveAction"
          class="shrink-0"
          @click="navigateTo('/marketing/approvals')"
        >
          Ir para aprovar
          <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent v-if="pendingApprovalPreviews.length" class="grid gap-3 sm:grid-cols-3">
        <button
          v-for="item in pendingApprovalPreviews"
          :key="item.id"
          type="button"
          class="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
          @click="navigateTo(`/marketing/approvals?request=${item.id}`)"
        >
          <div class="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
            <img
              v-if="item.thumbUrl"
              :src="item.thumbUrl"
              :alt="item.title"
              class="h-full w-full object-cover"
            >
            <div v-else class="flex h-full items-center justify-center text-muted-foreground">
              <Icon name="lucide:image-off" class="h-4 w-4" />
            </div>
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">
              {{ item.title }}
            </p>
            <p class="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span v-for="platform in item.platforms" :key="`${item.id}-${platform}`" class="inline-flex items-center gap-0.5">
                <Icon :name="platformIcon(platform)" class="h-3 w-3" />
                {{ platform }}
              </span>
              <span v-if="!item.platforms.length">Peça pendente</span>
            </p>
          </div>
        </button>
      </CardContent>
    </Card>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <component
        :is="card.link ? 'NuxtLink' : 'div'"
        v-for="card in statusCards"
        :key="card.status"
        :to="card.link || undefined"
      >
        <Card
          class="h-full"
          :class="{
            'transition-colors hover:bg-muted/40': Boolean(card.link),
            'border-primary/40': card.highlight,
          }"
        >
          <CardContent class="flex items-center gap-4 p-6">
            <MarketingMvpStatusBadge :status="card.status" />
            <div>
              <p class="text-sm text-muted-foreground">
                {{ card.label }}
              </p>
              <p class="text-2xl font-semibold">
                {{ card.value }}
              </p>
            </div>
          </CardContent>
        </Card>
      </component>
    </div>

    <div
      v-if="!isClientExperience"
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Card>
        <CardContent class="p-6">
          <p class="text-sm text-muted-foreground">
            Aprovações pendentes
          </p>
          <p class="mt-1 text-2xl font-semibold">
            {{ overview.approvals_pending }}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-6">
          <p class="text-sm text-muted-foreground">
            Campanhas ativas
          </p>
          <p class="mt-1 text-2xl font-semibold">
            {{ overview.campaigns_active }}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-6">
          <p class="text-sm text-muted-foreground">
            Filas de publicação
          </p>
          <p class="mt-1 text-2xl font-semibold">
            {{ overview.publication_jobs_open }}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-6">
          <p class="text-sm text-muted-foreground">
            Datas agendadas
          </p>
          <p class="mt-1 text-2xl font-semibold">
            {{ overview.schedules_upcoming }}
          </p>
          <p class="mt-1 text-[11px] text-muted-foreground">
            Conta cada data, não o conteúdo
          </p>
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <Card class="lg:col-span-2">
        <CardHeader>
          <CardTitle>{{ isClientExperience ? 'Acesso rápido' : 'Fluxo editorial' }}</CardTitle>
          <CardDescription>
            {{ isClientExperience
              ? 'Conteúdos, calendário, relatórios e contas sociais.'
              : 'Atalhos para as etapas mais usadas pela equipe.' }}
          </CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3 sm:grid-cols-2">
          <template v-if="isClientExperience">
            <Button
              v-if="workspace.can('marketing.social.approval.client') && showClientApproveAction"
              class="h-auto justify-start p-4"
              @click="navigateTo('/marketing/approvals')"
            >
              <Icon name="lucide:badge-check" class="mr-3 h-5 w-5" />
              <span class="text-left">
                <span class="block font-medium">Aprovações</span>
                <span class="block text-xs text-muted-foreground">
                  {{ pendingApprovalCount }} peça{{ pendingApprovalCount === 1 ? '' : 's' }} aguardando você
                </span>
              </span>
            </Button>
            <Button
              v-if="canCreate"
              variant="outline"
              class="h-auto justify-start p-4"
              @click="navigateTo('/marketing/content')"
            >
              <Icon name="lucide:panels-top-left" class="mr-3 h-5 w-5" />
              <span class="text-left">
                <span class="block font-medium">Publicações</span>
                <span class="block text-xs text-muted-foreground">Crie, agende e publique conteúdo</span>
              </span>
            </Button>
            <Button variant="outline" class="h-auto justify-start p-4" @click="navigateTo('/marketing/calendar')">
              <Icon name="lucide:calendar-days" class="mr-3 h-5 w-5" />
              <span class="text-left">
                <span class="block font-medium">Calendário</span>
                <span class="block text-xs text-muted-foreground">Veja o que está agendado e no ar</span>
              </span>
            </Button>
            <Button
              v-if="canReports"
              variant="outline"
              class="h-auto justify-start p-4"
              @click="navigateTo('/marketing/reports')"
            >
              <Icon name="lucide:bar-chart-3" class="mr-3 h-5 w-5" />
              <span class="text-left">
                <span class="block font-medium">Relatórios</span>
                <span class="block text-xs text-muted-foreground">Resultados das publicações</span>
              </span>
            </Button>
            <Button
              v-if="canIntegrations"
              variant="outline"
              class="h-auto justify-start p-4"
              @click="navigateTo('/settings/integrations')"
            >
              <Icon name="lucide:plug" class="mr-3 h-5 w-5" />
              <span class="text-left">
                <span class="block font-medium">Contas sociais</span>
                <span class="block text-xs text-muted-foreground">Contas e redes conectadas</span>
              </span>
            </Button>
          </template>
          <template v-else>
            <Button variant="outline" class="h-auto justify-start p-4" @click="navigateTo('/marketing/approvals')">
              <Icon name="lucide:badge-check" class="mr-3 h-5 w-5" />
              <span class="text-left">
                <span class="block font-medium">Aprovações</span>
                <span class="block text-xs text-muted-foreground">Revise artes e solicite ajustes</span>
              </span>
            </Button>
            <Button variant="outline" class="h-auto justify-start p-4" @click="navigateTo('/marketing/calendar')">
              <Icon name="lucide:calendar-days" class="mr-3 h-5 w-5" />
              <span class="text-left">
                <span class="block font-medium">Calendário</span>
                <span class="block text-xs text-muted-foreground">Visualize a agenda editorial</span>
              </span>
            </Button>
            <Button
              variant="outline"
              class="h-auto justify-start p-4"
              @click="navigateTo('/marketing/content')"
            >
              <Icon name="lucide:file-pen-line" class="mr-3 h-5 w-5" />
              <span class="text-left">
                <span class="block font-medium">Conteúdos</span>
                <span class="block text-xs text-muted-foreground">Editor central do fluxo</span>
              </span>
            </Button>
            <Button
              variant="outline"
              class="h-auto justify-start p-4"
              @click="navigateTo('/marketing/media')"
            >
              <Icon name="lucide:images" class="mr-3 h-5 w-5" />
              <span class="text-left">
                <span class="block font-medium">Biblioteca</span>
                <span class="block text-xs text-muted-foreground">Encontre artes e vídeos</span>
              </span>
            </Button>
          </template>
        </CardContent>
      </Card>

      <Card v-if="canReports && !isClientExperience">
        <CardHeader>
          <CardTitle>Relatórios</CardTitle>
          <CardDescription>
            Indicadores operacionais e desempenho orgânico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" class="w-full" @click="navigateTo('/marketing/reports')">
            Abrir relatórios
            <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
