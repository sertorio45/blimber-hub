<script setup lang="ts">
import type { CmsBlockCategory } from '~/lib/cms/blocks'

import { computed } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import {
  CMS_BLOCK_CATEGORY_LABELS,
  listBlockDefinitions,
} from '~/lib/cms/blocks'

defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  choose: [type: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const groups = computed(() => {
  const order: CmsBlockCategory[] = ['layout', 'content', 'conversion', 'dynamic']
  return order.map(category => ({
    category,
    label: CMS_BLOCK_CATEGORY_LABELS[category],
    blocks: listBlockDefinitions().filter(definition => definition.category === category),
  })).filter(group => group.blocks.length)
})

function choose(type: string) {
  emit('choose', type)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Adicionar bloco</DialogTitle>
        <DialogDescription>
          O bloco entra na seção selecionada. Se nenhum container estiver selecionado, ele vai para o fim da página.
        </DialogDescription>
      </DialogHeader>
      <div class="space-y-5">
        <section v-for="group in groups" :key="group.category" class="space-y-2">
          <h3 class="text-xs text-muted-foreground font-medium tracking-wide uppercase">
            {{ group.label }}
          </h3>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="definition in group.blocks"
              :key="definition.id"
              type="button"
              class="flex items-start gap-3 border rounded-lg p-3 text-left transition-colors disabled:cursor-not-allowed hover:bg-muted/50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :disabled="disabled"
              @click="choose(definition.id)"
            >
              <span class="size-8 flex shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon :name="definition.icon" class="size-4" aria-hidden="true" />
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-medium">{{ definition.label }}</span>
                <span class="mt-0.5 block text-xs text-muted-foreground">{{ definition.description }}</span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
