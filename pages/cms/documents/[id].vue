<script setup lang="ts">
import type { CmsDocumentPayload, CmsPublicationType } from '~/lib/cms/contracts'

import { computed, onMounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import CmsAutosaveIndicator from '~/components/cms/CmsAutosaveIndicator.vue'
import CmsGate from '~/components/cms/CmsGate.vue'
import CmsRevisionHistorySheet from '~/components/cms/CmsRevisionHistorySheet.vue'
import CmsSlugField from '~/components/cms/CmsSlugField.vue'
import CmsStatusBadge from '~/components/cms/CmsStatusBadge.vue'
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
import { useCmsAutosave } from '~/composables/cms/useCmsAutosave'
import { useCmsDocument } from '~/composables/cms/useCmsDocument'
import { useCmsSites } from '~/composables/cms/useCmsSites'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'
import { CMS_LIMITS } from '~/lib/cms/contracts'

definePageMeta({
  middleware: ['auth'],
  title: 'Documento',
})

const route = useRoute()
const documentId = computed(() => String(route.params.id))

const access = useCmsAccess()
const sites = useCmsSites()
const editor = useCmsDocument(documentId)

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
})
const editVersion = ref(0)
const fieldErrors = ref<Record<string, string>>({})
const actionError = ref<string | null>(null)
const publishing = ref(false)
const unpublishing = ref(false)
const historyOpen = ref(false)
const restoringId = ref<string | null>(null)

const kind = computed(() => editor.document.value?.kind ?? 'page')
const canEdit = computed(() => access.canUpdate(kind.value))
const isPublished = computed(() => editor.document.value?.publicStatus === 'published')
const slugPrefix = computed(() => cmsPathPrefix(kind.value, form.publicationType, sites.currentSite.value))

function payloadFromForm(): CmsDocumentPayload {
  return {
    title: form.title,
    slug: form.slug || undefined,
    excerpt: form.excerpt || undefined,
    body: form.body || undefined,
    blocks: [],
    termIds: [],
    seo: {
      title: form.seoTitle || undefined,
      description: form.seoDescription || undefined,
    },
    sourceName: form.sourceName || undefined,
    sourceUrl: form.sourceUrl || undefined,
  }
}

function applyPayload(payload: CmsDocumentPayload, publicationType?: CmsPublicationType | null) {
  form.title = payload.title ?? ''
  form.slug = payload.slug ?? ''
  form.excerpt = payload.excerpt ?? ''
  form.body = payload.body ?? ''
  form.seoTitle = payload.seo?.title ?? ''
  form.seoDescription = payload.seo?.description ?? ''
  form.sourceName = payload.sourceName ?? ''
  form.sourceUrl = payload.sourceUrl ?? ''
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
  source: () => ({ ...form }),
  enabled: () => canEdit.value && Boolean(editor.document.value),
  save: async ({ expectedVersion, payload }) => {
    fieldErrors.value = {}
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
      if (normalized.code === 'validation_failed')
        fieldErrors.value = cmsFieldErrors(normalized.details)
      throw error
    }
  },
  loadLatest: async () => {
    const latest = await editor.fetchLatest()
    editor.document.value = latest
    return {
      version: latest.editVersion,
      payload: latest.draftPayload,
    }
  },
  apply: (payload) => {
    applyPayload(payload)
  },
})

watch(() => editor.document.value?.id, () => {
  autosave.withoutTracking(() => hydrateFromDocument())
  autosave.reset(editVersion.value, payloadFromForm())
})

onMounted(async () => {
  await editor.load()
  autosave.withoutTracking(() => hydrateFromDocument())
  autosave.reset(editVersion.value, payloadFromForm())
})

watch(() => sites.currentSite.value?.id, async (next, previous) => {
  if (!previous || next === previous)
    return
  editor.clear()
  await editor.load()
  autosave.withoutTracking(() => hydrateFromDocument())
  autosave.reset(editVersion.value, payloadFromForm())
})

function suggestSeoDescription() {
  if (form.seoDescription.trim())
    return
  form.seoDescription = form.excerpt.slice(0, CMS_LIMITS.maxSeoDescriptionLength)
}

