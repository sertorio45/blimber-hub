<script setup lang="ts">
import type { Product, ProductCategory } from '~/types/crm'

import { columns } from '~/components/crm/products/columns'
import ProductForm from '~/components/crm/products/ProductForm.vue'
import CrmPageHeader from '~/components/crm/shared/CrmPageHeader.vue'
import MultiActionBar from '~/components/shared/MultiActionBar.vue'
import Button from '~/components/ui/button/Button.vue'
import Card from '~/components/ui/card/Card.vue'
import CardContent from '~/components/ui/card/CardContent.vue'
import CardHeader from '~/components/ui/card/CardHeader.vue'
import CardTitle from '~/components/ui/card/CardTitle.vue'
import Skeleton from '~/components/ui/skeleton/Skeleton.vue'
import DataTableViewOptions from '~/components/ui/table/DataTableViewOptions.vue'
import DataTable from '~/components/ui/table/DataTable.vue'
import DataTablePagination from '~/components/ui/table/DataTablePagination.vue'
import DataTableToolbar from '~/components/ui/table/DataTableToolbar.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import Sheet from '~/components/ui/sheet/Sheet.vue'
import SheetContent from '~/components/ui/sheet/SheetContent.vue'
import SheetDescription from '~/components/ui/sheet/SheetDescription.vue'
import SheetFooter from '~/components/ui/sheet/SheetFooter.vue'
import SheetHeader from '~/components/ui/sheet/SheetHeader.vue'
import SheetTitle from '~/components/ui/sheet/SheetTitle.vue'
import { useTenant } from '~/composables/useTenant'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'

definePageMeta({
  middleware: ['auth', 'tenant'],
  title: 'Produtos & Serviços',
  description: 'Gerencie produtos e serviços do CRM',
})

const { tenantId } = useTenant()
const isSheetOpen = ref(false)
const selectedProduct = ref<Product | null>(null)
const selectedItems = ref<number[]>([])
const FILTER_ALL = '__all__'
const filterType = ref<string>(FILTER_ALL)
const filterCategory = ref<string>(FILTER_ALL)
const filterActive = ref<string>(FILTER_ALL)

const queryParams = computed(() => {
  const tid = tenantId.value
  if (!tid)
    return null
  const q: Record<string, string> = { tenant_id: tid }
  if (filterType.value !== FILTER_ALL && (filterType.value === 'recorrente' || filterType.value === 'avulso'))
    q.type = filterType.value
  if (filterCategory.value !== FILTER_ALL && filterCategory.value)
    q.category_id = filterCategory.value
  if (filterActive.value !== FILTER_ALL && (filterActive.value === 'true' || filterActive.value === 'false'))
    q.active = filterActive.value
  return q
})

const productsCacheKey = computed(() => {
  const tid = tenantId.value
  if (!tid)
    return 'crm-products-empty'
  return `crm-products-${tid}-${filterType.value}-${filterCategory.value}-${filterActive.value}`
})

const {
  data: productsRaw,
  pending,
  refresh,
  showSkeleton,
} = await useCachedAsyncData<Product[]>(
  productsCacheKey,
  async () => {
    if (!queryParams.value)
      return []
    return await $fetch<Product[]>('/api/crm/products', { query: queryParams.value })
  },
  {
    watch: [tenantId, filterType, filterCategory, filterActive],
    default: () => null,
    server: false,
  },
)

const products = computed(() => productsRaw.value ?? [])

const { data: categoriesRaw } = await useCachedAsyncData<ProductCategory[]>(
  computed(() => `crm-products-categories-${tenantId.value ?? 'none'}`),
  () => tenantId.value ? $fetch<ProductCategory[]>('/api/crm/products/categories', { query: { tenant_id: tenantId.value } }) : Promise.resolve([]),
  { watch: [tenantId], default: () => null, server: false },
)
const categoriesList = computed(() => categoriesRaw.value ?? [])

const totalProducts = computed(() => products.value.length)
const recurringCount = computed(() => products.value.filter(p => p.type === 'recorrente').length)
const oneTimeCount = computed(() => products.value.filter(p => p.type === 'avulso').length)
const monthlyRecurringRevenue = computed(() =>
  products.value
    .filter(p => p.type === 'recorrente' && p.recurrence === 'mensal' && p.active)
    .reduce((sum, p) => sum + Number(p.price), 0),
)

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(value)
}

function updateSelectedItems(items: number[]) {
  selectedItems.value = items
}

function handleNewProduct() {
  selectedProduct.value = null
  isSheetOpen.value = true
}

function handleEdit(product: Product) {
  selectedProduct.value = product
  isSheetOpen.value = true
}

function closeSheet() {
  isSheetOpen.value = false
  selectedProduct.value = null
}

function handleProductSaved() {
  closeSheet()
  refresh()
}

async function setProductActive(product: Product, active: boolean) {
  if (!tenantId.value)
    return

  const actionLabel = active ? 'reativar' : 'desativar'
  const confirmed = await deleteWithConfirm(
    () => $fetch(`/api/crm/products/${product.id}/status`, {
      method: 'PUT',
      body: { tenant_id: tenantId.value, active },
    }),
    {
      title: active ? 'Reativar produto?' : 'Desativar produto?',
      description: active
        ? `Deseja reativar "${product.name}"?`
        : `O produto "${product.name}" será marcado como inativo. Você pode reativá-lo depois.`,
      confirmLabel: active ? 'Reativar' : 'Desativar',
      successMessage: active ? 'Produto reativado.' : 'Produto desativado.',
      errorMessage: `Não foi possível ${actionLabel} o produto.`,
    },
  )

  if (confirmed)
    refresh()
}

