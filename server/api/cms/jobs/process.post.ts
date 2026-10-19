import { Buffer } from 'node:buffer'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import process from 'node:process'

import { serverSupabaseServiceRole } from '#supabase/server'
import { getHeader, readBody } from 'h3'

import { processDueCmsPublicationJobs } from '~/server/utils/cms/publication-jobs'

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

/** pg_cron calls this with the vault secret. No user session. */
export default defineEventHandler(async (event) => {
  const expectedSecret = process.env.CMS_WORKER_SECRET
  if (!expectedSecret)
    throw createError({ statusCode: 503, statusMessage: 'Worker não configurado' })

  const providedSecret = getHeader(event, 'x-worker-secret') || ''
  if (!secureEquals(providedSecret, expectedSecret))
    throw createError({ statusCode: 401, statusMessage: 'Não autorizado' })

  const body = await readBody(event).catch(() => ({}))
  const client = await serverSupabaseServiceRole(event)
  const workerId = String(body?.workerId || `http:${randomUUID()}`)
  const results = await processDueCmsPublicationJobs(client, workerId, Number(body?.limit || 10))

  return {
    processed: results.length,
    succeeded: results.filter(result => result.success).length,
    failed: results.filter(result => result.success === false).length,
    results,
  }
})
