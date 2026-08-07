import type { ColumnDef } from '@tanstack/vue-table'
import type { TenantTeamMember } from '~/types/tenant-team'

import { h } from 'vue'
import DataTableColumnHeader from '@/components/tasks/components/DataTableColumnHeader.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import DataTableRowActions from '@/components/ui/table/DataTableRowActions.vue'
import { TENANT_TEAM_ROLE_LABELS } from '~/types/tenant-team'
import { crmBadgeClass, renderActiveStatusBadge } from '~/utils/crm/badges'

export const columns: ColumnDef<TenantTeamMember>[] = [
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
    accessorKey: 'email',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'E-mail' }),
    cell: ({ row }) => h('span', { class: 'text-muted-foreground' }, row.getValue('email')),
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'role',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Função' }),
    cell: ({ row }) => {
      const role = row.getValue('role') as TenantTeamMember['role']
      return h(Badge, { variant: 'outline' }, () => TENANT_TEAM_ROLE_LABELS[role] || role)
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Acesso' }),
    cell: ({ row, table }) => {
      const member = row.original
      const isPending = member.status === 'pending'
      const onResendInvite = (table.options.meta as any)?.onResendInvite

      return h('div', { class: 'flex flex-col items-start gap-0.5' }, [
        isPending
          ? h(Badge, { variant: 'outline', class: `font-medium text-xs ${crmBadgeClass.metaPending}` }, () => 'Convite pendente')
          : renderActiveStatusBadge(true),
        member.lastSignInAt
          ? h(
              'span',
              { class: 'text-xs text-muted-foreground' },
              `Último acesso: ${new Date(member.lastSignInAt).toLocaleDateString('pt-BR')}`,
            )
          : null,
        isPending && onResendInvite
          ? h(
              Button,
              {
                variant: 'link',
                size: 'sm',
                class: 'h-auto p-0 text-xs',
                onClick: () => onResendInvite(member),
              },
              () => 'Reenviar convite',
            )
          : null,
      ])
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: 'Criado em' }),
    cell: ({ row }) => {
      const rawDate = row.getValue('createdAt') as string
      if (!rawDate)
        return h('span', { class: 'text-sm text-muted-foreground' }, '-')
      const date = new Date(rawDate)
      if (Number.isNaN(date.getTime()))
        return h('span', { class: 'text-sm text-muted-foreground' }, '-')
      return h('span', { class: 'text-sm text-muted-foreground' }, date.toLocaleDateString('pt-BR'))
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
