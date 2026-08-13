import process from 'node:process'

import { createError } from 'h3'

import { resolveMetaGraphVersion } from '~/lib/meta-ads/graph'
import { decryptSecret } from '~/server/utils/marketing'

export type MetaRemoteObjectType
  = | 'facebook_feed_post'
    | 'facebook_photo'
    | 'facebook_video'
    | 'facebook_story'
    | 'instagram_media'
    | 'instagram_reel'
    | 'instagram_carousel'
    | 'instagram_story'
    | 'unknown'

export type RemoteDeletionStatus
  = | 'pending'
    | 'processing'
    | 'deleted'
    | 'already_absent'
    | 'failed'
    | 'unsupported'
    | 'manual_action_required'
    | 'skipped'

export interface NormalizedRemoteDeleteResult {
  platform: string
  format: string | null
  externalObjectId: string | null
  objectType: MetaRemoteObjectType
  status: RemoteDeletionStatus
  deleted: boolean
  retryable: boolean
  manualActionRequired: boolean
  providerCode: string | null
  message: string | null
  permalink?: string | null
}

export interface MetaPublishIdentity {
  externalPostId: string
  externalPostUrl: string | null
  externalObjectType: MetaRemoteObjectType
  externalContainerId?: string | null
  externalMediaId?: string | null
  externalPermalink?: string | null
  remoteIdentifiers?: Record<string, unknown>
}

interface MetaDeleteContext {
  client: any
  tenantId: string
  account: any
  format?: string | null
  externalPostId?: string | null
  externalObjectType?: string | null
  externalContainerId?: string | null
  externalMediaId?: string | null
  externalPermalink?: string | null
  remoteIdentifiers?: Record<string, unknown> | null
}

async function resolveMetaPageToken(client: any, tenantId: string, platform: string) {
  const { data: integration } = await client
    .from('marketing_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'meta')
    .eq('is_active', true)
    .maybeSingle()

  const config = integration?.config || {}
  const pageToken = decryptSecret(config.page_access_token_enc)
  const userToken = decryptSecret(config.access_token_enc)
  const token = pageToken || (platform === 'facebook' ? userToken : null)
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: platform === 'instagram'
        ? 'Integração Meta sem token da Página. Selecione novamente a Página do Facebook vinculada ao Instagram.'
        : 'Integração Meta sem token válido',
    })
  }
  return {
    token,
    pageId: String(config.page_id || ''),
    graphVersion: resolveMetaGraphVersion(),
  }
}

function sanitizeMessage(message: string | null | undefined) {
  if (!message)
    return null
  return String(message)
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .replace(/EAA[a-zA-Z0-9]+/g, '[redacted_token]')
    .slice(0, 500)
}

/**
 * Classify Graph API delete failures using explicit error codes/subcodes.
 * Regex on free-form messages is only a secondary signal for known absence codes.
 */
export function classifyMetaDeleteError(error: any): Pick<
  NormalizedRemoteDeleteResult,
  'status' | 'deleted' | 'retryable' | 'manualActionRequired' | 'providerCode' | 'message'
> {
  const graphError = error?.data?.error || error?.response?._data?.error || {}
  const code = Number(graphError.code || error?.statusCode || 0)
  const subcode = Number(graphError.error_subcode || 0)
  const message = sanitizeMessage(
    graphError.message || error?.statusMessage || error?.message || 'Falha ao excluir na Meta',
  )

  // Token / auth
  if ([190, 102, 463, 467].includes(code)) {
    return {
      status: 'failed',
      deleted: false,
      retryable: false,
      manualActionRequired: true,
      providerCode: String(code),
      message: message || 'Token Meta expirado ou inválido',
    }
  }

  // Explicit "object gone" codes from Meta.
  // 803: Some of the aliases you requested do not exist
  // 33: Unsupported get request / object cannot be loaded (often already deleted)
  // 100 + subcode 33/459: object does not exist
  const absenceByCode
    = code === 803
      || code === 33
      || (code === 100 && [33, 459].includes(subcode))

  if (absenceByCode) {
    return {
      status: 'already_absent',
      deleted: true,
      retryable: false,
      manualActionRequired: false,
      providerCode: String(code),
      message,
    }
  }

  // Rate limits / transient
  if ([4, 17, 32, 613].includes(code) || error?.statusCode === 429 || error?.statusCode === 503) {
    return {
      status: 'failed',
      deleted: false,
      retryable: true,
      manualActionRequired: false,
      providerCode: String(code || error?.statusCode || 'transient'),
      message,
    }
  }

  return {
    status: 'failed',
    deleted: false,
    retryable: code === 1 || code === 2,
    manualActionRequired: false,
    providerCode: code ? String(code) : 'unknown',
    message,
  }
}

