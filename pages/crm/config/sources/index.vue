<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { sourceColumns } from '~/components/crm/config/columns'
import SourceForm from '~/components/crm/config/SourceForm.vue'
import CrmPageHeader from '~/components/crm/shared/CrmPageHeader.vue'
import MultiActionBar from '~/components/shared/MultiActionBar.vue'
import Button from '~/components/ui/button/Button.vue'
import Card from '~/components/ui/card/Card.vue'
import CardContent from '~/components/ui/card/CardContent.vue'
import Dialog from '~/components/ui/dialog/Dialog.vue'
import DialogContent from '~/components/ui/dialog/DialogContent.vue'
import DialogFooter from '~/components/ui/dialog/DialogFooter.vue'
import DialogHeader from '~/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '~/components/ui/dialog/DialogTitle.vue'
import Skeleton from '~/components/ui/skeleton/Skeleton.vue'
import DataTableViewOptions from '~/components/ui/table/DataTableViewOptions.vue'
import DataTable from '~/components/ui/table/DataTable.vue'
import DataTablePagination from '~/components/ui/table/DataTablePagination.vue'
import DataTableToolbar from '~/components/ui/table/DataTableToolbar.vue'
import { isTenantScopedRole } from '~/constants/roles'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'
import { useTenantPage } from '~/composables/useTenantPage'
import { useTenantRoleFilter } from '~/composables/useTenantRoleFilter'

definePageMeta({
  middleware: ['auth'],
})

const { tenantId, currentRole, whenTenantReady } = useTenantPage()
const selectedItems = ref<any[]>([])
const showDialog = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formModel = ref<any>({ name: '', description: '', is_default: false })

// SSR-friendly fetch dos sources com tenant
const {
  data: sourcesRaw,
  pending,
  refresh: refreshSources,
  showSkeleton,
} = await useCachedAsyncData<any[]>(
  computed(() => `crm-lead-sources-${tenantId.value ?? 'none'}`),
  () =>
    $fetch('/api/crm/lead_source', {
      query: { tenant_id: tenantId.value },
    }),
  {
    watch: [tenantId],
    default: () => null,
    server: false,
  },
)

const sourcesArray = computed(() => sourcesRaw.value ?? [])
// Filtra por tenant (cliente/admin/funcionário)
const { filteredData: sourcesByTenant } = useTenantRoleFilter<any>(sourcesArray, 'tenant_id')

// Sempre inclui os is_default = true
const filteredSources = computed(() => {
  if (!tenantId.value)
    return []

  const all = sourcesArray.value
  const defaults = all.filter((item: any) => item.is_default === true)
  if (isTenantScopedRole(currentRole.value)) {
    return all.filter((item: any) => item.is_default === true || item.tenant_id === tenantId.value)
  }

  // Admin/fun: defaults + do tenant selecionado
  const ids = new Set(defaults.map((i: any) => i.id))
  return [...defaults, ...sourcesByTenant.value.filter((i: any) => !ids.has(i.id))]
})

function updateSelectedItems(indices: number[]) {
  // indices são índices do array filteredSources
  const items = indices.map(idx => filteredSources.value[idx]).filter(Boolean)
  selectedItems.value = items
}

function handleEdit(source: any) {
  if (!source || typeof source !== 'object')
    return

  if (source.is_default)
    return

  formMode.value = 'edit'
  formModel.value = {
    name: source.name ?? '',
    description: source.description ?? '',
    is_default: Boolean(source.is_default),
    id: source.id ?? undefined,
  }
  showDialog.value = true
}

function handleCreate() {
  formMode.value = 'create'
  formModel.value = { name: '', description: '', is_default: false }
  showDialog.value = true
}

