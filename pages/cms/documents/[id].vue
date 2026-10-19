<script setup lang="ts">
import type { CmsBlock, CmsDocumentPayload, CmsMediaRef, CmsPublicationJob, CmsPublicationType } from '~/lib/cms/contracts'

import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import Tiny from '~/components/articles/Tiny.vue'
import CmsAuthorField from '~/components/cms/CmsAuthorField.vue'
import CmsAutosaveIndicator from '~/components/cms/CmsAutosaveIndicator.vue'
import CmsCoverPicker from '~/components/cms/CmsCoverPicker.vue'
import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import CmsGate from '~/components/cms/CmsGate.vue'
import CmsRevisionHistorySheet from '~/components/cms/CmsRevisionHistorySheet.vue'
import CmsSchedulePanel from '~/components/cms/CmsSchedulePanel.vue'
import CmsSlugField from '~/components/cms/CmsSlugField.vue'
import CmsStatusBadge from '~/components/cms/CmsStatusBadge.vue'
import CmsTermField from '~/components/cms/CmsTermField.vue'
import CmsPageBuilder from '~/components/cms/page-builder/CmsPageBuilder.vue'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import {
  CMS_PUBLICATION_TYPE_HINTS,
  CMS_PUBLICATION_TYPE_LABELS,
  cmsFieldErrors,
  cmsPathPrefix,
} from '~/composables/cms/cmsDisplay'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { useCmsApi } from '~/composables/cms/useCmsApi'
import { useCmsAutosave } from '~/composables/cms/useCmsAutosave'
import { useCmsDocument } from '~/composables/cms/useCmsDocument'
import { useCmsSites } from '~/composables/cms/useCmsSites'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'
import { useTenantPage } from '~/composables/useTenantPage'
import { CMS_LIMITS } from '~/lib/cms/contracts'

definePageMeta({
  middleware: ['auth'],
  title: 'Editar conteúdo',
})

useTenantPage()

const route = useRoute()
const documentId = computed(() => String(route.params.id))

const access = useCmsAccess()
const api = useCmsApi()
const sites = useCmsSites()
const editor = useCmsDocument(documentId)

const ROUTE_CONFLICT_MESSAGE = 'Já existe um conteúdo com este endereço. Escolha outro.'

const titleId = useId()
const excerptId = useId()
const bodyId = useId()
const seoTitleId = useId()
const seoDescriptionId = useId()
const sourceNameId = useId()
const sourceUrlId = useId()

const form = reactive({
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  publicationType: null as CmsPublicationType | null,
  sourceName: '',
  sourceUrl: '',
  seoTitle: '',
  seoDescription: '',
  canonicalUrl: '',
  noindex: false,
  eventDate: '',
  cover: null as CmsMediaRef | null,
  authorId: '',
  termIds: [] as string[],
  blocks: [] as CmsBlock[],
})
const editVersion = ref(0)
const fieldErrors = ref<Record<string, string>>({})
const actionError = ref<string | null>(null)
const publishing = ref(false)
const unpublishing = ref(false)
const historyOpen = ref(false)
const restoringId = ref<string | null>(null)
const displaced = ref(false)
const loadedTenantId = ref<string | null>(null)

const kind = computed(() => editor.document.value?.kind ?? 'page')
const blockError = computed(() => {
  const direct = fieldErrors.value.blocks
  if (direct)
    return direct
  const nested = Object.entries(fieldErrors.value).find(([key]) => key === 'blocks' || key.startsWith('blocks.'))
  return nested?.[1]
})
const canEdit = computed(() => Boolean(editor.document.value) && access.canUpdate(kind.value))
const isPublished = computed(() => editor.document.value?.publicStatus === 'published')
const slugLocked = computed(() => {
  const current = editor.document.value
  if (!current)
    return false
  return current.publicStatus !== 'unpublished' || Boolean(current.publishedRevisionId || current.publishedAt)
})
const documentSite = computed(() =>
  sites.sites.value.find(site => site.id === editor.document.value?.siteId) ?? null,
)
const slugPrefix = computed(() => cmsPathPrefix(kind.value, form.publicationType, documentSite.value))

function fieldError(...keys: string[]): string | undefined {
  for (const key of keys) {
    const message = fieldErrors.value[key]
    if (message)
      return message
  }
  return undefined
}

