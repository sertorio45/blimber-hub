<script setup lang="ts">
const props = defineProps<{
  modelValue: string[]
  label: string
  hint?: string
  placeholder?: string
  disabled?: boolean
  separatorHint?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const draft = ref('')

function addItems() {
  if (props.disabled)
    return
  const parts = draft.value
    .split(/,|\n/)
    .map(item => item.trim())
    .filter(Boolean)
  if (!parts.length)
    return
  const next = [...props.modelValue]
  for (const part of parts) {
    if (!next.includes(part))
      next.push(part)
  }
  emit('update:modelValue', next)
  draft.value = ''
}

function removeAt(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}
</script>

<template>
  <div class="space-y-2">
    <Label>{{ label }}</Label>
    <p
      v-if="hint"
      class="text-xs text-muted-foreground"
    >
      {{ hint }}
    </p>
    <div
      v-if="modelValue.length"
      class="flex flex-wrap gap-2"
    >
      <Badge
        v-for="(item, index) in modelValue"
        :key="`${item}-${index}`"
        variant="secondary"
        class="gap-1 pr-1"
      >
        {{ item }}
        <button
          v-if="!disabled"
          type="button"
          class="rounded-sm p-0.5 hover:bg-muted"
          @click="removeAt(index)"
        >
          <Icon name="lucide:x" class="h-3 w-3" />
        </button>
      </Badge>
    </div>
    <div
      v-if="!disabled"
      class="flex gap-2"
    >
      <Input
        v-model="draft"
        :placeholder="placeholder || 'Adicionar…'"
        @keydown.enter.prevent="addItems"
      />
      <Button
        type="button"
        variant="outline"
        @click="addItems"
      >
        Adicionar
      </Button>
    </div>
    <p
      v-if="separatorHint && !disabled"
      class="text-xs text-muted-foreground"
    >
      {{ separatorHint }}
    </p>
  </div>
</template>
