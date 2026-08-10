<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import Label from '@/components/ui/label/Label.vue'
import Switch from '@/components/ui/switch/Switch.vue'
import Textarea from '@/components/ui/textarea/Textarea.vue'
import ColorPicker from '~/components/crm/config/ColorPicker.vue'

const props = defineProps<{
  modelValue: any
  mode?: 'create' | 'edit'
  loading?: boolean
  nameError?: string
}>()
const emit = defineEmits(['update:modelValue', 'submit'])

const local = ref({
  name: '',
  order: 1,
  color: '',
  description: '',
  is_default: false,
  ...(props.modelValue || {}),
})

// Gera cor aleatória em HEX
function randomColor() {
  const h = Math.floor(Math.random() * 360)
  const s = 60 + Math.floor(Math.random() * 30) // saturação 60-90%
  const l = 40 + Math.floor(Math.random() * 30) // luminosidade 40-70%
  return hslToHex(h, s, l)
}

function hslToHex(h: number, s: number, l: number) {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const color = l - a * Math.max(Math.min(k(n) - 3, 9 - k(n), 1), -1)
    return Math.round(255 * color)
  }
  return `#${[f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join('')}`
}

onMounted(() => {
  if (props.mode === 'create' && !local.value.color) {
    local.value.color = randomColor()
  }
})

watch(
  () => props.modelValue,
  (val) => {
    local.value = {
      name: '',
      order: 1,
      color: '',
      description: '',
      is_default: false,
      ...(val || {}),
    }
    if (props.mode === 'create' && !local.value.color) {
      local.value.color = randomColor()
    }
  },
  { immediate: true },
)

function handleInput(key: string, value: any) {
  local.value[key] = value
  emit('update:modelValue', { ...local.value })
}

function handleSubmit(e: Event) {
  e.preventDefault()
  emit('submit', { ...local.value })
}

const isEdit = computed(() => props.mode === 'edit')
const isDisabled = computed(() => props.modelValue.is_default === true)
</script>

<template>
  <form class="space-y-6" @submit="handleSubmit">
    <div class="space-y-2">
      <Label for="stage-name">Nome</Label>
      <Input
        id="stage-name"
        v-model="local.name"
        :disabled="isDisabled || props.loading"
        required
        placeholder="Nome do estágio"
        :class="isDisabled ? 'pointer-events-none opacity-50' : ''"
        @input="(e: Event) => handleInput('name', (e.target as HTMLInputElement).value)"
      />
      <p v-if="props.nameError" class="mt-1 text-xs text-red-500">
        {{ props.nameError }}
      </p>
    </div>
    <div class="space-y-2">
      <Label for="stage-order">Ordem</Label>
      <Input
        id="stage-order"
        v-model.number="local.order"
        type="number"
        min="1"
        :disabled="isDisabled || props.loading"
        required
        placeholder="Ordem"
        :class="isDisabled ? 'pointer-events-none opacity-50' : ''"
        @input="(e: Event) => handleInput('order', Number((e.target as HTMLInputElement).value))"
      />
    </div>
    <div class="space-y-2">
      <Label for="stage-description">Descrição</Label>
      <Textarea
        id="stage-description"
        v-model="local.description"
        :disabled="isDisabled || props.loading"
        placeholder="Descrição (opcional)"
        :class="isDisabled ? 'pointer-events-none opacity-50' : ''"
        @input="(e: Event) => handleInput('description', (e.target as HTMLTextAreaElement).value)"
      />
    </div>
    <div class="space-y-2">
      <Label>Cor</Label>
      <div class="flex items-center gap-3">
        <ColorPicker
          :model-value="local.color || '#3b82f6'"
          :disabled="isDisabled || props.loading"
          @update:model-value="(value: string) => handleInput('color', value)"
        />
        <span class="font-mono text-xs uppercase text-muted-foreground">
          {{ local.color || '#3b82f6' }}
        </span>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <Switch id="stage-default" :checked="!!local.is_default" disabled />
      <Label for="stage-default">Padrão (não pode ser alterado)</Label>
    </div>
    <div class="flex justify-end gap-2">
      <Button type="submit" :loading="props.loading" :disabled="isDisabled || props.loading">
        {{ isEdit ? 'Salvar alterações' : 'Criar estágio' }}
      </Button>
    </div>
  </form>
</template>
