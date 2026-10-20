<script setup lang="ts">
import type { CmsCollectionField, CmsEntryStatus } from '~/lib/cms/contracts'

import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import CmsCollectionFieldEditor from '~/components/cms/CmsCollectionFieldEditor.vue'
import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import CmsEntryForm from '~/components/cms/CmsEntryForm.vue'
import CmsGate from '~/components/cms/CmsGate.vue'
import CmsPageHeader from '~/components/cms/CmsPageHeader.vue'
import { cmsEntryLabel, cmsFieldErrors } from '~/composables/cms/cmsDisplay'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { normalizeCmsError } from '~/composables/cms/useCmsApi'
import { useCmsCollection, useCmsCollectionEntries, useCmsCollections } from '~/composables/cms/useCmsCollections'
import { useCmsSites } from '~/composables/cms/useCmsSites'
import { confirmDelete } from '~/composables/useConfirmDelete'
import { useTenantPage } from '~/composables/useTenantPage'
import { cmsCollectionSchemaSchema } from '~/lib/cms/contracts'

definePageMeta({
  middleware: ['auth'],
  title: 'Coleção',
})

useTenantPage()

const route = useRoute()
const definitionId = computed(() => String(route.params.id || ''))
const access = useCmsAccess()
const sites = useCmsSites()
const collection = useCmsCollection(definitionId)
const collections = useCmsCollections(computed(() => collection.definition.value?.siteId ?? sites.currentSite.value?.id ?? null))
const entries = useCmsCollectionEntries(definitionId)

const schemaOpen = ref(false)
const schemaFields = ref<CmsCollectionField[]>([])
const schemaError = ref<string | null>(null)
const savingSchema = ref(false)
const savingEntry = ref(false)
const entryError = ref<string | null>(null)
const payload = ref<Record<string, unknown>>({})
const status = ref<CmsEntryStatus>('draft')

const selectedId = computed(() => {
  const value = route.query.entry
  return typeof value === 'string' && value ? value : null
})
const creating = computed(() => selectedId.value === 'new')
const activeEntry = computed(() => entries.entries.value.find(entry => entry.id === selectedId.value) ?? null)

const gateError = computed(() => collection.loadError.value ?? entries.loadError.value)
const loading = computed(() => !access.ready.value || collection.showSkeleton.value)
const canWrite = computed(() => access.canManageSchemas.value)

const editorTitle = computed(() => {
  const definition = collection.definition.value
  if (!definition || creating.value || !activeEntry.value)
    return 'Novo registro'
  return cmsEntryLabel(definition, activeEntry.value)
})

const headerDescription = computed(() => {
  const definition = collection.definition.value
  if (!definition)
    return ''
  return `Chave ${definition.key}. Cada registro segue estes campos.`
})

function blankPayload(): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const field of collection.definition.value?.schema.fields ?? [])
    next[field.key] = field.type === 'boolean' ? false : null
  return next
}

function applyEntry() {
  entryError.value = null
  if (creating.value || !activeEntry.value) {
    payload.value = blankPayload()
    status.value = 'draft'
    return
  }
  payload.value = { ...blankPayload(), ...activeEntry.value.payload }
  status.value = activeEntry.value.status
}

watch([activeEntry, creating, () => collection.definition.value?.id], applyEntry, { immediate: true })

watch([() => sites.currentSite.value?.id, () => collection.definition.value?.siteId], ([current, owner]) => {
  if (current && owner && current !== owner)
    void navigateTo('/cms/collections')
})

watch(() => collection.definition.value?.schema, (schema) => {
  if (schema)
    schemaFields.value = schema.fields.map(field => ({ ...field }))
}, { immediate: true })

function selectEntry(id: string | null) {
  void navigateTo({
    path: `/cms/collections/${definitionId.value}`,
    query: id ? { entry: id } : {},
  })
}

async function saveSchema() {
  const definition = collection.definition.value
  if (!definition || savingSchema.value)
    return
  const parsed = cmsCollectionSchemaSchema.safeParse({ version: 1, fields: schemaFields.value })
  if (!parsed.success) {
    schemaError.value = 'Revise os campos: cada um precisa de rótulo, chave e tipo, sem chaves repetidas.'
    return
  }
  schemaError.value = null
  savingSchema.value = true
  try {
    await collections.updateDefinition(definition.id, { schema: parsed.data })
    await collection.refresh()
    schemaOpen.value = false
    toast.success('Campos atualizados')
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    if (normalized.code === 'aborted')
      return
    schemaError.value = normalized.message
  }
  finally {
    savingSchema.value = false
  }
}

async function saveEntry() {
  if (!canWrite.value || savingEntry.value)
    return
  savingEntry.value = true
  entryError.value = null
  try {
    const input = { payload: payload.value, status: status.value }
    const saved = creating.value || !activeEntry.value
      ? await entries.createEntry(input)
      : await entries.updateEntry(activeEntry.value.id, input)
    toast.success('Registro salvo')
    selectEntry(saved.id)
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    if (normalized.code === 'aborted')
      return
    const fields = cmsFieldErrors(normalized.details, normalized.message)
    entryError.value = fields.form || Object.values(fields)[0] || normalized.message
  }
  finally {
    savingEntry.value = false
  }
}

