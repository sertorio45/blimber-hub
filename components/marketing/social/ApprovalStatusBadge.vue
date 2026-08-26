<script setup lang="ts">
import { cn } from '@/lib/utils'
import {
  approvalStatusIcon,
  approvalStatusLabel,
  approvalStatusToneClass,
} from '~/utils/marketing-approval-status'

const props = withDefaults(defineProps<{
  status: string
  overdue?: boolean
  showIcon?: boolean
  class?: string
}>(), {
  overdue: false,
  showIcon: true,
})
</script>

<template>
  <span
    :class="cn(
      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
      approvalStatusToneClass(status, overdue),
      props.class,
    )"
  >
    <Icon
      v-if="showIcon"
      :name="approvalStatusIcon(status, overdue)"
      class="h-3 w-3 shrink-0"
    />
    {{ approvalStatusLabel(status, overdue) }}
  </span>
</template>
