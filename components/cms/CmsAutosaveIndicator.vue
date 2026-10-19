<script setup lang="ts">
import type { CmsAutosaveState } from '~/composables/cms/useCmsAutosave'

import { useNow } from '@vueuse/core'
import { computed } from 'vue'

import { formatCmsRelative } from '~/composables/cms/cmsDisplay'

const props = defineProps<{
  state: CmsAutosaveState
  isDirty: boolean
  lastSavedAt: number | null
  errorMessage?: string | null
}>()

const emit = defineEmits<{ retry: [] }>()

const now = useNow({ interval: 30_000 })

const label = computed(() => {
  switch (props.state) {
    case 'saving':
      return 'Salvando…'
    case 'saved':
      return props.lastSavedAt ? `Salvo ${formatCmsRelative(new Date(props.lastSavedAt), now.value.getTime())}` : 'Salvo'
    case 'error':
      return 'Falha ao salvar'
    case 'conflict':
      return 'Conflito de versão'
    default:
      return props.isDirty ? 'Alterações não salvas' : ''
  }
})

const icon = computed(() => {
  switch (props.state) {
    case 'saving':
      return 'lucide:loader-circle'
    case 'saved':
      return 'lucide:check'
    case 'error':
      return 'lucide:cloud-alert'
    case 'conflict':
      return 'lucide:git-compare'
    default:
      return props.isDirty ? 'lucide:pencil-line' : ''
  }
})
</script>

<template>
  <div
    class="min-h-6 flex items-center gap-1.5 text-xs"
    :class="state === 'error' || state === 'conflict' ? 'text-destructive' : 'text-muted-foreground'"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <Icon
      v-if="icon"
      :name="icon"
      class="size-3.5 shrink-0"
      :class="{ 'animate-spin': state === 'saving' }"
      aria-hidden="true"
    />
    <span :title="state === 'error' ? errorMessage ?? undefined : undefined">{{ label }}</span>
    <template v-if="state === 'error'">
      <span aria-hidden="true">—</span>
      <button
        type="button"
        class="rounded-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="emit('retry')"
      >
        Tentar novamente
      </button>
    </template>
  </div>
</template>
