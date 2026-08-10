<script setup lang="ts">
import type { Contact } from '~/types/crm'

import { useSupabaseClient } from '#imports'
import { columns } from '~/components/crm/contacts/columns'
import ContactForm from '~/components/crm/contacts/ContactForm.vue'
import CrmPageHeader from '~/components/crm/shared/CrmPageHeader.vue'
import MultiActionBar from '~/components/shared/MultiActionBar.vue'
import { Card, CardContent } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import DataTableViewOptions from '~/components/ui/table/DataTableViewOptions.vue'
import DataTable from '~/components/ui/table/DataTable.vue'
import DataTablePagination from '~/components/ui/table/DataTablePagination.vue'
import DataTableToolbar from '~/components/ui/table/DataTableToolbar.vue'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'
import { useTenantPage } from '~/composables/useTenantPage'

definePageMeta({
  middleware: ['auth'],
  title: 'Contatos',
  description: 'Gerencie seus contatos de negócios',
})

const supabase = useSupabaseClient()
const { tenantId } = useTenantPage()

const selectedContact = ref<Contact | null>(null)
const isDialogOpen = ref(false)
const selectedItems = ref<number[]>([])

const {
  data: contactsData,
  pending,
  refresh,
  showSkeleton,
} = await useCachedAsyncData<Contact[]>(
  computed(() => `crm-contacts-${tenantId.value ?? 'none'}`),
  async () => {
    if (!tenantId.value)
      return []

    const { data, error } = await supabase
      .from('crm_contact')
      .select('*, company:crm_company(name)')
      .eq('tenant_id', tenantId.value)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch contacts:', error)
      return []
    }

    return (data || []).map((c: any) => ({
      ...c,
      company_name: c.company?.name || '',
    }))
  },
  {
    default: () => null,
    watch: [tenantId],
  },
)

const contacts = computed(() => contactsData.value ?? [])

function updateSelectedItems(items: number[]) {
  selectedItems.value = items
}

async function handleMultiDelete() {
  if (!tenantId.value || !selectedItems.value.length)
    return

  const toDelete = selectedItems.value
    .map(idx => contacts.value[idx])
    .filter((contact): contact is Contact => Boolean(contact))
  const count = toDelete.length

  if (!count)
    return

  const deleted = await deleteWithConfirm(
    () => Promise.all(toDelete.map(contact =>
      $fetch(`/api/crm/contacts/${contact.id}?tenant_id=${tenantId.value}`, { method: 'DELETE' }),
    )),
    {
      title: 'Excluir vários contatos?',
      description: `Tem certeza que deseja excluir ${count} contatos? Esta ação não pode ser desfeita.`,
      successMessage: `${count} contato(s) excluído(s) com sucesso.`,
      errorMessage: 'Não foi possível excluir os contatos.',
    },
  )

  if (deleted) {
    selectedItems.value = []
    await refresh()
  }
}

async function handleDelete(contact: Contact) {
  if (!tenantId.value)
    return

  const deleted = await deleteWithConfirm(
    () => $fetch(`/api/crm/contacts/${contact.id}?tenant_id=${tenantId.value}`, { method: 'DELETE' }),
    {
      title: 'Excluir contato?',
      description: `Tem certeza que deseja excluir "${contact.name}"? Esta ação não pode ser desfeita.`,
      successMessage: 'Contato excluído com sucesso.',
      errorMessage: 'Não foi possível excluir o contato.',
    },
  )

  if (deleted)
    await refresh()
}

function handleEdit(contact: Contact) {
  selectedContact.value = contact
  isDialogOpen.value = true
}

function handleNewContact() {
  selectedContact.value = null
  isDialogOpen.value = true
}

function closeDialog() {
  isDialogOpen.value = false
  selectedContact.value = null
}

function handleContactSaved() {
  closeDialog()
  // Use refresh from useLazyAsyncData
  refresh()
}
</script>

<template>
  <div class="w-full flex flex-col items-stretch gap-4">
    <CrmPageHeader
      title="Contatos"
      description="Gerencie seus contatos de negócios"
    >
      <template #actions>
        <Button variant="outline">
          <Icon name="lucide:download" class="mr-2 h-4 w-4" />
          Exportar
        </Button>
        <Button @click="handleNewContact">
          <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
          Novo Contato
        </Button>
      </template>
    </CrmPageHeader>

    <!-- DataTable with Skeleton -->
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
      <!-- DataTable -->
      <DataTable
        :data="contacts"
        :columns="columns"
        :meta="{ onEdit: handleEdit, onDelete: handleDelete }"
        @selection-change="updateSelectedItems"
      >
        <template #toolbar="{ table }">
          <DataTableToolbar :table="table" placeholder="Buscar contatos..." filter-column="name">
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

    <!-- Contact Dialog -->
    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="mx-auto w-full overflow-hidden p-0 lg:max-w-3xl md:max-w-2xl sm:max-w-lg">
        <DialogHeader class="border-b p-4 md:p-6">
          <DialogTitle class="text-xl">
            {{ selectedContact ? 'Editar Contato' : 'Criar Contato' }}
          </DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">
            {{ selectedContact ? 'Edite os dados do contato.' : 'Adicione um novo contato ao seu cadastro.' }}
          </DialogDescription>
        </DialogHeader>
        <div class="max-h-[calc(80vh-10rem)] overflow-y-auto p-4 md:p-6">
          <ContactForm
            :initial-data="selectedContact || undefined"
            @success="handleContactSaved"
            @cancel="closeDialog"
          />
        </div>
        <div class="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" @click="closeDialog">
            Cancelar
          </Button>
          <Button type="submit" form="contact-form">
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
