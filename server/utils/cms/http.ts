import type { H3Event } from 'h3'
import type { ZodType, ZodTypeDef } from 'zod'

import { Buffer } from 'node:buffer'

import { defineEventHandler, getHeader, getQuery, readBody, setResponseHeader, setResponseHeaders } from 'h3'

import { cmsError, cmsValidationError, withCmsErrors } from '~/server/utils/cms/errors'

/** Default request body ceiling for admin JSON endpoints that carry no payload. */
export const CMS_DEFAULT_BODY_BYTES = 16 * 1024

export const CMS_PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'

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
 * get the shared CDN policy.
 */
export function defineCmsPublicHandler<T>(handler: (event: H3Event) => Promise<T>) {
  return defineEventHandler(async (event): Promise<T> => {
    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Accept-Encoding',
      'Cache-Control': 'no-store',
    })
    const result = await withCmsErrors(() => handler(event))
    setResponseHeader(event, 'Cache-Control', CMS_PUBLIC_CACHE_CONTROL)
    return result
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
