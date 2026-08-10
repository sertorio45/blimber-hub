import { h, resolveComponent } from 'vue'
import { Badge } from '@/components/ui/badge'

/** Shared CRM badge styles — keep DataTable tags consistent across modules. */
export const crmBadgeClass = {
  active:
    'border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300',
  inactive:
    'border-transparent bg-muted text-muted-foreground hover:bg-muted',
  defaultFlag:
    'border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300',
  customFlag:
    'border-transparent bg-muted text-muted-foreground hover:bg-muted',
  priorityHigh:
    'border-transparent bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300',
  priorityMedium:
    'border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300',
  priorityLow:
    'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
  type:
    'border-border bg-background text-foreground',
  statusScheduled:
    'border-transparent bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300',
  statusCompleted:
    'border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300',
  statusCancelled:
    'border-transparent bg-muted text-muted-foreground hover:bg-muted',
  statusNoShow:
    'border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300',
  metaSent:
    'border-emerald-200 bg-emerald-50 text-emerald-700',
  metaFailed:
    'border-red-200 bg-red-50 text-red-700',
  metaPending:
    'border-amber-200 bg-amber-50 text-amber-800',
  metaSkipped:
    'border-border bg-muted text-muted-foreground',
} as const

export function renderActiveStatusBadge(isActive: boolean) {
  return h(
    Badge,
    {
      variant: 'outline',
      class: ['font-medium text-xs', isActive ? crmBadgeClass.active : crmBadgeClass.inactive].join(' '),
    },
    () => (isActive ? 'Ativo' : 'Inativo'),
  )
}

export function renderDefaultFlagBadge(isDefault: boolean) {
  const Icon = resolveComponent('Icon')
  return h(
    Badge,
    {
      variant: 'outline',
      class: [
        'inline-flex items-center gap-1 font-medium text-xs',
        isDefault ? crmBadgeClass.defaultFlag : crmBadgeClass.customFlag,
      ].join(' '),
    },
    () => [
      h(Icon, {
        name: isDefault ? 'lucide:check-circle' : 'lucide:circle',
        class: 'h-3.5 w-3.5',
      }),
      isDefault ? 'Padrão' : 'Personalizado',
    ],
  )
}

export function renderPriorityBadge(priority: string) {
  const map: Record<string, { label: string, className: string }> = {
    high: { label: 'Alta', className: crmBadgeClass.priorityHigh },
    medium: { label: 'Média', className: crmBadgeClass.priorityMedium },
    low: { label: 'Baixa', className: crmBadgeClass.priorityLow },
  }
  const item = map[priority]
  if (!item)
    return h('span', { class: 'text-sm text-muted-foreground' }, priority || '-')

  return h(
    Badge,
    { variant: 'outline', class: ['font-medium text-xs', item.className].join(' ') },
    () => item.label,
  )
}

export function meetingStatusBadgeClass(status: string): string {
  if (status === 'completed')
    return crmBadgeClass.statusCompleted
  if (status === 'cancelled')
    return crmBadgeClass.statusCancelled
  if (status === 'no-show')
    return crmBadgeClass.statusNoShow
  return crmBadgeClass.statusScheduled
}
