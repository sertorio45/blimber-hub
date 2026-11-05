<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import { CalendarDate, DateFormatter, getLocalTimeZone, parseDate, today } from '@internationalized/date'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  label?: string
  description?: string
  placeholder?: string
  disabled?: boolean
  disablePast?: boolean
  class?: string
  id?: string
}>(), {
  modelValue: null,
  label: '',
  description: '',
  placeholder: 'Selecionar data',
  disabled: false,
  disablePast: false,
  id: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const selectedDate = ref<DateValue>()
const formatter = new DateFormatter('pt-BR', {
  dateStyle: 'medium',
})

function parseValue(value?: string | null) {
  if (!value) {
    selectedDate.value = undefined
    return
  }

  try {
    // Accept YYYY-MM-DD (native date input) or ISO datetime prefix
    const dateOnly = value.slice(0, 10)
    selectedDate.value = parseDate(dateOnly)
  }
  catch {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      selectedDate.value = undefined
      return
    }
    selectedDate.value = new CalendarDate(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    )
  }
}

function selectDate(value: DateValue | undefined) {
  selectedDate.value = value
  if (!value) {
    emit('update:modelValue', '')
    return
  }
  emit('update:modelValue', value.toString())
  open.value = false
}

function clearValue() {
  selectedDate.value = undefined
  emit('update:modelValue', '')
  open.value = false
}

const displayValue = computed(() => {
  if (!selectedDate.value)
    return props.placeholder
  return formatter.format(selectedDate.value.toDate(getLocalTimeZone()))
})

watch(() => props.modelValue, parseValue, { immediate: true })
</script>

<template>
  <div class="space-y-2" :class="props.class">
    <Label v-if="label">
      {{ label }}
    </Label>
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          type="button"
          variant="outline"
          class="w-full justify-start text-left font-normal"
          :disabled="disabled"
          :class="{ 'text-muted-foreground': !selectedDate }"
        >
          <Icon name="lucide:calendar" class="mr-2 h-4 w-4 shrink-0" />
          <span class="truncate">{{ displayValue }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0" align="start">
        <Calendar
          :model-value="selectedDate"
          :min-value="disablePast ? today(getLocalTimeZone()) : undefined"
          initial-focus
          @update:model-value="selectDate"
        />
        <div class="flex items-center justify-between border-t p-2">
          <Button type="button" variant="ghost" size="sm" @click="clearValue">
            Limpar
          </Button>
          <Button type="button" variant="ghost" size="sm" @click="selectDate(today(getLocalTimeZone()))">
            Hoje
          </Button>
        </div>
      </PopoverContent>
    </Popover>
    <p v-if="description" class="text-xs text-muted-foreground">
      {{ description }}
    </p>
  </div>
</template>
