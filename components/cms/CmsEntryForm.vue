<script setup lang="ts">
import type { CmsMediaAsset } from '~/composables/cms/useCmsMedia'
import type { CmsCollectionSchema, CmsEntryStatus, CmsMediaRef } from '~/lib/cms/contracts'

import { computed, ref } from 'vue'

import CmsMediaLibraryDialog from '~/components/cms/CmsMediaLibraryDialog.vue'
import { useCmsMedia } from '~/composables/cms/useCmsMedia'
import { mediaAssetPreviewUrl } from '~/utils/media-asset'

const props = withDefaults(defineProps<{
  schema: CmsCollectionSchema
  disabled?: boolean
  saving?: boolean
}>(), {
  disabled: false,
  saving: false,
})

const emit = defineEmits<{ submit: [] }>()

const media = useCmsMedia()

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
  const record = value as Record<string, unknown>
  if (typeof record.assetId !== 'string' || !record.assetId)
    return null
  return {
    assetId: record.assetId,
    ...(typeof record.objectPath === 'string' && record.objectPath ? { objectPath: record.objectPath } : {}),
    ...(typeof record.alt === 'string' && record.alt ? { alt: record.alt } : {}),
    ...(typeof record.credit === 'string' && record.credit ? { credit: record.credit } : {}),
  }
}

function galleryValue(key: string): CmsMediaRef[] {
  const value = payload.value[key]
  if (!Array.isArray(value))
    return []
  const items: CmsMediaRef[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue
    const record = item as Record<string, unknown>
    if (typeof record.assetId !== 'string' || !record.assetId)
      continue
    items.push({
      assetId: record.assetId,
      ...(typeof record.objectPath === 'string' && record.objectPath ? { objectPath: record.objectPath } : {}),
      ...(typeof record.alt === 'string' && record.alt ? { alt: record.alt } : {}),
    })
  }
  return items
}

function previewFor(assetId: string): string | null {
  const asset = media.assets.value.find(item => item.id === assetId)
  if (!asset)
    return null
  return mediaAssetPreviewUrl({
    mimeType: typeof asset.mime_type === 'string' ? asset.mime_type : '',
    previewUrl: asset.previewUrl,
    preview_url: asset.preview_url,
  })
}

function toMediaRef(asset: CmsMediaAsset, current?: CmsMediaRef | null): CmsMediaRef {
  const objectPath = typeof asset.object_path === 'string' ? asset.object_path.trim() : ''
  return {
    assetId: asset.id,
    ...(objectPath ? { objectPath } : {}),
    ...(current?.alt ? { alt: current.alt } : {}),
    ...(current?.credit ? { credit: current.credit } : {}),
  }
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

function setMediaAlt(key: string, alt: string) {
  const current = mediaValue(key)
  if (!current)
    return
  setField(key, { ...current, ...(alt.trim() ? { alt: alt.trim() } : { alt: undefined }) })
}

function removeGalleryItem(key: string, assetId: string) {
  setField(key, galleryValue(key).filter(item => item.assetId !== assetId))
}

/** Which field the library dialog is currently editing (single or gallery). */
const picker = ref<{ key: string, multiple: boolean } | null>(null)
const pickerOpen = ref(false)

function openPicker(key: string, multiple: boolean) {
  if (locked.value)
    return
  picker.value = { key, multiple }
  pickerOpen.value = true
}

const pickerSelectedIds = computed(() => {
  if (!picker.value)
    return []
  return picker.value.multiple
    ? galleryValue(picker.value.key).map(item => item.assetId)
    : [mediaValue(picker.value.key)?.assetId].filter((id): id is string => Boolean(id))
})

function onPickerSelect(asset: CmsMediaAsset) {
  if (!picker.value || picker.value.multiple)
    return
  const key = picker.value.key
  setField(key, toMediaRef(asset, mediaValue(key)))
}

function onPickerConfirm(assets: CmsMediaAsset[]) {
  if (!picker.value || !picker.value.multiple)
    return
  const key = picker.value.key
  const current = galleryValue(key)
  setField(key, assets.map(asset => toMediaRef(asset, current.find(item => item.assetId === asset.id))))
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

      <div v-else-if="field.type === 'gallery'" class="space-y-2">
        <ul v-if="galleryValue(field.key).length" class="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <li
            v-for="item in galleryValue(field.key)"
            :key="item.assetId"
            class="relative overflow-hidden border rounded-lg bg-muted/40"
          >
            <img
              v-if="previewFor(item.assetId)"
              :src="previewFor(item.assetId) || undefined"
              :alt="item.alt || ''"
              class="aspect-square w-full object-cover"
            >
            <span v-else class="aspect-square flex items-center justify-center text-muted-foreground">
              <Icon name="lucide:image" class="size-6" aria-hidden="true" />
            </span>
            <button
              v-if="!locked"
              type="button"
              class="absolute right-1 top-1 size-6 flex items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background"
              :aria-label="`Remover imagem de ${field.label}`"
              @click="removeGalleryItem(field.key, item.assetId)"
            >
              <Icon name="lucide:x" class="size-3.5" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <Button
          type="button"
          variant="outline"
          class="w-full border-dashed"
          :disabled="locked"
          @click="openPicker(field.key, true)"
        >
          <Icon name="lucide:image-plus" class="mr-2 size-4" aria-hidden="true" />
          {{ galleryValue(field.key).length ? 'Adicionar ou trocar imagens' : 'Escolher ou enviar imagens' }}
        </Button>
        <p class="text-xs text-muted-foreground">
          {{ galleryValue(field.key).length }} {{ galleryValue(field.key).length === 1 ? 'imagem selecionada' : 'imagens selecionadas' }}. Você pode enviar arquivos novos dentro do seletor.
        </p>
      </div>

      <div v-else class="space-y-2">
        <div v-if="mediaValue(field.key)" class="space-y-2">
          <div class="overflow-hidden border rounded-lg bg-muted/40">
            <img
              v-if="previewFor(mediaValue(field.key)!.assetId)"
              :src="previewFor(mediaValue(field.key)!.assetId) || undefined"
              :alt="mediaValue(field.key)?.alt || ''"
              class="aspect-[16/9] w-full object-cover"
            >
            <div v-else class="aspect-[16/9] flex items-center justify-center text-muted-foreground">
              <Icon name="lucide:image" class="size-8" aria-hidden="true" />
            </div>
          </div>
          <Input
            :model-value="mediaValue(field.key)?.alt ?? ''"
            placeholder="Texto alternativo"
            maxlength="300"
            :disabled="locked"
            @update:model-value="value => setMediaAlt(field.key, String(value ?? ''))"
          />
          <div class="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" :disabled="locked" @click="openPicker(field.key, false)">
              Trocar
            </Button>
            <Button type="button" variant="ghost" size="sm" :disabled="locked" @click="setField(field.key, null)">
              Remover
            </Button>
          </div>
        </div>
        <Button
          v-else
          type="button"
          variant="outline"
          class="h-24 w-full border-dashed"
          :disabled="locked"
          @click="openPicker(field.key, false)"
        >
          <Icon name="lucide:image-plus" class="mr-2 size-4" aria-hidden="true" />
          Escolher ou enviar imagem
        </Button>
      </div>
    </div>

    <CmsMediaLibraryDialog
      v-model:open="pickerOpen"
      :multiple="picker?.multiple ?? false"
      :title="picker?.multiple ? 'Escolher imagens' : 'Escolher imagem'"
      :selected-asset-ids="pickerSelectedIds"
      @select="onPickerSelect"
      @confirm="onPickerConfirm"
    />

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