async function publish() {
  if (!access.canPublish.value || publishing.value)
    return
  publishing.value = true
  actionError.value = null
  fieldErrors.value = {}
  try {
    await autosave.flush()
    const result = await editor.publish(editVersion.value)
    await editor.load()
    autosave.withoutTracking(() => hydrateFromDocument())
    autosave.reset(editVersion.value, payloadFromForm())
    toast.success(`Publicado em ${result.path}`)
  }
  catch (error: unknown) {
    const normalized = editor.normalizeError(error)
    if (normalized.code === 'version_conflict') {
      autosave.markConflict(normalized.details)
      return
    }
    if (normalized.code === 'validation_failed') {
      fieldErrors.value = cmsFieldErrors(normalized.details)
      actionError.value = normalized.message
      return
    }
    if (normalized.code === 'route_conflict') {
      actionError.value = normalized.message || 'Este endereço já está em uso. Escolha outro.'
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
        await editor.unpublish()
        await editor.load()
        autosave.withoutTracking(() => hydrateFromDocument())
        autosave.reset(editVersion.value, payloadFromForm())
      }
      finally {
        unpublishing.value = false
      }
    },
    {
      title: 'Retirar do ar?',
      description: 'A página deixa de aparecer no site público. O conteúdo permanece no CMS.',
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
    await autosave.flush()
    await editor.restoreRevision(revision.id, editVersion.value)
    await editor.load()
    autosave.withoutTracking(() => hydrateFromDocument())
    autosave.reset(editVersion.value, payloadFromForm())
    historyOpen.value = false
    toast.success('Revisão restaurada como rascunho.')
  }
  catch (error: unknown) {
    const normalized = editor.normalizeError(error)
    if (normalized.code === 'version_conflict')
      autosave.markConflict(normalized.details)
    else
      toast.error(normalized.message)
  }
  finally {
    restoringId.value = null
  }
}

async function keepMine() {
  await autosave.keepMine()
}

async function reloadServer() {
  await autosave.reloadFromServer()
}
</script>

<template>
  <div class="mx-auto max-w-4xl p-4 space-y-6 sm:p-6">
    <CmsGate
      :allowed="access.canRead.value"
      :error="editor.loadError.value"
      @retry="editor.load()"
    >
      <div v-if="editor.pending.value && !editor.document.value" class="space-y-4">
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
                Recarregar versão do servidor
              </Button>
              <Button size="sm" :disabled="autosave.reloading.value" @click="keepMine">
                Manter minha versão
              </Button>
            </div>
          </div>

          <p v-if="actionError" class="text-sm text-destructive" role="alert">
            {{ actionError }}
          </p>
        </header>

        <fieldset class="space-y-6" :disabled="!canEdit">
          <div class="space-y-2">
            <Label :for="titleId">Título</Label>
            <Input
              :id="titleId"
              v-model="form.title"
              :maxlength="CMS_LIMITS.maxTitleLength"
              :aria-invalid="Boolean(fieldErrors.title)"
            />
            <p v-if="fieldErrors.title" class="text-xs text-destructive">
              {{ fieldErrors.title }}
            </p>
          </div>

          <CmsSlugField
            v-model="form.slug"
            :source="form.title"
            :prefix="slugPrefix"
            :locked="isPublished"
            :error="fieldErrors.slug"
            :disabled="!canEdit"
          />

          <div v-if="kind === 'publication'" class="space-y-3">
            <Label>Tipo</Label>
            <div class="grid gap-2 sm:grid-cols-2">
              <button
                v-for="type in (['article', 'news'] as CmsPublicationType[])"
                :key="type"
                type="button"
                class="border rounded-lg p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="form.publicationType === type ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'"
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
            <p v-if="fieldErrors.publicationType" class="text-xs text-destructive">
              {{ fieldErrors.publicationType }}
            </p>
          </div>

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
            <Textarea
              :id="bodyId"
              v-model="form.body"
              rows="12"
              class="min-h-64 text-sm font-mono"
              :aria-invalid="Boolean(fieldErrors.body)"
            />
            <p v-if="fieldErrors.body" class="text-xs text-destructive">
              {{ fieldErrors.body }}
            </p>
          </div>

          <div
            v-if="kind === 'publication' && form.publicationType === 'news'"
            class="grid gap-4 sm:grid-cols-2"
          >
            <div class="space-y-2">
              <Label :for="sourceNameId">Fonte</Label>
              <Input :id="sourceNameId" v-model="form.sourceName" />
            </div>
            <div class="space-y-2">
              <Label :for="sourceUrlId">URL de origem</Label>
              <Input :id="sourceUrlId" v-model="form.sourceUrl" type="url" placeholder="https://" />
              <p v-if="fieldErrors.sourceUrl" class="text-xs text-destructive">
                {{ fieldErrors.sourceUrl }}
              </p>
            </div>
          </div>

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
                />
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
                />
              </div>
            </div>
          </details>
        </fieldset>
      </template>
    </CmsGate>

    <CmsRevisionHistorySheet
      v-model:open="historyOpen"
      :load="editor.listRevisions"
      :can-restore="canEdit"
      :restoring-id="restoringId"
      :published-revision-id="editor.document.value?.publishedRevisionId"
      @restore="restoreRevision"
    />
  </div>
</template>
