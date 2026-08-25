/**
 * Build / normalize Marketing Report layouts from template catalogs.
 */

import { getReportTemplate } from '~/constants/marketing-report-templates'
import type {
  MarketingReportLayoutJson,
  MarketingReportLayoutProvider,
  ReportLayoutBlock,
  ReportLayoutBlockType,
} from '~/types/marketing-report-layout'
import type { ReportMetricDef } from '~/types/marketing-reports'

const BLOCK_LABELS_PT: Record<ReportLayoutBlockType, string> = {
  kpi_primary: 'Indicadores principais',
  kpi_detail: 'Detalhamento',
  trend_chart: 'Gráfico de tendência',
  campaigns_table: 'Tabela de campanhas',
  conversions_table: 'Conversões por ação',
  networks_table: 'Por tipo de campanha',
  insights: 'Insights',
}

export function reportLayoutBlockLabel(type: ReportLayoutBlockType): string {
  return BLOCK_LABELS_PT[type] || type
}

export function availableBlockTypesForProvider(
  provider: MarketingReportLayoutProvider,
): ReportLayoutBlockType[] {
  if (provider === 'google_ads') {
    return [
      'kpi_primary',
      'kpi_detail',
      'trend_chart',
      'conversions_table',
      'networks_table',
      'campaigns_table',
      'insights',
    ]
  }
  return [
    'kpi_primary',
    'kpi_detail',
    'trend_chart',
    'campaigns_table',
    'insights',
  ]
}

function newBlockId(type: ReportLayoutBlockType): string {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function createReportLayoutBlock(
  type: ReportLayoutBlockType,
  metricKeys?: string[],
): ReportLayoutBlock {
  return {
    id: newBlockId(type),
    type,
    enabled: true,
    ...(metricKeys?.length ? { metricKeys: [...metricKeys] } : {}),
    title: reportLayoutBlockLabel(type),
  }
}

/** Default layout derived from a report template definition. */
export function buildDefaultReportLayout(
  provider: MarketingReportLayoutProvider,
  templateBaseId: string,
): MarketingReportLayoutJson {
  const template = getReportTemplate(provider, templateBaseId)
  const primary = template.metrics.filter(m => m.primary)
  const primaryKeys = (primary.length ? primary.slice(0, 3) : template.metrics.slice(0, 3)).map(m => m.key)
  const primarySet = new Set(primaryKeys)
  const detailKeys = template.metrics.filter(m => !primarySet.has(m.key)).map(m => m.key)

  const blocks: ReportLayoutBlock[] = [
    createReportLayoutBlock('kpi_primary', primaryKeys),
    createReportLayoutBlock('kpi_detail', detailKeys),
    createReportLayoutBlock('trend_chart'),
  ]

  if (provider === 'google_ads') {
    blocks.push(createReportLayoutBlock('conversions_table'))
    blocks.push(createReportLayoutBlock('networks_table'))
  }

  blocks.push(createReportLayoutBlock('campaigns_table'))

  return {
    version: 1,
    templateBaseId: template.id,
    blocks,
  }
}

function isBlockType(value: unknown): value is ReportLayoutBlockType {
  return typeof value === 'string' && value in BLOCK_LABELS_PT
}

function normalizeBlock(raw: unknown, index: number): ReportLayoutBlock | null {
  if (!raw || typeof raw !== 'object')
    return null
  const row = raw as Record<string, unknown>
  const type = row.type
  if (!isBlockType(type))
    return null
  const id = typeof row.id === 'string' && row.id.trim()
    ? row.id.trim()
    : `${type}-${index}`
  const metricKeys = Array.isArray(row.metricKeys)
    ? row.metricKeys.filter((k): k is string => typeof k === 'string' && Boolean(k.trim()))
    : undefined
  return {
    id,
    type,
    enabled: row.enabled === false ? false : true,
    ...(metricKeys?.length ? { metricKeys } : {}),
    ...(typeof row.title === 'string' && row.title.trim()
      ? { title: row.title.trim() }
      : { title: reportLayoutBlockLabel(type) }),
  }
}

/**
 * Normalize persisted / draft layout JSON.
 * Falls back to default layout when invalid.
 */
export function normalizeReportLayout(
  provider: MarketingReportLayoutProvider,
  templateBaseId: string,
  raw: unknown,
): MarketingReportLayoutJson {
  const fallback = buildDefaultReportLayout(provider, templateBaseId)
  if (!raw || typeof raw !== 'object')
    return fallback

  const row = raw as Record<string, unknown>
  const blocksRaw = Array.isArray(row.blocks) ? row.blocks : null
  if (!blocksRaw?.length)
    return fallback

  const blocks = blocksRaw
    .map((b, i) => normalizeBlock(b, i))
    .filter((b): b is ReportLayoutBlock => Boolean(b))

  if (!blocks.length)
    return fallback

  const allowed = new Set(availableBlockTypesForProvider(provider))
  const filtered = blocks.filter(b => allowed.has(b.type))
  if (!filtered.length)
    return fallback

  const baseId = typeof row.templateBaseId === 'string' && row.templateBaseId.trim()
    ? row.templateBaseId.trim()
    : templateBaseId

  return {
    version: 1,
    templateBaseId: baseId,
    blocks: filtered,
  }
}

/** Metric defs for a KPI block, ordered by metricKeys when present. */
export function resolveBlockMetricDefs(
  catalog: ReportMetricDef[],
  metricKeys: string[] | undefined,
  mode: 'primary' | 'detail' | 'all',
): ReportMetricDef[] {
  if (metricKeys?.length) {
    const byKey = new Map(catalog.map(m => [m.key, m]))
    return metricKeys.map(k => byKey.get(k)).filter((m): m is ReportMetricDef => Boolean(m))
  }
  if (mode === 'all')
    return catalog
  const primaries = catalog.filter(m => m.primary)
  const primaryKeys = new Set(
    (primaries.length ? primaries.slice(0, 3) : catalog.slice(0, 3)).map(m => m.key),
  )
  if (mode === 'primary')
    return catalog.filter(m => primaryKeys.has(m.key))
  return catalog.filter(m => !primaryKeys.has(m.key))
}

export function layoutsAreEqual(
  a: MarketingReportLayoutJson,
  b: MarketingReportLayoutJson,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
