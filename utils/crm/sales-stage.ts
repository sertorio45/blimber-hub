import type { Lead, SalesStage } from '~/types/crm'

/** Stages belonging to a funnel, sorted by order. */
export function stagesForFunnel(
  stages: Array<Pick<SalesStage, 'id' | 'name' | 'order' | 'funnel_id'>>,
  funnelId: string | null | undefined,
) {
  if (!funnelId)
    return []
  return stages
    .filter(stage => stage.funnel_id === funnelId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function firstStageIdForFunnel(
  stages: Array<Pick<SalesStage, 'id' | 'order' | 'funnel_id'>>,
  funnelId: string | null | undefined,
): string | null {
  const list = stagesForFunnel(stages, funnelId)
  return list[0]?.id ?? null
}

export function isStageWonOrLost(stageName: string): 'won' | 'lost' | null {
  const name = (stageName || '').toLowerCase()
  if (name.includes('won') || name.includes('ganho') || name.includes('ganh'))
    return 'won'
  if (name.includes('lost') || name.includes('perdido') || name.includes('perdid'))
    return 'lost'
  return null
}

export function getStatusFromStageName(stageName: string): Lead['status'] | null {
  const name = (stageName || '').toLowerCase()
  if (name.includes('novo') || name.includes('new'))
    return 'new'
  if (name.includes('contat') || name.includes('contact'))
    return 'contacted'
  if (name.includes('qualific') || name.includes('qualif'))
    return 'qualified'
  if (name.includes('propost') || name.includes('proposal'))
    return 'proposal'
  if (name.includes('negocia') || name.includes('negoti'))
    return 'negotiation'
  if (name.includes('ganh') || name.includes('won'))
    return 'won'
  if (name.includes('perdid') || name.includes('lost'))
    return 'lost'
  return null
}

export function resolveLeadStatusOnStageMove(
  stageName: string,
  previousStatus?: Lead['status'] | null,
): { status: Lead['status'], closed_at: string | null } {
  const wonOrLost = isStageWonOrLost(stageName)
  const statusFromStage = getStatusFromStageName(stageName)
  let status: Lead['status'] = statusFromStage ?? previousStatus ?? 'new'
  if (!statusFromStage && (previousStatus === 'won' || previousStatus === 'lost'))
    status = 'negotiation'
  return {
    status,
    closed_at: wonOrLost ? new Date().toISOString() : null,
  }
}
