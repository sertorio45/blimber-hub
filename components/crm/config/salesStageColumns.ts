import type { ColumnDef } from '@tanstack/vue-table'
import { h } from 'vue'

import DataTableColumnHeader from '@/components/tasks/components/DataTableColumnHeader.vue'
import { Checkbox } from '@/components/ui/checkbox'
import DataTableRowActions from '@/components/ui/table/DataTableRowActions.vue'
import { renderDefaultFlagBadge } from '~/utils/crm/badges'

export const salesStageColumns: ColumnDef<any>[] = [
  {
    id: 'select',
    header: ({ table }) =>
      h(Checkbox, {
        'checked': table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate'),
        'onUpdate:checked': value => table.toggleAllPageRowsSelected(!!value),
        'ariaLabel': 'Selecionar todos',
        'class': 'translate-y-0.5',
      }),
    cell: ({ row }) =>
      h(Checkbox, {
        'checked': row.getIsSelected(),
        'onUpdate:checked': value => row.toggleSelected(!!value),
        'ariaLabel': 'Selecionar linha',
        'class': 'translate-y-0.5',
      }),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Nome' }),
    cell: ({ row }) => h('span', { class: 'font-medium' }, row.getValue('name')),
  },
  {
    accessorKey: 'order',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Ordem' }),
    cell: ({ row }) => h('span', { class: 'tabular-nums text-sm text-muted-foreground' }, row.getValue('order')),
  },
  {
    accessorKey: 'color',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Cor' }),
    cell: ({ row }) =>
      h('span', {
        class: 'inline-block h-5 w-5 rounded-full border border-border shadow-sm',
        style: `background:${row.getValue('color')}`,
        title: String(row.getValue('color') || ''),
      }),
  },
  {
    accessorKey: 'description',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Descrição' }),
    cell: ({ row }) => h(
      'span',
      { class: 'max-w-[240px] truncate text-sm text-muted-foreground' },
      (row.getValue('description') as string) || '—',
    ),
  },
  {
    accessorKey: 'is_default',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Padrão' }),
    cell: ({ row }) => renderDefaultFlagBadge(Boolean(row.original.is_default)),
    enableSorting: false,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row, table }) =>
      h(DataTableRowActions, {
        row,
        onEdit: () => (table.options.meta as any)?.onEdit?.(row.original),
        onDelete: () => (table.options.meta as any)?.onDelete?.(row.original),
      }),
    enableSorting: false,
    enableHiding: false,
  },
]
