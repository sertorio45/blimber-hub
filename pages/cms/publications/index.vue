<script setup lang="ts">
import type { CmsDocumentSummary, CmsPublicationType } from '~/lib/cms/contracts'
import { computed, ref } from 'vue'

import { toast } from 'vue-sonner'
import CmsCreateDocumentDialog from '~/components/cms/CmsCreateDocumentDialog.vue'
import CmsDocumentsTable from '~/components/cms/CmsDocumentsTable.vue'
import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import CmsGate from '~/components/cms/CmsGate.vue'
import CmsPageHeader from '~/components/cms/CmsPageHeader.vue'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { useCmsDocuments } from '~/composables/cms/useCmsDocuments'
import { useCmsSites } from '~/composables/cms/useCmsSites'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'

definePageMeta({
  middleware: ['auth'],
  title: 'Publicações',
})

const access = useCmsAccess()
const sites = useCmsSites()
const list = useCmsDocuments({
  kind: 'publication',
  siteId: () => sites.currentSite.value?.id,
})
const createOpen = ref(false)

const gateError = computed(() => sites.loadError.value || list.loadError.value)

const typeTabs: Array<{ value: 'all' | CmsPublicationType, label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'article', label: 'Artigos' },
  { value: 'news', label: 'Notícias' },
]

function openDocument(document: CmsDocumentSummary) {
  navigateTo(`/cms/documents/${document.id}`)
}

async function trashDocument(document: CmsDocumentSummary) {
  const deleted = await deleteWithConfirm(
    () => list.trash(document.id),
    {
      title: 'Mover publicação para a lixeira?',
      description: `"${document.title || 'Sem título'}" sairá das listagens.`,
      successMessage: 'Publicação movida para a lixeira.',
      errorMessage: 'Não foi possível excluir a publicação.',
      confirmLabel: 'Mover para a lixeira',
    },
  )
  if (!deleted)
    toast.error('Não foi possível excluir a publicação.')
}

async function retry() {
  await Promise.all([sites.refresh(), list.refresh()])
}
</script>

<template>
  <div class="mx-auto max-w-6xl p-4 space-y-6 sm:p-6">
    <CmsPageHeader
      title="Publicações"
      description="Artigos e notícias no mesmo editor."
      :sites="sites.sites.value"
      :current-site-id="sites.currentSite.value?.id"
      @select-site="sites.selectSite"
    >
      <template #actions>
        <Button
          v-if="access.canCreate('publication') && sites.currentSite.value"
          size="sm"
          @click="createOpen = true"
        >
          <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
          Nova publicação
        </Button>
      </template>
    </CmsPageHeader>

    <CmsGate :allowed="access.canRead.value" :error="gateError" @retry="retry">
      <div v-if="!sites.currentSite.value && !sites.showSkeleton.value" class="py-8">
        <CmsEmptyState
          icon="lucide:globe"
          title="Crie um site primeiro"
          description="As publicações ficam vinculadas ao site da empresa."
        >
          <Button as-child>
            <NuxtLink to="/cms">
              Ir para a visão geral
            </NuxtLink>
          </Button>
        </CmsEmptyState>
      </div>

      <template v-else>
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            class="w-fit inline-flex rounded-lg bg-muted p-1"
            role="tablist"
            aria-label="Tipo de publicação"
          >
            <button
              v-for="tab in typeTabs"
              :key="tab.value"
              type="button"
              role="tab"
              class="rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :class="list.type.value === tab.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'"
              :aria-selected="list.type.value === tab.value"
              @click="list.type.value = tab.value"
            >
              {{ tab.label }}
            </button>
          </div>

          <div class="flex flex-1 items-center gap-2 lg:max-w-sm lg:justify-end">
            <div class="relative w-full">
              <Icon name="lucide:search" class="pointer-events-none absolute left-3 top-1/2 size-4 text-muted-foreground -translate-y-1/2" aria-hidden="true" />
              <Input
                v-model="list.search.value"
                class="pl-9"
                placeholder="Buscar publicações…"
                aria-label="Buscar publicações"
              />
            </div>
            <Button
              v-if="list.hasFilters.value"
              variant="ghost"
              size="sm"
              @click="list.clearFilters()"
            >
              Limpar
            </Button>
          </div>
        </div>

        <div v-if="list.showSkeleton.value" class="h-64 animate-pulse rounded-xl bg-muted" />

        <CmsEmptyState
          v-else-if="!list.items.value.length"
          :icon="list.hasFilters.value ? 'lucide:search-x' : 'lucide:newspaper'"
          :title="list.hasFilters.value ? 'Nenhuma publicação encontrada' : 'Nenhuma publicação ainda'"
          :description="list.hasFilters.value ? 'Ajuste os filtros ou a busca.' : 'Crie o primeiro artigo ou notícia.'"
        >
          <Button
            v-if="!list.hasFilters.value && access.canCreate('publication')"
            @click="createOpen = true"
          >
            Nova publicação
          </Button>
        </CmsEmptyState>

        <CmsDocumentsTable
          v-else
          :items="list.items.value"
          kind="publication"
          :site="sites.currentSite.value"
          :can-delete="access.canDelete('publication')"
          :has-more="list.hasMore.value"
          :loading-more="list.loadingMore.value"
          :load-more-error="list.loadMoreError.value"
          @open="openDocument"
          @trash="trashDocument"
          @load-more="list.loadMore()"
        />
      </template>
    </CmsGate>

    <CmsCreateDocumentDialog
      v-model:open="createOpen"
      kind="publication"
      :site="sites.currentSite.value"
    />
  </div>
</template>
