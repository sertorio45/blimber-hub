<script setup lang="ts">
import type {
  BrandAiFidelity,
  BrandAiLogoUsage,
  BrandAiPreferences,
  BrandAiRealism,
  BrandAiTextInImage,
} from '~/types/brand-guide'
import { createEmptyAiPreferences } from '~/utils/brand-guide'

const props = defineProps<{
  modelValue: BrandAiPreferences | undefined
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BrandAiPreferences]
}>()

const prefs = computed({
  get: () => props.modelValue || createEmptyAiPreferences(),
  set: value => emit('update:modelValue', value),
})

function patch(partial: Partial<BrandAiPreferences>) {
  emit('update:modelValue', { ...prefs.value, ...partial })
}

const fidelityOptions: Array<{ value: BrandAiFidelity, label: string, hint: string }> = [
  { value: 'strict', label: 'Estrita', hint: 'Seguir a marca o mais fiel possível' },
  { value: 'balanced', label: 'Equilibrada', hint: 'Fidelidade com espaço criativo' },
  { value: 'creative', label: 'Criativa', hint: 'Mais liberdade estética' },
]

const realismOptions: Array<{ value: BrandAiRealism, label: string }> = [
  { value: 'photoreal', label: 'Fotorrealismo' },
  { value: 'stylized', label: 'Estilizado' },
  { value: 'mixed', label: 'Misto' },
]

const textOptions: Array<{ value: BrandAiTextInImage, label: string }> = [
  { value: 'allow', label: 'Permitir texto' },
  { value: 'avoid', label: 'Evitar texto' },
  { value: 'brand_only', label: 'Somente marca / claims aprovados' },
]

const logoOptions: Array<{ value: BrandAiLogoUsage, label: string }> = [
  { value: 'required', label: 'Logo obrigatório' },
  { value: 'optional', label: 'Logo opcional' },
  { value: 'avoid', label: 'Evitar logo na imagem' },
]
</script>

<template>
  <div class="space-y-4">
    <Card>
      <CardContent class="space-y-6 p-6">
        <div>
          <p class="text-sm font-medium">
            Preferências de IA
          </p>
          <p class="text-xs text-muted-foreground">
            Contexto para futuros briefings e geração — esta tela não gera imagens.
          </p>
        </div>

        <Alert>
          <Icon
            name="lucide:info"
            class="h-4 w-4"
          />
          <AlertTitle>Somente contexto</AlertTitle>
          <AlertDescription>
            Salve fidelidade, realismo e restrições para orientar a IA. A geração de imagens fica fora desta etapa.
          </AlertDescription>
        </Alert>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label>Fidelidade à marca</Label>
            <Select
              :model-value="prefs.fidelity"
              :disabled="disabled"
              @update:model-value="patch({ fidelity: $event as BrandAiFidelity })"
            >
              <SelectTrigger>
                <SelectValue placeholder="Fidelidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in fidelityOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-muted-foreground">
              {{ fidelityOptions.find(item => item.value === prefs.fidelity)?.hint }}
            </p>
          </div>

          <div class="space-y-2">
            <Label>Realismo</Label>
            <Select
              :model-value="prefs.realism"
              :disabled="disabled"
              @update:model-value="patch({ realism: $event as BrandAiRealism })"
            >
              <SelectTrigger>
                <SelectValue placeholder="Realismo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in realismOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>Texto na imagem</Label>
            <Select
              :model-value="prefs.textInImage"
              :disabled="disabled"
              @update:model-value="patch({ textInImage: $event as BrandAiTextInImage })"
            >
              <SelectTrigger>
                <SelectValue placeholder="Texto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in textOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>Logo na imagem</Label>
            <Select
              :model-value="prefs.logo"
              :disabled="disabled"
              @update:model-value="patch({ logo: $event as BrandAiLogoUsage })"
            >
              <SelectTrigger>
                <SelectValue placeholder="Logo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in logoOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="space-y-2">
          <Label>Preferências gerais</Label>
          <Textarea
            :model-value="prefs.preferences"
            rows="4"
            placeholder="Orientações recorrentes para prompts e briefings…"
            :disabled="disabled"
            @update:model-value="patch({ preferences: String($event || '') })"
          />
        </div>

        <div class="space-y-2">
          <Label>Observações</Label>
          <Textarea
            :model-value="prefs.notes"
            rows="4"
            placeholder="Notas extras para o time ou para a IA…"
            :disabled="disabled"
            @update:model-value="patch({ notes: String($event || '') })"
          />
        </div>
      </CardContent>
    </Card>
  </div>
</template>
