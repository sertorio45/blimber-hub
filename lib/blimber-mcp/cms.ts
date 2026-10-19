/**
 * CMS content tools for MCP.
 *
 * Read (`cms.read`) and publish (`cms.publish`) are separate. A member who can
 * edit pages or publications still cannot publish through these tools.
 */

import type { BlimberMcpToolContext } from './types'
import type { CmsDocumentKind } from '~/lib/cms/contracts'
import type { CmsContext, CmsDocumentContext } from '~/server/utils/cms/context'

import { z } from 'zod'
import { hasModuleEntitlement } from '~/constants/modules'
import { holdsCapability } from '~/constants/workspace'
import { cmsPublishablePayloadSchema, cmsSlugSchema } from '~/lib/cms/contracts'
import { loadTenantDocument, loadTenantSite } from '~/server/utils/cms/context'
import { assertPayloadLimits, listDocuments, publishDocument } from '~/server/utils/cms/documents'
import { mapDocument } from '~/server/utils/cms/mappers'
import { resolveMcpActorUserId } from './auth'
import { assertBlimberWriteConfirmation, resolveDryRun } from './confirm'
import { BlimberMcpError, mapSupabaseRpcError } from './errors'
import { assertMcpCapability, resolveMcpEditorialActor } from './marketing-editorial'

const uuid = z.string().uuid()

export const CMS_TOOL_NAMES = [
  'cms.list_documents',
  'cms.get_document',
  'cms.publish_document',
] as const

export type CmsToolName = typeof CMS_TOOL_NAMES[number]

/**
 * The only capability that authorizes each tool. Write caps such as
 * `cms.pages.update` are intentionally absent from the publish tool.
 */
export const CMS_TOOL_CAPABILITY = {
  'cms.list_documents': 'cms.read',
  'cms.get_document': 'cms.read',
  'cms.publish_document': 'cms.publish',
} as const

const CAPABILITY_DENIED: Record<CmsToolName, string> = {
  'cms.list_documents': 'Sem permissão cms.read para listar o conteúdo.',
  'cms.get_document': 'Sem permissão cms.read para ler o conteúdo.',
  'cms.publish_document': 'Publicar exige cms.publish. Editar páginas ou publicações não publica.',
}

export const CMS_TOOL_DESCRIPTIONS: Record<CmsToolName, string> = {
  'cms.list_documents': 'Lista páginas e publicações do tenant. Exige cms.read. Não altera nem publica.',
  'cms.get_document': 'Lê um documento, incluindo o rascunho. Exige cms.read. Não altera nem publica.',
  'cms.publish_document': 'Publica um documento já salvo. Exige cms.publish (editar não basta). dryRun padrão true; execute pede confirm.',
}

const actorField = uuid.optional().describe('UUID do usuário cujas permissões cms.* serão verificadas.')

export const cmsListDocumentsSchema = z.object({
  tenantId: uuid.describe('UUID do tenant.'),
  siteId: uuid.optional().describe('Filtra por site.'),
  kind: z.enum(['page', 'publication']).optional().describe('page ou publication. Vazio mistura os dois.'),
  search: z.string().trim().max(120).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  actorUserId: actorField,
})

export const cmsGetDocumentSchema = z.object({
  tenantId: uuid.describe('UUID do tenant.'),
  documentId: uuid.describe('UUID do documento.'),
  actorUserId: actorField,
})

export const cmsPublishDocumentSchema = z.object({
  tenantId: uuid.describe('UUID do tenant.'),
  documentId: uuid.describe('UUID do documento.'),
  expectedVersion: z.number().int().nonnegative().describe('editVersion atual. Recuse se divergir.'),
  actorUserId: actorField,
  dryRun: z.boolean().optional().describe('Padrão true: valida sem publicar.'),
  confirmTenantId: z.string().optional().describe('Obrigatório no execute. Igual a tenantId.'),
  confirm: z.boolean().optional().describe('Obrigatório true no execute.'),
})