function payloadFromForm(): CmsDocumentPayload {
  const current = editor.document.value?.draftPayload
  const sourceUrl = form.sourceUrl.trim()
  const canonical = form.canonicalUrl.trim()
  const seo = {
    ...current?.seo,
    title: form.seoTitle.trim() || undefined,
    description: form.seoDescription.trim() || undefined,
    canonicalUrl: canonical || undefined,
    noindex: form.noindex || undefined,
  }
  if (!seo.title)
    delete seo.title
  if (!seo.description)
    delete seo.description
  if (!seo.canonicalUrl)
    delete seo.canonicalUrl
  if (!seo.noindex)
    delete seo.noindex
  const publication = editor.document.value?.kind === 'publication'
  const cover = publication
    ? form.cover
    : (current?.cover ?? null)
  const payload: CmsDocumentPayload = {
    title: form.title,
    slug: form.slug || undefined,
    excerpt: form.excerpt || undefined,
    body: form.body,
    blocks: publication ? (current?.blocks ?? []) : form.blocks,
    cover,
    authorId: publication ? (form.authorId || null) : (current?.authorId ?? null),
    termIds: publication ? [...form.termIds] : (current?.termIds ?? []),
    seo,
  }
  if (form.publicationType === 'news') {
    payload.sourceName = form.sourceName.trim() || undefined
    payload.sourceUrl = sourceUrl || undefined
    payload.eventDate = form.eventDate.trim() || undefined
  }
  return payload
}

function applyPayload(payload: CmsDocumentPayload, publicationType?: CmsPublicationType | null) {
  form.title = payload.title ?? ''
  form.slug = payload.slug ?? ''
  form.excerpt = payload.excerpt ?? ''
  form.body = payload.body ?? ''
  form.blocks = JSON.parse(JSON.stringify(payload.blocks ?? [])) as CmsBlock[]
  form.seoTitle = payload.seo?.title ?? ''
  form.seoDescription = payload.seo?.description ?? ''
  form.canonicalUrl = payload.seo?.canonicalUrl ?? ''
  form.noindex = Boolean(payload.seo?.noindex)
  form.sourceName = payload.sourceName ?? ''
  form.sourceUrl = payload.sourceUrl ?? ''
  form.eventDate = payload.eventDate ? payload.eventDate.slice(0, 10) : ''
  form.cover = payload.cover ?? null
  form.authorId = payload.authorId ?? ''
  form.termIds = [...(payload.termIds ?? [])]
  if (publicationType !== undefined)
    form.publicationType = publicationType
}

function hydrateFromDocument() {
  const doc = editor.document.value
  if (!doc)
    return
  applyPayload(doc.draftPayload, doc.publicationType)
  editVersion.value = doc.editVersion
  fieldErrors.value = {}
  actionError.value = null
}

const autosave = useCmsAutosave({
  version: editVersion,
  getPayload: payloadFromForm,
  source: () => form,
  enabled: () => canEdit.value && !displaced.value && loadedTenantId.value === api.tenantId.value,
  save: async ({ expectedVersion, payload }) => {
    fieldErrors.value = {}
    actionError.value = null
    try {
      const saved = await editor.saveDraft({
        expectedVersion,
        payload,
        publicationType: kind.value === 'publication' ? form.publicationType ?? undefined : undefined,
      })
      return { version: saved.editVersion }
    }
    catch (error: unknown) {
      const normalized = editor.normalizeError(error)
      if (normalized.code === 'route_conflict')
        fieldErrors.value = { slug: ROUTE_CONFLICT_MESSAGE }
      else if (normalized.code === 'validation_failed' || normalized.status === 422)
        fieldErrors.value = cmsFieldErrors(normalized.details)
      throw error
    }
  },
  loadLatest: async () => {
    const latest = await editor.fetchLatest()
    if (api.tenantId.value !== loadedTenantId.value)
      throw new Error('Empresa alterada')
    editor.document.value = latest
    return {
      version: latest.editVersion,
      payload: latest.draftPayload,
    }
  },
  apply: (payload) => {
    applyPayload(payload, editor.document.value?.publicationType ?? form.publicationType)
  },
})

function rememberServerDocument() {
  loadedTenantId.value = api.tenantId.value
  autosave.withoutTracking(() => hydrateFromDocument())
  autosave.reset(editVersion.value)
}

function clearEditor() {
  fieldErrors.value = {}
  actionError.value = null
  loadedTenantId.value = null
  editor.clear()
  autosave.withoutTracking(() => {
    form.title = ''
    form.slug = ''
    form.excerpt = ''
    form.body = ''
    form.publicationType = null
    form.sourceName = ''
    form.sourceUrl = ''
    form.seoTitle = ''
    form.seoDescription = ''
    form.canonicalUrl = ''
    form.noindex = false
    form.eventDate = ''
    form.cover = null
    form.authorId = ''
    form.termIds = []
  })
  autosave.reset(0)
}

