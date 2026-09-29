import { serverSupabaseServiceRole } from '#supabase/server'
import { createError, defineEventHandler, getQuery } from 'h3'
import { ZodError } from 'zod'
import { listClients } from '~/lib/blimber-mcp/platform/clients'
import { assertBlimberMcpApiKey } from '~/server/utils/blimber-gpt-auth'

/** Administrative inventory for n8n and MCP clients; never returns integration secrets. */
export default defineEventHandler(async (event) => {
  assertBlimberMcpApiKey(event)
  const query = getQuery(event)
  const client = await serverSupabaseServiceRole(event)
  try {
    const data = await listClients(client, {
      ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}),
      cursor: query.cursor,
      includeInactive: query.includeInactive === 'true',
      module: query.module,
      integrationProvider: query.integrationProvider,
      integrationStatus: query.integrationStatus,
    })
    return { ok: true, data }
  }
  catch (error) {
    if (error instanceof ZodError)
      throw createError({ statusCode: 400, statusMessage: 'Filtros de clientes inválidos' })
    throw error
  }
})
