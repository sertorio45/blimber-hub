import type { MetaGraphFetch } from './types'

import { MetaAdsToolError } from './types'
import { actPath, metaGraphUrl, resolveMetaGraphVersion } from './graph'

/**
 * Supported ad_format values for Generate Previews API.
 * Subset of commonly used placements; Meta accepts many more.
 */
export const META_AD_PREVIEW_FORMATS = [
  'DESKTOP_FEED_STANDARD',
  'MOBILE_FEED_STANDARD',
  'INSTAGRAM_STANDARD',
  'INSTAGRAM_STORY',
  'INSTAGRAM_REELS',
  'FACEBOOK_STORY_MOBILE',
  'FACEBOOK_REELS_MOBILE',
  'MESSENGER_MOBILE_INBOX_MEDIA',
  'RIGHT_COLUMN_STANDARD',
  'INSTAGRAM_EXPLORE_CONTEXTUAL',
  'INSTAGRAM_EXPLORE_GRID_HOME',
  'AUDIENCE_NETWORK_INSTREAM_VIDEO',
  'INSTREAM_VIDEO_DESKTOP',
  'INSTREAM_VIDEO_MOBILE',
  'FACEBOOK_REELS_BANNER',
] as const

export type MetaAdPreviewFormat = (typeof META_AD_PREVIEW_FORMATS)[number]

export interface MetaAdPreviewResult {
  ad_format: string
  body: string | null
  error: string | null
}

export interface GeneratePreviewInput {
  adAccountId: string
  creative: Record<string, unknown>
  ad_format: string
  apiVersion?: string
}

export interface ExistingAdPreviewInput {
  adId: string
  ad_format: string
  apiVersion?: string
}

export interface ExistingCreativePreviewInput {
  creativeId: string
  ad_format: string
  apiVersion?: string
}

/** GET /act_{id}/generatepreviews — draft creative spec preview */
export async function generateAdPreview(
  graph: MetaGraphFetch,
  accessToken: string,
  input: GeneratePreviewInput,
): Promise<MetaAdPreviewResult> {
  const act = actPath(input.adAccountId)
  const version = resolveMetaGraphVersion(input.apiVersion)
  const url = metaGraphUrl(version, `/${act}/generatepreviews`)

  try {
    const data = await graph(url, {
      query: {
        ad_format: input.ad_format,
        creative: JSON.stringify(input.creative),
        access_token: accessToken,
      },
    })
    const body = data?.data?.[0]?.body ?? null
    return { ad_format: input.ad_format, body, error: null }
  }
  catch (err) {
    return {
      ad_format: input.ad_format,
      body: null,
      error: err instanceof MetaAdsToolError ? err.message : String(err),
    }
  }
}

/** GET /{adId}/previews — preview for existing ad */
export async function getExistingAdPreview(
  graph: MetaGraphFetch,
  accessToken: string,
  input: ExistingAdPreviewInput,
): Promise<MetaAdPreviewResult> {
  const version = resolveMetaGraphVersion(input.apiVersion)
  const url = metaGraphUrl(version, `/${input.adId}/previews`)

  try {
    const data = await graph(url, {
      query: {
        ad_format: input.ad_format,
        access_token: accessToken,
      },
    })
    const body = data?.data?.[0]?.body ?? null
    return { ad_format: input.ad_format, body, error: null }
  }
  catch (err) {
    return {
      ad_format: input.ad_format,
      body: null,
      error: err instanceof MetaAdsToolError ? err.message : String(err),
    }
  }
}

/** GET /{creativeId}/previews — preview for existing creative */
export async function getExistingCreativePreview(
  graph: MetaGraphFetch,
  accessToken: string,
  input: ExistingCreativePreviewInput,
): Promise<MetaAdPreviewResult> {
  const version = resolveMetaGraphVersion(input.apiVersion)
  const url = metaGraphUrl(version, `/${input.creativeId}/previews`)

  try {
    const data = await graph(url, {
      query: {
        ad_format: input.ad_format,
        access_token: accessToken,
      },
    })
    const body = data?.data?.[0]?.body ?? null
    return { ad_format: input.ad_format, body, error: null }
  }
  catch (err) {
    return {
      ad_format: input.ad_format,
      body: null,
      error: err instanceof MetaAdsToolError ? err.message : String(err),
    }
  }
}

/** Batch preview for multiple placements (sequential to respect rate limits) */
export async function generateAdPreviewsBatch(
  graph: MetaGraphFetch,
  accessToken: string,
  params: {
    adAccountId?: string
    adId?: string
    creativeId?: string
    creative?: Record<string, unknown>
    ad_formats: string[]
    apiVersion?: string
  },
): Promise<MetaAdPreviewResult[]> {
  const results: MetaAdPreviewResult[] = []

  for (const ad_format of params.ad_formats) {
    let result: MetaAdPreviewResult

    if (params.adId) {
      result = await getExistingAdPreview(graph, accessToken, {
        adId: params.adId,
        ad_format,
        apiVersion: params.apiVersion,
      })
    }
    else if (params.creativeId) {
      result = await getExistingCreativePreview(graph, accessToken, {
        creativeId: params.creativeId,
        ad_format,
        apiVersion: params.apiVersion,
      })
    }
    else if (params.creative && params.adAccountId) {
      result = await generateAdPreview(graph, accessToken, {
        adAccountId: params.adAccountId,
        creative: params.creative,
        ad_format,
        apiVersion: params.apiVersion,
      })
    }
    else {
      result = {
        ad_format,
        body: null,
        error: 'Informe adId, creativeId, ou (adAccountId + creative).',
      }
    }

    results.push(result)
  }

  return results
}

/**
 * Validate creative spec via Generate Previews API.
 * Submits creative to multiple placements; returns errors/warnings without HTML.
 */
export async function validateCreativeViaPreview(
  graph: MetaGraphFetch,
  accessToken: string,
  params: {
    adAccountId?: string
    adId?: string
    creativeId?: string
    creative?: Record<string, unknown>
    ad_formats: string[]
    apiVersion?: string
  },
): Promise<{
  valid: boolean
  placements_ok: string[]
  placements_failed: Array<{ ad_format: string; error: string }>
  summary: string
}> {
  const previews = await generateAdPreviewsBatch(graph, accessToken, params)

  const ok: string[] = []
  const failed: Array<{ ad_format: string; error: string }> = []

  for (const p of previews) {
    if (p.body && !p.error) {
      ok.push(p.ad_format)
    }
    else {
      failed.push({ ad_format: p.ad_format, error: p.error || 'Preview vazio' })
    }
  }

  const valid = failed.length === 0
  const summary = valid
    ? `Criativo válido em ${ok.length} posicionamento(s).`
    : `Criativo com erro em ${failed.length}/${previews.length} posicionamento(s): ${failed.map(f => `${f.ad_format} (${f.error})`).join('; ')}`

  return { valid, placements_ok: ok, placements_failed: failed, summary }
}
