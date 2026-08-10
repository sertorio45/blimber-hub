<script setup lang="ts">
defineProps<{
  count: number
  onDelete: () => void
}>()
</script>

<template>
  <div
    class="fixed bottom-6 left-1/2 z-30 flex transform animate-in items-center gap-4 rounded-lg bg-primary px-4 py-3 text-primary-foreground shadow-lg duration-200 fade-in-0 zoom-in-95 slide-in-from-bottom-5 -translate-x-1/2"
  >
    <div class="flex items-center gap-2">
      <div class="h-7 w-7 flex items-center justify-center rounded-full bg-primary-foreground/20 text-sm font-medium">
        {{ count }}
      </div>
      <span class="text-sm font-medium">itens selecionados</span>
    </div>
    <div class="flex gap-2">
      <slot name="actions" />
      <Button variant="destructive" size="sm" @click="onDelete">
        <Icon name="lucide:trash-2" class="mr-2 h-4 w-4" />
        Excluir selecionados
      </Button>
    </div>
  </div>
</template>