export const CMS_TOOL_SCHEMAS = {
  'cms.list_documents': cmsListDocumentsSchema,
  'cms.get_document': cmsGetDocumentSchema,
  'cms.publish_document': cmsPublishDocumentSchema,
} as const

type ListInput = z.infer<typeof cmsListDocumentsSchema>
type GetInput = z.infer<typeof cmsGetDocumentSchema>
type PublishInput = z.infer<typeof cmsPublishDocumentSchema>

export interface CmsMcpActor {
  userId: string
  capabilities: string[]
}

function rethrowCmsAsMcp(error: unknown): never {
  if (error instanceof BlimberMcpError)
    throw error

  if (error && typeof error === 'object' && 'data' in error) {
    const body = (error as { data?: { error?: { code?: string, message?: string, details?: unknown } } }).data?.error
    const statusCode = (error as { statusCode?: number }).statusCode ?? 400
    if (body?.message) {
      throw new BlimberMcpError(
        (body.code || 'cms_error').toUpperCase(),
        body.message,
        statusCode,
        body.details,
      )
    }
  }

  throw mapSupabaseRpcError(error, 'Falha ao acessar o CMS')
}

async function assertCmsModule(ctx: BlimberMcpToolContext, tenantId: string): Promise<void> {
  const { data, error } = await ctx.client
    .from('tenant_modules')
    .select('module_name')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  if (error)
    throw new BlimberMcpError('DB_ERROR', error.message || 'Falha ao ler módulos do tenant', 400)

  const names = (data ?? []).map((row: { module_name?: string }) => String(row.module_name ?? ''))
  if (!hasModuleEntitlement(names, 'cms')) {
    throw new BlimberMcpError('MODULE_DISABLED', 'CMS não contratado para esta empresa.', 403)
  }
}

/** Resolves the actor and requires the single capability of this tool. */
export async function authorizeCmsMcpTool(
  ctx: BlimberMcpToolContext,
  tenantId: string,
  tool: CmsToolName,
  actorUserId?: string,
): Promise<CmsMcpActor> {
  if (!resolveMcpActorUserId(actorUserId || ctx.actorUserId)) {
    throw new BlimberMcpError(
      'ACTOR_REQUIRED',
      'Informe actorUserId ou BLIMBER_MCP_ACTOR_USER_ID para verificar cms.read ou cms.publish.',
      403,
    )
  }

  let actor: Awaited<ReturnType<typeof resolveMcpEditorialActor>>
  try {
    actor = await resolveMcpEditorialActor(ctx, tenantId, actorUserId)
  }
  catch (error) {
    if (error instanceof BlimberMcpError && error.code === 'ACTOR_REQUIRED') {
      throw new BlimberMcpError(
        'ACTOR_REQUIRED',
        'Informe actorUserId ou BLIMBER_MCP_ACTOR_USER_ID para verificar cms.read ou cms.publish.',
        403,
      )
    }
    throw error
  }

  if (!actor.isPlatformStaff)
    await assertCmsModule(ctx, tenantId)

  assertMcpCapability(actor, [CMS_TOOL_CAPABILITY[tool]], CAPABILITY_DENIED[tool])
  return { userId: actor.userId, capabilities: actor.capabilities }
}

function asCmsContext(ctx: BlimberMcpToolContext, tenantId: string, actor: CmsMcpActor): CmsContext {
  return {
    client: ctx.client,
    tenantId,
    userId: actor.userId,
    ws: {
      has: (capability: string) => holdsCapability(actor.capabilities, capability),
    } as CmsContext['ws'],
  }
}

