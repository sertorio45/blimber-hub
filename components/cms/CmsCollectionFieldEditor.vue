<script setup lang="ts">
import type { CmsCollectionField, CmsCollectionFieldType } from '~/lib/cms/contracts'

import { CMS_COLLECTION_FIELD_LABELS, cmsSlugDraft } from '~/composables/cms/cmsDisplay'
import { CMS_COLLECTION_FIELD_LIMIT } from '~/lib/cms/contracts'

const props = withDefaults(defineProps<{
  disabled?: boolean
}>(), {
  disabled: false,
})

const fields = defineModel<CmsCollectionField[]>({ required: true })

const FIELD_TYPES = Object.keys(CMS_COLLECTION_FIELD_LABELS) as CmsCollectionFieldType[]

function addField() {
  if (props.disabled || fields.value.length >= CMS_COLLECTION_FIELD_LIMIT)
    return
  fields.value = [
    ...fields.value,
    { key: '', label: '', type: 'text', required: false },
  ]
}

function patch(index: number, next: Partial<CmsCollectionField>) {
  fields.value = fields.value.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...next } : field)
}

function onLabel(index: number, label: string) {
  const current = fields.value[index]
  if (!current)
    return
  const keyWasDerived = !current.key || current.key === cmsSlugDraft(current.label)
  patch(index, {
    label,
    key: keyWasDerived ? cmsSlugDraft(label) : current.key,
  })
}

function remove(index: number) {
  fields.value = fields.value.filter((_, fieldIndex) => fieldIndex !== index)
}

function setType(index: number, value: unknown) {
  const type = value === 'number' || value === 'boolean' || value === 'media' ? value : 'text'
  patch(index, { type })
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="(field, index) in fields"
      :key="index"
      class="grid gap-2 border rounded-lg p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_9rem_auto_auto] sm:items-end"
    >
      <div class="space-y-1">
        <Label :for="`cms-field-label-${index}`">Rótulo</Label>
        <Input
          :id="`cms-field-label-${index}`"
          :model-value="field.label"
          maxlength="80"
          autocomplete="off"
          :disabled="disabled"
          @update:model-value="value => onLabel(index, String(value ?? ''))"
        />
      </div>
      <div class="space-y-1">
        <Label :for="`cms-field-key-${index}`">Chave</Label>
        <Input
          :id="`cms-field-key-${index}`"
          :model-value="field.key"
          maxlength="64"
          class="font-mono"
          autocomplete="off"
          spellcheck="false"
          :disabled="disabled"
          @update:model-value="value => patch(index, { key: cmsSlugDraft(String(value ?? '')) })"
        />
      </div>
      <div class="space-y-1">
        <Label :for="`cms-field-type-${index}`">Tipo</Label>
        <Select :model-value="field.type" :disabled="disabled" @update:model-value="value => setType(index, value)">
          <SelectTrigger :id="`cms-field-type-${index}`" aria-label="Tipo do campo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="type in FIELD_TYPES" :key="type" :value="type">
              {{ CMS_COLLECTION_FIELD_LABELS[type] }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex items-center gap-2 pb-2">
        <Switch
          :id="`cms-field-required-${index}`"
          :checked="field.required"
          :disabled="disabled"
          @update:checked="value => patch(index, { required: value })"
        />
        <Label :for="`cms-field-required-${index}`" class="text-xs font-normal">
          Obrigatório
        </Label>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="text-muted-foreground"
        :disabled="disabled || fields.length <= 1"
        :aria-label="`Remover ${field.label || 'campo'}`"
        @click="remove(index)"
      >
        <Icon name="lucide:trash-2" class="size-4" aria-hidden="true" />
      </Button>
    </div>
    <Button
      type="button"
      variant="outline"
      size="sm"
      :disabled="disabled || fields.length >= CMS_COLLECTION_FIELD_LIMIT"
      @click="addField"
    >
      <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
      Adicionar campo
    </Button>
  </div>
</template>