async function handleFormSubmit(_data: any) {
  // Busca tenantId sempre atualizado e válido
  const currentTenantId = tenantId.value || (typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null)
  if (!currentTenantId) {
    console.warn('Select a tenant before creating a source.')
    return
  }
  const isEdit = formMode.value === 'edit'
  const url = isEdit ? `/api/crm/lead_source/${formModel.value.id}` : '/api/crm/lead_source'
  const method = isEdit ? 'PUT' : 'POST'
  const payload: any = {
    name: formModel.value.name?.trim() || '',
    description: formModel.value.description?.trim(),
    is_default: false,
    tenant_id: currentTenantId,
  }
  if (isEdit && formModel.value.id) {
    payload.id = String(formModel.value.id)
  }
  try {
    await useFetch(url, { method, body: payload })
    showDialog.value = false
    await refreshSources() // Sempre atualiza do backend
  }
  catch {
    // Trate erro se quiser
  }
}

async function handleDelete(source: any) {
  if (!source?.id || source.is_default)
    return

  const deleted = await deleteWithConfirm(
    () => $fetch(`/api/crm/lead_source/${source.id}?tenant_id=${tenantId.value}`, { method: 'DELETE' }),
    {
      title: 'Excluir origem?',
      description: `Tem certeza que deseja excluir "${source.name}"? Esta ação não pode ser desfeita.`,
      successMessage: 'Origem excluída com sucesso.',
      errorMessage: 'Não foi possível excluir a origem.',
    },
  )

  if (deleted)
    await refreshSources()
}

async function handleMultiDelete() {
  const toDelete = selectedItems.value.filter(item => item && !item.is_default)
  const count = toDelete.length

  if (!count)
    return

  const deleted = await deleteWithConfirm(
    () => Promise.all(toDelete.map(item =>
      $fetch(`/api/crm/lead_source/${item.id}?tenant_id=${tenantId.value}`, { method: 'DELETE' }),
    )),
    {
      title: 'Excluir várias origens?',
      description: `Tem certeza que deseja excluir ${count} origens? Esta ação não pode ser desfeita.`,
      successMessage: `${count} origem(ns) excluída(s) com sucesso.`,
      errorMessage: 'Não foi possível excluir as origens.',
    },
  )

  if (deleted) {
    selectedItems.value = []
    await refreshSources()
  }
}

whenTenantReady(() => {
  refreshSources()
})

watch(tenantId, (val) => {
  if (val)
    refreshSources()
  showDialog.value = false
  formModel.value = { name: '', description: '', is_default: false }
})
</script>

<template>
  <div class="w-full flex flex-col items-stretch gap-4">
    <CrmPageHeader
      title="Origens"
      description="Gerencie todas as origens de leads do seu CRM."
    >
      <template #actions>
        <Button @click="handleCreate">
          <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
          Nova origem
        </Button>
      </template>
    </CrmPageHeader>
    <div v-if="showSkeleton" class="space-y-4">
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
          :data="filteredSources"
          :columns="sourceColumns"
          :meta="{ onEdit: handleEdit, onDelete: handleDelete }"
          @selection-change="updateSelectedItems"
        >
          <template #toolbar="{ table }">
<DataTableToolbar :table="table" filter-column="name" placeholder="Filtrar origens...">
            <template #options>
              <DataTableViewOptions :table="table" />
            </template>
          </DataTableToolbar>
        </template>
          <template #pagination="{ table }">
            <DataTablePagination :table="table" />
          </template>
        </DataTable>
      <MultiActionBar
        v-if="selectedItems.length > 0"
        :count="selectedItems.length"
        :on-delete="handleMultiDelete"
      />
    </template>
    <!-- Dialog de criar/editar -->
    <Dialog :open="showDialog" @update:open="showDialog = $event">
      <DialogContent class="max-w-lg w-full">
        <DialogHeader>
          <DialogTitle>{{ formMode === 'edit' ? 'Editar Origem' : 'Nova Origem' }}</DialogTitle>
        </DialogHeader>
        <SourceForm v-model="formModel" :mode="formMode" :loading="false" @submit="handleFormSubmit" />
        <DialogFooter>
          <Button variant="outline" @click="showDialog = false">
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style></style>
