import type { ColumnDef } from '@tanstack/vue-table'
import type { Product } from '~/types/crm'

import { h, resolveComponent } from 'vue'
import DataTableColumnHeader from '@/components/tasks/components/DataTableColumnHeader.vue'
import { Checkbox } from '@/components/ui/checkbox'
import Button from '@/components/ui/button/Button.vue'
import { renderActiveStatusBadge } from '~/utils/crm/badges'

export const columns: ColumnDef<Product>[] = [
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
    accessorKey: 'name',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Nome' }),
    cell: ({ row }) => h('span', { class: 'font-medium' }, row.getValue('name')),
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'type',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Tipo' }),
    cell: ({ row }) => {
      const type = row.getValue('type') as string
      return h('span', {
        class: type === 'recorrente' ? 'text-primary font-medium' : 'text-muted-foreground',
      }, type === 'recorrente' ? 'Recorrente' : 'Avulso')
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'price',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Preço' }),
    cell: ({ row }) => {
      const price = Number(row.getValue('price'))
      return h('span', {}, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price))
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'recurrence',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Recorrência' }),
    cell: ({ row }) => {
      const r = row.getValue('recurrence') as string | null | undefined
      if (!r)
        return '-'
      const map: Record<string, string> = {
        mensal: 'Mensal',
        trimestral: 'Trimestral',
        semestral: 'Semestral',
        anual: 'Anual',
      }
      return map[r] ?? r
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'category',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Categoria' }),
    cell: ({ row }) => row.getValue('category') || '-',
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'tags',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Tags' }),
    cell: ({ row }) => {
      const tags = row.getValue('tags') as string[]
      if (!tags || tags.length === 0)
        return '-'
      return h('div', { class: 'flex flex-wrap gap-1' }, [
        ...tags.slice(0, 2).map(tag =>
          h('span', { class: 'inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium' }, tag),
        ),
        ...(tags.length > 2 ? [h('span', { class: 'text-xs text-muted-foreground' }, `+${tags.length - 2}`)] : []),
      ])
    },
    enableSorting: false,
    enableHiding: true,
  },
  {
    accessorKey: 'active',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Status' }),
    cell: ({ row }) => renderActiveStatusBadge(Boolean(row.getValue('active'))),
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row, table }) => {
      const meta = table.options.meta as {
        onEdit?: (row: Product) => void
        onDeactivate?: (row: Product) => void
        onReactivate?: (row: Product) => void
        onDelete?: (row: Product) => void
      }
      const product = row.original as Product
      const Icon = resolveComponent('Icon')

      return h('div', { class: 'flex justify-end gap-1' }, [
        h(Button, {
          variant: 'ghost',
          size: 'icon',
          class: 'h-8 w-8 text-muted-foreground hover:text-primary',
          title: 'Editar',
          onClick: () => meta.onEdit?.(product),
        }, () => [
          h(Icon, { name: 'lucide:pencil', class: 'h-4 w-4' }),
          h('span', { class: 'sr-only' }, 'Editar'),
        ]),
        product.active
          ? h(Button, {
              variant: 'ghost',
              size: 'icon',
              class: 'h-8 w-8 text-muted-foreground hover:text-amber-600',
              title: 'Desativar',
              onClick: () => meta.onDeactivate?.(product),
            }, () => [
              h(Icon, { name: 'lucide:power-off', class: 'h-4 w-4' }),
              h('span', { class: 'sr-only' }, 'Desativar'),
            ])
          : h(Button, {
              variant: 'ghost',
              size: 'icon',
              class: 'h-8 w-8 text-muted-foreground hover:text-green-600',
              title: 'Reativar',
              onClick: () => meta.onReactivate?.(product),
            }, () => [
              h(Icon, { name: 'lucide:power', class: 'h-4 w-4' }),
              h('span', { class: 'sr-only' }, 'Reativar'),
            ]),
        h(Button, {
          variant: 'ghost',
          size: 'icon',
          class: 'h-8 w-8 text-muted-foreground hover:text-destructive',
          title: 'Excluir',
          onClick: () => meta.onDelete?.(product),
        }, () => [
          h(Icon, { name: 'lucide:trash-2', class: 'h-4 w-4' }),
          h('span', { class: 'sr-only' }, 'Excluir'),
        ]),
      ])
    },
    enableSorting: false,
    enableHiding: false,
  },
]
