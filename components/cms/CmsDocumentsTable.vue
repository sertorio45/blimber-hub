<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { CmsDocumentKind, CmsDocumentSummary, CmsSite } from '~/lib/cms/contracts'

import { Icon } from '#components'

import { computed, h } from 'vue'
import CmsStatusBadge from '~/components/cms/CmsStatusBadge.vue'
import DataTableColumnHeader from '~/components/tasks/components/DataTableColumnHeader.vue'
import { Button } from '~/components/ui/button'
import DataTable from '~/components/ui/table/DataTable.vue'
import DataTablePagination from '~/components/ui/table/DataTablePagination.vue'
import { CMS_PUBLICATION_TYPE_LABELS, cmsPathPrefix, formatCmsDateTime, formatCmsRelative } from '~/composables/cms/cmsDisplay'

const props = withDefaults(defineProps<{
  items: CmsDocumentSummary[]
  kind: CmsDocumentKind
  site: CmsSite | null
  canDelete?: boolean
  hasMore?: boolean
  loadingMore?: boolean
  loadMoreError?: string | null
}>(), {
  canDelete: false,
  hasMore: false,
  loadingMore: false,
  loadMoreError: null,
})

const emit = defineEmits<{
  open: [document: CmsDocumentSummary]
  trash: [document: CmsDocumentSummary]
  loadMore: []
}>()

function pathOf(document: CmsDocumentSummary): string | null {
  if (!document.slug)
    return document.isHome ? '/' : null
  return `${cmsPathPrefix(document.kind, document.publicationType, props.site)}${document.slug}`
}

// Columns are built here (not in a columns.ts) because they close over the site's route prefixes and emits.
const columns = computed<ColumnDef<CmsDocumentSummary, unknown>[]>(() => {
  const list: ColumnDef<CmsDocumentSummary, unknown>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Título' }),
      cell: ({ row }) => h('button', {
        type: 'button',
        class: 'max-w-[28rem] truncate rounded-sm text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        onClick: () => emit('open', row.original),
      }, row.original.title || 'Sem título'),
    },
  ]

  if (props.kind === 'publication') {
    list.push({
      accessorKey: 'publicationType',
      header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Tipo' }),
      cell: ({ row }) => {
        const type = row.original.publicationType
        return type
          ? h('span', { class: 'inline-flex items-center gap-1 text-xs text-muted-foreground' }, [
              h(Icon, { 'name': type === 'news' ? 'lucide:newspaper' : 'lucide:file-text', 'class': 'size-3.5', 'aria-hidden': 'true' }),
              CMS_PUBLICATION_TYPE_LABELS[type],
            ])
          : '—'
      },
    })
  }

  list.push(
    {
      id: 'path',
      accessorFn: document => document.slug ?? '',
      header: 'Endereço',
      enableSorting: false,
      cell: ({ row }) => {
        const path = pathOf(row.original)
        return path
          ? h('code', { class: 'max-w-[18rem] inline-block truncate align-middle font-mono text-xs text-muted-foreground' }, path)
          : h('span', { class: 'text-xs text-muted-foreground' }, 'Sem endereço')
      },
    },
    {
      accessorKey: 'publicStatus',
      header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Status público' }),
      cell: ({ row }) => h(CmsStatusBadge, {
        status: row.original.publicStatus,
        hasUnpublishedChanges: row.original.hasUnpublishedChanges,
      }),
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Atualizado em' }),
      cell: ({ row }) => h('time', {
        datetime: row.original.updatedAt,
        title: formatCmsDateTime(row.original.updatedAt),
        class: 'whitespace-nowrap text-sm text-muted-foreground',
      }, formatCmsRelative(row.original.updatedAt)),
    },
    {
      id: 'actions',
      header: () => h('span', { class: 'sr-only' }, 'Ações'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
        h(Button, {
          'variant': 'ghost',
          'size': 'icon',
          'class': 'size-8 text-muted-foreground hover:text-foreground',
          'aria-label': `Editar ${row.original.title || 'conteúdo'}`,
          'title': 'Editar',
          'onClick': () => emit('open', row.original),
        }, () => h(Icon, { 'name': 'lucide:pencil', 'class': 'size-4', 'aria-hidden': 'true' })),
        props.canDelete
          ? h(Button, {
              'variant': 'ghost',
              'size': 'icon',
              'class': 'size-8 text-muted-foreground hover:text-destructive',
              'aria-label': `Mover ${row.original.title || 'conteúdo'} para a lixeira`,
              'title': 'Mover para a lixeira',
              'onClick': () => emit('trash', row.original),
            }, () => h(Icon, { 'name': 'lucide:trash-2', 'class': 'size-4', 'aria-hidden': 'true' }))
          : null,
      ]),
    },
  )

  return list
})
</script>

<template>
  <div class="space-y-3">
    <!-- Horizontal scroll keeps the table usable on small screens without hiding columns. -->
    <div class="overflow-x-auto">
      <DataTable :data="items" :columns="columns">
        <template #pagination="{ table }">
          <DataTablePagination v-if="table.getPageCount() > 1" :table="table" />
        </template>
      </DataTable>
    </div>
    <div v-if="hasMore || loadMoreError" class="flex flex-col items-center gap-2">
      <p v-if="loadMoreError" role="alert" class="text-xs text-destructive">
        {{ loadMoreError }}
      </p>
      <Button variant="outline" size="sm" :disabled="loadingMore" @click="emit('loadMore')">
        <Icon v-if="loadingMore" name="lucide:loader-circle" class="mr-2 size-4 animate-spin" aria-hidden="true" />
        {{ loadingMore ? 'Carregando…' : 'Carregar mais' }}
      </Button>
    </div>
  </div>
</template>
