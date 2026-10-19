<script setup lang="ts">
import type { CmsBlock } from '~/lib/cms/contracts'

import CmsBlockBranch from '~/components/cms/page-builder/CmsBlockBranch.vue'
import { Button } from '~/components/ui/button'
import { siblingId } from '~/lib/cms/blocks/tree'

const props = defineProps<{
  blocks: CmsBlock[]
  selectedId: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  move: [id: string, direction: -1 | 1]
  duplicate: [id: string]
  remove: [id: string]
  add: []
}>()

function onKeydown(event: KeyboardEvent) {
  if (props.disabled || !props.selectedId)
    return
  const target = event.target as HTMLElement | null
  if (target && (target.closest('input, textarea, select, [contenteditable="true"]')))
    return
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
    return
  event.preventDefault()
  const direction = event.key === 'ArrowUp' ? -1 : 1
  if (event.altKey) {
    emit('move', props.selectedId, direction)
    return
  }
  const next = siblingId(props.blocks, props.selectedId, direction)
  if (next)
    emit('select', next)
}
</script>

<template>
  <section class="h-full flex flex-col border rounded-xl bg-card" aria-label="Estrutura da página">
    <div class="flex items-center justify-between gap-2 border-b px-3 py-2">
      <h2 class="text-sm font-medium">
        Blocos
      </h2>
      <Button type="button" size="sm" variant="outline" :disabled="disabled" @click="emit('add')">
        <Icon name="lucide:plus" class="mr-1.5 size-3.5" aria-hidden="true" />
        Adicionar
      </Button>
    </div>
    <div
      class="min-h-48 flex-1 overflow-y-auto p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      tabindex="0"
      @keydown="onKeydown"
    >
      <p v-if="!blocks.length" class="px-2 py-6 text-center text-sm text-muted-foreground">
        Nenhum bloco ainda. Comece por uma seção.
      </p>
      <CmsBlockBranch
        v-else
        :blocks="blocks"
        :selected-id="selectedId"
        :disabled="disabled"
        @select="emit('select', $event)"
        @move="(id, direction) => emit('move', id, direction)"
        @duplicate="emit('duplicate', $event)"
        @remove="emit('remove', $event)"
      />
    </div>
    <p class="border-t px-3 py-2 text-[11px] text-muted-foreground leading-snug">
      Setas selecionam o bloco vizinho. Alt + setas reordenam. No celular, use as setas de cada linha.
    </p>
  </section>
</template>
