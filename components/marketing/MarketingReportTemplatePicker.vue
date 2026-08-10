<script setup lang="ts">
import type { MarketingReportPlatform } from '~/types/marketing-reports'
import {
  getReportTemplate,
  templatesForPlatform,
} from '~/constants/marketing-report-templates'

const props = defineProps<{
  platform: MarketingReportPlatform
}>()

const model = defineModel<string>({ required: true })

const templates = computed(() => templatesForPlatform(props.platform))

const selected = computed(() => getReportTemplate(props.platform, model.value))

watch(
  () => props.platform,
  () => {
    const list = templatesForPlatform(props.platform)
    if (!list.some(t => t.id === model.value))
      model.value = list[0]?.id || 'overview'
  },
)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">
      Modelo de relatório
    </Label>
    <Select v-model="model">
      <SelectTrigger class="w-full min-w-[200px] sm:w-[260px]">
        <SelectValue :placeholder="selected.label" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="t in templates"
          :key="t.id"
          :value="t.id"
        >
          {{ t.label }}
        </SelectItem>
      </SelectContent>
    </Select>
    <p class="max-w-md text-xs text-muted-foreground">
      {{ selected.description }}
    </p>
  </div>
</template>