async function removeEntry() {
  const entry = activeEntry.value
  const definition = collection.definition.value
  if (!entry || !definition)
    return
  const confirmed = await confirmDelete({
    title: 'Excluir registro?',
    description: `"${cmsEntryLabel(definition, entry)}" será removido.`,
    confirmLabel: 'Excluir',
  })
  if (!confirmed)
    return
  try {
    await entries.deleteEntry(entry.id)
    toast.success('Registro excluído')
    selectEntry(null)
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    if (normalized.code !== 'aborted')
      toast.error(normalized.message)
  }
}

async function removeCollection() {
  const definition = collection.definition.value
  if (!definition)
    return
  const confirmed = await confirmDelete({
    title: 'Excluir coleção?',
    description: `"${definition.name}" e todos os registros serão removidos.`,
    confirmLabel: 'Excluir coleção',
  })
  if (!confirmed)
    return
  try {
    await collections.deleteDefinition(definition.id)
    toast.success('Coleção excluída')
    await navigateTo('/cms/collections')
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    if (normalized.code !== 'aborted')
      toast.error(normalized.message)
  }
}

function retry() {
  void collection.refresh()
  void entries.refresh()
}
</script>

<template>
  <CmsGate :allowed="access.canRead.value" :error="gateError" @retry="retry">
    <div v-if="loading" class="space-y-3" aria-busy="true">
      <Skeleton class="h-8 w-48" />
      <Skeleton class="h-40 w-full" />
    </div>

    <CmsEmptyState
      v-else-if="!collection.definition.value"
      icon="lucide:layers"
      title="Coleção não encontrada"
      description="Ela pode ter sido excluída ou pertencer a outra empresa."
    >
      <Button variant="outline" as-child>
        <NuxtLink to="/cms/collections">
          Voltar às coleções
        </NuxtLink>
      </Button>
    </CmsEmptyState>

    <div v-else class="space-y-6">
      <CmsPageHeader
        :title="collection.definition.value.name"
        :description="headerDescription"
        :sites="sites.sites.value"
        :current-site-id="sites.currentSite.value?.id"
        @select-site="sites.selectSite"
      >
        <template #actions>
          <Button variant="outline" as-child>
            <NuxtLink to="/cms/collections">
              Coleções
            </NuxtLink>
          </Button>
          <Button v-if="canWrite" variant="outline" @click="schemaOpen = !schemaOpen">
            Campos
          </Button>
          <Button v-if="canWrite" @click="selectEntry('new')">
            <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
            Novo registro
          </Button>
        </template>
      </CmsPageHeader>

      <section v-if="schemaOpen && canWrite" class="border rounded-xl bg-card p-4 space-y-3">
        <div>
          <h2 class="text-sm font-medium">
            Campos
          </h2>
          <p class="text-xs text-muted-foreground">
            Alterar o esquema não reescreve os registros já salvos. Eles passam a valer na próxima edição.
          </p>
        </div>
        <CmsCollectionFieldEditor v-model="schemaFields" :disabled="savingSchema" />
        <p v-if="schemaError" class="text-xs text-destructive">
          {{ schemaError }}
        </p>
        <div class="flex justify-between gap-2">
          <Button type="button" variant="ghost" class="text-destructive" @click="removeCollection">
            Excluir coleção
          </Button>
          <Button type="button" :disabled="savingSchema" @click="saveSchema">
            {{ savingSchema ? 'Salvando…' : 'Salvar campos' }}
          </Button>
        </div>
      </section>

      <div class="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div class="border rounded-xl bg-card">
          <p v-if="entries.showSkeleton.value" class="px-3 py-4 text-sm text-muted-foreground">
            Carregando registros…
          </p>
          <CmsEmptyState
            v-else-if="!entries.entries.value.length"
            icon="lucide:inbox"
            title="Nenhum registro"
            description="Crie o primeiro a partir dos campos desta coleção."
          />
          <ul v-else class="divide-y">
            <li v-for="entry in entries.entries.value" :key="entry.id">
              <button
                type="button"
                class="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
                :class="entry.id === selectedId ? 'bg-muted/60' : ''"
                @click="selectEntry(entry.id)"
              >
                <span class="truncate text-sm">{{ cmsEntryLabel(collection.definition.value, entry) }}</span>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {{ entry.status === 'published' ? 'Publicado' : 'Rascunho' }}
                </span>
              </button>
            </li>
          </ul>
        </div>

        <section class="border rounded-xl bg-card p-5">
          <div v-if="!selectedId" class="py-8 text-center text-sm text-muted-foreground">
            Selecione um registro ou crie um novo.
          </div>
          <template v-else>
            <div class="mb-4 flex items-center justify-between gap-2">
              <h2 class="text-sm font-medium">
                {{ editorTitle }}
              </h2>
              <Button v-if="canWrite && activeEntry" type="button" variant="ghost" size="sm" @click="removeEntry">
                Excluir
              </Button>
            </div>
            <p v-if="entryError" role="alert" class="mb-4 border border-destructive/30 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {{ entryError }}
            </p>
            <CmsEntryForm
              v-model:payload="payload"
              v-model:status="status"
              :schema="collection.definition.value.schema"
              :disabled="!canWrite"
              :saving="savingEntry"
              @submit="saveEntry"
            />
          </template>
        </section>
      </div>
    </div>
  </CmsGate>
</template>
