<script setup lang="ts">
import { Eye, EyeOff } from 'lucide-vue-next'

const props = defineProps<{
  id?: string
  modelValue: string
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const showPassword = ref(false)

function updateValue(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

function togglePasswordVisibility(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  showPassword.value = !showPassword.value
}
</script>

<template>
  <div class="relative">
    <input
      :id="props.id"
      :type="showPassword ? 'text' : 'password'"
      :value="props.modelValue"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      class="h-10 w-full flex border border-input rounded-md bg-transparent py-2 pl-3 pr-10 text-sm ring-offset-background disabled:cursor-not-allowed file:border-0 file:bg-transparent file:text-sm placeholder:text-muted-foreground file:font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring"
      @input="updateValue"
    >
    <button
      type="button"
      class="absolute right-0 top-0 z-10 flex h-full w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      tabindex="-1"
      :disabled="props.disabled"
      :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
      @click="togglePasswordVisibility"
    >
      <Eye v-if="!showPassword" class="pointer-events-none h-4 w-4" />
      <EyeOff v-else class="pointer-events-none h-4 w-4" />
    </button>
  </div>
</template>
