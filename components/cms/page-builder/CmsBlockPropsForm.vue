<script setup lang="ts">
import type { CmsBlock } from '~/lib/cms/contracts'

import { computed } from 'vue'

import CmsSchemaFields from '~/components/cms/page-builder/CmsSchemaFields.vue'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
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

/** Select value for "no collection" — Radix does not accept an empty string. */
const MANUAL_COLLECTION = '__manual__'

const collectionKey = computed(() => {
  const raw = props.block?.props.collectionKey
  return typeof raw === 'string' ? raw.trim() : ''
})

const isLinkable = computed(() =>
  Boolean(props.block && LINKABLE_TYPES.has(props.block.type)),
)

const isLinked = computed(() => Boolean(isLinkable.value && collectionKey.value))

/**
 * The `collectionKey` field is rendered as a menu of this site's collections
 * (below), and manual items only exist while the block is not linked.
 */
const visibleFields = computed(() => {
  const fields = definition.value?.fields ?? []
  return fields.filter((field) => {
    if (isLinkable.value && field.key === 'collectionKey')
      return false
    if (isLinked.value && field.key === 'items')
      return false
    return true
  })
})

const collectionLimit = computed(() => {
  const raw = props.block?.props.collectionLimit
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 6
})

const sites = useCmsSites()
const collections = useCmsCollections(() => sites.currentSite.value?.id ?? null)

const collectionOptions = computed(() => {
  const options = collections.definitions.value.map(definitionItem => ({
    value: definitionItem.key,
    label: definitionItem.name,
  }))
  if (collectionKey.value && !options.some(option => option.value === collectionKey.value)) {
    options.push({ value: collectionKey.value, label: `${collectionKey.value} (não encontrada)` })
  }
  return options
})

function setCollectionKey(value: unknown) {
  if (!props.block)
    return
  const next = String(value ?? '')
  emit('update:props', {
    ...props.block.props,
    collectionKey: next === MANUAL_COLLECTION ? '' : next,
  })
}

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
        <div v-if="isLinkable" class="mb-3 space-y-2">
          <Label>Coleção vinculada</Label>
          <Select
            :model-value="collectionKey || MANUAL_COLLECTION"
            @update:model-value="setCollectionKey"
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma coleção" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="MANUAL_COLLECTION">
                Sem coleção — itens manuais
              </SelectItem>
              <SelectItem
                v-for="option in collectionOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p v-if="!collectionOptions.length" class="text-xs text-muted-foreground">
            Nenhuma coleção criada neste site ainda. Crie em CMS → Coleções para vincular.
          </p>
          <p v-else class="text-xs text-muted-foreground">
            Ao vincular, os itens vêm automaticamente dos registros publicados da coleção.
          </p>
        </div>
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
            Coleção “{{ collectionKey }}” não encontrada neste site. Escolha outra no menu acima ou selecione “Sem coleção” para voltar aos itens manuais.
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
