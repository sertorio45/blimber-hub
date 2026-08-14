<script setup lang="ts">
import GoogleAdsBrandIcon from '@/components/brand/GoogleAdsBrandIcon.vue'
import GoogleAnalyticsBrandIcon from '@/components/brand/GoogleAnalyticsBrandIcon.vue'
import MetaBrandIcon from '@/components/brand/MetaBrandIcon.vue'

export type MarketingReportSource = 'google_analytics' | 'google_ads' | 'meta'

const props = defineProps<{
  sources?: MarketingReportSource[] | null
}>()

const ALL_ITEMS: Array<{
  value: MarketingReportSource
  label: string
}> = [
  { value: 'meta', label: 'Meta' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'google_analytics', label: 'Google Analytics' },
]

const model = defineModel<MarketingReportSource>({ required: true })

const items = computed(() => {
  if (!props.sources?.length)
    return ALL_ITEMS
  return ALL_ITEMS.filter(item => props.sources!.includes(item.value))
})
</script>

<template>
  <nav
    class="w-full flex shrink-0 justify-center md:w-auto md:justify-start"
    aria-label="Selecionar plataforma de relatório"
  >
    <div
      class="flex flex-col items-center gap-3 border border-border rounded-[2rem] bg-card px-2.5 py-4 shadow-md"
    >
      <Button
        v-for="item in items"
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
        <span class="h-9 w-9 flex items-center justify-center">
          <GoogleAnalyticsBrandIcon v-if="item.value === 'google_analytics'" size="lg" />
          <GoogleAdsBrandIcon v-else-if="item.value === 'google_ads'" size="lg" />
          <span v-else class="h-9 w-9 flex items-center justify-center text-[#0866FF]">
            <MetaBrandIcon size="lg" />
          </span>
        </span>
      </Button>
    </div>
  </nav>
</template>
