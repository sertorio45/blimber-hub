<script setup lang="ts">
import type { CmsFieldSpec } from '~/lib/cms/blocks'

import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'

const props = defineProps<{
  fields: CmsFieldSpec[]
  modelValue: Record<string, unknown>
  createItem?: (key: string) => Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

function patch(key: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function textValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function boolValue(value: unknown): boolean {
  return value === true
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function listValue(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => objectValue(item))
}

function mediaValue(value: unknown): { assetId: string, alt: string, credit: string } {
  const record = objectValue(value)
  return {
    assetId: typeof record.assetId === 'string' ? record.assetId : '',
    alt: typeof record.alt === 'string' ? record.alt : '',
    credit: typeof record.credit === 'string' ? record.credit : '',
  }
}

function commitMedia(key: string, next: { assetId: string, alt: string, credit: string }) {
  const assetId = next.assetId.trim()
  if (!assetId) {
    patch(key, null)
    return
  }
  patch(key, {
    assetId,
    ...(next.alt.trim() ? { alt: next.alt.trim() } : {}),
    ...(next.credit.trim() ? { credit: next.credit.trim() } : {}),
  })
}

function updateMedia(key: string, patchPart: Partial<{ assetId: string, alt: string, credit: string }>) {
  commitMedia(key, { ...mediaValue(props.modelValue[key]), ...patchPart })
}

function commitNumber(field: CmsFieldSpec, raw: string | number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed))
    return
  const rounded = Math.round(parsed)
  const min = field.min ?? rounded
  const max = field.max ?? rounded
  patch(field.key, Math.min(max, Math.max(min, rounded)))
}

function updateItem(key: string, index: number, value: Record<string, unknown>) {
  const next = listValue(props.modelValue[key]).slice()
  next[index] = value
  patch(key, next)
}

function removeItem(key: string, index: number) {
  patch(key, listValue(props.modelValue[key]).filter((_, itemIndex) => itemIndex !== index))
}

function addItem(field: CmsFieldSpec) {
  const current = listValue(props.modelValue[field.key])
  if (field.max != null && current.length >= field.max)
    return
  const created = props.createItem?.(field.key) ?? {}
  patch(field.key, [...current, created])
}
</script>

<template>
  <div class="space-y-4">
    <div v-for="field in fields" :key="field.key" class="space-y-2">
      <template v-if="field.widget === 'boolean'">
        <div class="flex items-center justify-between gap-3">
          <Label class="font-normal">{{ field.label }}</Label>
          <Switch
            :checked="boolValue(modelValue[field.key])"
            @update:checked="value => patch(field.key, Boolean(value))"
          />
        </div>
      </template>

      <template v-else-if="field.widget === 'select'">
        <Label>{{ field.label }}</Label>
        <Select
          :model-value="textValue(modelValue[field.key])"
          @update:model-value="value => patch(field.key, String(value))"
        >
          <SelectTrigger>
            <SelectValue :placeholder="field.label" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in field.options ?? []"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </template>

      <template v-else-if="field.widget === 'textarea'">
        <Label>{{ field.label }}</Label>
        <Textarea
          :model-value="textValue(modelValue[field.key])"
          :rows="field.key === 'html' ? 8 : 4"
          @update:model-value="value => patch(field.key, String(value ?? ''))"
        />
      </template>

      <template v-else-if="field.widget === 'number'">
        <Label>{{ field.label }}</Label>
        <Input
          type="number"
          :min="field.min"
          :max="field.max"
          :model-value="textValue(modelValue[field.key])"
          @update:model-value="value => commitNumber(field, value)"
        />
      </template>

      <template v-else-if="field.widget === 'media'">
        <Label>{{ field.label }}</Label>
        <div class="border rounded-lg p-3 space-y-2">
          <Input
            :model-value="mediaValue(modelValue[field.key]).assetId"
            placeholder="ID da mídia"
            @update:model-value="value => updateMedia(field.key, { assetId: String(value ?? '') })"
          />
          <Input
            :model-value="mediaValue(modelValue[field.key]).alt"
            placeholder="Texto alternativo"
            @update:model-value="value => updateMedia(field.key, { alt: String(value ?? '') })"
          />
          <Input
            :model-value="mediaValue(modelValue[field.key]).credit"
            placeholder="Crédito"
            @update:model-value="value => updateMedia(field.key, { credit: String(value ?? '') })"
          />
          <p class="text-xs text-muted-foreground">
            Use o identificador da mídia já enviada. A URL assinada não é salva.
          </p>
        </div>
      </template>

      <template v-else-if="field.widget === 'group'">
        <div class="border rounded-lg p-3 space-y-3">
          <p class="text-sm font-medium">
            {{ field.label }}
          </p>
          <CmsSchemaFields
            :fields="field.fields ?? []"
            :model-value="objectValue(modelValue[field.key])"
            :create-item="createItem"
            @update:model-value="value => patch(field.key, value)"
          />
        </div>
      </template>

      <template v-else-if="field.widget === 'list'">
        <div class="flex items-center justify-between gap-2">
          <Label>{{ field.label }}</Label>
          <span v-if="field.max" class="text-xs text-muted-foreground">
            {{ listValue(modelValue[field.key]).length }} / {{ field.max }}
          </span>
        </div>
        <div
          v-for="(item, index) in listValue(modelValue[field.key])"
          :key="`${field.key}-${index}`"
          class="border rounded-lg p-3 space-y-3"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs text-muted-foreground font-medium">
              {{ field.itemLabel || 'Item' }} {{ index + 1 }}
            </p>
            <Button type="button" variant="ghost" size="sm" @click="removeItem(field.key, index)">
              Remover
            </Button>
          </div>
          <CmsSchemaFields
            :fields="field.fields ?? []"
            :model-value="item"
            :create-item="createItem"
            @update:model-value="value => updateItem(field.key, index, value)"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="field.max != null && listValue(modelValue[field.key]).length >= field.max"
          @click="addItem(field)"
        >
          Adicionar {{ (field.itemLabel || 'item').toLowerCase() }}
        </Button>
      </template>

      <template v-else>
        <Label>{{ field.label }}</Label>
        <Input
          :inputmode="field.widget === 'url' ? 'url' : undefined"
          :placeholder="field.placeholder"
          :model-value="textValue(modelValue[field.key])"
          @update:model-value="value => patch(field.key, String(value ?? ''))"
        />
      </template>
    </div>
  </div>
</template>
