import type { ColumnDef } from '@tanstack/vue-table'
import type { SocialCampaign } from '~/types/marketing-social'

import { h } from 'vue'
import { Badge } from '@/components/ui/badge'
import DataTableColumnHeader from '@/components/tasks/components/DataTableColumnHeader.vue'
import DataTableRowActions from '@/components/ui/table/DataTableRowActions.vue'
import { SOCIAL_CAMPAIGN_STATUS_LABELS } from '~/types/marketing-social'

function formatDate(value?: string | null) {
  if (!value)
    return '—'
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateRange(startsAt?: string | null, endsAt?: string | null) {
  if (!startsAt && !endsAt)
    return '—'
  return `${formatDate(startsAt)} → ${formatDate(endsAt)}`
}

export const columns: ColumnDef<SocialCampaign>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Campanha' }),
    cell: ({ row, table }) =>
      h(
        'button',
        {
          type: 'button',
          class: 'text-left font-medium hover:underline',
          onClick: () => (table.options.meta as any)?.onView?.(row.original),
        },
        row.original.name,
      ),
    enableSorting: true,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Status' }),
    cell: ({ row }) =>
      h(Badge, { variant: 'secondary' }, () =>
        SOCIAL_CAMPAIGN_STATUS_LABELS[row.original.status] || row.original.status),
    enableSorting: true,
  },
  {
    id: 'dates',
    header: 'Período',
    cell: ({ row }) => formatDateRange(row.original.startsAt, row.original.endsAt),
    enableSorting: false,
  },
  {
    accessorKey: 'postsCount',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Posts' }),
    cell: ({ row }) => String(row.original.postsCount ?? 0),
    enableSorting: true,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row, table }) => {
      const meta = table.options.meta as {
        onEdit?: (row: SocialCampaign) => void
        onDelete?: (row: SocialCampaign) => void
        canManage?: boolean
      } | undefined

      if (!meta?.canManage)
        return null

      return h(DataTableRowActions, {
        row,
        onEdit: () => meta?.onEdit?.(row.original),
        onDelete: () => meta?.onDelete?.(row.original),
      })
    },
    enableSorting: false,
    enableHiding: false,
  },
]
