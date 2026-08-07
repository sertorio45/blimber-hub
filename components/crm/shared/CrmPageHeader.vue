<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="min-w-0 space-y-1">
      <h1 class="text-2xl font-bold tracking-tight">
        {{ title }}
      </h1>
      <p v-if="description" class="text-sm text-muted-foreground">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