export async function cmsListDocuments(ctx: BlimberMcpToolContext, input: ListInput) {
  const actor = await authorizeCmsMcpTool(ctx, input.tenantId, 'cms.list_documents', input.actorUserId)
  const cmsCtx = asCmsContext(ctx, input.tenantId, actor)
  const limit = input.limit ?? 25
  const kinds: CmsDocumentKind[] = input.kind ? [input.kind] : ['page', 'publication']

  try {
    if (kinds.length === 1) {
      return await listDocuments(cmsCtx, {
        kind: kinds[0]!,
        siteId: input.siteId,
        search: input.search,
        cursor: input.cursor,
        limit,
      })
    }

    const pages = await Promise.all(kinds.map(kind => listDocuments(cmsCtx, {
      kind,
      siteId: input.siteId,
      search: input.search,
      limit,
    })))
    const merged = pages
      .flatMap(page => page.data)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
    return { data: merged.slice(0, limit), nextCursor: null }
  }
  catch (error) {
    rethrowCmsAsMcp(error)
  }
}

export async function cmsGetDocument(ctx: BlimberMcpToolContext, input: GetInput) {
  const actor = await authorizeCmsMcpTool(ctx, input.tenantId, 'cms.get_document', input.actorUserId)
  const cmsCtx = asCmsContext(ctx, input.tenantId, actor)
  try {
    const document = await loadTenantDocument(cmsCtx, input.documentId)
    return mapDocument(document)
  }
  catch (error) {
    rethrowCmsAsMcp(error)
  }
}

function assertPublishable(document: { is_home: boolean, draft_payload: unknown }): void {
  assertPayloadLimits(document.draft_payload)
  const schema = document.is_home
    ? cmsPublishablePayloadSchema.extend({ slug: cmsSlugSchema.optional() })
    : cmsPublishablePayloadSchema
  const parsed = schema.safeParse(document.draft_payload ?? {})
  if (!parsed.success) {
    throw new BlimberMcpError(
      'VALIDATION_FAILED',
      'Revise os campos obrigatórios antes de publicar.',
      422,
      parsed.error.flatten(),
    )
  }
}

export async function cmsPublishDocument(ctx: BlimberMcpToolContext, input: PublishInput) {
  const actor = await authorizeCmsMcpTool(ctx, input.tenantId, 'cms.publish_document', input.actorUserId)
  const cmsCtx = asCmsContext(ctx, input.tenantId, actor)

  let document: CmsDocumentContext['document']
  try {
    document = await loadTenantDocument(cmsCtx, input.documentId)
  }
  catch (error) {
    rethrowCmsAsMcp(error)
  }

  if (document.edit_version !== input.expectedVersion) {
    throw new BlimberMcpError(
      'VERSION_CONFLICT',
      'Este conteúdo foi alterado. Use o editVersion atual.',
      409,
      { currentVersion: document.edit_version },
    )
  }

  try {
    assertPublishable(document)
  }
  catch (error) {
    rethrowCmsAsMcp(error)
  }

  const dryRun = resolveDryRun(input.dryRun, true)
  if (dryRun) {
    return {
      dryRun: true as const,
      documentId: document.id,
      editVersion: document.edit_version,
      title: document.title,
      publicStatus: document.public_status,
      note: 'Nada foi publicado. Para publicar: dryRun false, confirm true e confirmTenantId igual a tenantId.',
    }
  }

  assertBlimberWriteConfirmation({
    tenantId: input.tenantId,
    confirmTenantId: input.confirmTenantId ?? '',
    confirm: input.confirm,
  })

  try {
    const site = await loadTenantSite(cmsCtx, document.site_id)
    const published = await publishDocument(
      { ...cmsCtx, site, document },
      { expectedVersion: input.expectedVersion },
    )
    return { dryRun: false as const, ...published }
  }
  catch (error) {
    rethrowCmsAsMcp(error)
  }
}

export async function invokeCmsTool(
  name: CmsToolName,
  ctx: BlimberMcpToolContext,
  args: unknown,
): Promise<unknown> {
  const schema = CMS_TOOL_SCHEMAS[name]
  const input = schema.parse(args ?? {})
  if (name === 'cms.list_documents')
    return cmsListDocuments(ctx, input as ListInput)
  if (name === 'cms.get_document')
    return cmsGetDocument(ctx, input as GetInput)
  return cmsPublishDocument(ctx, input as PublishInput)
}