export function resolveMetaObjectType(input: {
  platform: string
  format?: string | null
  externalObjectType?: string | null
}): MetaRemoteObjectType {
  if (input.externalObjectType)
    return input.externalObjectType as MetaRemoteObjectType

  const format = String(input.format || 'static')
  if (input.platform === 'instagram') {
    if (format === 'story')
      return 'instagram_story'
    if (format === 'video')
      return 'instagram_reel'
    if (format === 'carousel')
      return 'instagram_carousel'
    return 'instagram_media'
  }

  if (input.platform === 'facebook') {
    if (format === 'story')
      return 'facebook_story'
    if (format === 'video')
      return 'facebook_video'
    return 'facebook_feed_post'
  }

  return 'unknown'
}

/**
 * Canonical ID used for DELETE. Prefer published media / page post ID.
 * Never fall back to a temporary creation/container ID when a published ID exists.
 */
export function resolveDeletableObjectId(input: {
  externalPostId?: string | null
  externalMediaId?: string | null
  externalContainerId?: string | null
  remoteIdentifiers?: Record<string, unknown> | null
}): string | null {
  const published
    = input.externalMediaId
      || input.externalPostId
      || (input.remoteIdentifiers?.publishedMediaId as string | undefined)
      || (input.remoteIdentifiers?.pagePostId as string | undefined)
      || null

  if (published)
    return String(published)

  // Only use container when it is explicitly the only stored ID (legacy/broken).
  if (input.externalContainerId && !input.externalPostId)
    return null

  return null
}

async function graphDelete(
  graphBase: string,
  objectId: string,
  token: string,
): Promise<{ ok: true, raw: any } | { ok: false, error: any }> {
  try {
    const raw = await $fetch<any>(`${graphBase}/${objectId}`, {
      method: 'DELETE',
      query: { access_token: token },
    })
    // Meta returns { success: true } for deletes. Anything else is not success.
    if (raw && raw.success === false) {
      return {
        ok: false,
        error: { data: { error: { code: 'success_false', message: 'Graph API returned success=false' } } },
      }
    }
    if (raw && typeof raw.success !== 'undefined' && raw.success !== true) {
      return {
        ok: false,
        error: { data: { error: { code: 'unexpected_payload', message: 'Resposta inesperada da Graph API' } } },
      }
    }
    return { ok: true, raw }
  }
  catch (error: any) {
    return { ok: false, error }
  }
}

function baseResult(
  platform: string,
  format: string | null,
  objectType: MetaRemoteObjectType,
  externalObjectId: string | null,
  permalink?: string | null,
): Omit<NormalizedRemoteDeleteResult, 'status' | 'deleted' | 'retryable' | 'manualActionRequired' | 'providerCode' | 'message'> {
  return {
    platform,
    format,
    externalObjectId,
    objectType,
    permalink: permalink || null,
  }
}

async function deleteFacebookObject(
  ctx: MetaDeleteContext,
  objectType: MetaRemoteObjectType,
  graphBase: string,
  token: string,
): Promise<NormalizedRemoteDeleteResult> {
  const format = ctx.format || null
  const objectId = resolveDeletableObjectId(ctx)
  const base = baseResult('facebook', format, objectType, objectId, ctx.externalPermalink)

  if (objectType === 'facebook_story') {
    return {
      ...base,
      status: 'manual_action_required',
      deleted: false,
      retryable: false,
      manualActionRequired: true,
      providerCode: 'unsupported_story_delete',
      message: 'Stories do Facebook geralmente não suportam exclusão via Graph API após a publicação. Remova manualmente e confirme.',
    }
  }

  if (!objectId) {
    return {
      ...base,
      status: 'failed',
      deleted: false,
      retryable: false,
      manualActionRequired: true,
      providerCode: 'missing_remote_id',
      message: 'ID remoto inválido ou apenas container temporário armazenado',
    }
  }

  // Feed posts, photos and videos all use DELETE /{object-id} with page token,
  // but only when object-id is the published Page post / photo / video ID.
  const result = await graphDelete(graphBase, objectId, token)
  if (result.ok) {
    return {
      ...base,
      status: 'deleted',
      deleted: true,
      retryable: false,
      manualActionRequired: false,
      providerCode: null,
      message: null,
    }
  }

  const classified = classifyMetaDeleteError(result.error)
  return { ...base, ...classified }
}

