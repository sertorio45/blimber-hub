<script setup lang="ts">
import type { Company } from '~/types/crm'
import { ref, watch } from 'vue'

import DataTableViewOptions from '~/components/ui/table/DataTableViewOptions.vue'
import { columns } from '~/components/crm/company/columns'
import CompanyForm from '~/components/crm/company/CompanyForm.vue'
import CrmPageHeader from '~/components/crm/shared/CrmPageHeader.vue'
import MultiActionBar from '~/components/shared/MultiActionBar.vue'
import Button from '~/components/ui/button/Button.vue'
import Card from '~/components/ui/card/Card.vue'
import CardContent from '~/components/ui/card/CardContent.vue'
import Dialog from '~/components/ui/dialog/Dialog.vue'
import DialogContent from '~/components/ui/dialog/DialogContent.vue'
import DialogDescription from '~/components/ui/dialog/DialogDescription.vue'
import DialogHeader from '~/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '~/components/ui/dialog/DialogTitle.vue'
import Skeleton from '~/components/ui/skeleton/Skeleton.vue'
import DataTable from '~/components/ui/table/DataTable.vue'
import DataTablePagination from '~/components/ui/table/DataTablePagination.vue'
import DataTableToolbar from '~/components/ui/table/DataTableToolbar.vue'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'
import { useTenantPage } from '~/composables/useTenantPage'

definePageMeta({
  middleware: ['auth'],
  title: 'Empresas',
  description: 'Gerencie empresas e prospects',
})

const { tenantId, whenTenantReady } = useTenantPage()

const companiesData = ref<Company[]>([])
const isLoading = ref(false)
const selectedItems = ref<Company[]>([])
const isFormOpen = ref(false)
const editingCompany = ref<Company | undefined>(undefined)
const page = ref(1)
const limit = ref(20)

async function fetchCompanies() {
  if (!tenantId.value) {
    console.warn('No tenant ID available')
    return
  }

  isLoading.value = true
  try {
    const { data } = await $fetch('/api/crm/company', {
      query: { tenant_id: tenantId.value, page: page.value, limit: limit.value },
    })
    companiesData.value = data || []
  }
  catch (error) {
    console.error('Failed to fetch companies:', error)
    companiesData.value = []
  }
  finally {
    isLoading.value = false
  }
}

function handleCreate() {
  editingCompany.value = undefined
  isFormOpen.value = true
}

function handleEdit(company: Company) {
  editingCompany.value = company
  isFormOpen.value = true
}

function handleFormSuccess() {
  isFormOpen.value = false
  editingCompany.value = undefined
  fetchCompanies()
}

function updateSelectedItems(items: Company[]) {
  selectedItems.value = items
}

function handlePageChange(newPage: number) {
  page.value = newPage
  fetchCompanies()
}

function handleLimitChange(newLimit: number) {
  limit.value = newLimit
  page.value = 1
  fetchCompanies()
}

whenTenantReady(() => {
  fetchCompanies()
})

watch(tenantId, (val) => {
  if (!val)
    return
  isFormOpen.value = false
  editingCompany.value = undefined
})

async function handleDelete(company: Company) {
  if (!company || !tenantId.value)
    return

  const deleted = await deleteWithConfirm(
    () => $fetch(`/api/crm/company/${company.id}?tenant_id=${tenantId.value}`, { method: 'DELETE' }),
    {
      title: 'Excluir empresa?',
      description: `Tem certeza que deseja excluir "${company.name}"? Esta ação não pode ser desfeita.`,
      successMessage: 'Empresa excluída com sucesso.',
      errorMessage: 'Não foi possível excluir a empresa.',
    },
  )

  if (deleted)
    await fetchCompanies()
}

async function handleMultiDelete() {
  if (!tenantId.value || !selectedItems.value.length)
    return

  const toDelete = [...selectedItems.value]
  const count = toDelete.length

  const deleted = await deleteWithConfirm(
    () => Promise.all(toDelete.map(company =>
      $fetch(`/api/crm/company/${company.id}?tenant_id=${tenantId.value}`, { method: 'DELETE' }),
    )),
    {
      title: 'Excluir várias empresas?',
      description: `Tem certeza que deseja excluir ${count} empresas? Esta ação não pode ser desfeita.`,
      successMessage: `${count} empresa(s) excluída(s) com sucesso.`,
      errorMessage: 'Não foi possível excluir as empresas.',
    },
  )

  if (deleted) {
    selectedItems.value = []
    await fetchCompanies()
  }
}
</script>

<template>
  <div class="w-full flex flex-col items-stretch gap-4">
    <CrmPageHeader
      title="Empresas"
      description="Gerencie empresas e prospects"
    >
      <template #actions>
        <Button variant="outline">
          <Icon name="lucide:download" class="mr-2 h-4 w-4" />
          Exportar
        </Button>
        <Button @click="handleCreate">
          <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
          Nova Empresa
        </Button>
      </template>
    </CrmPageHeader>

    <!-- DataTable with Skeleton -->
    <div v-if="isLoading" class="space-y-4">
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
      <!-- DataTable -->
      <DataTable
        :data="companiesData"
        :columns="columns"
        :meta="{ onEdit: handleEdit, onDelete: handleDelete }"
        @delete="handleDelete"
        @selection-change="updateSelectedItems"
      >
        <template #toolbar="{ table }">
          <DataTableToolbar :table="table" placeholder="Buscar empresas..." filter-column="name">
            <template #options>
              <DataTableViewOptions :table="table" />
            </template>
          </DataTableToolbar>
        </template>
        <template #pagination="{ table }">
          <DataTablePagination :table="table" />
        </template>
      </DataTable>
    </template>

    <MultiActionBar
      v-if="selectedItems.length > 0"
      :count="selectedItems.length"
      :on-delete="handleMultiDelete"
    />

    <!-- Dialog de Criação/Edição -->
    <Dialog v-model:open="isFormOpen">
      <DialogContent class="mx-auto w-full overflow-hidden p-0 lg:max-w-3xl md:max-w-2xl sm:max-w-lg">
        <DialogHeader class="border-b p-4 md:p-6">
          <DialogTitle class="text-xl">
            {{ editingCompany ? 'Editar Empresa' : 'Criar Empresa' }}
          </DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">
            {{ editingCompany ? 'Edite os dados da empresa.' : 'Adicione uma nova empresa ao seu cadastro.' }}
          </DialogDescription>
        </DialogHeader>
        <div class="max-h-[calc(80vh-10rem)] overflow-y-auto p-4 md:p-6">
          <CompanyForm :initial-data="editingCompany" @success="handleFormSuccess" />
        </div>
        <div class="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" @click="isFormOpen = false">
            Cancelar
          </Button>
          <Button type="submit" form="company-form">
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
