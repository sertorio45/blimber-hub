import type { CmsContext } from '~/server/utils/cms/context'
import type { CmsDbError } from '~/server/utils/cms/errors'

import { CMS_LIMITS, cmsSlugSchema } from '~/lib/cms/contracts'
import { assertNoDbError, cmsDbError, cmsError } from '~/server/utils/cms/errors'
import { slugify } from '~/utils/slugify'

export interface CmsSlugScope {
  column: string
  value: string
}

export function cmsSlugTaken(message = 'Este endereço já está em uso'): Error {
  return cmsError(409, 'validation_failed', message, { field: 'slug', reason: 'taken' })
}

export function throwIfSlugConflict(error: CmsDbError | null | undefined, fallbackMessage: string): void {
  if (!error)
    return
  if (error.code === '23505')
    throw cmsSlugTaken()
  throw cmsDbError(error, fallbackMessage)
}

/**
 * Picks a slug unique inside `scope` (and the context tenant). An explicit slug
 * conflicts instead of being rewritten, so the address the user typed stays honest.
 */
export async function allocateCmsSlug(
  ctx: Pick<CmsContext, 'client' | 'tenantId'>,
  input: {
    table: string
    base: string
    explicit?: string | null
    scope: CmsSlugScope[]
    fallback: string
    exceptId?: string
  },
): Promise<string> {
  if (input.explicit) {
    const parsed = cmsSlugSchema.safeParse(input.explicit)
    if (!parsed.success)
      throw cmsError(422, 'validation_failed', 'Endereço inválido', { field: 'slug', reason: 'invalid_format' })
    if (await isSlugTaken(ctx, input.table, parsed.data, input.scope, input.exceptId))
      throw cmsSlugTaken()
    return parsed.data
  }

  const roomForSuffix = CMS_LIMITS.maxSlugLength - 6
  const base = slugify(input.base, roomForSuffix).replace(/-+$/, '') || input.fallback
  let query = ctx.client
    .from(input.table)
    .select('slug')
    .eq('tenant_id', ctx.tenantId)
    .like('slug', `${base}%`)
    .limit(500)
  for (const filter of input.scope)
    query = query.eq(filter.column, filter.value)
  if (input.exceptId)
    query = query.neq('id', input.exceptId)

  const { data, error } = await query
  assertNoDbError(error, 'Erro ao reservar o endereço')

  const taken = new Set(((data ?? []) as Array<{ slug: string | null }>).map(row => row.slug))
  if (!taken.has(base))
    return base
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${base}-${suffix}`.slice(0, CMS_LIMITS.maxSlugLength).replace(/-+$/, '')
    if (candidate && !taken.has(candidate))
      return candidate
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, CMS_LIMITS.maxSlugLength).replace(/-+$/, '') || base
}

async function isSlugTaken(
  ctx: Pick<CmsContext, 'client' | 'tenantId'>,
  table: string,
  slug: string,
  scope: CmsSlugScope[],
  exceptId?: string,
): Promise<boolean> {
  let query = ctx.client
    .from(table)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('slug', slug)
    .limit(1)
  for (const filter of scope)
    query = query.eq(filter.column, filter.value)
  if (exceptId)
    query = query.neq('id', exceptId)

  const { data, error } = await query
  assertNoDbError(error, 'Erro ao reservar o endereço')
  return ((data ?? []) as unknown[]).length > 0
}
