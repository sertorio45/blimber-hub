<script setup lang="ts">
/**
 * Drag-and-drop editor for Marketing Report board layouts.
 */
import type {
  MarketingReportLayoutJson,
  MarketingReportLayoutProvider,
  ReportLayoutBlock,
  ReportLayoutBlockType,
} from '~/types/marketing-report-layout'

import { defineAsyncComponent } from 'vue'
import { getReportTemplate } from '~/constants/marketing-report-templates'
import {
  availableBlockTypesForProvider,
  createReportLayoutBlock,
  reportLayoutBlockLabel,
} from '~/lib/marketing/report-layout'

const Draggable = defineAsyncComponent(() => import('vuedraggable'))

const props = defineProps<{
  provider: MarketingReportLayoutProvider
  templateBaseId: string
  modelValue: MarketingReportLayoutJson
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: MarketingReportLayoutJson]
  save: []
  restore: []
  cancel: []
}>()

const template = computed(() =>
  getReportTemplate(props.provider, props.templateBaseId),
)

const metricCatalog = computed(() => template.value.metrics)

const blocks = computed({
  get: () => props.modelValue.blocks,
  set: (next: ReportLayoutBlock[]) => {
    emit('update:modelValue', {
      ...props.modelValue,
      version: 1,
      templateBaseId: props.templateBaseId,
      blocks: next,
    })
  },
})

const addableTypes = computed(() => {
  const used = new Set(blocks.value.map(b => b.type))
  // KPIs and charts can be duplicated? Prefer one of each for clarity — allow re-add if removed
  return availableBlockTypesForProvider(props.provider).filter(type => !used.has(type))
})

function patchBlock(id: string, patch: Partial<ReportLayoutBlock>) {
  blocks.value = blocks.value.map(b => (b.id === id ? { ...b, ...patch } : b))
}

function removeBlock(id: string) {
  blocks.value = blocks.value.filter(b => b.id !== id)
}

function addBlock(type: ReportLayoutBlockType) {
  const metricKeys = type === 'kpi_primary' || type === 'kpi_detail'
    ? metricCatalog.value.map(m => m.key)
    : undefined
  const block = createReportLayoutBlock(type, metricKeys)
  if (type === 'kpi_primary') {
    const primaries = metricCatalog.value.filter(m => m.primary)
    block.metricKeys = (primaries.length ? primaries.slice(0, 3) : metricCatalog.value.slice(0, 3)).map(m => m.key)
  }
  if (type === 'kpi_detail') {
    const primaries = metricCatalog.value.filter(m => m.primary)
    const primaryKeys = new Set(
      (primaries.length ? primaries.slice(0, 3) : metricCatalog.value.slice(0, 3)).map(m => m.key),
    )
    block.metricKeys = metricCatalog.value.filter(m => !primaryKeys.has(m.key)).map(m => m.key)
  }
  blocks.value = [...blocks.value, block]
}

function toggleMetric(blockId: string, key: string, checked: boolean) {
  const block = blocks.value.find(b => b.id === blockId)
  if (!block)
    return
  const current = new Set(block.metricKeys || [])
  if (checked)
    current.add(key)
  else
    current.delete(key)
  // Keep catalog order
  const ordered = metricCatalog.value.map(m => m.key).filter(k => current.has(k))
  patchBlock(blockId, { metricKeys: ordered })
}

function isMetricChecked(block: ReportLayoutBlock, key: string) {
  if (!block.metricKeys?.length)
    return true
  return block.metricKeys.includes(key)
}
</script>

<template>
  <Card class="overflow-hidden border-primary/20">
    <CardHeader class="border-b bg-muted/30">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle class="text-base font-semibold">
            Editar layout do relatório
          </CardTitle>
          <CardDescription class="mt-1">
            Arraste para reordenar. Adicione ou remova blocos e escolha as métricas dos indicadores.
            Modelo base: <span class="font-medium text-foreground">{{ template.label }}</span>
          </CardDescription>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="saving"
            @click="emit('restore')"
          >
            Restaurar padrão
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            :disabled="saving"
            @click="emit('cancel')"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            :disabled="saving || !blocks.length"
            @click="emit('save')"
          >
            <Icon
              v-if="saving"
              name="lucide:loader-2"
              class="mr-2 h-4 w-4 animate-spin"
            />
            Salvar layout
          </Button>
        </div>
      </div>
    </CardHeader>

    <CardContent class="space-y-4 p-4 sm:p-6">
      <div
        v-if="addableTypes.length"
        class="flex flex-wrap items-center gap-2"
      >
        <span class="text-xs text-muted-foreground font-medium">
          Adicionar bloco
        </span>
        <Button
          v-for="type in addableTypes"
          :key="type"
          type="button"
          size="sm"
          variant="outline"
          :disabled="saving"
          @click="addBlock(type)"
        >
          <Icon name="lucide:plus" class="mr-1.5 h-3.5 w-3.5" />
          {{ reportLayoutBlockLabel(type) }}
        </Button>
      </div>

      <Draggable
        v-model="blocks"
        item-key="id"
        handle=".layout-drag-handle"
        :disabled="saving"
        class="space-y-3"
      >
        <template #item="{ element: block }">
          <div
            class="rounded-xl border bg-card p-3 shadow-sm"
            :class="block.enabled === false ? 'opacity-60' : ''"
          >
            <div class="flex items-start gap-3">
              <button
                type="button"
                class="layout-drag-handle mt-0.5 cursor-grab touch-none rounded-md border bg-muted/40 p-1.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
                aria-label="Arrastar bloco"
                :disabled="saving"
              >
                <Icon name="lucide:grip-vertical" class="h-4 w-4" />
              </button>

              <div class="min-w-0 flex-1 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium">
                      {{ block.title || reportLayoutBlockLabel(block.type) }}
                    </p>
                    <Badge variant="secondary" class="font-normal">
                      {{ reportLayoutBlockLabel(block.type) }}
                    </Badge>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="flex items-center gap-2">
                      <Label
                        :for="`blk-en-${block.id}`"
                        class="cursor-pointer text-xs text-muted-foreground"
                      >
                        Visível
                      </Label>
                      <Switch
                        :id="`blk-en-${block.id}`"
                        :checked="block.enabled !== false"
                        :disabled="saving"
                        @update:checked="(v: boolean) => patchBlock(block.id, { enabled: v })"
                      />
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      class="h-8 w-8 text-destructive"
                      :disabled="saving || blocks.length <= 1"
                      @click="removeBlock(block.id)"
                    >
                      <Icon name="lucide:trash-2" class="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div
                  v-if="block.type === 'kpi_primary' || block.type === 'kpi_detail'"
                  class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <label
                    v-for="metric in metricCatalog"
                    :key="`${block.id}-${metric.key}`"
                    class="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 text-sm"
                  >
                    <Checkbox
                      :checked="isMetricChecked(block, metric.key)"
                      :disabled="saving"
                      @update:checked="(v: boolean) => toggleMetric(block.id, metric.key, v)"
                    />
                    <span class="min-w-0 truncate">{{ metric.label }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </template>
      </Draggable>

      <p
        v-if="!blocks.length"
        class="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
      >
        Nenhum bloco no layout. Adicione indicadores, gráficos ou tabelas.
      </p>
    </CardContent>
  </Card>
</template>
