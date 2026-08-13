/**
 * Official Meta Ad Studies / Experiments (Split Testing).
 * Creative A/B: SPLIT_TEST_V2 + creative_test_config on /me/ad_studies.
 * Classic: SPLIT_TEST with adsets[] per cell.
 */

import type { MetaGraphFetch } from './types'
import { enrichMetaGraphWriteError, metaGraphUrl } from './graph'
import { MetaAdsToolError } from './types'

export type ExperimentServiceContext = {
  apiVersion: string
  accessToken: string
  graph: MetaGraphFetch
}

export type ExperimentCellInput = {
  name: string
  treatmentPercentage: number
  /** Exactly one ad id for SPLIT_TEST_V2 creative tests. */
  adId?: string
  /** Adset ids for classic SPLIT_TEST. */
  adsetIds?: string[]
}

export type CreateExperimentInput = {
  name: string
  description?: string
  type: 'SPLIT_TEST_V2' | 'SPLIT_TEST'
  cells: ExperimentCellInput[]
  startTime: number
  endTime: number
  /** Required for SPLIT_TEST_V2 creative tests (cents or % — official XOR). */
  creativeTestDailyBudget?: number
  creativeTestLifetimeBudgetPercentage?: number
}

function buildCellsBody(type: CreateExperimentInput['type'], cells: ExperimentCellInput[]) {
  if (cells.length < 2 || cells.length > 5) {
    throw new MetaAdsToolError(
      'EXPERIMENT_CELLS_INVALID',
      'Experiments exigem 2–5 células (doc Meta Split Testing).',
      400,
      { count: cells.length },
    )
  }
  const sum = cells.reduce((acc, c) => acc + c.treatmentPercentage, 0)
  if (sum !== 100) {
    throw new MetaAdsToolError(
      'EXPERIMENT_PERCENTAGE_INVALID',
      'Soma de treatmentPercentage das células deve ser 100.',
      400,
      { sum },
    )
  }

  return cells.map((cell) => {
    const base: Record<string, unknown> = {
      name: cell.name,
      treatment_percentage: cell.treatmentPercentage,
    }
    if (type === 'SPLIT_TEST_V2') {
      if (!cell.adId) {
        throw new MetaAdsToolError(
          'EXPERIMENT_AD_REQUIRED',
          `Célula "${cell.name}": SPLIT_TEST_V2 exige exatamente um adId.`,
          400,
        )
      }
      base.ads = [cell.adId]
    }
    else {
      if (!cell.adsetIds?.length) {
        throw new MetaAdsToolError(
          'EXPERIMENT_ADSET_REQUIRED',
          `Célula "${cell.name}": SPLIT_TEST clássico exige adsetIds[].`,
          400,
        )
      }
      base.adsets = cell.adsetIds
    }
    return base
  })
}

export function buildCreateExperimentGraphBody(input: CreateExperimentInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name,
    type: input.type,
    cells: buildCellsBody(input.type, input.cells),
    start_time: input.startTime,
    end_time: input.endTime,
    cooldown_start_time: input.startTime,
    observation_end_time: input.endTime,
  }
  if (input.description)
    body.description = input.description

  if (input.type === 'SPLIT_TEST_V2') {
    const hasDaily = input.creativeTestDailyBudget != null
    const hasLife = input.creativeTestLifetimeBudgetPercentage != null
    if (hasDaily === hasLife) {
      throw new MetaAdsToolError(
        'EXPERIMENT_BUDGET_XOR',
        'SPLIT_TEST_V2 exige creativeTestDailyBudget OU creativeTestLifetimeBudgetPercentage.',
        400,
      )
    }
    const creative_test_config: Record<string, unknown> = {}
    if (hasDaily)
      creative_test_config.daily_budget = input.creativeTestDailyBudget
    if (hasLife)
      creative_test_config.lifetime_budget_percentage = input.creativeTestLifetimeBudgetPercentage
    body.creative_test_config = creative_test_config
  }

  return body
}

export async function createExperiment(
  ctx: ExperimentServiceContext,
  input: CreateExperimentInput,
  options?: { dryRun?: boolean },
): Promise<{ studyId: string | null, body: Record<string, unknown>, dryRun: boolean }> {
  const body = buildCreateExperimentGraphBody(input)
  if (options?.dryRun) {
    return { studyId: null, body, dryRun: true }
  }

  try {
    const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, '/me/ad_studies'), {
      method: 'POST',
      query: { access_token: ctx.accessToken },
      body,
    })
    return {
      studyId: res?.id ? String(res.id) : null,
      body,
      dryRun: false,
    }
  }
  catch (err) {
    enrichMetaGraphWriteError(err, body)
  }
}

export async function getExperiment(
  ctx: ExperimentServiceContext,
  studyId: string,
): Promise<Record<string, unknown>> {
  const id = String(studyId || '').trim()
  if (!id) {
    throw new MetaAdsToolError('EXPERIMENT_ID_REQUIRED', 'studyId é obrigatório.', 400)
  }
  const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, `/${id}`), {
    query: {
      fields: 'id,name,type,start_time,end_time,description,cells{id,name,treatment_percentage}',
      access_token: ctx.accessToken,
    },
  })
  return res && typeof res === 'object' ? res as Record<string, unknown> : {}
}

/**
 * Stop study early by setting end_time / observation_end_time to now (official pattern).
 */
export async function stopExperiment(
  ctx: ExperimentServiceContext,
  studyId: string,
  options?: { dryRun?: boolean },
): Promise<{ studyId: string, body: Record<string, unknown>, dryRun: boolean }> {
  const id = String(studyId || '').trim()
  if (!id) {
    throw new MetaAdsToolError('EXPERIMENT_ID_REQUIRED', 'studyId é obrigatório.', 400)
  }
  const now = Math.floor(Date.now() / 1000)
  const body: Record<string, unknown> = {
    end_time: now,
    observation_end_time: now,
  }
  if (options?.dryRun) {
    return { studyId: id, body, dryRun: true }
  }
  try {
    await ctx.graph(metaGraphUrl(ctx.apiVersion, `/${id}`), {
      method: 'POST',
      query: { access_token: ctx.accessToken },
      body,
    })
    return { studyId: id, body, dryRun: false }
  }
  catch (err) {
    enrichMetaGraphWriteError(err, body)
  }
}