async function openDocument() {
  const tenant = api.tenantId.value
  const id = documentId.value
  if (!tenant || !id || displaced.value)
    return
  const loaded = await editor.load()
  if (!loaded || displaced.value || api.tenantId.value !== tenant || documentId.value !== id)
    return
  rememberServerDocument()
}

watch(documentId, (id, previous) => {
  if (previous !== undefined && id !== previous)
    displaced.value = false
  if (!displaced.value)
    void openDocument()
}, { immediate: true })

watch(() => api.tenantId.value, (next, previous) => {
  if (!previous || next === previous)
    return
  displaced.value = true
  clearEditor()
})

function suggestSeoDescription() {
  const suggestion = form.excerpt.trim().slice(0, CMS_LIMITS.maxSeoDescriptionLength)
  if (!suggestion) {
    toast.message('Escreva um resumo para sugerir a descrição.')
    return
  }
  form.seoDescription = suggestion
}

async function publish() {
  if (!access.canPublish.value || publishing.value)
    return
  publishing.value = true
  actionError.value = null
  fieldErrors.value = {}
  try {
    const flushed = await autosave.flush()
    if (!flushed) {
      if (autosave.state.value !== 'conflict')
        actionError.value = 'Não foi possível salvar antes de publicar.'
      return
    }
    const result = await editor.publish(editVersion.value)
    const loaded = await editor.load()
    if (loaded)
      rememberServerDocument()
    toast.success(`Publicado em ${result.path}`)
  }
  catch (error: unknown) {
    const normalized = editor.normalizeError(error)
    if (normalized.code === 'aborted')
      return
    if (normalized.code === 'version_conflict') {
      autosave.markConflict(normalized.details)
      return
    }
    if (normalized.code === 'route_conflict') {
      fieldErrors.value = { slug: ROUTE_CONFLICT_MESSAGE }
      actionError.value = ROUTE_CONFLICT_MESSAGE
      return
    }
    if (normalized.code === 'validation_failed' || normalized.status === 422) {
      fieldErrors.value = cmsFieldErrors(normalized.details)
      actionError.value = normalized.message
      return
    }
    actionError.value = normalized.message
  }
  finally {
    publishing.value = false
  }
}

async function unpublish() {
  if (!access.canPublish.value || unpublishing.value)
    return
  const confirmed = await deleteWithConfirm(
    async () => {
      unpublishing.value = true
      try {
        const flushed = await autosave.flush()
        if (!flushed)
          throw new Error('Não foi possível salvar as alterações antes de retirar do ar.')
        await editor.unpublish()
        const loaded = await editor.load()
        if (loaded)
          rememberServerDocument()
      }
      finally {
        unpublishing.value = false
      }
    },
    {
      title: 'Retirar do ar?',
      description: 'O conteúdo deixa de aparecer no site. O rascunho e o histórico permanecem no CMS.',
      confirmLabel: 'Retirar do ar',
      successMessage: 'Conteúdo retirado do ar.',
      errorMessage: 'Não foi possível retirar do ar.',
    },
  )
  void confirmed
}

async function restoreRevision(revision: { id: string }) {
  if (!canEdit.value || restoringId.value)
    return
  restoringId.value = revision.id
  try {
    const flushed = await autosave.flush()
    if (!flushed) {
      if (autosave.state.value !== 'conflict')
        toast.error('Salve as alterações pendentes antes de restaurar.')
      return
    }
    await editor.restoreRevision(revision.id, editVersion.value)
    const loaded = await editor.load()
    if (loaded)
      rememberServerDocument()
    historyOpen.value = false
    toast.success('Versão restaurada como rascunho.')
  }
  catch (error: unknown) {
    const normalized = editor.normalizeError(error)
    if (normalized.code === 'version_conflict')
      autosave.markConflict(normalized.details)
    else if (normalized.code !== 'aborted')
      toast.error(normalized.message)
  }
  finally {
    restoringId.value = null
  }
}

async function keepMine() {
  const kept = await autosave.keepMine()
  if (!kept && autosave.lastError.value)
    toast.error(autosave.lastError.value.message)
}

async function reloadServer() {
  const reloaded = await autosave.reloadFromServer()
  if (!reloaded && autosave.lastError.value)
    toast.error(autosave.lastError.value.message)
}

