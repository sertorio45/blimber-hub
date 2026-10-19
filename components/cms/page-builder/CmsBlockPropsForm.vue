<script setup lang="ts">
import type { CmsBlock } from '~/lib/cms/contracts'

import { computed } from 'vue'

import CmsSchemaFields from '~/components/cms/page-builder/CmsSchemaFields.vue'
import { defaultListItem, getBlockDefinition } from '~/lib/cms/blocks'

const props = defineProps<{
  block: CmsBlock | null
}>()

const emit = defineEmits<{
  'update:props': [props: Record<string, unknown>]
}>()

const definition = computed(() => props.block ? getBlockDefinition(props.block.type) : undefined)

function createItem(key: string): Record<string, unknown> {
  if (!definition.value)
    return {}
  return defaultListItem(definition.value.propsSchema, key)
}
</script>

<template>
  <section class="border rounded-xl bg-card" aria-label="Propriedades do bloco">
    <div class="border-b px-3 py-2">
      <h2 class="text-sm font-medium">
        Propriedades
      </h2>
      <p v-if="definition" class="text-xs text-muted-foreground">
        {{ definition.label }}
      </p>
    </div>
    <div class="max-h-[70vh] overflow-y-auto p-3 lg:max-h-[calc(100vh-16rem)]">
      <p v-if="!block" class="py-8 text-center text-sm text-muted-foreground">
        Selecione um bloco para editar.
      </p>
      <p v-else-if="!definition" class="py-8 text-center text-sm text-destructive">
        Este bloco não faz parte do catálogo.
      </p>
      <CmsSchemaFields
        v-else
        :key="block.id"
        :fields="definition.fields"
        :model-value="block.props"
        :create-item="createItem"
        @update:model-value="emit('update:props', $event)"
      />
    </div>
  </section>
</template>
