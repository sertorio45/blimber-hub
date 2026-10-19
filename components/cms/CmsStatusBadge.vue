<script setup lang="ts">
import type { CmsPublicStatus } from '~/lib/cms/contracts'

import { computed } from 'vue'

import { cmsStatusDisplay } from '~/composables/cms/cmsDisplay'

const props = withDefaults(defineProps<{
  status: CmsPublicStatus
  hasUnpublishedChanges?: boolean
}>(), {
  hasUnpublishedChanges: false,
})

const display = computed(() => cmsStatusDisplay(props.status, props.hasUnpublishedChanges))

const DOT_CLASS: Record<string, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  muted: 'bg-muted-foreground/50',
  neutral: 'bg-sky-500',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap border rounded-full bg-background px-2 py-0.5 text-xs text-foreground font-medium"
  >
    <span class="size-1.5 shrink-0 rounded-full" :class="DOT_CLASS[display.tone]" aria-hidden="true" />
    {{ display.label }}
  </span>
</template>
