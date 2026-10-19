<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'

import { cmsSlugDraft, cmsSlugify } from '~/composables/cms/cmsDisplay'
import { CMS_LIMITS } from '~/lib/cms/contracts'

const props = withDefaults(defineProps<{
  modelValue: string
  /** Text the slug is suggested from (usually the title). */
  source?: string
  /** Keep following `source` until the user edits the slug by hand. */
  auto?: boolean
  /** Path before the slug, e.g. `/` or `/noticias/`. */
  prefix?: string
  /** Already published: editing requires an explicit "Alterar endereço". */
  locked?: boolean
  label?: string
  error?: string | null
  disabled?: boolean
}>(), {
  source: '',
  auto: true,
  prefix: '/',
  locked: false,
  label: 'Endereço',
  error: null,
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const inputId = useId()
const hintId = `${inputId}-hint`
const errorId = `${inputId}-error`

const touched = ref(false)
const unlocked = ref(false)

const isReadonly = computed(() => props.disabled || (props.locked && !unlocked.value))

watch(() => props.source, (value) => {
  if (props.auto && !touched.value && !props.locked)
    emit('update:modelValue', cmsSlugify(value ?? ''))
}, { immediate: props.auto && !props.modelValue })

watch(() => props.locked, (locked) => {
  if (!locked)
    unlocked.value = false
})

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  touched.value = raw.length > 0
  emit('update:modelValue', raw ? cmsSlugDraft(raw) : cmsSlugify(props.auto ? props.source : ''))
}

function onBlur() {
  const clean = cmsSlugify(props.modelValue)
  if (clean !== props.modelValue)
    emit('update:modelValue', clean)
}

const describedBy = computed(() => [props.error ? errorId : null, hintId].filter(Boolean).join(' '))
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-center justify-between gap-2">
      <Label :for="inputId">{{ label }}</Label>
      <Button
        v-if="locked && !unlocked && !disabled"
        type="button"
        variant="link"
        size="sm"
        class="h-auto p-0 text-xs"
        @click="unlocked = true"
      >
        Alterar endereço
      </Button>
    </div>
    <div
      class="flex items-center border rounded-md bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring"
      :class="[error ? 'border-destructive' : 'border-input', isReadonly ? 'bg-muted/40' : '']"
    >
      <span class="max-w-[45%] select-none truncate pl-3 text-sm text-muted-foreground" aria-hidden="true">{{ prefix }}</span>
      <input
        :id="inputId"
        :value="modelValue"
        :readonly="isReadonly"
        :maxlength="CMS_LIMITS.maxSlugLength"
        :aria-invalid="Boolean(error) || undefined"
        :aria-describedby="describedBy"
        autocomplete="off"
        spellcheck="false"
        inputmode="url"
        placeholder="endereco-da-pagina"
        class="h-9 min-w-0 flex-1 bg-transparent py-1 pr-3 text-sm outline-none read-only:cursor-default read-only:text-muted-foreground"
        @input="onInput"
        @blur="onBlur"
      >
      <Icon v-if="isReadonly && locked" name="lucide:lock" class="mr-3 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </div>
    <p v-if="error" :id="errorId" class="text-xs text-destructive">
      {{ error }}
    </p>
    <p :id="hintId" class="text-xs text-muted-foreground">
      <template v-if="locked && !unlocked">
        Este endereço já está no ar. Para evitar links quebrados, ele só muda se você pedir.
      </template>
      <template v-else-if="locked && unlocked">
        Ao publicar, o endereço antigo deixa de funcionar. Atualize links que apontam para ele.
      </template>
      <template v-else>
        Use letras minúsculas, números e hífens.
      </template>
    </p>
  </div>
</template>
