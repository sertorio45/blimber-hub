import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { CMS_LIMITS } from '~/lib/cms/contracts'

/**
 * Opaque preview credential. The payload names a revision and an expiry;
 * it never carries a session, user id or draft. The public URL only has
 * this token.
 */
const cmsPreviewClaimsSchema = z.object({
  v: z.literal(1),
  tid: z.string().uuid(),
  sid: z.string().uuid(),
  did: z.string().uuid(),
  rid: z.string().uuid(),
  exp: z.number().int().positive(),
}).strict()

export type CmsPreviewClaims = z.infer<typeof cmsPreviewClaimsSchema>

export interface CmsPreviewTokenIssue {
  token: string
  expiresAt: string
}

export type CmsPreviewVerification
  = | { ok: true, claims: CmsPreviewClaims }
    | { ok: false, reason: 'invalid' | 'expired' }

const MAX_TOKEN_LENGTH = 512

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function signaturesMatch(actual: string, expected: string): boolean {
  const left = Buffer.from(actual)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function signCmsPreviewToken(
  input: Pick<CmsPreviewClaims, 'tid' | 'sid' | 'did' | 'rid'> & { exp?: number },
  secret: string,
  nowMs = Date.now(),
): CmsPreviewTokenIssue {
  const exp = input.exp ?? Math.floor(nowMs / 1000) + CMS_LIMITS.previewTokenTtlSeconds
  const claims: CmsPreviewClaims = {
    v: 1,
    tid: input.tid,
    sid: input.sid,
    did: input.did,
    rid: input.rid,
    exp,
  }
  const encoded = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  return {
    token: `${encoded}.${sign(encoded, secret)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  }
}

export function verifyCmsPreviewToken(token: string, secret: string, nowMs = Date.now()): CmsPreviewVerification {
  if (!secret || token.length > MAX_TOKEN_LENGTH)
    return { ok: false, reason: 'invalid' }

  const separator = token.indexOf('.')
  if (separator <= 0 || separator !== token.lastIndexOf('.'))
    return { ok: false, reason: 'invalid' }

  const encoded = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  if (!encoded || !signature || !signaturesMatch(signature, sign(encoded, secret)))
    return { ok: false, reason: 'invalid' }

  try {
    const parsed = cmsPreviewClaimsSchema.safeParse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')))
    if (!parsed.success)
      return { ok: false, reason: 'invalid' }
    if (parsed.data.exp * 1000 <= nowMs)
      return { ok: false, reason: 'expired' }
    return { ok: true, claims: parsed.data }
  }
  catch {
    return { ok: false, reason: 'invalid' }
  }
}
