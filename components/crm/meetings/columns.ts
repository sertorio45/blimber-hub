import type { ColumnDef } from '@tanstack/vue-table'
import type { Meeting } from '~/types/crm'

import { h } from 'vue'
import DataTableColumnHeader from '@/components/tasks/components/DataTableColumnHeader.vue'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import DataTableRowActions from '@/components/ui/table/DataTableRowActions.vue'
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS } from '~/constants/meetings'
import { crmBadgeClass, meetingStatusBadgeClass } from '~/utils/crm/badges'

export const columns: ColumnDef<Meeting>[] = [
  {
    id: 'select',
    header: ({ table }) =>
      h(Checkbox, {
        'checked': table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate'),
        'onUpdate:checked': (value: boolean) => table.toggleAllPageRowsSelected(!!value),
        'ariaLabel': 'Selecionar todos',
        'class': 'translate-y-0.5',
      }),
    cell: ({ row }) =>
      h(Checkbox, {
        'checked': row.getIsSelected(),
        'onUpdate:checked': (value: boolean) => row.toggleSelected(!!value),
        'ariaLabel': 'Selecionar linha',
        'class': 'translate-y-0.5',
      }),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'title',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Título' }),
    cell: ({ row }) => h('span', { class: 'font-medium' }, row.getValue('title')),
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'company_name',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Empresa' }),
    cell: ({ row }) => h('span', { class: 'text-sm text-muted-foreground' }, (row.getValue('company_name') as string) || '—'),
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'contact_name',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Contato' }),
    cell: ({ row }) => h('span', { class: 'text-sm text-muted-foreground' }, (row.getValue('contact_name') as string) || '—'),
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'lead_name',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Lead' }),
    cell: ({ row }) => h('span', { class: 'text-sm text-muted-foreground' }, (row.getValue('lead_name') as string) || '—'),
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'type',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Tipo' }),
    cell: ({ row }) => {
      const type = row.getValue('type') as Meeting['type']
      return h(
        Badge,
        { variant: 'outline', class: `font-medium text-xs ${crmBadgeClass.type}` },
        () => MEETING_TYPE_LABELS[type] || type,
      )
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Status' }),
    cell: ({ row }) => {
      const status = row.getValue('status') as Meeting['status']
      return h(
        Badge,
        {
          variant: 'outline',
          class: `font-medium text-xs ${meetingStatusBadgeClass(status)}`,
        },
        () => MEETING_STATUS_LABELS[status] || status,
      )
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'start_time',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Início' }),
    cell: ({ row }) => {
      const raw = row.getValue('start_time') as string
      return h('span', { class: 'text-sm tabular-nums' }, new Date(raw).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }))
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'end_time',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Fim' }),
    cell: ({ row }) => {
      const raw = row.getValue('end_time') as string
      return h('span', { class: 'text-sm tabular-nums text-muted-foreground' }, new Date(raw).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }))
    },
    enableSorting: true,
    enableHiding: true,
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
