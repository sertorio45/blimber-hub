<script setup lang="ts">
import {
  emptyMarketingMvpOverviewCounts,
  MARKETING_MVP_STATUS_LABELS,
  type MarketingMvpOverviewCounts,
  type MarketingMvpStatus,
} from '~/types/marketing-mvp'
import MarketingMvpStatusBadge from '~/components/marketing/MarketingMvpStatusBadge.vue'
import { useMarketingAudience } from '~/composables/marketing/useMarketingAudience'

definePageMeta({
  middleware: ['auth'],
  title: 'Marketing',
})

const { tenantId } = useTenant()
const workspace = useWorkspace()
const { isClientExperience } = useMarketingAudience()

const canCreate = computed(() => workspace.can('marketing.social.create'))
const canReports = computed(() => workspace.can('marketing.social.reports'))
const canIntegrations = computed(() => workspace.can('marketing.social.integrations'))

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

const statusCards = computed(() => {
  const byStatus = overview.value.contents_by_mvp_status
  const order: MarketingMvpStatus[] = isClientExperience.value
    ? ['agendado', 'publicado', 'erro']
    : ['rascunho', 'producao', 'aprovacao', 'agendado', 'publicado', 'erro']

  const linkFor = (status: MarketingMvpStatus) => {
    // Client portal: single "Publicações" surface is `/marketing/content`.
    if (isClientExperience.value)
      return `/marketing/content?mvp_status=${status}`

    if (status === 'aprovacao')
      return '/marketing/approvals'
    if (status === 'producao')
      return '/marketing/production'
    if (status === 'agendado' || status === 'publicado' || status === 'erro')
      return `/marketing/publishing?mvp_status=${status}`
    return `/marketing/content?mvp_status=${status}`
  }

  return order.map(status => ({
    status,
    label: MARKETING_MVP_STATUS_LABELS[status],
    value: byStatus?.[status] || 0,
    link: linkFor(status),
    highlight: (status === 'aprovacao' || status === 'erro') && (byStatus?.[status] || 0) > 0,
  }))
})
</script>

<template>
  <MarketingPageSkeleton v-if="showSkeleton" variant="dashboard" />
  <div v-else class="space-y-8">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          {{ isClientExperience ? 'Conteúdo' : 'Visão geral' }}
        </h1>
        <p class="mt-1 text-muted-foreground">
          <template v-if="isClientExperience">
            Acompanhe e publique conteúdo nas suas redes.
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

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <NuxtLink v-for="card in statusCards" :key="card.status" :to="card.link">
        <Card
          class="h-full transition-colors hover:bg-muted/40"
          :class="{ 'border-primary/40': card.highlight }"
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
      </NuxtLink>
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
              v-if="workspace.can('marketing.social.approval.client')"
              variant="outline"
              class="h-auto justify-start p-4"
              @click="navigateTo('/marketing/approvals')"
            >
              <Icon name="lucide:badge-check" class="mr-3 h-5 w-5" />
              <span class="text-left">
                <span class="block font-medium">Aprovações</span>
                <span class="block text-xs text-muted-foreground">Revise peças enviadas para você</span>
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
