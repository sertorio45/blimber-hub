import type { CmsCreateSiteInput, CmsSite, CmsUpdateSiteInput } from '~/lib/cms/contracts'
import type { CmsContext, CmsSiteContext } from '~/server/utils/cms/context'
import type { CmsDbError } from '~/server/utils/cms/errors'
import type { CmsSiteRow } from '~/server/utils/cms/mappers'
import type { WorkspaceTenant } from '~/server/utils/workspace-context'

import { randomBytes } from 'node:crypto'

import { CMS_DEFAULT_LOCALE, CMS_DEFAULT_TIMEZONE, CMS_TABLES } from '~/lib/cms/contracts'
import { recordCmsAudit } from '~/server/utils/cms/audit'
import { assertNoDbError, cmsDbError, cmsError } from '~/server/utils/cms/errors'
import { mapSite, SITE_COLUMNS } from '~/server/utils/cms/mappers'
import { slugify } from '~/utils/slugify'

const SITE_KEY_BASE_LENGTH = 48
const GENERATED_KEY_ATTEMPTS = 5

function isSiteKeyConflict(error: CmsDbError): boolean {
  return error.code === '23505' && /site_key/i.test(`${error.message ?? ''} ${error.details ?? ''}`)
}

function siteKeyTaken(): Error {
  return cmsError(409, 'validation_failed', 'Esta chave de site já está em uso', { field: 'siteKey', reason: 'taken' })
}

/** Public site key derived from the tenant slug (or name), always matching `cmsSiteKeySchema`. */
export function siteKeyBase(tenant: Pick<WorkspaceTenant, 'slug' | 'name'> | null | undefined): string {
  const base = slugify(tenant?.slug || tenant?.name || '', SITE_KEY_BASE_LENGTH).replace(/-+$/, '')
  if (!base)
    return 'site'
  return base.length < 3 ? `${base}-site` : base
}

function candidateKey(base: string, attempt: number): string {
  if (attempt === 0)
    return base
  if (attempt < GENERATED_KEY_ATTEMPTS - 1)
    return `${base}-${attempt + 1}`
  return `${base}-${randomBytes(3).toString('hex')}`
}

export async function listSites(ctx: CmsContext): Promise<CmsSite[]> {
  const { data, error } = await ctx.client
    .from(CMS_TABLES.sites)
    .select(SITE_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: true })
  assertNoDbError(error)
  return ((data ?? []) as CmsSiteRow[]).map(mapSite)
}

/**
 * `site_key` is globally unique. A key typed by the user conflicts with 409;
 * a generated one retries with a numeric, then random, suffix.
 */
export async function createSite(ctx: CmsContext, input: CmsCreateSiteInput): Promise<CmsSite> {
  const base = input.siteKey ?? siteKeyBase(ctx.ws.tenant)
  const attempts = input.siteKey ? 1 : GENERATED_KEY_ATTEMPTS

  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data, error } = await ctx.client
      .from(CMS_TABLES.sites)
      .insert({
        tenant_id: ctx.tenantId,
        site_key: input.siteKey ?? candidateKey(base, attempt),
        name: input.name,
        default_locale: input.defaultLocale ?? CMS_DEFAULT_LOCALE,
        timezone: input.timezone ?? CMS_DEFAULT_TIMEZONE,
        settings: {},
      })
      .select(SITE_COLUMNS)
      .single()

    if (!error) {
      const row = data as CmsSiteRow
      await recordCmsAudit(ctx, { action: 'site.create', siteId: row.id, metadata: { siteKey: row.site_key } })
      return mapSite(row)
    }
    if (!isSiteKeyConflict(error as CmsDbError))
      throw cmsDbError(error as CmsDbError, 'Erro ao criar o site')
  }

  throw siteKeyTaken()
}

/** Partial update; `settings` is shallow-merged so unrelated keys survive a PATCH. */
export async function updateSite(ctx: CmsSiteContext, input: CmsUpdateSiteInput): Promise<CmsSite> {
  const patch: Partial<Omit<CmsSiteRow, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>> = {}
  if (input.name !== undefined)
    patch.name = input.name
  if (input.siteKey !== undefined)
    patch.site_key = input.siteKey
  if (input.defaultLocale !== undefined)
    patch.default_locale = input.defaultLocale
  if (input.timezone !== undefined)
    patch.timezone = input.timezone
  if (input.settings !== undefined)
    patch.settings = { ...(ctx.site.settings ?? {}), ...input.settings }

  const fields = Object.keys(patch)
  if (!fields.length)
    return mapSite(ctx.site)

  const { data, error } = await ctx.client
    .from(CMS_TABLES.sites)
    .update(patch)
    .eq('id', ctx.site.id)
    .eq('tenant_id', ctx.tenantId)
    .select(SITE_COLUMNS)
    .single()
  if (error) {
    if (isSiteKeyConflict(error as CmsDbError))
      throw siteKeyTaken()
    throw cmsDbError(error as CmsDbError, 'Erro ao salvar o site')
  }

  const row = data as CmsSiteRow
  await recordCmsAudit(ctx, { action: 'site.update', siteId: row.id, metadata: { fields } })
  return mapSite(row)
}
