<script setup lang="ts">
import type { CmsDocumentKind, CmsDocumentSummary, CmsPublicationType } from '~/lib/cms/contracts'

import { computed, ref } from 'vue'

import CmsCreateDocumentDialog from '~/components/cms/CmsCreateDocumentDialog.vue'
import CmsCreateSiteDialog from '~/components/cms/CmsCreateSiteDialog.vue'
import CmsDocumentsTable from '~/components/cms/CmsDocumentsTable.vue'
import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import CmsGate from '~/components/cms/CmsGate.vue'
import CmsPageHeader from '~/components/cms/CmsPageHeader.vue'
import { CMS_PUBLICATION_TYPE_LABELS } from '~/composables/cms/cmsDisplay'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { useCmsDocuments } from '~/composables/cms/useCmsDocuments'
import { useCmsSites } from '~/composables/cms/useCmsSites'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'

const props = defineProps<{
  kind: CmsDocumentKind
  title: string
  description: string
}>()

const access = useCmsAccess()
const {
  sites,
  currentSite,
  pending: sitesPending,
  showSkeleton: sitesSkeleton,
  loadError: sitesError,
  refresh: refreshSites,
  selectSite,
  createSite,
} = useCmsSites()

const documents = useCmsDocuments({
  kind: props.kind,
  siteId: () => currentSite.value?.id,
})

const createOpen = ref(false)
const createSiteOpen = ref(false)

const allowCreate = computed(() => access.canCreate(props.kind))
const allowDelete = computed(() => access.canDelete(props.kind))
const canManageSettings = computed(() => access.canManageSettings.value)

const gateError = computed(() => sitesError.value ?? (documents.items.value.length ? null : documents.loadError.value))
const showInitialSkeleton = computed(() => !access.ready.value || sitesSkeleton.value || (Boolean(currentSite.value) && documents.showSkeleton.value))

const typeOptions: Array<{ value: 'all' | CmsPublicationType, label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'article', label: CMS_PUBLICATION_TYPE_LABELS.article },
  { value: 'news', label: CMS_PUBLICATION_TYPE_LABELS.news },
]

const statusOptions = [
  { value: 'all', label: 'Todos os status' },
  { value: 'unpublished', label: 'Rascunhos' },
  { value: 'published', label: 'Publicados' },
  { value: 'withdrawn', label: 'Retirados do ar' },
] as const

const emptyCopy = computed(() => {
  if (!currentSite.value) {
    return {
      icon: 'lucide:globe',
      title: 'Nenhum site ainda',
      description: 'Crie o site desta empresa para começar a publicar.',
    }
  }
  if (documents.hasFilters.value) {
    return {
      icon: 'lucide:search-x',
      title: 'Nenhum resultado',
      description: 'Nada corresponde a essa busca. Tente outro termo ou limpe os filtros.',
    }
  }
  return props.kind === 'page'
    ? { icon: 'lucide:file', title: 'Nenhuma página ainda', description: 'Crie a primeira página do site, como início ou contato.' }
    : { icon: 'lucide:newspaper', title: 'Nenhuma publicação ainda', description: 'Artigos e notícias aparecem aqui depois de criados.' }
})

const defaultType = computed(() => (documents.type.value === 'all' ? null : documents.type.value))

function onStatusChange(value: unknown) {
  const next = String(value ?? 'all')
  if (next === 'all' || next === 'unpublished' || next === 'published' || next === 'withdrawn')
    documents.status.value = next
}

function openDocument(item: CmsDocumentSummary) {
  void navigateTo(`/cms/documents/${item.id}`)
}

async function onTrash(item: CmsDocumentSummary) {
  await deleteWithConfirm(
    () => documents.trash(item.id),
    {
      title: 'Mover para a lixeira?',
      description: `"${item.title || 'Sem título'}" sai do ar e vai para a lixeira.`,
      confirmLabel: 'Mover para a lixeira',
      successMessage: 'Conteúdo movido para a lixeira.',
      errorMessage: 'Não foi possível mover para a lixeira.',
    },
  )
}

function retry() {
  void refreshSites()
  void documents.refresh()
}
</script>

<template>
  <CmsGate :allowed="access.canRead.value" :error="gateError" @retry="retry">
    <div class="space-y-6">
      <CmsPageHeader
        :title="title"
        :description="description"
        :sites="sites"
        :current-site-id="currentSite?.id"
        @select-site="selectSite"
      >
        <template #actions>
          <Button v-if="allowCreate && currentSite" @click="createOpen = true">
            <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
            {{ kind === 'page' ? 'Nova página' : 'Nova publicação' }}
          </Button>
        </template>
      </CmsPageHeader>

      <div v-if="showInitialSkeleton || sitesPending && !sites.length" class="space-y-3" aria-busy="true">
        <Skeleton class="h-10 max-w-md w-full" />
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
      </div>

      <template v-else-if="currentSite">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            v-if="kind === 'publication'"
            class="inline-flex self-start border rounded-lg bg-background p-0.5"
            role="tablist"
            aria-label="Tipo de publicação"
          >
            <button
              v-for="option in typeOptions"
              :key="option.value"
              type="button"
              role="tab"
              class="rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :class="documents.type.value === option.value ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'"
              :aria-selected="documents.type.value === option.value"
              @click="documents.type.value = option.value"
            >
              {{ option.label }}
            </button>
          </div>

          <div class="relative min-w-0 flex-1">
            <Icon name="lucide:search" class="pointer-events-none absolute left-3 top-1/2 size-4 text-muted-foreground -translate-y-1/2" aria-hidden="true" />
            <Input
              v-model="documents.search.value"
              class="pl-9"
              placeholder="Buscar por título ou endereço"
              aria-label="Buscar"
            />
          </div>

          <Select :model-value="documents.status.value" @update:model-value="onStatusChange">
            <SelectTrigger class="w-full sm:w-48" aria-label="Status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in statusOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p v-if="documents.isSearching.value || documents.revalidating.value" class="text-xs text-muted-foreground">
          Atualizando a lista…
        </p>

        <CmsEmptyState
          v-if="!documents.items.value.length"
          :icon="emptyCopy.icon"
          :title="emptyCopy.title"
          :description="emptyCopy.description"
        >
          <Button v-if="documents.hasFilters.value" variant="outline" size="sm" @click="documents.clearFilters()">
            Limpar filtros
          </Button>
          <Button v-else-if="allowCreate" size="sm" @click="createOpen = true">
            {{ kind === 'page' ? 'Nova página' : 'Nova publicação' }}
          </Button>
        </CmsEmptyState>

        <CmsDocumentsTable
          v-else
          :items="documents.items.value"
          :kind="kind"
          :site="currentSite"
          :can-delete="allowDelete"
          :has-more="documents.hasMore.value"
          :loading-more="documents.loadingMore.value"
          :load-more-error="documents.loadMoreError.value"
          @open="openDocument"
          @trash="onTrash"
          @load-more="documents.loadMore()"
        />
      </template>

      <CmsEmptyState
        v-else
        :icon="emptyCopy.icon"
        :title="emptyCopy.title"
        :description="emptyCopy.description"
      >
        <Button v-if="canManageSettings" size="sm" @click="createSiteOpen = true">
          Criar site
        </Button>
      </CmsEmptyState>
    </div>

    <CmsCreateDocumentDialog
      v-model:open="createOpen"
      :kind="kind"
      :site="currentSite"
      :default-type="defaultType"
    />
    <CmsCreateSiteDialog v-model:open="createSiteOpen" :create="createSite" />
  </CmsGate>
</template>
