/**
 * Official Meta Ad Studies / Experiments (Split Testing).
 * Creative A/B: SPLIT_TEST_V2 + creative_test_config on /me/ad_studies.
 * Classic: SPLIT_TEST with adsets[] per cell.
 *
 * Documented limits (Marketing API Split Testing + Ad Study):
 * - Creative Tests (SPLIT_TEST_V2): 2–5 cells, exactly one ad per cell.
 * - Classic SPLIT_TEST: max 150 cells / study; max 100 ad entities / cell; 100 concurrent studies.
 * - treatment_percentage ≥ 10; creative tests require percentages summing to 100.
 * List: GET act_{adAccountId}/impacting_ad_studies (Ad Account edge).
 * Cells: GET /{studyId}/cells (ads, adsets, campaigns).
 * Conflicts: GET /{adsetId}/ad_studies, GET /{campaignId}/ad_studies + impacting studies.
 * Duplicate ads: POST /{adId}/copies (copied_ad_id; creative_parameters; status_option).
 * Winner: Graph documents results_first_available_date + confidence_level; no winner_cell_id field.
 */

import type { MetaGraphFetch } from './types'
import { actPath, enrichMetaGraphWriteError, metaGraphUrl } from './graph'
import { MetaAdsToolError } from './types'

export type ExperimentServiceContext = {
  apiVersion: string
  accessToken: string
  graph: MetaGraphFetch
}

export const CREATIVE_TEST_MIN_CELLS = 2
export const CREATIVE_TEST_MAX_CELLS = 5
export const CLASSIC_SPLIT_TEST_MAX_CELLS = 150
export const MIN_TREATMENT_PERCENTAGE = 10
export const MAX_CONCURRENT_STUDIES = 100

export const EXPERIMENT_STUDY_FIELDS
  = 'id,name,type,description,start_time,end_time,canceled_time,cooldown_start_time,observation_end_time,results_first_available_date,confidence_level'

export const EXPERIMENT_CELL_FIELDS
  = 'id,name,treatment_percentage,ads,adsets,campaigns,adaccounts'

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

export type ExperimentVariationInput = {
  name?: string
  message?: string
  headline?: string
  description?: string
  linkUrl?: string
}

export type StudyConflict = {
  studyId: string
  name: string | null
  type: string | null
  phase: 'running' | 'scheduled'
  startTime: unknown
  endTime: unknown
  matched: { ads: string[], adsets: string[], campaigns: string[] }
}

function cellCountLimits(type: CreateExperimentInput['type']): { min: number, max: number } {
  if (type === 'SPLIT_TEST_V2')
    return { min: CREATIVE_TEST_MIN_CELLS, max: CREATIVE_TEST_MAX_CELLS }
  return { min: CREATIVE_TEST_MIN_CELLS, max: CLASSIC_SPLIT_TEST_MAX_CELLS }
}

export function evenTreatmentPercentages(cellCount: number): number[] {
  if (cellCount < 1)
    return []
  const base = Math.floor(100 / cellCount)
  const rem = 100 - base * cellCount
  return Array.from({ length: cellCount }, (_, i) => base + (i < rem ? 1 : 0))
}

export function toUnixSeconds(value: unknown): number | null {
  if (value == null || value === '')
    return null
  if (typeof value === 'number' && Number.isFinite(value))
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value)
  const asNum = Number(value)
  if (Number.isFinite(asNum) && String(value).trim() !== '' && !String(value).includes('-') && !String(value).includes('T'))
    return asNum > 1e12 ? Math.floor(asNum / 1000) : Math.floor(asNum)
  const ms = Date.parse(String(value))
  if (Number.isFinite(ms))
    return Math.floor(ms / 1000)
  return null
}

/** Open = not canceled and not ended (running or scheduled). */
export function studyPhase(
  study: Record<string, unknown>,
  nowSec = Math.floor(Date.now() / 1000),
): 'running' | 'scheduled' | 'ended' {
  if (study.canceled_time)
    return 'ended'
  const start = toUnixSeconds(study.start_time)
  const end = toUnixSeconds(study.end_time)
  if (end != null && end <= nowSec)
    return 'ended'
  if (start != null && start > nowSec)
    return 'scheduled'
  return 'running'
}

export function flattenGraphIds(value: unknown): string[] {
  if (value == null)
    return []
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim()
    return id ? [id] : []
  }
  if (Array.isArray(value))
    return value.flatMap(flattenGraphIds)
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    if (Array.isArray(rec.data))
      return flattenGraphIds(rec.data)
    if (rec.id != null)
      return flattenGraphIds(rec.id)
  }
  return []
}

