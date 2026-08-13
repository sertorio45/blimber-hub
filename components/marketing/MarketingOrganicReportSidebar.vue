<script setup lang="ts">
import type { OrganicReportPlatform } from '~/types/marketing-organic-reports'

const props = defineProps<{
  platforms: OrganicReportPlatform[]
}>()

const model = defineModel<OrganicReportPlatform>({ required: true })

const items: Array<{
  value: OrganicReportPlatform
  label: string
  icon: string
  color?: string
}> = [
  { value: 'facebook', label: 'Facebook', icon: 'lucide:facebook', color: 'text-[#1877F2]' },
  { value: 'instagram', label: 'Instagram', icon: 'lucide:instagram', color: 'text-[#E4405F]' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'lucide:linkedin', color: 'text-[#0A66C2]' },
]

const visibleItems = computed(() => items.filter(item => props.platforms.includes(item.value)))
</script>

<template>
  <nav
    class="flex w-full shrink-0 justify-center md:w-auto md:justify-start"
    aria-label="Selecionar rede social"
  >
    <div
      class="flex flex-col items-center gap-3 rounded-[2rem] border border-border bg-card px-2.5 py-4 shadow-md"
    >
      <Button
        v-for="item in visibleItems"
        :key="item.value"
        type="button"
        variant="ghost"
        size="icon"
        class="relative h-12 w-12 shrink-0 rounded-xl text-foreground"
        :class="
          model === item.value
            ? 'bg-muted shadow-sm ring-1 ring-border'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        "
        :aria-pressed="model === item.value"
        :aria-label="item.label"
        :title="item.label"
        @click="model = item.value"
      >
        <span class="flex h-9 w-9 items-center justify-center" :class="item.color">
          <Icon :name="item.icon" class="h-7 w-7" />
        </span>
      </Button>
    </div>
  </nav>
</template>
