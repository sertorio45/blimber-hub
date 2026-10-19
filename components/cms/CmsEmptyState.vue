<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string
  title: string
  description?: string
  tone?: 'default' | 'error'
}>(), {
  icon: 'lucide:inbox',
  description: '',
  tone: 'default',
})
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-3 border rounded-xl border-dashed px-6 py-12 text-center"
    :role="tone === 'error' ? 'alert' : undefined"
  >
    <div
      class="size-10 flex items-center justify-center rounded-full"
      :class="tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'"
    >
      <Icon :name="icon" class="size-5" aria-hidden="true" />
    </div>
    <div class="max-w-md space-y-1">
      <p class="text-sm font-medium">
        {{ title }}
      </p>
      <p v-if="description" class="text-sm text-muted-foreground">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.default" class="flex flex-wrap items-center justify-center gap-2 pt-1">
      <slot />
    </div>
  </div>
</template>