export function extractStudyCells(study: Record<string, unknown>): Record<string, unknown>[] {
  const raw = study.cells
  if (Array.isArray(raw))
    return raw.filter(row => row && typeof row === 'object') as Record<string, unknown>[]
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return ((raw as { data: unknown[] }).data).filter(row => row && typeof row === 'object') as Record<string, unknown>[]
  }
  return []
}

export function collectCellEntityIds(cells: Record<string, unknown>[]): {
  ads: string[]
  adsets: string[]
  campaigns: string[]
} {
  const ads: string[] = []
  const adsets: string[] = []
  const campaigns: string[] = []
  for (const cell of cells) {
    ads.push(...flattenGraphIds(cell.ads))
    adsets.push(...flattenGraphIds(cell.adsets))
    campaigns.push(...flattenGraphIds(cell.campaigns))
  }
  return {
    ads: [...new Set(ads)],
    adsets: [...new Set(adsets)],
    campaigns: [...new Set(campaigns)],
  }
}

function buildCellsBody(type: CreateExperimentInput['type'], cells: ExperimentCellInput[]) {
  const { min, max } = cellCountLimits(type)
  if (cells.length < min || cells.length > max) {
    const hint = type === 'SPLIT_TEST_V2'
      ? 'Teste de criativo (SPLIT_TEST_V2 / Creative Tests) exige 2–5 células (doc Meta Split Testing).'
      : `SPLIT_TEST clássico exige 2–${CLASSIC_SPLIT_TEST_MAX_CELLS} células (doc Meta Split Testing).`
    throw new MetaAdsToolError(
      'EXPERIMENT_CELLS_INVALID',
      hint,
      400,
      {
        count: cells.length,
        min,
        max,
        type,
        note: 'Pedido informal “até 6 variações” (7 versões com o anúncio base) excede o teto de 5 células do Creative Test.',
      },
    )
  }
  for (const cell of cells) {
    if (cell.treatmentPercentage < MIN_TREATMENT_PERCENTAGE) {
      throw new MetaAdsToolError(
        'EXPERIMENT_PERCENTAGE_INVALID',
        `treatmentPercentage de cada célula deve ser ≥ ${MIN_TREATMENT_PERCENTAGE} (doc Ad Study).`,
        400,
        { cell: cell.name, treatmentPercentage: cell.treatmentPercentage },
      )
    }
  }
  const sum = cells.reduce((acc, c) => acc + c.treatmentPercentage, 0)
  if (type === 'SPLIT_TEST_V2' && sum !== 100) {
    throw new MetaAdsToolError(
      'EXPERIMENT_PERCENTAGE_INVALID',
      'Soma de treatmentPercentage das células deve ser 100 (Creative Test).',
      400,
      { sum },
    )
  }
  if (type === 'SPLIT_TEST' && (sum < 1 || sum > 100)) {
    throw new MetaAdsToolError(
      'EXPERIMENT_PERCENTAGE_INVALID',
      'Soma de treatmentPercentage deve ser ≤ 100 (doc Ad Study).',
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
      if (cell.adsetIds.length > 100) {
        throw new MetaAdsToolError(
          'EXPERIMENT_ADSET_REQUIRED',
          `Célula "${cell.name}": no máximo 100 entidades por célula (doc Split Testing).`,
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

export function variationHasCopyOverlay(variation: ExperimentVariationInput): boolean {
  return Boolean(
    variation.message
    || variation.headline
    || variation.description
    || variation.linkUrl,
  )
}

/**
 * Overlay copy fields onto existing object_story_spec (link_data / video_data).
 * Does not invent AdCreative fields; requires a story spec when overlay is requested.
 */
export function mergeVariationCreativeParameters(
  objectStorySpec: Record<string, unknown> | null | undefined,
  variation: ExperimentVariationInput,
): Record<string, unknown> | undefined {
  if (!variationHasCopyOverlay(variation))
    return undefined
  if (!objectStorySpec || typeof objectStorySpec !== 'object') {
    throw new MetaAdsToolError(
      'EXPERIMENT_CREATIVE_OVERLAY_UNSUPPORTED',
      'Variação com copy exige object_story_spec (link_data ou video_data) no anúncio base. Use ads já criados em cells[] ou copie sem overlay de texto.',
      400,
    )
  }

  const story = structuredClone(objectStorySpec) as Record<string, unknown>
  if (story.link_data && typeof story.link_data === 'object') {
    const link = { ...(story.link_data as Record<string, unknown>) }
    if (variation.message != null)
      link.message = variation.message
    if (variation.headline != null)
      link.name = variation.headline
    if (variation.description != null)
      link.description = variation.description
    if (variation.linkUrl != null) {
      if (!String(variation.linkUrl).startsWith('https://')) {
        throw new MetaAdsToolError('LINK_URL_HTTPS_REQUIRED', 'linkUrl da variação deve usar https://.', 400)
      }
      link.link = variation.linkUrl
      if (link.call_to_action && typeof link.call_to_action === 'object') {
        const cta = { ...(link.call_to_action as Record<string, unknown>) }
        const value = (cta.value && typeof cta.value === 'object')
          ? { ...(cta.value as Record<string, unknown>) }
          : {}
        value.link = variation.linkUrl
        cta.value = value
        link.call_to_action = cta
      }
    }
    story.link_data = link
  }
  else if (story.video_data && typeof story.video_data === 'object') {
    const video = { ...(story.video_data as Record<string, unknown>) }
    if (variation.message != null)
      video.message = variation.message
    if (variation.headline != null)
      video.title = variation.headline
    if (variation.linkUrl != null) {
      if (!String(variation.linkUrl).startsWith('https://')) {
        throw new MetaAdsToolError('LINK_URL_HTTPS_REQUIRED', 'linkUrl da variação deve usar https://.', 400)
      }
      video.link = variation.linkUrl
    }
    story.video_data = video
  }
  else {
    throw new MetaAdsToolError(
      'EXPERIMENT_CREATIVE_OVERLAY_UNSUPPORTED',
      'Overlay de copy só é aplicado em object_story_spec.link_data ou video_data (campos oficiais AdCreative).',
      400,
    )
  }

  return { object_story_spec: story }
}

export function buildCopyAdGraphBody(params: {
  variation: ExperimentVariationInput
  index: number
  objectStorySpec?: Record<string, unknown> | null
}): Record<string, unknown> {
  const suffix = params.variation.name?.trim()
    ? ` - ${params.variation.name.trim()}`
    : ` - Test ${params.index + 1}`
  const body: Record<string, unknown> = {
    status_option: 'PAUSED',
    rename_options: {
      rename_strategy: 'ONLY_TOP_LEVEL_RENAME',
      rename_suffix: suffix,
    },
  }
  const creative = mergeVariationCreativeParameters(params.objectStorySpec, params.variation)
  if (creative)
    body.creative_parameters = creative
  return body
}

export async function listExperiments(
  ctx: ExperimentServiceContext,
  adAccountId: string,
  options?: { limit?: number },
): Promise<{ studies: Record<string, unknown>[], paging: unknown }> {
  const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, `/${actPath(adAccountId)}/impacting_ad_studies`), {
    query: {
      fields: `${EXPERIMENT_STUDY_FIELDS},cells{${EXPERIMENT_CELL_FIELDS}}`,
      limit: options?.limit ?? 50,
      access_token: ctx.accessToken,
    },
  })
  const studies = Array.isArray(res?.data) ? res.data as Record<string, unknown>[] : []
  return { studies, paging: res?.paging ?? null }
}

async function listEntityStudies(
  ctx: ExperimentServiceContext,
  entityId: string,
): Promise<Record<string, unknown>[]> {
  const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, `/${entityId}/ad_studies`), {
    query: {
      fields: `${EXPERIMENT_STUDY_FIELDS},cells{${EXPERIMENT_CELL_FIELDS}}`,
      access_token: ctx.accessToken,
    },
  })
  return Array.isArray(res?.data) ? res.data as Record<string, unknown>[] : []
}

function matchStudyAgainstTargets(
  study: Record<string, unknown>,
  targets: { ads: Set<string>, adsets: Set<string>, campaigns: Set<string> },
): StudyConflict | null {
  const phase = studyPhase(study)
  if (phase === 'ended')
    return null
  const entities = collectCellEntityIds(extractStudyCells(study))
  const matched = {
    ads: entities.ads.filter(id => targets.ads.has(id)),
    adsets: entities.adsets.filter(id => targets.adsets.has(id)),
    campaigns: entities.campaigns.filter(id => targets.campaigns.has(id)),
  }
  const studyTouchesTarget = matched.ads.length || matched.adsets.length || matched.campaigns.length
  if (!studyTouchesTarget)
    return null
  return {
    studyId: String(study.id || ''),
    name: study.name != null ? String(study.name) : null,
    type: study.type != null ? String(study.type) : null,
    phase,
    startTime: study.start_time ?? null,
    endTime: study.end_time ?? null,
    matched,
  }
}

export async function checkExperimentEligibility(
  ctx: ExperimentServiceContext,
  params: {
    adAccountId: string
    adIds?: string[]
    adsetIds?: string[]
    campaignIds?: string[]
  },
): Promise<{
  eligible: boolean
  conflicts: StudyConflict[]
  limits: Record<string, unknown>
}> {
  const targets = {
    ads: new Set((params.adIds || []).map(String)),
    adsets: new Set((params.adsetIds || []).map(String)),
    campaigns: new Set((params.campaignIds || []).map(String)),
  }
  const byId = new Map<string, StudyConflict>()

  const { studies } = await listExperiments(ctx, params.adAccountId, { limit: 100 })
  for (const study of studies) {
    const conflict = matchStudyAgainstTargets(study, targets)
    if (conflict?.studyId)
      byId.set(conflict.studyId, conflict)
  }

  for (const adsetId of targets.adsets) {
    const extra = await listEntityStudies(ctx, adsetId)
    for (const study of extra) {
      const conflict = matchStudyAgainstTargets(study, {
        ads: targets.ads,
        adsets: new Set([adsetId, ...targets.adsets]),
        campaigns: targets.campaigns,
      })
      if (conflict?.studyId && !byId.has(conflict.studyId)) {
        if (!conflict.matched.adsets.includes(adsetId))
          conflict.matched.adsets.push(adsetId)
        byId.set(conflict.studyId, conflict)
      }
      else if (study.id && studyPhase(study) !== 'ended' && !byId.has(String(study.id))) {
        byId.set(String(study.id), {
          studyId: String(study.id),
          name: study.name != null ? String(study.name) : null,
          type: study.type != null ? String(study.type) : null,
          phase: studyPhase(study) as 'running' | 'scheduled',
          startTime: study.start_time ?? null,
          endTime: study.end_time ?? null,
          matched: { ads: [], adsets: [adsetId], campaigns: [] },
        })
      }
    }
  }

  for (const campaignId of targets.campaigns) {
    const extra = await listEntityStudies(ctx, campaignId)
    for (const study of extra) {
      if (study.id && studyPhase(study) !== 'ended' && !byId.has(String(study.id))) {
        byId.set(String(study.id), {
          studyId: String(study.id),
          name: study.name != null ? String(study.name) : null,
          type: study.type != null ? String(study.type) : null,
          phase: studyPhase(study) as 'running' | 'scheduled',
          startTime: study.start_time ?? null,
          endTime: study.end_time ?? null,
          matched: { ads: [], adsets: [], campaigns: [campaignId] },
        })
      }
    }
  }

  const conflicts = [...byId.values()].filter(row => row.studyId)
  return {
    eligible: conflicts.length === 0,
    conflicts,
    limits: {
      creativeTestCells: { min: CREATIVE_TEST_MIN_CELLS, max: CREATIVE_TEST_MAX_CELLS },
      classicSplitTestMaxCells: CLASSIC_SPLIT_TEST_MAX_CELLS,
      minTreatmentPercentage: MIN_TREATMENT_PERCENTAGE,
      maxConcurrentStudies: MAX_CONCURRENT_STUDIES,
      maxAdEntitiesPerCell: 100,
      note: 'Creative Tests: 1 anúncio por célula. “Até 6 variações” no produto = no máximo 4 variações + base (5 células).',
    },
  }
}

export function assertEligibleOrThrow(eligibility: { eligible: boolean, conflicts: StudyConflict[] }) {
  if (eligibility.eligible)
    return
  const first = eligibility.conflicts[0]
  throw new MetaAdsToolError(
    'EXPERIMENT_AD_IN_ACTIVE_STUDY',
    `Anúncio/adset/campanha já participa de um teste ${first?.phase === 'scheduled' ? 'agendado' : 'ativo'} (study ${first?.studyId || '?'}). Encerre o estudo ou escolha outro anúncio.`,
    409,
    { conflicts: eligibility.conflicts },
  )
}

export async function assertStudyOnAdAccount(
  ctx: ExperimentServiceContext,
  adAccountId: string,
  studyId: string,
): Promise<void> {
  const { studies } = await listExperiments(ctx, adAccountId, { limit: 100 })
  if (studies.some(row => String(row.id) === studyId))
    return
  throw new MetaAdsToolError(
    'EXPERIMENT_TENANT_MISMATCH',
    'Study não pertence à ad account do tenant (impacting_ad_studies).',
    403,
    { studyId, adAccountId: actPath(adAccountId) },
  )
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

export async function copyAdForExperiment(
  ctx: ExperimentServiceContext,
  adId: string,
  copyBody: Record<string, unknown>,
): Promise<string> {
  try {
    const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, `/${adId}/copies`), {
      method: 'POST',
      query: { access_token: ctx.accessToken },
      body: copyBody,
    })
    const copied = res?.copied_ad_id ?? res?.id
    if (!copied) {
      throw new MetaAdsToolError(
        'EXPERIMENT_COPY_AD_FAILED',
        'Meta não retornou copied_ad_id ao duplicar o anúncio para o teste.',
        502,
        { response: res, request_payload: copyBody },
      )
    }
    return String(copied)
  }
  catch (err) {
    if (err instanceof MetaAdsToolError)
      throw err
    enrichMetaGraphWriteError(err, copyBody)
  }
}