async function handleDeactivate(product: Product) {
  await setProductActive(product, false)
}

async function handleReactivate(product: Product) {
  await setProductActive(product, true)
}

async function handleDelete(product: Product) {
  if (!tenantId.value)
    return

  const deleted = await deleteWithConfirm(
    () => $fetch(`/api/crm/products/${product.id}?tenant_id=${tenantId.value}`, { method: 'DELETE' }),
    {
      title: 'Excluir produto?',
      description: `Tem certeza que deseja excluir permanentemente "${product.name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      successMessage: 'Produto excluído com sucesso.',
      errorMessage: 'Não foi possível excluir o produto.',
    },
  )

  if (deleted)
    refresh()
}

async function handleMultiDelete() {
  const tid = tenantId.value
  if (!tid || !selectedItems.value.length)
    return

  const toDelete = selectedItems.value.map(i => products.value[i]).filter(Boolean)
  const count = toDelete.length

  if (!count)
    return

  const deleted = await deleteWithConfirm(
    () => Promise.all(toDelete.map(p =>
      $fetch(`/api/crm/products/${p.id}?tenant_id=${tid}`, { method: 'DELETE' }),
    )),
    {
      title: `Excluir ${count} produto(s)?`,
      description: 'Os produtos selecionados serão removidos permanentemente. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir todos',
      successMessage: `${count} produto(s) excluído(s).`,
      errorMessage: 'Não foi possível excluir os produtos.',
    },
  )

  if (deleted) {
    selectedItems.value = []
    refresh()
  }
}

</script>

<template>
  <div class="flex w-full flex-col items-stretch gap-4">
    <CrmPageHeader
      title="Produtos & Serviços"
      description="Gerencie produtos e serviços do seu CRM"
    >
      <template #actions>
        <Button variant="outline">
          <Icon name="lucide:download" class="mr-2 h-4 w-4" />
          Exportar
        </Button>
        <Button @click="handleNewProduct">
          <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
          Novo Produto
        </Button>
      </template>
    </CrmPageHeader>

    <!-- Stats -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card v-if="showSkeleton">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton class="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton class="h-8 w-16" />
        </CardContent>
      </Card>
      <template v-else>
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Total de Produtos
            </CardTitle>
            <Icon name="lucide:package" class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ totalProducts }}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Serviços Recorrentes
            </CardTitle>
            <Icon name="lucide:repeat" class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ recurringCount }}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Serviços Avulsos
            </CardTitle>
            <Icon name="lucide:circle-dot" class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ oneTimeCount }}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Receita Recorrente Mensal
            </CardTitle>
            <Icon name="lucide:trending-up" class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ formatCurrency(monthlyRecurringRevenue) }}
            </div>
          </CardContent>
        </Card>
      </template>
    </div>

    <!-- Filters + link categorias -->
    <div class="flex flex-wrap items-center gap-2">
      <NuxtLink to="/crm/products/categories">
        <Button variant="outline" size="sm" class="gap-1">
          <Icon name="lucide:folder" class="h-4 w-4" />
          Categorias
        </Button>
      </NuxtLink>
      <Select v-model="filterType">
        <SelectTrigger class="w-[160px]">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="FILTER_ALL">
            Todos os tipos
          </SelectItem>
          <SelectItem value="recorrente">
            Recorrente
          </SelectItem>
          <SelectItem value="avulso">
            Avulso
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="filterCategory">
        <SelectTrigger class="w-[180px]">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="FILTER_ALL">
            Todas as categorias
          </SelectItem>
          <SelectItem v-for="cat in categoriesList" :key="cat.id" :value="cat.id">
            {{ cat.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="filterActive">
        <SelectTrigger class="w-[160px]">
          <SelectValue placeholder="Selecione o status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="FILTER_ALL">
            Todos (ativos e inativos)
          </SelectItem>
          <SelectItem value="true">
            Somente ativos
          </SelectItem>
          <SelectItem value="false">
            Somente inativos
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- DataTable com Skeleton -->
    <div v-if="showSkeleton" class="space-y-4">
      <Card class="border shadow-sm">
        <CardContent class="p-4">
          <div class="space-y-2">
            <Skeleton class="h-8 w-[250px]" />
            <Skeleton class="h-8 w-full" />
            <Skeleton class="h-8 w-full" />
            <Skeleton class="h-8 w-full" />
            <Skeleton class="h-8 w-full" />
            <Skeleton class="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
    <template v-else>
      <DataTable
        :data="products"
        :columns="columns"
        :meta="{
          onEdit: handleEdit,
          onDeactivate: handleDeactivate,
          onReactivate: handleReactivate,
          onDelete: handleDelete,
        }"
        @selection-change="updateSelectedItems"
      >
        <template #toolbar="{ table }">
          <DataTableToolbar :table="table" placeholder="Buscar produtos..." filter-column="name">
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

    <!-- Sheet: New / Edit Product -->
    <Sheet v-model:open="isSheetOpen">
      <SheetContent class="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {{ selectedProduct ? 'Editar Produto' : 'Novo Produto' }}
          </SheetTitle>
          <SheetDescription>
            {{ selectedProduct ? 'Atualize os dados do produto.' : 'Adicione um novo produto ou serviço.' }}
          </SheetDescription>
        </SheetHeader>
        <div class="py-6">
          <ProductForm
            :initial-data="selectedProduct ?? undefined"
            :categories="categoriesList"
            @success="handleProductSaved"
            @cancel="closeSheet"
          />
        </div>
        <SheetFooter>
          <Button variant="outline" @click="closeSheet">
            Cancelar
          </Button>
          <Button type="submit" form="product-form">
            Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </div>
</template>
