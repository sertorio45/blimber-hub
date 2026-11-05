<script setup lang="ts">
import { useWorkspace } from '~/composables/useWorkspace'

definePageMeta({
  middleware: ['auth'],
  title: 'Métricas operacionais',
})

const social = useMarketingSocial()
const { can } = useWorkspace()

const canRead = computed(() => can('marketing.social.ops_metrics.read'))

const to = ref(new Date().toISOString().slice(0, 10))
const from = ref(new Date(Date.now() - 30 * 24 * 3600_000).toISOString().slice(0, 10))

const { data, showSkeleton, refresh } = useMarketingFetch({
  key: () => `ops-metrics-${social.tenantId.value}-${from.value}-${to.value}`,
  handler: () => social.getOpsMetrics({
    from: `${from.value}T00:00:00.000Z`,
    to: `${to.value}T23:59:59.999Z`,
  }),
  default: () => null as any,
  watch: [social.tenantId, from, to, canRead],
  enabled: () => Boolean(social.tenantId.value) && canRead.value,
})

const metrics = computed(() => data.value)

const cards = computed(() => {
  const m = metrics.value
  if (!m)
    return []
  return [
    { label: 'Criados', value: m.totals.created },
    { label: 'Publicados', value: m.totals.published },
    { label: 'Atrasados', value: m.totals.overdue },
    { label: 'Falhas de publicação', value: m.totals.failed },
    { label: 'Alterações solicitadas', value: m.totals.changesRequested },
    { label: 'Tarefas atrasadas', value: m.totals.overdueTasks },
    { label: 'Ciclo médio (h)', value: m.averages.productionCycleHours ?? '—' },
    { label: 'Versões / post', value: m.averages.versionsPerPost ?? '—' },
    { label: '1ª versão aprovada (%)', value: m.averages.firstVersionApprovalRate ?? '—' },
    { label: 'Entregues no prazo', value: m.deliveredOnTime },
  ]
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">
        Métricas operacionais
      </h1>
      <p class="mt-1 text-muted-foreground">
        Ciclo de produção, retrabalho, carga da equipe e consumo do pacote.
      </p>
    </div>

    <Card v-if="!canRead">
      <CardContent class="p-6 text-sm text-muted-foreground">
        Você não tem permissão para ver métricas operacionais.
      </CardContent>
    </Card>

    <template v-else>
      <Card>
        <CardContent class="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <BaseDatePicker v-model="from" label="De" placeholder="Data inicial" class="flex-1" />
          <BaseDatePicker v-model="to" label="Até" placeholder="Data final" class="flex-1" />
          <Button variant="outline" @click="refresh()">
            Atualizar
          </Button>
        </CardContent>
      </Card>

      <MarketingPageSkeleton v-if="showSkeleton" variant="reports" />

      <template v-else>
        <div class="grid gap-3 lg:grid-cols-5 sm:grid-cols-2">
          <Card v-for="card in cards" :key="card.label">
            <CardContent class="p-4">
              <p class="text-xs text-muted-foreground">
                {{ card.label }}
              </p>
              <p class="mt-2 text-2xl font-semibold tracking-tight">
                {{ card.value }}
              </p>
            </CardContent>
          </Card>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Carga da equipe</CardTitle>
              <CardDescription>Tarefas abertas por responsável</CardDescription>
            </CardHeader>
            <CardContent class="space-y-2">
              <div
                v-for="row in metrics?.teamLoad || []"
                :key="row.userId"
                class="flex items-center justify-between border rounded-lg px-3 py-2 text-sm"
              >
                <span class="text-xs text-muted-foreground font-mono">{{ row.userId.slice(0, 8) }}…</span>
                <Badge variant="secondary">
                  {{ row.openTasks }} tarefa(s)
                </Badge>
              </div>
              <p v-if="!(metrics?.teamLoad || []).length" class="text-sm text-muted-foreground">
                Nenhuma tarefa aberta no período.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pacote ativo</CardTitle>
              <CardDescription>Contratado versus entregue</CardDescription>
            </CardHeader>
            <CardContent v-if="metrics?.packageUsage" class="text-sm space-y-3">
              <div class="flex justify-between border-b py-2">
                <span>Posts</span>
                <span>{{ metrics.packageUsage.posts.produced }}/{{ metrics.packageUsage.posts.contracted }}</span>
              </div>
              <div class="flex justify-between border-b py-2">
                <span>Reels</span>
                <span>{{ metrics.packageUsage.reels.produced }}/{{ metrics.packageUsage.reels.contracted }}</span>
              </div>
              <div class="flex justify-between border-b py-2">
                <span>Stories</span>
                <span>{{ metrics.packageUsage.stories.produced }}/{{ metrics.packageUsage.stories.contracted }}</span>
              </div>
              <div class="flex justify-between py-2">
                <span>Campanhas</span>
                <span>{{ metrics.packageUsage.campaigns.produced }}/{{ metrics.packageUsage.campaigns.contracted }}</span>
              </div>
              <Badge v-if="metrics.packageUsage.overQuota" variant="destructive">
                Acima da cota
              </Badge>
            </CardContent>
            <CardContent v-else class="text-sm text-muted-foreground">
              Nenhum pacote ativo neste cliente.
            </CardContent>
          </Card>
        </div>
      </template>
    </template>
  </div>
</template>