export function buildWinnerSummary(study: Record<string, unknown>): {
  documentedWinnerField: false
  resultsFirstAvailableDate: string | null
  confidenceLevel: unknown
  note: string
} {
  const date = study.results_first_available_date != null
    ? String(study.results_first_available_date)
    : null
  return {
    documentedWinnerField: false,
    resultsFirstAvailableDate: date,
    confidenceLevel: study.confidence_level ?? null,
    note: date
      ? 'A Graph documenta results_first_available_date e confidence_level; não há winner_cell_id. Compare células (ads) e insights; o Ads Manager mostra o vencedor quando o teste conclui.'
      : 'Resultados ainda não disponíveis (results_first_available_date vazio). Não inventar vencedor.',
  }
}

export async function getExperiment(
  ctx: ExperimentServiceContext,
  studyId: string,
): Promise<{
  study: Record<string, unknown>
  cells: Record<string, unknown>[]
  ads: string[]
  adsets: string[]
  campaigns: string[]
  objectives: unknown
  winner: ReturnType<typeof buildWinnerSummary>
}> {
  const id = String(studyId || '').trim()
  if (!id) {
    throw new MetaAdsToolError('EXPERIMENT_ID_REQUIRED', 'studyId é obrigatório.', 400)
  }
  const studyRaw = await ctx.graph(metaGraphUrl(ctx.apiVersion, `/${id}`), {
    query: {
      fields: EXPERIMENT_STUDY_FIELDS,
      access_token: ctx.accessToken,
    },
  })
  const study = studyRaw && typeof studyRaw === 'object' ? studyRaw as Record<string, unknown> : {}

  const cellsRes = await ctx.graph(metaGraphUrl(ctx.apiVersion, `/${id}/cells`), {
    query: {
      fields: EXPERIMENT_CELL_FIELDS,
      access_token: ctx.accessToken,
    },
  })
  const cells = Array.isArray(cellsRes?.data)
    ? cellsRes.data as Record<string, unknown>[]
    : []

  let objectives: unknown = null
  try {
    const objRes = await ctx.graph(metaGraphUrl(ctx.apiVersion, `/${id}/objectives`), {
      query: { access_token: ctx.accessToken },
    })
    objectives = objRes?.data ?? objRes ?? null
  }
  catch {
    objectives = null
  }

  const entities = collectCellEntityIds(cells)
  return {
    study: { ...study, id: study.id || id },
    cells,
    ads: entities.ads,
    adsets: entities.adsets,
    campaigns: entities.campaigns,
    objectives,
    winner: buildWinnerSummary(study),
  }
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

export function assertCreativeTestVersionCount(basePlusVariations: number) {
  if (basePlusVariations < CREATIVE_TEST_MIN_CELLS || basePlusVariations > CREATIVE_TEST_MAX_CELLS) {
    throw new MetaAdsToolError(
      'EXPERIMENT_CELLS_INVALID',
      `Creative Tests da Meta permitem ${CREATIVE_TEST_MIN_CELLS}–${CREATIVE_TEST_MAX_CELLS} células (não 2–7). Com baseAdId, use 1–${CREATIVE_TEST_MAX_CELLS - 1} variações (total ${CREATIVE_TEST_MIN_CELLS}–${CREATIVE_TEST_MAX_CELLS} versões).`,
      400,
      {
        versions: basePlusVariations,
        min: CREATIVE_TEST_MIN_CELLS,
        max: CREATIVE_TEST_MAX_CELLS,
        maxVariations: CREATIVE_TEST_MAX_CELLS - 1,
      },
    )
  }
}
