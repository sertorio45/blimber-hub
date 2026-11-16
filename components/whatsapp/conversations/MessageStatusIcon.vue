<script setup lang="ts">
const props = defineProps<{
  status: string
}>()

const icon = computed(() => {
  const map: Record<string, string> = {
    pending: 'i-lucide-clock',
    sent: 'i-lucide-check',
    delivered: 'i-lucide-check-check',
    read: 'i-lucide-check-check text-blue-400',
    failed: 'i-lucide-alert-circle text-destructive',
  }
  return map[props.status] || 'i-lucide-check'
})
</script>

<template>
  <span :class="icon" class="h-3 w-3" />
</template>
