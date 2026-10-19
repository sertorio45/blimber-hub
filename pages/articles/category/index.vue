<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { columns } from '~/components/articles/category/columns'
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

const { tenantId, currentRole } = useTenantPage()
const isStaff = computed(() => isStaffRole(currentRole.value))

const selectedItems = ref([])

// Debug: log tenantId and categoriesRaw
watch(
  tenantId,
  (val) => {
    console.warn('[DEBUG] tenantId:', val)
  },
  { immediate: true },
)

const { data: categoriesRaw, pending: loading, refresh: refreshCategories } = useFetch('/api/articles/category', { transform: response => response.data })

const { filteredData: categories } = useTenantRoleFilter<any>(categoriesRaw as any, 'tenant_id') // Filter categories by tenantId

watch(
  categoriesRaw,
  (val) => {
    console.warn('[DEBUG] categoriesRaw:', val)
  },
  { immediate: true },
)

async function handleDelete(category: any) {
  const deleted = await deleteWithConfirm(
    () => $fetch(`/api/articles/category/${category.id}?tenant_id=${tenantId.value}`, { method: 'DELETE' }),
    {
      title: 'Excluir categoria?',
      description: `Tem certeza que deseja excluir "${category.title}"? Esta ação não pode ser desfeita.`,
      successMessage: 'Categoria excluída com sucesso.',
      errorMessage: 'Não foi possível excluir a categoria.',
    },
  )

  if (deleted)
    await refreshCategories()
}

async function handleMultiDelete() {
  const toDelete = selectedItems.value
    .map(idx => categories.value[idx])
    .filter(Boolean)
  const count = toDelete.length

  if (!count)
    return

  const deleted = await deleteWithConfirm(
    () => Promise.all(toDelete.map(category =>
      $fetch(`/api/articles/category/${category.id}?tenant_id=${tenantId.value}`, { method: 'DELETE' }),
    )),
    {
      title: 'Excluir várias categorias?',
      description: `Tem certeza que deseja excluir ${count} categorias? Esta ação não pode ser desfeita.`,
      successMessage: `${count} categoria(s) excluída(s) com sucesso.`,
      errorMessage: 'Não foi possível excluir as categorias.',
    },
  )

  if (deleted) {
    selectedItems.value = []
    await refreshCategories()
  }
}

function handleEditClick(category: any) {
  navigateTo(`/articles/category/edit/${category.id}`)
}

function updateSelectedItems(items: any) {
  selectedItems.value = items
}

watch(tenantId, () => {
  refreshCategories()
})
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Categories
        </h1>
        <p class="text-muted-foreground">
          Manage your article categories
        </p>
      </div>
      <Button class="bg-primary hover:bg-primary/90" @click="() => navigateTo('/articles/category/new')">
        <Icon name="lucide:plus-circle" class="mr-2 h-4 w-4" />
        New Category
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
        :data="categories"
        :columns="columns"
        :meta="{ onEdit: handleEditClick, onDelete: handleDelete }"
        @delete="handleDelete"
        @selection-change="updateSelectedItems"
      >
        <template #toolbar="{ table }">
          <DataTableToolbar :table="table" placeholder="Filter categories..." />
        </template>
        <template #pagination="{ table }">
          <DataTablePagination :table="table" />
        </template>
        <template #actions="{ row }">
          <DataTableRowActions :row="row" :on-edit="handleEditClick" :on-delete="handleDelete" />
        </template>
      </DataTable>
      <div
        v-if="categories.length === 0 && tenantId && isStaff"
        class="p-6 text-center text-muted-foreground"
      >
        No categories found for this tenant.
      </div>
      <div
        v-else-if="!tenantId && isStaff"
        class="p-6 text-center text-muted-foreground"
      >
        Select a tenant to view categories.
      </div>
      <div v-else-if="categories.length === 0" class="p-6 text-center text-muted-foreground">
        No categories found.
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
