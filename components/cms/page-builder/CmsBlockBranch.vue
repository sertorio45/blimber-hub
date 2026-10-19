<script setup lang="ts">
import type { CmsBlock } from '~/lib/cms/contracts'

import { computed } from 'vue'

import { Button } from '~/components/ui/button'
import { getBlockDefinition } from '~/lib/cms/blocks'
import { blockLabel, canAcceptChildren } from '~/lib/cms/blocks/tree'

const props = defineProps<{
  blocks: CmsBlock[]
  selectedId: string | null
  depth?: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  move: [id: string, direction: -1 | 1]
  duplicate: [id: string]
  remove: [id: string]
}>()

const depth = computed(() => props.depth ?? 1)

function label(block: CmsBlock): string {
  return blockLabel(block)
}

function icon(block: CmsBlock): string {
  return getBlockDefinition(block.type)?.icon ?? 'lucide:box'
}

function isSection(block: CmsBlock): boolean {
  return canAcceptChildren(block, depth.value) || getBlockDefinition(block.type)?.acceptsChildren === true
}
</script>

<template>
  <ul
    class="space-y-1"
    :role="depth === 1 ? 'tree' : 'group'"
  >
    <li
      v-for="(block, index) in blocks"
      :key="block.id"
      role="none"
    >
      <div
        class="group flex items-center gap-1 rounded-lg pr-1"
        :class="selectedId === block.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/70'"
        :style="{ paddingLeft: `${(depth - 1) * 12}px` }"
      >
        <button
          type="button"
          class="min-w-0 flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          role="treeitem"
          :aria-selected="selectedId === block.id"
          @click="emit('select', block.id)"
        >
          <Icon :name="icon(block)" class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="truncate">{{ label(block) }}</span>
        </button>
        <div class="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-7"
            :disabled="disabled || index === 0"
            aria-label="Mover para cima"
            @click="emit('move', block.id, -1)"
          >
            <Icon name="lucide:chevron-up" class="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-7"
            :disabled="disabled || index === blocks.length - 1"
            aria-label="Mover para baixo"
            @click="emit('move', block.id, 1)"
          >
            <Icon name="lucide:chevron-down" class="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            v-if="isSection(block)"
            type="button"
            variant="ghost"
            size="icon"
            class="size-7"
            :disabled="disabled"
            aria-label="Duplicar seção"
            @click="emit('duplicate', block.id)"
          >
            <Icon name="lucide:copy" class="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-7 text-muted-foreground hover:text-destructive"
            :disabled="disabled"
            aria-label="Remover bloco"
            @click="emit('remove', block.id)"
          >
            <Icon name="lucide:trash-2" class="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <CmsBlockBranch
        v-if="block.children?.length"
        class="mt-1"
        :blocks="block.children"
        :selected-id="selectedId"
        :depth="depth + 1"
        :disabled="disabled"
        @select="emit('select', $event)"
        @move="(id, direction) => emit('move', id, direction)"
        @duplicate="emit('duplicate', $event)"
        @remove="emit('remove', $event)"
      />
    </li>
  </ul>
</template>
