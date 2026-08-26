import { APPROVAL_REQUEST_STATUS_LABELS } from '~/types/marketing-social'

export type ApprovalStatusTone =
  | 'pending'
  | 'approved'
  | 'changes_requested'
  | 'rejected'
  | 'cancelled'
  | 'superseded'
  | 'overdue'
  | 'unknown'

/** Visual tone classes aligned with MarketingMvpStatusBadge. */
export function approvalStatusToneClass(status: string, overdue = false): string {
  if (overdue && status === 'pending')
    return 'bg-destructive/10 text-destructive'

  switch (status) {
    case 'pending':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
    case 'approved':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'changes_requested':
      return 'bg-orange-500/10 text-orange-700 dark:text-orange-300'
    case 'rejected':
      return 'bg-destructive/10 text-destructive'
    case 'cancelled':
    case 'superseded':
      return 'bg-muted text-muted-foreground'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/** Soft left-edge accent for inbox cards. */
export function approvalStatusAccentClass(status: string, overdue = false): string {
  if (overdue && status === 'pending')
    return 'border-l-destructive'
  switch (status) {
    case 'pending':
      return 'border-l-amber-500'
    case 'approved':
      return 'border-l-emerald-500'
    case 'changes_requested':
      return 'border-l-orange-500'
    case 'rejected':
      return 'border-l-destructive'
    default:
      return 'border-l-border'
  }
}

export function approvalStatusLabel(status: string, overdue = false): string {
  if (overdue && status === 'pending')
    return 'Atrasado'
  return APPROVAL_REQUEST_STATUS_LABELS[status] || status || '—'
}

export function approvalStatusIcon(status: string, overdue = false): string {
  if (overdue && status === 'pending')
    return 'lucide:alarm-clock'
  switch (status) {
    case 'pending':
      return 'lucide:clock-3'
    case 'approved':
      return 'lucide:check-circle-2'
    case 'changes_requested':
      return 'lucide:message-square-warning'
    case 'rejected':
      return 'lucide:x-circle'
    case 'cancelled':
      return 'lucide:ban'
    case 'superseded':
      return 'lucide:replace'
    default:
      return 'lucide:circle'
  }
}