async function deleteInstagramObject(
  ctx: MetaDeleteContext,
  objectType: MetaRemoteObjectType,
  graphBase: string,
  token: string,
): Promise<NormalizedRemoteDeleteResult> {
  const format = ctx.format || null
  const objectId = resolveDeletableObjectId(ctx)
  const base = baseResult('instagram', format, objectType, objectId, ctx.externalPermalink)

  if (objectType === 'instagram_story') {
    return {
      ...base,
      status: 'manual_action_required',
      deleted: false,
      retryable: false,
      manualActionRequired: true,
      providerCode: 'unsupported_story_delete',
      message: 'Stories do Instagram não podem ser excluídos de forma confiável via API. Remova no app e confirme manualmente.',
    }
  }

  if (!objectId) {
    return {
      ...base,
      status: 'failed',
      deleted: false,
      retryable: false,
      manualActionRequired: true,
      providerCode: 'missing_remote_id',
      message: 'ID de mídia publicada ausente — não use creation/container ID para exclusão',
    }
  }

  // Instagram media, reels and carousels: DELETE /{ig-media-id}
  const result = await graphDelete(graphBase, objectId, token)
  if (result.ok) {
    return {
      ...base,
      status: 'deleted',
      deleted: true,
      retryable: false,
      manualActionRequired: false,
      providerCode: null,
      message: null,
    }
  }

  const classified = classifyMetaDeleteError(result.error)
  return { ...base, ...classified }
}

export async function deleteMetaRemoteObject(ctx: MetaDeleteContext): Promise<NormalizedRemoteDeleteResult> {
  const platform = String(ctx.account?.platform || 'unknown')
  const objectType = resolveMetaObjectType({
    platform,
    format: ctx.format,
    externalObjectType: ctx.externalObjectType,
  })

  if (platform !== 'facebook' && platform !== 'instagram') {
    return {
      platform,
      format: ctx.format || null,
      externalObjectId: ctx.externalPostId || null,
      objectType: 'unknown',
      status: 'unsupported',
      deleted: false,
      retryable: false,
      manualActionRequired: true,
      providerCode: 'unsupported_platform',
      message: `Plataforma ${platform} sem adapter de exclusão Meta`,
    }
  }

  const { token, graphVersion } = await resolveMetaPageToken(ctx.client, ctx.tenantId, platform)
  const graphBase = `https://graph.facebook.com/${graphVersion}`

  if (platform === 'facebook')
    return deleteFacebookObject(ctx, objectType, graphBase, token)
  return deleteInstagramObject(ctx, objectType, graphBase, token)
}

/** Helpers used by the publisher to persist rich identity without breaking old rows. */
export function buildMetaPublishIdentity(
  platform: string,
  format: string | null | undefined,
  published: { id?: string, post_id?: string, permalink?: string | null },
  extras?: { containerId?: string | null, mediaId?: string | null },
): MetaPublishIdentity {
  const objectType = resolveMetaObjectType({ platform, format })
  const publishedId = String(published.post_id || published.id || '')
  return {
    externalPostId: publishedId,
    externalPostUrl: published.permalink || null,
    externalObjectType: objectType,
    externalContainerId: extras?.containerId || null,
    externalMediaId: extras?.mediaId || publishedId || null,
    externalPermalink: published.permalink || null,
    remoteIdentifiers: {
      publishedMediaId: publishedId,
      pagePostId: published.post_id || null,
      containerId: extras?.containerId || null,
      graphObjectType: objectType,
    },
  }
}
