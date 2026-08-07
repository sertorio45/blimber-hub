import type { ColumnDef } from '@tanstack/vue-table'
import type { LeadSource } from '~/types/crm'

import { h } from 'vue'
import DataTableColumnHeader from '@/components/tasks/components/DataTableColumnHeader.vue'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'

import DataTableRowActions from '@/components/ui/table/DataTableRowActions.vue'
import { formatLeadValueRange } from '~/composables/crm/useCrmLeadValue'
import { crmBadgeClass, renderDefaultFlagBadge, renderPriorityBadge } from '~/utils/crm/badges'

const statusOptions = [
  { value: 'new', label: 'Novo', color: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  { value: 'contacted', label: 'Contatado', color: 'border-transparent bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300' },
  { value: 'qualified', label: 'Qualificado', color: 'border-transparent bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300' },
  { value: 'proposal', label: 'Proposta', color: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  { value: 'negotiation', label: 'Negociação', color: 'border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  { value: 'won', label: 'Ganho', color: crmBadgeClass.active },
  { value: 'lost', label: 'Perdido', color: crmBadgeClass.inactive },
]

const priorityOptions = [
  { value: 'low', label: 'Baixa', color: crmBadgeClass.priorityLow },
  { value: 'medium', label: 'Média', color: crmBadgeClass.priorityMedium },
  { value: 'high', label: 'Alta', color: crmBadgeClass.priorityHigh },
]

const sourceOptions = [
  { value: 'website', label: 'Site' },
  { value: 'referral', label: 'Indicação' },
  { value: 'social', label: 'Redes Sociais' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'other', label: 'Outros' },
]

function resolveStatusBadge(row: { getValue: (key: string) => unknown, original: Record<string, unknown> }, table: { options: { meta?: Record<string, unknown> } }) {
  const getStage = table.options.meta?.getStage as
    | ((id?: string | null) => { name: string, color?: string } | null | undefined)
    | undefined

  const stageId = (row.original.sales_stage_id || row.getValue('sales_stage_id')) as string | null | undefined
  const stage = getStage?.(stageId)

  if (stage?.name) {
    const stageColor = stage.color
      ? undefined
      : 'border-transparent bg-muted text-foreground'
    return {
      label: stage.name,
      class: stageColor,
      style: stage.color
        ? {
            backgroundColor: `${stage.color}22`,
            color: stage.color,
            borderColor: `${stage.color}55`,
          }
        : undefined,
    }
  }

  const status = statusOptions.find(s => s.value === row.getValue('status'))
  if (!status)
    return null

  return {
    label: status.label,
    class: status.color,
    style: undefined,
  }
}

export const columns: ColumnDef<any>[] = [
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
    cell: ({ row }) => {
      return h('div', { class: 'flex flex-col' }, [
        h('span', { class: 'font-medium' }, row.getValue('name')),
        h('span', { class: 'text-sm text-muted-foreground' }, row.original.email),
      ])
    },
  },
  {
    accessorKey: 'company',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Empresa' }),
    cell: ({ row }) => h('span', row.getValue('company') || '-'),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Status' }),
    cell: ({ row, table }) => {
      const badge = resolveStatusBadge(row, table)
      if (!badge)
        return h('span', { class: 'text-sm text-muted-foreground' }, '-')

      return h(
        Badge,
        {
          variant: 'outline',
          class: ['font-medium', badge.class].filter(Boolean).join(' '),
          style: badge.style,
        },
        () => badge.label,
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'priority',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Prioridade' }),
    cell: ({ row }) => renderPriorityBadge(String(row.getValue('priority') || '')),
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'source',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Origem' }),
    cell: ({ row }) => {
      const source = sourceOptions.find(s => s.value === row.getValue('source'))
      return h('span', { class: 'capitalize' }, source?.label || row.getValue('source'))
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'value',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Valor' }),
    cell: ({ row }) => {
      const lead = row.original as { value?: number, values?: number[] }
      return h(
        'span',
        { class: 'font-medium' },
        formatLeadValueRange(lead.values, lead.value),
      )
    },
  },
  {
    accessorKey: 'assigned_to',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Responsável' }),
    cell: ({ row, table }) => {
      const userId = row.getValue('assigned_to') || row.original.assignedTo
      const getMemberName = (table.options.meta as { getMemberName?: (id?: string | null) => string })?.getMemberName
      const label = getMemberName ? getMemberName(userId as string | null) : (userId || 'Não atribuído')
      return h('span', label)
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Criado em' }),
    cell: ({ row }) => {
      const rawDate = row.getValue('created_at') || row.original.createdAt
      if (!rawDate)
        return h('span', { class: 'text-sm text-muted-foreground' }, '-')
      const date = new Date(String(rawDate))
      if (Number.isNaN(date.getTime()))
        return h('span', { class: 'text-sm text-muted-foreground' }, '-')
      return h('span', { class: 'text-sm' }, date.toLocaleDateString('pt-BR'))
    },
  },
  {
    id: 'actions',
    cell: ({ row, table }) =>
      h(DataTableRowActions, {
        row,
        onEdit: () => (table.options.meta as any)?.onEdit?.(row.original),
        onDelete: () => (table.options.meta as any)?.onDelete?.(row.original),
      }),
  },
]

export const sourceColumns: ColumnDef<LeadSource>[] = [
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
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Nome da origem' }),
    cell: ({ row }) => h('span', { class: 'font-medium text-muted-foreground' }, row.getValue('name')),
  },
  {
    accessorKey: 'description',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Descrição' }),
    cell: ({ row }) => h('span', { class: 'truncate text-xs text-muted-foreground' }, row.getValue('description')),
  },
  {
    accessorKey: 'is_default',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Padrão' }),
    cell: ({ row }) => renderDefaultFlagBadge(Boolean(row.original.is_default)),
    enableSorting: false,
    enableHiding: false,
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

export { priorityOptions, sourceOptions, statusOptions }
