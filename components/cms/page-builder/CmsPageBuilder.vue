<script setup lang="ts">
import type { CmsBlock } from '~/lib/cms/contracts'

import { computed, ref, watch } from 'vue'

import CmsAddBlockDialog from '~/components/cms/page-builder/CmsAddBlockDialog.vue'
import CmsBlockPreview from '~/components/cms/page-builder/CmsBlockPreview.vue'
import CmsBlockPropsForm from '~/components/cms/page-builder/CmsBlockPropsForm.vue'
import CmsBlockTree from '~/components/cms/page-builder/CmsBlockTree.vue'
import {
  canAcceptChildren,
  countBlocks,
  createBlock,
  duplicateSection,
  findBlock,
  insertBlock,
  insertionTarget,
  moveBlock,
  removeBlock,
  updateBlockProps,
} from '~/lib/cms/blocks'
import { CMS_LIMITS } from '~/lib/cms/contracts'

const props = defineProps<{
  disabled?: boolean
}>()

const blocks = defineModel<CmsBlock[]>({ required: true })

const selectedId = ref<string | null>(null)
const addOpen = ref(false)
const notice = ref<string | null>(null)

const selected = computed(() =>
  selectedId.value ? findBlock(blocks.value, selectedId.value)?.block ?? null : null,
)

watch(blocks, (next) => {
  if (selectedId.value && !findBlock(next, selectedId.value))
    selectedId.value = next[0]?.id ?? null
}, { deep: true })

function select(id: string) {
  selectedId.value = id
  notice.value = null
}

function move(id: string, direction: -1 | 1) {
  blocks.value = moveBlock(blocks.value, id, direction)
}

function duplicate(id: string) {
  const before = countBlocks(blocks.value)
  const next = duplicateSection(blocks.value, id)
  if (countBlocks(next) > CMS_LIMITS.maxBlocksPerDocument) {
    notice.value = 'Não há espaço para duplicar esta seção.'
    return
  }
  if (countBlocks(next) === before)
    return
  blocks.value = next
  const copy = findBlock(next, id)
  const sibling = copy?.siblings[copy.index + 1]
  if (sibling)
    selectedId.value = sibling.id
}

function remove(id: string) {
  const found = findBlock(blocks.value, id)
  const fallback = found?.siblings[found.index - 1]?.id ?? found?.siblings[found.index + 1]?.id ?? found?.parent?.id ?? null
  blocks.value = removeBlock(blocks.value, id)
  selectedId.value = fallback
}

function add(type: string) {
  if (props.disabled)
    return
  if (countBlocks(blocks.value) >= CMS_LIMITS.maxBlocksPerDocument) {
    notice.value = 'Esta página já atingiu o limite de blocos.'
    return
  }
  const target = insertionTarget(blocks.value, selectedId.value)
  if (target.parentId) {
    const parent = findBlock(blocks.value, target.parentId)
    if (!parent || !canAcceptChildren(parent.block, parent.depth)) {
      notice.value = 'Esta seção não aceita mais blocos dentro dela.'
      return
    }
  }
  const block = createBlock(type)
  blocks.value = insertBlock(blocks.value, block, target.parentId, target.index)
  selectedId.value = block.id
  notice.value = null
}

function updateProps(next: Record<string, unknown>) {
  if (!selectedId.value)
    return
  blocks.value = updateBlockProps(blocks.value, selectedId.value, next)
}
</script>

<template>
  <div class="space-y-3">
    <p v-if="notice" class="text-sm text-destructive" role="alert">
      {{ notice }}
    </p>
    <div class="flex flex-col gap-4 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)_18rem] lg:items-start">
      <CmsBlockTree
        class="order-1 lg:sticky lg:top-4"
        :blocks="blocks"
        :selected-id="selectedId"
        :disabled="disabled"
        @select="select"
        @move="move"
        @duplicate="duplicate"
        @remove="remove"
        @add="addOpen = true"
      />
      <div class="order-2 min-w-0 border rounded-xl bg-muted/30 p-3 lg:min-h-[36rem] lg:p-4">
        <p class="mb-3 text-xs text-muted-foreground">
          Pré-visualização
        </p>
        <p v-if="!blocks.length" class="border rounded-xl border-dashed py-16 text-center text-sm text-muted-foreground">
          A página ainda não tem blocos.
        </p>
        <CmsBlockPreview
          v-else
          :blocks="blocks"
          :selected-id="selectedId"
          @select="select"
        />
      </div>
      <CmsBlockPropsForm
        class="order-3 lg:sticky lg:top-4"
        :block="selected"
        @update:props="updateProps"
      />
    </div>
    <CmsAddBlockDialog v-model:open="addOpen" :disabled="disabled" @choose="add" />
  </div>
</template>
