<script setup lang="ts">
import type { BrandColor, BrandColorRole } from '~/types/brand-guide'
import { newBrandColor } from '~/utils/brand-guide'

const props = defineProps<{
  modelValue: BrandColor[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BrandColor[]]
}>()

const roles: Array<{ value: BrandColorRole, label: string }> = [
  { value: 'primary', label: 'Primária' },
  { value: 'secondary', label: 'Secundária' },
  { value: 'accent', label: 'Destaque' },
  { value: 'neutral', label: 'Neutra' },
  { value: 'other', label: 'Outra' },
]

function updateAt(index: number, patch: Partial<BrandColor>) {
  const next = props.modelValue.map((color, i) => i === index ? { ...color, ...patch } : color)
  emit('update:modelValue', next)
}

function addColor() {
  emit('update:modelValue', [...props.modelValue, newBrandColor()])
}

function removeColor(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="text-sm font-medium">
          Paleta de cores
        </p>
        <p class="text-xs text-muted-foreground">
          Selecione cores com preview imediato.
        </p>
      </div>
      <Button
        v-if="!disabled"
        type="button"
        size="sm"
        variant="outline"
        @click="addColor"
      >
        <Icon name="lucide:plus" class="mr-1.5 h-4 w-4" />
        Cor
      </Button>
    </div>

    <div
      v-if="!modelValue.length"
      class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
    >
      Nenhuma cor cadastrada.
    </div>

    <div class="grid gap-3">
      <div
        v-for="(color, index) in modelValue"
        :key="color.id"
        class="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
      >
        <div
          class="h-12 w-full shrink-0 rounded-md border sm:h-10 sm:w-10"
          :style="{ backgroundColor: color.hex }"
          :title="color.hex"
        />
        <div class="grid flex-1 gap-2 sm:grid-cols-3">
          <Input
            :model-value="color.name"
            placeholder="Nome"
            :disabled="disabled"
            @update:model-value="updateAt(index, { name: String($event || '') })"
          />
          <div class="flex items-center gap-2">
            <input
              type="color"
              class="h-9 w-10 cursor-pointer rounded border bg-transparent p-0.5"
              :value="color.hex"
              :disabled="disabled"
              @input="updateAt(index, { hex: ($event.target as HTMLInputElement).value })"
            >
            <Input
              :model-value="color.hex"
              class="font-mono uppercase"
              placeholder="#000000"
              :disabled="disabled"
              @update:model-value="updateAt(index, { hex: String($event || '') })"
            />
          </div>
          <Select
            :model-value="color.role"
            :disabled="disabled"
            @update:model-value="updateAt(index, { role: $event as BrandColorRole })"
          >
            <SelectTrigger>
              <SelectValue placeholder="Papel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="role in roles"
                :key="role.value"
                :value="role.value"
              >
                {{ role.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          v-if="!disabled"
          type="button"
          size="icon"
          variant="ghost"
          class="shrink-0"
          @click="removeColor(index)"
        >
          <Icon name="lucide:trash-2" class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <div
      v-if="modelValue.length"
      class="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3"
    >
      <div
        v-for="color in modelValue"
        :key="`preview-${color.id}`"
        class="h-8 min-w-16 flex-1 rounded-md border"
        :style="{ backgroundColor: color.hex }"
        :title="`${color.name} (${color.hex})`"
      />
    </div>
  </div>
</template>
