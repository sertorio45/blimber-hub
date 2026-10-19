<script setup lang="ts">
import type { CmsCollectionSchema, CmsEntryStatus, CmsMediaRef } from '~/lib/cms/contracts'

import { computed } from 'vue'

const props = withDefaults(defineProps<{
  schema: CmsCollectionSchema
  disabled?: boolean
  saving?: boolean
  mediaAssets?: Array<{ id: string, name: string }>
}>(), {
  disabled: false,
  saving: false,
  mediaAssets: () => [],
})

const emit = defineEmits<{ submit: [] }>()

const payload = defineModel<Record<string, unknown>>('payload', { required: true })
const status = defineModel<CmsEntryStatus>('status', { required: true })

const locked = computed(() => props.disabled || props.saving)

function textValue(key: string): string {
  const value = payload.value[key]
  return typeof value === 'string' ? value : ''
}

function numberValue(key: string): string {
  const value = payload.value[key]
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function booleanValue(key: string): boolean {
  return payload.value[key] === true
}

function mediaValue(key: string): CmsMediaRef | null {
  const value = payload.value[key]
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const assetId = (value as { assetId?: unknown }).assetId
  if (typeof assetId !== 'string' || !assetId)
    return null
  const alt = (value as { alt?: unknown }).alt
  return { assetId, ...(typeof alt === 'string' && alt ? { alt } : {}) }
}

function setField(key: string, value: unknown) {
  payload.value = { ...payload.value, [key]: value }
}

function setNumber(key: string, raw: string) {
  if (!raw.trim()) {
    setField(key, null)
    return
  }
  const parsed = Number(raw)
  setField(key, Number.isFinite(parsed) ? parsed : null)
}

function setMedia(key: string, assetId: string) {
  const current = mediaValue(key)
  if (!assetId) {
    setField(key, null)
    return
  }
  setField(key, { assetId, ...(current?.alt ? { alt: current.alt } : {}) })
}

function setMediaAlt(key: string, alt: string) {
  const current = mediaValue(key)
  if (!current)
    return
  setField(key, { assetId: current.assetId, ...(alt.trim() ? { alt: alt.trim() } : {}) })
}

function setStatus(value: unknown) {
  status.value = value === 'published' ? 'published' : 'draft'
}
</script>

<template>
  <form class="space-y-4" novalidate @submit.prevent="emit('submit')">
    <div v-for="field in schema.fields" :key="field.key" class="space-y-1.5">
      <Label :for="`cms-entry-${field.key}`">
        {{ field.label }}
        <span v-if="field.required" class="text-muted-foreground font-normal">*</span>
      </Label>

      <Input
        v-if="field.type === 'text'"
        :id="`cms-entry-${field.key}`"
        :model-value="textValue(field.key)"
        :disabled="locked"
        autocomplete="off"
        @update:model-value="value => setField(field.key, String(value ?? ''))"
      />

      <Input
        v-else-if="field.type === 'number'"
        :id="`cms-entry-${field.key}`"
        type="number"
        step="any"
        :model-value="numberValue(field.key)"
        :disabled="locked"
        @update:model-value="value => setNumber(field.key, String(value ?? ''))"
      />

      <div v-else-if="field.type === 'boolean'" class="flex items-center gap-2 pt-1">
        <Switch
          :id="`cms-entry-${field.key}`"
          :checked="booleanValue(field.key)"
          :disabled="locked"
          @update:checked="value => setField(field.key, value)"
        />
        <span class="text-sm text-muted-foreground">{{ booleanValue(field.key) ? 'Sim' : 'Não' }}</span>
      </div>

      <div v-else class="space-y-2">
        <Select
          :model-value="mediaValue(field.key)?.assetId || 'none'"
          :disabled="locked"
          @update:model-value="value => setMedia(field.key, value === 'none' ? '' : String(value ?? ''))"
        >
          <SelectTrigger :id="`cms-entry-${field.key}`" aria-label="Arquivo de mídia">
            <SelectValue placeholder="Selecione um arquivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              Nenhum
            </SelectItem>
            <SelectItem v-for="asset in mediaAssets" :key="asset.id" :value="asset.id">
              {{ asset.name || asset.id }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-if="mediaValue(field.key)"
          :model-value="mediaValue(field.key)?.alt ?? ''"
          placeholder="Texto alternativo"
          maxlength="300"
          :disabled="locked"
          @update:model-value="value => setMediaAlt(field.key, String(value ?? ''))"
        />
        <p v-if="!mediaAssets.length" class="text-xs text-muted-foreground">
          Nenhum arquivo na biblioteca. Envie em Mídia e volte aqui.
        </p>
      </div>
    </div>

    <div class="space-y-1.5">
      <Label for="cms-entry-status">Status</Label>
      <Select :model-value="status" :disabled="locked" @update:model-value="setStatus">
        <SelectTrigger id="cms-entry-status" aria-label="Status do registro">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="draft">
            Rascunho
          </SelectItem>
          <SelectItem value="published">
            Publicado
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div v-if="!disabled" class="flex justify-end">
      <Button type="submit" :disabled="saving">
        <Icon v-if="saving" name="lucide:loader-circle" class="mr-2 size-4 animate-spin" aria-hidden="true" />
        {{ saving ? 'Salvando…' : 'Salvar registro' }}
      </Button>
    </div>
  </form>
</template>
