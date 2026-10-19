<script setup lang="ts">
import type { CmsDocumentSummary } from '~/lib/cms/contracts'
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
  title: 'Páginas',
})

const access = useCmsAccess()
const sites = useCmsSites()
const list = useCmsDocuments({
  kind: 'page',
  siteId: () => sites.currentSite.value?.id,
})
const createOpen = ref(false)

const gateError = computed(() => sites.loadError.value || list.loadError.value)

function openDocument(document: CmsDocumentSummary) {
  navigateTo(`/cms/documents/${document.id}`)
}

async function trashDocument(document: CmsDocumentSummary) {
  const deleted = await deleteWithConfirm(
    () => list.trash(document.id),
    {
      title: 'Mover página para a lixeira?',
      description: `"${document.title || 'Sem título'}" sairá das listagens. Você poderá restaurá-la depois.`,
      successMessage: 'Página movida para a lixeira.',
      errorMessage: 'Não foi possível excluir a página.',
      confirmLabel: 'Mover para a lixeira',
    },
  )
  if (!deleted)
    toast.error('Não foi possível excluir a página.')
}

async function retry() {
  await Promise.all([sites.refresh(), list.refresh()])
}
</script>

<template>
  <div class="mx-auto max-w-6xl p-4 space-y-6 sm:p-6">
    <CmsPageHeader
      title="Páginas"
      description="Home, Sobre, Serviços e outras páginas do site."
      :sites="sites.sites.value"
      :current-site-id="sites.currentSite.value?.id"
      @select-site="sites.selectSite"
    >
      <template #actions>
        <Button
          v-if="access.canCreate('page') && sites.currentSite.value"
          size="sm"
          @click="createOpen = true"
        >
          <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
          Nova página
        </Button>
      </template>
    </CmsPageHeader>

    <CmsGate :allowed="access.canRead.value" :error="gateError" @retry="retry">
      <div v-if="!sites.currentSite.value && !sites.showSkeleton.value" class="py-8">
        <CmsEmptyState
          icon="lucide:globe"
          title="Crie um site primeiro"
          description="As páginas ficam vinculadas ao site da empresa."
        >
          <Button as-child>
            <NuxtLink to="/cms">
              Ir para a visão geral
            </NuxtLink>
          </Button>
        </CmsEmptyState>
      </div>

      <template v-else>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="relative max-w-sm flex-1">
            <Icon name="lucide:search" class="pointer-events-none absolute left-3 top-1/2 size-4 text-muted-foreground -translate-y-1/2" aria-hidden="true" />
            <Input
              v-model="list.search.value"
              class="pl-9"
              placeholder="Buscar páginas…"
              aria-label="Buscar páginas"
            />
          </div>
          <Button
            v-if="list.hasFilters.value"
            variant="ghost"
            size="sm"
            @click="list.clearFilters()"
          >
            Limpar filtros
          </Button>
        </div>

        <div v-if="list.showSkeleton.value" class="h-64 animate-pulse rounded-xl bg-muted" />

        <CmsEmptyState
          v-else-if="!list.items.value.length"
          :icon="list.hasFilters.value ? 'lucide:search-x' : 'lucide:layout-template'"
          :title="list.hasFilters.value ? 'Nenhuma página encontrada' : 'Nenhuma página ainda'"
          :description="list.hasFilters.value ? 'Tente outro termo de busca.' : 'Crie a primeira página do site.'"
        >
          <Button
            v-if="!list.hasFilters.value && access.canCreate('page')"
            @click="createOpen = true"
          >
            Nova página
          </Button>
        </CmsEmptyState>

        <CmsDocumentsTable
          v-else
          :items="list.items.value"
          kind="page"
          :site="sites.currentSite.value"
          :can-delete="access.canDelete('page')"
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
      kind="page"
      :site="sites.currentSite.value"
    />
  </div>
</template>
