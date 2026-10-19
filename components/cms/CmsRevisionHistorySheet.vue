<script setup lang="ts">
import type { CmsRevisionSummary } from '~/composables/cms/useCmsDocument'
import type { CmsPage } from '~/lib/cms/contracts'

import { ref, watch } from 'vue'

import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import { CMS_REVISION_REASON_LABELS, formatCmsDateTime } from '~/composables/cms/cmsDisplay'
import { visibleCmsError } from '~/composables/cms/useCmsApi'

const props = withDefaults(defineProps<{
  /** Injected so the sheet stays agnostic of how revisions are fetched. */
  load: (cursor?: string | null) => Promise<CmsPage<CmsRevisionSummary>>
  canRestore?: boolean
  restoringId?: string | null
  publishedRevisionId?: string | null
}>(), {
  canRestore: false,
  restoringId: null,
  publishedRevisionId: null,
})

const emit = defineEmits<{ restore: [revision: CmsRevisionSummary] }>()

const open = defineModel<boolean>('open', { default: false })

const revisions = ref<CmsRevisionSummary[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
let token = 0

async function loadFirst() {
  const current = ++token
  loading.value = true
  error.value = null
  try {
    const page = await props.load(null)
    if (current !== token)
      return
    revisions.value = page.data
    nextCursor.value = page.nextCursor
  }
  catch (err: unknown) {
    if (current === token)
      error.value = visibleCmsError(err)?.message ?? null
  }
  finally {
    if (current === token)
      loading.value = false
  }
}

async function loadMore() {
  if (!nextCursor.value || loadingMore.value)
    return
  const current = token
  loadingMore.value = true
  try {
    const page = await props.load(nextCursor.value)
    if (current !== token)
      return
    revisions.value = [...revisions.value, ...page.data]
    nextCursor.value = page.nextCursor
  }
  catch (err: unknown) {
    error.value = visibleCmsError(err)?.message ?? null
  }
  finally {
    loadingMore.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen)
    void loadFirst()
})

defineExpose({ reload: loadFirst })
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="right" class="w-full flex flex-col gap-0 p-0 sm:max-w-md">
      <SheetHeader class="border-b px-6 py-4">
        <SheetTitle>Histórico</SheetTitle>
        <SheetDescription>
          Versões salvas em publicações e restaurações. Restaurar cria um novo rascunho; o site só muda quando você publicar.
        </SheetDescription>
      </SheetHeader>

      <div class="flex-1 overflow-y-auto px-6 py-4">
        <div v-if="loading && !revisions.length" class="space-y-3" aria-busy="true">
          <Skeleton v-for="index in 4" :key="index" class="h-16 w-full" />
        </div>

        <CmsEmptyState
          v-else-if="error && !revisions.length"
          tone="error"
          icon="lucide:triangle-alert"
          title="Não foi possível carregar o histórico"
          :description="error"
        >
          <Button size="sm" variant="outline" @click="loadFirst">
            Tentar novamente
          </Button>
        </CmsEmptyState>

        <CmsEmptyState
          v-else-if="!revisions.length"
          icon="lucide:history"
          title="Nenhuma versão ainda"
          description="Uma versão é registrada sempre que o conteúdo é publicado ou restaurado."
        />

        <ol v-else class="space-y-2">
          <li
            v-for="revision in revisions"
            :key="revision.id"
            class="flex items-start justify-between gap-3 border rounded-lg p-3"
          >
            <div class="min-w-0 space-y-0.5">
              <p class="flex flex-wrap items-center gap-2 text-sm font-medium">
                Versão {{ revision.revisionNumber }}
                <span
                  v-if="revision.id === publishedRevisionId"
                  class="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-700 font-medium dark:text-emerald-400"
                >
                  No ar
                </span>
              </p>
              <p class="text-xs text-muted-foreground">
                {{ CMS_REVISION_REASON_LABELS[revision.reason] ?? revision.reason }} · {{ formatCmsDateTime(revision.createdAt) }}
              </p>
            </div>
            <Button
              v-if="canRestore"
              size="sm"
              variant="outline"
              class="shrink-0"
              :disabled="Boolean(restoringId)"
              @click="emit('restore', revision)"
            >
              <Icon
                :name="restoringId === revision.id ? 'lucide:loader-circle' : 'lucide:undo-2'"
                class="mr-1.5 size-3.5"
                :class="{ 'animate-spin': restoringId === revision.id }"
                aria-hidden="true"
              />
              Restaurar como rascunho
            </Button>
          </li>
        </ol>

        <div v-if="nextCursor" class="pt-3">
          <Button variant="ghost" size="sm" class="w-full" :disabled="loadingMore" @click="loadMore">
            {{ loadingMore ? 'Carregando…' : 'Carregar versões anteriores' }}
          </Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
