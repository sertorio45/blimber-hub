<script setup lang="ts">
/**
 * Shared Relatórios chrome: title, client, period, tab subnav.
 * Query `range` (and custom dates) is kept when switching tabs.
 */
import { DateRangePicker } from '@/components/ui/date-range-picker'
import {
  MARKETING_REPORT_TABS,
  resolveMarketingReportTab,
  withReportsRangeQuery,
} from '~/lib/marketing/reports-hub'

const route = useRoute()
const { currentTenant } = useTenant()
const { datePreset, dateStart, dateEnd } = useMarketingReportsRange()

const tenantLabel = computed(() => currentTenant.value?.name?.trim() || null)
const activeTab = computed(() => resolveMarketingReportTab(route.path))

function tabLocation(path: string) {
  return withReportsRangeQuery(path, route.query)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold tracking-tight">
          Relatórios
        </h1>
        <p class="max-w-2xl text-muted-foreground">
          {{ activeTab.description }}
        </p>
        <p class="text-xs text-muted-foreground">
          <template v-if="tenantLabel">
            Cliente ativo: {{ tenantLabel }}
          </template>
          <template v-else>
            Selecione um cliente no workspace para carregar os relatórios.
          </template>
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Label class="whitespace-nowrap text-xs text-muted-foreground">
          Período
        </Label>
        <Select v-model="datePreset">
          <SelectTrigger class="w-[180px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">
              Hoje
            </SelectItem>
            <SelectItem value="yesterday">
              Ontem
            </SelectItem>
            <SelectItem value="last_7d">
              Últimos 7 dias
            </SelectItem>
            <SelectItem value="last_14d">
              Últimos 14 dias
            </SelectItem>
            <SelectItem value="last_30d">
              Últimos 30 dias
            </SelectItem>
            <SelectItem value="last_90d">
              Últimos 90 dias
            </SelectItem>
            <SelectItem
              v-if="activeTab.id !== 'social'"
              value="all"
            >
              Todo período
            </SelectItem>
            <SelectItem value="custom">
              Período personalizado
            </SelectItem>
          </SelectContent>
        </Select>
        <DateRangePicker
          v-if="datePreset === 'custom'"
          v-model:start="dateStart"
          v-model:end="dateEnd"
          class="shrink-0"
        />
      </div>
    </div>

    <nav
      class="flex gap-1 overflow-x-auto px-1 pb-1 -mx-1"
      aria-label="Tipos de relatório"
    >
      <NuxtLink
        v-for="tab in MARKETING_REPORT_TABS"
        :key="tab.id"
        :to="tabLocation(tab.path)"
        class="shrink-0 border rounded-full px-3 py-1.5 text-sm transition-colors"
        :class="activeTab.id === tab.id
          ? 'border-foreground/20 bg-foreground text-background'
          : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
      >
        {{ tab.title }}
      </NuxtLink>
    </nav>

    <NuxtPage />
  </div>
</template>