const OPEN_JOB = new Set(['pending', 'processing', 'retrying'])

async function loadSchedule(): Promise<CmsPublicationJob | null> {
  const page = await editor.listJobs()
  return page.data.find(item => OPEN_JOB.has(item.status)) ?? null
}

async function schedulePublication(input: { runAt: string, timezone: string }): Promise<CmsPublicationJob | null> {
  if (!access.canPublish.value)
    return null
  const flushed = await autosave.flush()
  if (!flushed) {
    if (autosave.state.value !== 'conflict')
      actionError.value = 'Não foi possível salvar antes de agendar.'
    return null
  }
  return editor.schedule({
    runAt: input.runAt,
    timezone: input.timezone,
    expectedVersion: editVersion.value,
  })
}

async function cancelPublication(): Promise<CmsPublicationJob | null> {
  if (!access.canPublish.value)
    return null
  return editor.cancelSchedule()
}
</script>

<template>
  <div class="mx-auto space-y-6" :class="kind === 'page' && editor.document.value ? 'max-w-[90rem]' : 'max-w-6xl'">
    <CmsGate
      :allowed="access.canRead.value"
      :error="displaced ? null : editor.loadError.value"
      @retry="openDocument"
    >
      <CmsEmptyState
        v-if="displaced"
        icon="lucide:building-2"
        title="Empresa alterada"
        description="O conteúdo aberto era de outra empresa. O editor foi esvaziado para não misturar os dados."
      >
        <Button as-child>
          <NuxtLink to="/cms">
            Ir para a visão geral
          </NuxtLink>
        </Button>
      </CmsEmptyState>

      <div v-else-if="editor.pending.value && !editor.document.value" class="space-y-4">
        <div class="h-10 w-2/3 animate-pulse rounded-lg bg-muted" />
        <div class="h-64 animate-pulse rounded-xl bg-muted" />
      </div>

      <template v-else-if="editor.document.value">
        <header class="border-b pb-4 space-y-4">
          <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <NuxtLink
              :to="kind === 'page' ? '/cms/pages' : '/cms/publications'"
              class="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {{ kind === 'page' ? 'Páginas' : 'Publicações' }}
            </NuxtLink>
            <Icon name="lucide:chevron-right" class="size-3.5" aria-hidden="true" />
            <span class="truncate text-foreground">{{ form.title || 'Sem título' }}</span>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 space-y-2">
              <h1 class="text-xl font-semibold tracking-tight">
                {{ kind === 'page' ? 'Editar página' : form.publicationType === 'news' ? 'Editar notícia' : 'Editar artigo' }}
              </h1>
              <div class="flex flex-wrap items-center gap-2">
                <CmsStatusBadge
                  :status="editor.document.value.publicStatus"
                  :has-unpublished-changes="editor.document.value.hasUnpublishedChanges"
                />
                <CmsAutosaveIndicator
                  :state="autosave.state.value"
                  :is-dirty="autosave.isDirty.value"
                  :last-saved-at="autosave.lastSavedAt.value"
                  :error-message="autosave.lastError.value?.message"
                  @retry="autosave.retry()"
                />
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" @click="historyOpen = true">
                <Icon name="lucide:history" class="mr-2 size-4" aria-hidden="true" />
                Histórico
              </Button>
              <Button
                v-if="access.canPublish.value && isPublished"
                variant="outline"
                size="sm"
                :disabled="unpublishing"
                @click="unpublish"
              >
                Retirar do ar
              </Button>
              <Button
                v-if="access.canPublish.value"
                size="sm"
                :disabled="publishing || autosave.state.value === 'conflict'"
                @click="publish"
              >
                <Icon name="lucide:upload" class="mr-2 size-4" aria-hidden="true" />
                {{ isPublished ? 'Publicar alterações' : 'Publicar' }}
              </Button>
            </div>
          </div>

          <div
            v-if="autosave.state.value === 'conflict'"
            class="border border-destructive/30 rounded-lg bg-destructive/5 p-3 text-sm"
            role="alert"
          >
            <p class="text-destructive font-medium">
              Outra pessoa salvou enquanto você editava.
            </p>
            <p class="mt-1 text-muted-foreground">
              Suas alterações locais foram preservadas. Escolha como continuar.
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" :disabled="autosave.reloading.value" @click="reloadServer">
                Recarregar
              </Button>
              <Button size="sm" :disabled="autosave.reloading.value" @click="keepMine">
                Manter minha versão
              </Button>
            </div>
          </div>

          <p v-if="actionError" class="text-sm text-destructive" role="alert">
            {{ actionError }}
          </p>

          <CmsSchedulePanel
            v-if="access.canPublish.value"
            :timezone="documentSite?.timezone || 'America/Sao_Paulo'"
            :current-version="editVersion"
            :load="loadSchedule"
            :schedule="schedulePublication"
            :cancel="cancelPublication"
          />
        </header>

        <fieldset class="space-y-6" :disabled="!canEdit">
          <div class="space-y-2">
            <Label :for="titleId">Título</Label>
            <Input
              :id="titleId"
              v-model="form.title"
              :maxlength="CMS_LIMITS.maxTitleLength"
              :aria-invalid="Boolean(fieldError('title', 'payload.title'))"
            />
            <p v-if="fieldError('title', 'payload.title')" class="text-xs text-destructive">
              {{ fieldError('title', 'payload.title') }}
            </p>
          </div>

          <CmsSlugField
            v-model="form.slug"
            :source="form.title"
            :auto="false"
            :prefix="slugPrefix"
            :locked="slugLocked"
            :error="fieldError('slug', 'payload.slug')"
            :disabled="!canEdit"
          />

          <div v-if="kind === 'publication'" class="space-y-3">
            <Label>Tipo</Label>
            <div class="grid gap-2 sm:grid-cols-2">
              <button
                v-for="type in (['article', 'news'] as CmsPublicationType[])"
                :key="type"
                type="button"
                class="border rounded-lg p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="form.publicationType === type ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'"
                :disabled="slugLocked"
                @click="form.publicationType = type"
              >
                <p class="text-sm font-medium">
                  {{ CMS_PUBLICATION_TYPE_LABELS[type] }}
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ CMS_PUBLICATION_TYPE_HINTS[type] }}
                </p>
              </button>
            </div>
            <p v-if="slugLocked" class="text-xs text-muted-foreground">
              O tipo não muda depois que a publicação vai ao ar.
            </p>
            <p v-if="fieldErrors.publicationType" class="text-xs text-destructive">
              {{ fieldErrors.publicationType }}
            </p>
          </div>

          <div v-if="kind === 'publication'" class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div class="min-w-0 space-y-6">
              <div class="space-y-2">
                <Label :for="excerptId">Resumo</Label>
                <Textarea
                  :id="excerptId"
                  v-model="form.excerpt"
                  rows="3"
                  :maxlength="CMS_LIMITS.maxExcerptLength"
                  :aria-invalid="Boolean(fieldErrors.excerpt)"
                />
                <p v-if="fieldErrors.excerpt" class="text-xs text-destructive">
                  {{ fieldErrors.excerpt }}
                </p>
              </div>

              <div class="space-y-2">
                <Label :for="bodyId">Conteúdo</Label>
                <ClientOnly>
                  <Tiny
                    v-model="form.body"
                    :height="520"
                    :disabled="!canEdit"
                  />
                  <template #fallback>
                    <div class="h-[520px] animate-pulse rounded-md bg-muted" />
                  </template>
                </ClientOnly>
                <p v-if="fieldErrors.body" class="text-xs text-destructive">
                  {{ fieldErrors.body }}
                </p>
              </div>

              <div v-if="form.publicationType === 'news'" class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label :for="sourceNameId">Fonte</Label>
                  <Input
                    :id="sourceNameId"
                    v-model="form.sourceName"
                    :aria-invalid="Boolean(fieldError('sourceName', 'payload.sourceName'))"
                  />
                  <p v-if="fieldError('sourceName', 'payload.sourceName')" class="text-xs text-destructive">
                    {{ fieldError('sourceName', 'payload.sourceName') }}
                  </p>
                </div>
                <div class="space-y-2">
                  <Label :for="sourceUrlId">URL de origem</Label>
                  <Input :id="sourceUrlId" v-model="form.sourceUrl" type="url" placeholder="https://" />
                  <p v-if="fieldError('sourceUrl', 'payload.sourceUrl')" class="text-xs text-destructive">
                    {{ fieldError('sourceUrl', 'payload.sourceUrl') }}
                  </p>
                </div>
                <div class="space-y-2">
                  <Label for="cms-event-date">Data do fato</Label>
                  <Input id="cms-event-date" v-model="form.eventDate" type="date" />
                  <p v-if="fieldError('eventDate', 'payload.eventDate')" class="text-xs text-destructive">
                    {{ fieldError('eventDate', 'payload.eventDate') }}
                  </p>
                </div>
              </div>
            </div>

            <aside class="lg:sticky lg:top-4 space-y-6">
              <CmsCoverPicker
                v-model="form.cover"
                :disabled="!canEdit"
                :error="fieldError('cover', 'payload.cover')"
              />
              <CmsAuthorField
                v-model="form.authorId"
                :site-id="editor.document.value.siteId"
                :disabled="!canEdit"
                :error="fieldError('authorId', 'payload.authorId')"
              />
              <CmsTermField
                v-model="form.termIds"
                :site-id="editor.document.value.siteId"
                kind="category"
                label="Categorias"
                :disabled="!canEdit"
                :error="fieldError('termIds', 'payload.termIds')"
              />
              <CmsTermField
                v-model="form.termIds"
                :site-id="editor.document.value.siteId"
                kind="tag"
                label="Tags"
                :disabled="!canEdit"
                :error="fieldError('termIds', 'payload.termIds')"
              />
            </aside>
          </div>

          <template v-else>
            <div class="space-y-2">
              <Label :for="excerptId">Resumo</Label>
              <Textarea
                :id="excerptId"
                v-model="form.excerpt"
                rows="3"
                :maxlength="CMS_LIMITS.maxExcerptLength"
                :aria-invalid="Boolean(fieldErrors.excerpt)"
              />
              <p v-if="fieldErrors.excerpt" class="text-xs text-destructive">
                {{ fieldErrors.excerpt }}
              </p>
            </div>

            <div class="space-y-2">
              <Label>Conteúdo</Label>
              <CmsPageBuilder v-model="form.blocks" :disabled="!canEdit" />
              <p v-if="blockError" class="text-xs text-destructive" role="alert">
                {{ blockError }}
              </p>
            </div>
          </template>

          <details class="border rounded-xl p-4">
            <summary class="cursor-pointer text-sm font-medium">
              SEO
            </summary>
            <div class="mt-4 space-y-4">
              <div class="space-y-2">
                <Label :for="seoTitleId">Título SEO</Label>
                <Input
                  :id="seoTitleId"
                  v-model="form.seoTitle"
                  :maxlength="CMS_LIMITS.maxSeoTitleLength"
                  :aria-invalid="Boolean(fieldError('seo.title', 'payload.seo.title'))"
                />
                <p v-if="fieldError('seo.title', 'payload.seo.title')" class="text-xs text-destructive">
                  {{ fieldError('seo.title', 'payload.seo.title') }}
                </p>
              </div>
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <Label :for="seoDescriptionId">Descrição SEO</Label>
                  <button
                    type="button"
                    class="text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    @click="suggestSeoDescription"
                  >
                    Sugerir a partir do resumo
                  </button>
                </div>
                <Textarea
                  :id="seoDescriptionId"
                  v-model="form.seoDescription"
                  rows="3"
                  :maxlength="CMS_LIMITS.maxSeoDescriptionLength"
                  :aria-invalid="Boolean(fieldError('seo.description', 'payload.seo.description'))"
                />
                <p v-if="fieldError('seo.description', 'payload.seo.description')" class="text-xs text-destructive">
                  {{ fieldError('seo.description', 'payload.seo.description') }}
                </p>
              </div>
              <div class="space-y-2">
                <Label for="cms-canonical">URL canônica</Label>
                <Input
                  id="cms-canonical"
                  v-model="form.canonicalUrl"
                  type="url"
                  inputmode="url"
                  placeholder="https://"
                  :aria-invalid="Boolean(fieldError('seo.canonicalUrl', 'canonicalUrl'))"
                />
                <p v-if="fieldError('seo.canonicalUrl', 'canonicalUrl')" class="text-xs text-destructive">
                  {{ fieldError('seo.canonicalUrl', 'canonicalUrl') }}
                </p>
              </div>
              <div class="flex items-center justify-between gap-3">
                <Label for="cms-noindex" class="font-normal">Ocultar dos mecanismos de busca</Label>
                <Switch
                  id="cms-noindex"
                  :checked="form.noindex"
                  :disabled="!canEdit"
                  @update:checked="value => (form.noindex = Boolean(value))"
                />
              </div>
            </div>
          </details>
        </fieldset>
      </template>
    </CmsGate>

    <CmsRevisionHistorySheet
      v-model:open="historyOpen"
      :document-id="documentId"
      :load="editor.listRevisions"
      :can-restore="canEdit"
      :restoring-id="restoringId"
      :published-revision-id="editor.document.value?.publishedRevisionId"
      @restore="restoreRevision"
    />
  </div>
</template>
