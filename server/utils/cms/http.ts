import type { H3Event } from 'h3'
import type { ZodType, ZodTypeDef } from 'zod'

import { Buffer } from 'node:buffer'

import { defineEventHandler, getHeader, getQuery, readBody, setResponseHeader, setResponseHeaders } from 'h3'

import { cmsError, cmsValidationError, withCmsErrors } from '~/server/utils/cms/errors'

/** Default request body ceiling for admin JSON endpoints that carry no payload. */
export const CMS_DEFAULT_BODY_BYTES = 16 * 1024

export const CMS_PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
export const CMS_ROBOTS_INDEX = 'index, follow'
export const CMS_ROBOTS_NOINDEX = 'noindex, nofollow'

export interface CmsPublicHandlerOptions {
  /** Preview responses must never be stored by a shared cache. */
  cache?: 'public' | 'no-store'
  /** `auto` follows `seo.noindex` and redirect payloads; sitemap and preview stay `noindex`. */
  robots?: 'auto' | 'noindex'
}

function statusCodeOf(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('statusCode' in error))
    return null
  const status = (error as { statusCode?: unknown }).statusCode
  return typeof status === 'number' ? status : null
}

/** Indexability of a successful public payload. Redirects and previews are never indexed. */
export function robotsTagForPublicResult(result: unknown): string {
  if (!result || typeof result !== 'object')
    return CMS_ROBOTS_NOINDEX
  const data = (result as { data?: unknown }).data
  if (!data || typeof data !== 'object')
    return CMS_ROBOTS_NOINDEX
  if ('redirect' in data || ('preview' in data && (data as { preview?: boolean }).preview))
    return CMS_ROBOTS_NOINDEX
  const seo = (data as { seo?: { noindex?: boolean } }).seo
  return seo?.noindex === true ? CMS_ROBOTS_NOINDEX : CMS_ROBOTS_INDEX
}

/** Admin handler: CMS error envelope and `Cache-Control: no-store` on every response. */
export function defineCmsHandler<T>(handler: (event: H3Event) => Promise<T>) {
  return defineEventHandler(async (event): Promise<T> => {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return withCmsErrors(() => handler(event))
  })
}

/**
 * Public delivery handler. Content is public, so any origin may GET it, but
 * credentials are never allowed. Errors are not cached; successful responses
 * get the shared CDN policy unless the handler opts out (preview).
 */
export function defineCmsPublicHandler<T>(
  handler: (event: H3Event) => Promise<T>,
  options: CmsPublicHandlerOptions = {},
) {
  return defineEventHandler(async (event): Promise<T> => {
    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Accept-Encoding',
      'Cache-Control': 'no-store',
    })
    if (options.robots === 'noindex')
      setResponseHeader(event, 'X-Robots-Tag', CMS_ROBOTS_NOINDEX)

    try {
      const result = await withCmsErrors(() => handler(event))
      if (options.cache !== 'no-store')
        setResponseHeader(event, 'Cache-Control', CMS_PUBLIC_CACHE_CONTROL)
      if (options.robots !== 'noindex')
        setResponseHeader(event, 'X-Robots-Tag', robotsTagForPublicResult(result))
      return result
    }
    catch (error: unknown) {
      const status = statusCodeOf(error)
      if (status === 404 || status === 410)
        setResponseHeader(event, 'X-Robots-Tag', CMS_ROBOTS_NOINDEX)
      throw error
    }
  })
}

/**
 * Reads a JSON body with a byte ceiling. `Content-Length` is checked before
 * parsing; the parsed value is measured again because the header is optional.
 */
export async function readCmsJsonBody(event: H3Event, maxBytes = CMS_DEFAULT_BODY_BYTES): Promise<unknown> {
  const declared = Number(getHeader(event, 'content-length') ?? 0)
  if (Number.isFinite(declared) && declared > maxBytes)
    throw cmsError(413, 'payload_too_large', 'Conteúdo grande demais para ser salvo')

  const body: unknown = await readBody(event)
  if (body !== undefined && body !== null && Buffer.byteLength(JSON.stringify(body), 'utf8') > maxBytes)
    throw cmsError(413, 'payload_too_large', 'Conteúdo grande demais para ser salvo')

  return body ?? {}
}

export function parseCmsInput<Output, Input = Output>(
  schema: ZodType<Output, ZodTypeDef, Input>,
  value: unknown,
  message = 'Dados inválidos',
): Output {
  const parsed = schema.safeParse(value ?? {})
  if (!parsed.success)
    throw cmsValidationError(parsed.error, message)
  return parsed.data
}

export async function readCmsBody<Output, Input = Output>(
  event: H3Event,
  schema: ZodType<Output, ZodTypeDef, Input>,
  maxBytes = CMS_DEFAULT_BODY_BYTES,
): Promise<Output> {
  return parseCmsInput(schema, await readCmsJsonBody(event, maxBytes))
}

export function readCmsQuery<Output, Input = Output>(
  event: H3Event,
  schema: ZodType<Output, ZodTypeDef, Input>,
): Output {
  return parseCmsInput(schema, getQuery(event), 'Parâmetros inválidos')
}
