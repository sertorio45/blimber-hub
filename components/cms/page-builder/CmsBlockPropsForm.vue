<script setup lang="ts">
import type { CmsBlock } from '~/lib/cms/contracts'

import { computed } from 'vue'

import CmsSchemaFields from '~/components/cms/page-builder/CmsSchemaFields.vue'
import { cmsEntryLabel } from '~/composables/cms/cmsDisplay'
import { useCmsCollectionEntries, useCmsCollections } from '~/composables/cms/useCmsCollections'
import { useCmsSites } from '~/composables/cms/useCmsSites'
import { defaultListItem, getBlockDefinition } from '~/lib/cms/blocks'

const props = defineProps<{
  block: CmsBlock | null
}>()

const emit = defineEmits<{
  'update:props': [props: Record<string, unknown>]
}>()

const definition = computed(() => props.block ? getBlockDefinition(props.block.type) : undefined)

/** Block types whose items can come from a collection instead of manual copies. */
const LINKABLE_TYPES = new Set(['testimonials', 'cards', 'faq'])

const collectionKey = computed(() => {
  const raw = props.block?.props.collectionKey
  return typeof raw === 'string' ? raw.trim() : ''
})

const isLinked = computed(() =>
  Boolean(props.block && LINKABLE_TYPES.has(props.block.type) && collectionKey.value),
)

/** Manual items only exist while the block is not linked to a collection. */
const visibleFields = computed(() => {
  const fields = definition.value?.fields ?? []
  return isLinked.value ? fields.filter(field => field.key !== 'items') : fields
})

const collectionLimit = computed(() => {
  const raw = props.block?.props.collectionLimit
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 6
})

const sites = useCmsSites()
const collections = useCmsCollections(() => sites.currentSite.value?.id ?? null)
const linkedDefinition = computed(() =>
  isLinked.value
    ? collections.definitions.value.find(item => item.key === collectionKey.value) ?? null
    : null,
)
const linkedEntriesState = useCmsCollectionEntries(() => linkedDefinition.value?.id ?? null)
const linkedEntries = computed(() =>
  linkedDefinition.value
    ? linkedEntriesState.entries.value
        .filter(entry => entry.status === 'published')
        .slice(0, collectionLimit.value)
        .map(entry => cmsEntryLabel(linkedDefinition.value!, entry))
    : [],
)

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
      <template v-else>
        <div
          v-if="isLinked"
          class="mb-3 border border-primary/30 rounded-lg bg-primary/5 p-3 text-xs leading-relaxed"
          role="note"
        >
          <p class="text-foreground font-medium">
            Itens automáticos da coleção “{{ collectionKey }}”
          </p>
          <p class="mt-1 text-muted-foreground">
            Este bloco não guarda cópias: o site mostra os registros publicados da coleção.
            Para adicionar ou editar itens, use CMS → Coleções.
          </p>
          <ul v-if="linkedEntries.length" class="mt-2 list-disc pl-4 text-muted-foreground space-y-0.5">
            <li v-for="label in linkedEntries" :key="label">
              {{ label }}
            </li>
          </ul>
          <p v-else-if="linkedDefinition" class="mt-2 text-muted-foreground">
            Nenhum registro publicado nesta coleção ainda.
          </p>
          <p v-else class="mt-2 text-destructive">
            Coleção “{{ collectionKey }}” não encontrada neste site. Confira a chave ou limpe o campo para voltar aos itens manuais.
          </p>
        </div>
        <CmsSchemaFields
          :key="block.id"
          :fields="visibleFields"
          :model-value="block.props"
          :create-item="createItem"
          @update:model-value="emit('update:props', $event)"
        />
      </template>
    </div>
  </section>
</template>
