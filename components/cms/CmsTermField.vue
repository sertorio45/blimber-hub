<script setup lang="ts">
import type { CmsTaxonomyKind } from '~/lib/cms/contracts'

import { computed, ref } from 'vue'

import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { normalizeCmsError } from '~/composables/cms/cmsErrors'
import { useCmsTaxonomies } from '~/composables/cms/useCmsTaxonomies'

const props = withDefaults(defineProps<{
  modelValue: string[]
  siteId: string
  kind: CmsTaxonomyKind
  label: string
  disabled?: boolean
  error?: string | null
}>(), {
  disabled: false,
  error: null,
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const catalog = useCmsTaxonomies(() => props.siteId)
const open = ref(false)
const draftName = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)
const filter = ref('')

const options = computed(() => catalog.termsOf(props.kind))
const visible = computed(() => {
  const query = filter.value.trim().toLocaleLowerCase('pt-BR')
  if (!query)
    return options.value
  return options.value.filter(term => term.name.toLocaleLowerCase('pt-BR').includes(query))
})
const selected = computed(() => options.value.filter(term => props.modelValue.includes(term.id)))
const placeholder = computed(() => props.kind === 'category' ? 'Nova categoria' : 'Nova tag')

function toggle(id: string, checked: boolean) {
  const next = new Set(props.modelValue)
  if (checked)
    next.add(id)
  else
    next.delete(id)
  emit('update:modelValue', [...next])
}

function remove(id: string) {
  emit('update:modelValue', props.modelValue.filter(item => item !== id))
}

async function createTerm() {
  const name = draftName.value.trim()
  if (!name || creating.value)
    return
  creating.value = true
  createError.value = null
  try {
    const term = await catalog.createTerm({ kind: props.kind, name })
    if (!props.modelValue.includes(term.id))
      emit('update:modelValue', [...props.modelValue, term.id])
    draftName.value = ''
  }
  catch (error: unknown) {
    createError.value = normalizeCmsError(error).message
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <Label>{{ label }}</Label>

    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          type="button"
          variant="outline"
          class="w-full justify-between font-normal"
          :disabled="disabled"
          :aria-invalid="Boolean(error)"
        >
          <span class="truncate text-muted-foreground">
            {{ selected.length ? `${selected.length} selecionada${selected.length === 1 ? '' : 's'}` : `Escolher ${label.toLocaleLowerCase('pt-BR')}` }}
          </span>
          <Icon name="lucide:chevrons-up-down" class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-72 p-3" align="start">
        <div class="space-y-3">
          <Input v-model="filter" :placeholder="`Buscar ${label.toLocaleLowerCase('pt-BR')}`" :aria-label="`Buscar ${label}`" />

          <p v-if="catalog.showSkeleton.value" class="text-xs text-muted-foreground">
            Carregando…
          </p>
          <p v-else-if="!visible.length" class="text-xs text-muted-foreground">
            Nenhuma opção ainda.
          </p>
          <ul v-else class="max-h-48 overflow-y-auto space-y-1">
            <li v-for="term in visible" :key="term.id">
              <label class="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/60">
                <Checkbox
                  :checked="modelValue.includes(term.id)"
                  @update:checked="value => toggle(term.id, value === true)"
                />
                <span class="truncate">{{ term.name }}</span>
              </label>
            </li>
          </ul>

          <form class="flex gap-2" @submit.prevent="createTerm">
            <Input v-model="draftName" :placeholder="placeholder" maxlength="160" :aria-label="placeholder" />
            <Button type="submit" size="sm" :disabled="creating || !draftName.trim()">
              Adicionar
            </Button>
          </form>
          <p v-if="createError" class="text-xs text-destructive" role="alert">
            {{ createError }}
          </p>
        </div>
      </PopoverContent>
    </Popover>

    <div v-if="selected.length" class="flex flex-wrap gap-1.5">
      <Badge v-for="term in selected" :key="term.id" variant="secondary" class="gap-1 font-normal">
        {{ term.name }}
        <button
          type="button"
          class="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :disabled="disabled"
          :aria-label="`Remover ${term.name}`"
          @click="remove(term.id)"
        >
          <Icon name="lucide:x" class="size-3" aria-hidden="true" />
        </button>
      </Badge>
    </div>

    <p v-if="catalog.loadError.value" class="text-xs text-destructive" role="alert">
      {{ catalog.loadError.value.message }}
    </p>
    <p v-if="error" class="text-xs text-destructive">
      {{ error }}
    </p>
  </div>
</template>
