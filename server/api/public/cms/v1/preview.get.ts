import type { CmsItem } from '~/lib/cms/contracts'
import type { CmsPublicPreview } from '~/server/utils/cms/preview'

import { serverSupabaseServiceRole } from '#supabase/server'
import { z } from 'zod'

import { defineCmsPublicHandler, readCmsQuery } from '~/server/utils/cms/http'
import { resolveCmsPreview } from '~/server/utils/cms/preview'

const previewQuerySchema = z.object({
  token: z.string().min(1).max(512),
})

/** Unauthenticated. Cache and indexing are refused; the body is one revision snapshot. */
export default defineCmsPublicHandler(async (event): Promise<CmsItem<CmsPublicPreview>> => {
  const query = readCmsQuery(event, previewQuerySchema)
  const client = await serverSupabaseServiceRole(event)
  return { data: await resolveCmsPreview(client, query.token) }
}, { cache: 'no-store', robots: 'noindex' })
