<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { columns } from '~/components/articles/columns'
import MultiActionBar from '~/components/shared/MultiActionBar.vue'
import DataTable from '~/components/ui/table/DataTable.vue'
import DataTablePagination from '~/components/ui/table/DataTablePagination.vue'
import DataTableRowActions from '~/components/ui/table/DataTableRowActions.vue'
import DataTableToolbar from '~/components/ui/table/DataTableToolbar.vue'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'
import { useTenantPage } from '~/composables/useTenantPage'
import { useTenantRoleFilter } from '~/composables/useTenantRoleFilter'
import { isStaffRole } from '~/constants/roles'

definePageMeta({
  middleware: ['auth'],
})

const { tenantId, currentRole, whenTenantReady } = useTenantPage()
const isStaff = computed(() => isStaffRole(currentRole.value))

const selectedItems = ref([])

const { data: articlesRaw, pending: loading, refresh: refreshArticles } = useFetch('/api/articles', { transform: response => response.data })
const { filteredData: articles } = useTenantRoleFilter<any>(articlesRaw as any, 'tenant_id')

async function handleDelete(article: any) {
  const deleted = await deleteWithConfirm(
    () => $fetch(`/api/articles/${article.id}`, { method: 'DELETE' }),
    {
      title: 'Excluir artigo?',
      description: `Tem certeza que deseja excluir "${article.title}"? Esta ação não pode ser desfeita.`,
      successMessage: 'Artigo excluído com sucesso.',
      errorMessage: 'Não foi possível excluir o artigo.',
    },
  )

  if (deleted)
    await refreshArticles()
}

async function handleMultiDelete() {
  const toDelete = selectedItems.value
    .map(idx => articles.value[idx])
    .filter(Boolean)
  const count = toDelete.length

  if (!count)
    return

  const deleted = await deleteWithConfirm(
    () => Promise.all(toDelete.map(article =>
      $fetch(`/api/articles/${article.id}`, { method: 'DELETE' }),
    )),
    {
      title: 'Excluir vários artigos?',
      description: `Tem certeza que deseja excluir ${count} artigos? Esta ação não pode ser desfeita.`,
      successMessage: `${count} artigo(s) excluído(s) com sucesso.`,
      errorMessage: 'Não foi possível excluir os artigos.',
    },
  )

  if (deleted) {
    selectedItems.value = []
    await refreshArticles()
  }
}

function handleEditClick(article: any) {
  navigateTo(`/articles/edit/${article.id}`)
}

function updateSelectedItems(items: any) {
  selectedItems.value = items
}

whenTenantReady(() => {
  refreshArticles()
})

watch(tenantId, () => {
  refreshArticles()
})
</script>

<template>
  <div class="">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Articles
        </h1>
        <p class="text-muted-foreground">
          Manage your site articles
        </p>
      </div>
      <Button class="bg-primary hover:bg-primary/90" @click="() => navigateTo('/articles/new')">
        <Icon name="lucide:plus-circle" class="mr-2 h-4 w-4" />
        New Article
      </Button>
    </div>

    <div v-if="loading" class="space-y-4">
      <Card class="border shadow-sm">
        <CardContent class="p-4">
          <div class="space-y-2">
            <Skeleton class="h-8 w-[250px]" />
            <Skeleton class="h-8 w-full" />
            <Skeleton class="h-8 w-full" />
            <Skeleton class="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
    <template v-else>
      <DataTable
        :data="articles"
        :columns="columns"
        :meta="{ onEdit: handleEditClick, onDelete: handleDelete }"
        @delete="handleDelete"
        @selection-change="updateSelectedItems"
      >
        <template #toolbar="{ table }">
          <DataTableToolbar :table="table" placeholder="Filter articles..." />
        </template>
        <template #pagination="{ table }">
          <DataTablePagination :table="table" />
        </template>
        <template #actions="{ row }">
          <DataTableRowActions :row="row" :on-edit="handleEditClick" :on-delete="handleDelete" />
        </template>
      </DataTable>
      <div
        v-if="articles.length === 0 && tenantId && isStaff"
        class="p-6 text-center text-muted-foreground"
      >
        No articles found for this tenant.
      </div>
      <div
        v-else-if="!tenantId && isStaff"
        class="p-6 text-center text-muted-foreground"
      >
        Select a tenant to view articles.
      </div>
      <div v-else-if="articles.length === 0" class="p-6 text-center text-muted-foreground">
        No articles found.
      </div>
    </template>

    <MultiActionBar
      v-if="selectedItems.length > 0"
      :count="selectedItems.length"
      :on-delete="handleMultiDelete"
    />
  </div>
</template>

<style></style>
