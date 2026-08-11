import type { ReportMetricDef, ReportMetricFormat } from '~/types/marketing-reports'

export function formatReportMetricValue(
  value: number | null | undefined,
  format: ReportMetricFormat,
): string {
  const n = value == null || Number.isNaN(Number(value)) ? null : Number(value)
  if (n == null)
    return '—'

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
    case 'percent':
      return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
    case 'roas':
      return n > 0
        ? `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`
        : '—'
    case 'decimal':
      return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    case 'integer':
    default:
      return Math.round(n).toLocaleString('pt-BR')
  }
}

export function readMetricBag(source: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!source)
    return null
  const v = source[key]
  if (v == null || v === '')
    return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

export function periodLabelPt(period?: {
  preset?: string
  date_start?: string | null
  date_end?: string | null
} | null): string {
  if (!period?.preset)
    return ''
  if (period.preset === 'custom' && period.date_start && period.date_end)
    return `${period.date_start} → ${period.date_end}`
  const labels: Record<string, string> = {
    today: 'Hoje',
    yesterday: 'Ontem',
    last_7d: 'Últimos 7 dias',
    last_14d: 'Últimos 14 dias',
    last_30d: 'Últimos 30 dias',
    last_90d: 'Últimos 90 dias',
  }
  return labels[period.preset] || period.preset
}

export function metricDefsLabelMap(defs: ReportMetricDef[]): Record<string, string> {
  return Object.fromEntries(defs.map(d => [d.key, d.label]))
}

/** Format a period-over-period delta percentage for report KPIs. */
export function formatReportDelta(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(Number(pct)))
    return ''
  const n = Number(pct)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
}

export function reportDeltaTone(
  pct: number | null | undefined,
  invert = false,
): 'up' | 'down' | 'neutral' {
  if (pct == null || Number.isNaN(Number(pct)) || Math.abs(Number(pct)) < 0.05)
    return 'neutral'
  const effective = invert ? -Number(pct) : Number(pct)
  return effective >= 0 ? 'up' : 'down'
}

/** Format GA4 averageSessionDuration (seconds) as mm:ss. */
export function formatDurationSeconds(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0)
    return '—'
  const total = Math.round(n)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function shortDateLabel(isoDate: string): string {
  if (!isoDate)
    return ''
  const parts = isoDate.split('-')
  if (parts.length === 3)
    return `${parts[2]}/${parts[1]}`
  return isoDate
}
