<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '#components'
import Button from '~/components/ui/button/Button.vue'
import Input from '~/components/ui/input/Input.vue'
import Label from '~/components/ui/label/Label.vue'
import Popover from '~/components/ui/popover/Popover.vue'
import PopoverContent from '~/components/ui/popover/PopoverContent.vue'
import PopoverTrigger from '~/components/ui/popover/PopoverTrigger.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  disabled?: boolean
  presets?: string[]
}>(), {
  disabled: false,
  presets: () => [
    '#38bdf8',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#14b8a6',
    '#64748b',
  ],
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const local = ref(normalizeHex(props.modelValue || '#3b82f6'))
const hue = ref(210)
const sat = ref(80)
const light = ref(55)

watch(
  () => props.modelValue,
  (val) => {
    if (!val)
      return
    local.value = normalizeHex(val)
    const [h, s, l] = hexToHsl(local.value)
    hue.value = h
    sat.value = s
    light.value = l
  },
  { immediate: true },
)

watch([hue, sat, light], ([h, s, l]) => {
  const hex = hslToHex(h, s, l)
  if (hex === local.value)
    return
  local.value = hex
  emit('update:modelValue', hex)
})

const satLightBg = computed(() =>
  `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue.value}, 100%, 50%))`,
)

function selectPreset(color: string) {
  const hex = normalizeHex(color)
  local.value = hex
  const [h, s, l] = hexToHsl(hex)
  hue.value = h
  sat.value = s
  light.value = l
  emit('update:modelValue', hex)
}

function onHexInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  const withHash = raw.startsWith('#') ? raw : `#${raw}`
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash))
    return
  selectPreset(withHash)
}

function onSatLightPointer(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width)
  const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height)
  sat.value = Math.round((x / rect.width) * 100)
  light.value = Math.round(100 - (y / rect.height) * 100)
}

function normalizeHex(hex: string): string {
  const cleaned = hex.replace('#', '')
  if (cleaned.length === 3) {
    return `#${cleaned.split('').map(c => c + c).join('')}`.toLowerCase()
  }
  return `#${cleaned.slice(0, 6).toLowerCase()}`
}

function hexToHsl(hex: string): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  const value = hex.replace('#', '')
  if (value.length === 3) {
    r = Number.parseInt(value[0] + value[0], 16)
    g = Number.parseInt(value[1] + value[1], 16)
    b = Number.parseInt(value[2] + value[2], 16)
  }
  else {
    r = Number.parseInt(value.substring(0, 2), 16)
    g = Number.parseInt(value.substring(2, 4), 16)
    b = Number.parseInt(value.substring(4, 6), 16)
  }
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToHex(h: number, s: number, l: number) {
  const satN = s / 100
  const lightN = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = satN * Math.min(lightN, 1 - lightN)
  const f = (n: number) => {
    const color = lightN - a * Math.max(Math.min(k(n) - 3, 9 - k(n), 1), -1)
    return Math.round(255 * color)
  }
  return `#${[f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join('')}`
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        size="icon"
        class="h-9 w-9 shrink-0 border"
        :disabled="disabled"
        :aria-label="`Cor selecionada: ${local}`"
        :style="{ backgroundColor: local }"
      >
        <Icon name="lucide:pipette" class="h-3.5 w-3.5 text-white drop-shadow" />
        <span class="sr-only">Abrir seletor de cor</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-72 space-y-3 p-3" align="start">
      <div class="space-y-1.5">
        <Label class="text-xs text-muted-foreground">
          Paleta
        </Label>
        <div class="grid grid-cols-5 gap-2">
          <button
            v-for="color in presets"
            :key="color"
            type="button"
            class="h-7 w-7 rounded-md border border-border transition ring-offset-background hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="{ 'ring-2 ring-ring': local.toLowerCase() === color.toLowerCase() }"
            :style="{ backgroundColor: color }"
            :aria-label="`Usar cor ${color}`"
            @click="selectPreset(color)"
          />
        </div>
      </div>

      <div
        class="relative h-28 w-full cursor-crosshair overflow-hidden rounded-md border"
        :style="{ background: satLightBg }"
        @click="onSatLightPointer"
      >
        <div
          class="pointer-events-none absolute h-3.5 w-3.5 border-2 border-white rounded-full shadow"
          :style="{
            left: `calc(${sat}% - 7px)`,
            top: `calc(${100 - light}% - 7px)`,
            background: local,
          }"
        />
      </div>

      <input
        v-model.number="hue"
        type="range"
        min="0"
        max="360"
        step="1"
        class="h-2 w-full cursor-pointer appearance-none rounded-full"
        :style="{ background: 'linear-gradient(90deg, red, yellow, lime, cyan, blue, magenta, red)' }"
        aria-label="Matiz"
      >

      <div class="flex items-center gap-2">
        <div
          class="h-8 w-8 shrink-0 rounded-md border"
          :style="{ backgroundColor: local }"
        />
        <Input
          :model-value="local"
          class="h-8 font-mono text-xs uppercase"
          maxlength="7"
          @input="onHexInput"
        />
      </div>
    </PopoverContent>
  </Popover>
</template>
