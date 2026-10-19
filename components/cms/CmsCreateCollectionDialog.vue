<script setup lang="ts">
import type { CmsCollectionDefinition, CmsCollectionField } from '~/lib/cms/contracts'

import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import CmsCollectionFieldEditor from '~/components/cms/CmsCollectionFieldEditor.vue'
import { cmsFieldErrors, cmsSlugify } from '~/composables/cms/cmsDisplay'
import { normalizeCmsError } from '~/composables/cms/useCmsApi'
import { cmsCreateCollectionInputSchema } from '~/lib/cms/contracts'

const props = defineProps<{
  siteId: string
  create: (input: {
    siteId: string
    key: string
    name: string
    schema: { version: 1, fields: CmsCollectionField[] }
  }) => Promise<CmsCollectionDefinition>
}>()

const emit = defineEmits<{ created: [definition: CmsCollectionDefinition] }>()

const open = defineModel<boolean>('open', { default: false })

const name = ref('')
const key = ref('')
const keyTouched = ref(false)
const fields = ref<CmsCollectionField[]>([{ key: 'titulo', label: 'Título', type: 'text', required: true }])
const errors = ref<Record<string, string>>({})
const submitting = ref(false)

watch(open, (isOpen) => {
  if (!isOpen)
    return
  name.value = ''
  key.value = ''
  keyTouched.value = false
  fields.value = [{ key: 'titulo', label: 'Título', type: 'text', required: true }]
  errors.value = {}
})

function onName(value: string) {
  name.value = value
  if (!keyTouched.value)
    key.value = cmsSlugify(value)
}

async function submit() {
  const parsed = cmsCreateCollectionInputSchema.safeParse({
    siteId: props.siteId,
    name: name.value,
    key: cmsSlugify(key.value),
    schema: { version: 1, fields: fields.value },
  })
  if (!parsed.success) {
    const next: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const path = issue.path[0] === 'schema' ? 'fields' : String(issue.path[0] ?? 'form')
      if (!next[path])
        next[path] = path === 'fields' ? 'Revise os campos: cada um precisa de rótulo, chave e tipo.' : issue.message
    }
    errors.value = next
    return
  }

  errors.value = {}
  submitting.value = true
  try {
    const definition = await props.create(parsed.data)
    toast.success('Coleção criada')
    open.value = false
    emit('created', definition)
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    if (normalized.code === 'aborted')
      return
    const fieldErrors = cmsFieldErrors(normalized.details, normalized.message)
    errors.value = Object.keys(fieldErrors).length ? fieldErrors : { form: normalized.message }
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Nova coleção</DialogTitle>
        <DialogDescription>
          Defina os campos do registro. Texto, número, sim/não e mídia.
        </DialogDescription>
      </DialogHeader>
      <form class="max-h-[70vh] overflow-y-auto pr-1 space-y-4" novalidate @submit.prevent="submit">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="cms-collection-name">Nome</Label>
            <Input
              id="cms-collection-name"
              :model-value="name"
              maxlength="80"
              autofocus
              autocomplete="off"
              placeholder="Ex.: Depoimentos"
              :aria-invalid="Boolean(errors.name) || undefined"
              @update:model-value="value => onName(String(value ?? ''))"
            />
            <p v-if="errors.name" class="text-xs text-destructive">
              {{ errors.name }}
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="cms-collection-key">Chave</Label>
            <Input
              id="cms-collection-key"
              :model-value="key"
              maxlength="64"
              class="font-mono"
              autocomplete="off"
              spellcheck="false"
              placeholder="depoimentos"
              :aria-invalid="Boolean(errors.key) || undefined"
              @update:model-value="value => { keyTouched = true; key = cmsSlugify(String(value ?? '')) }"
            />
            <p v-if="errors.key" class="text-xs text-destructive">
              {{ errors.key }}
            </p>
          </div>
        </div>

        <CmsCollectionFieldEditor v-model="fields" />
        <p v-if="errors.fields" class="text-xs text-destructive">
          {{ errors.fields }}
        </p>
        <p v-if="errors.form" role="alert" class="border border-destructive/30 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {{ errors.form }}
        </p>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button type="button" variant="outline" @click="open = false">
            Cancelar
          </Button>
          <Button type="submit" :disabled="submitting || !name.trim()">
            {{ submitting ? 'Criando…' : 'Criar coleção' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
