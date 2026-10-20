import type {
  CmsCollectionDefinition,
  CmsCollectionField,
  CmsCollectionSchema,
  CmsCreateCollectionInput,
  CmsEntry,
  CmsEntryListQuery,
  CmsEntryStatus,
  CmsPage,
  CmsSaveEntryInput,
  CmsUpdateCollectionInput,
} from '~/lib/cms/contracts'
import type { CmsContext } from '~/server/utils/cms/context'
import type { CmsDbError } from '~/server/utils/cms/errors'

import { Buffer } from 'node:buffer'

import { z } from 'zod'

import { CMS_COLLECTION_GALLERY_LIMIT, CMS_TABLES, cmsCollectionSchemaSchema, cmsMediaRefSchema } from '~/lib/cms/contracts'
import { recordCmsAudit } from '~/server/utils/cms/audit'
import { loadTenantSite } from '~/server/utils/cms/context'
import { assertNoDbError, cmsDbError, cmsError, cmsNotFound } from '~/server/utils/cms/errors'
import { cursorFilter, decodeCmsCursor, paginate } from '~/server/utils/cms/pagination'

const uuidSchema = z.string().uuid()

const DEFINITION_COLUMNS = 'id, tenant_id, site_id, key, name, schema, created_at, updated_at'
const ENTRY_COLUMNS = 'id, tenant_id, site_id, definition_id, payload, status, created_at, updated_at'

/** Entry bodies stay small: structured fields, not a document draft. */
const MAX_ENTRY_BYTES = 64 * 1024
const MAX_SCHEMA_BYTES = 32 * 1024

interface DefinitionRow {
  id: string
  tenant_id: string
  site_id: string
  key: string
  name: string
  schema: unknown
  created_at: string
  updated_at: string
}

interface EntryRow {
  id: string
  tenant_id: string
  site_id: string
  definition_id: string
  payload: unknown
  status: CmsEntryStatus
  created_at: string
  updated_at: string
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? {}), 'utf8')
}

function parseStoredSchema(value: unknown, definitionId: string): CmsCollectionSchema {
  const parsed = cmsCollectionSchemaSchema.safeParse(value)
  if (!parsed.success) {
    console.error('[cms] invalid collection schema', definitionId, parsed.error)
    throw cmsError(500, 'internal_error', 'O esquema desta coleção está inválido')
  }
  return parsed.data
}

function mapDefinition(row: DefinitionRow): CmsCollectionDefinition {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    key: row.key,
    name: row.name,
    schema: parseStoredSchema(row.schema, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapEntry(row: EntryRow): CmsEntry {
  const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    ? row.payload as Record<string, unknown>
    : {}
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    definitionId: row.definition_id,
    payload,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function assertSchemaSize(schema: CmsCollectionSchema): void {
  if (byteLength(schema) > MAX_SCHEMA_BYTES)
    throw cmsError(413, 'payload_too_large', 'O esquema da coleção é grande demais')
}

function isKeyConflict(error: CmsDbError): boolean {
  return error.code === '23505' && /key/i.test(`${error.message ?? ''} ${error.details ?? ''}`)
}

function throwDefinitionWriteError(error: CmsDbError, fallback: string): never {
  if (isKeyConflict(error)) {
    throw cmsError(409, 'validation_failed', 'Já existe uma coleção com esta chave neste site', {
      field: 'key',
      reason: 'taken',
    })
  }
  throw cmsDbError(error, fallback)
}

function fieldError(field: CmsCollectionField, message: string): never {
  throw cmsError(422, 'validation_failed', message, { field: field.key, label: field.label })
}

function emptyField(field: CmsCollectionField): unknown {
  if (field.type === 'boolean')
    return false
  if (field.type === 'gallery')
    return []
  return null
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * Keeps only the fields declared in the schema and checks each type.
 * Media is stored as `{ assetId }`, never as a signed URL.
 */
export function coerceEntryPayload(
  schema: CmsCollectionSchema,
  payload: unknown,
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw cmsError(422, 'validation_failed', 'O registro precisa ser um objeto', { field: 'payload' })

  const source = payload as Record<string, unknown>
  const output: Record<string, unknown> = {}

  for (const field of schema.fields) {
    const value = source[field.key]
    if (isEmpty(value)) {
      if (field.required && field.type !== 'boolean')
        fieldError(field, `Preencha ${field.label}.`)
      output[field.key] = emptyField(field)
      continue
    }

    if (field.type === 'text') {
      if (typeof value !== 'string')
        fieldError(field, `${field.label} precisa ser um texto.`)
      output[field.key] = value
      continue
    }

    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value))
        fieldError(field, `${field.label} precisa ser um número.`)
      output[field.key] = value
      continue
    }

    if (field.type === 'boolean') {
      if (typeof value !== 'boolean')
        fieldError(field, `${field.label} precisa ser sim ou não.`)
      output[field.key] = value
      continue
    }

    if (field.type === 'gallery') {
      if (!Array.isArray(value))
        fieldError(field, `${field.label} precisa ser uma lista de imagens.`)
      if (value.length > CMS_COLLECTION_GALLERY_LIMIT)
        fieldError(field, `${field.label} aceita no máximo ${CMS_COLLECTION_GALLERY_LIMIT} imagens.`)
      output[field.key] = value.map((item) => {
        const media = cmsMediaRefSchema.safeParse(item)
        if (!media.success)
          fieldError(field, `${field.label} precisa referenciar arquivos da mídia.`)
        return media.data
      })
      continue
    }

    const media = cmsMediaRefSchema.safeParse(value)
    if (!media.success)
      fieldError(field, `${field.label} precisa referenciar um arquivo da mídia.`)
    output[field.key] = media.data
  }

  if (byteLength(output) > MAX_ENTRY_BYTES)
    throw cmsError(413, 'payload_too_large', 'O registro é grande demais para ser salvo')

  return output
}

export async function loadCollectionDefinition(
  ctx: Pick<CmsContext, 'client' | 'tenantId'>,
  definitionId: string | null | undefined,
): Promise<CmsCollectionDefinition> {
  if (!definitionId || !uuidSchema.safeParse(definitionId).success)
    throw cmsNotFound('Coleção não encontrada')

  const { data, error } = await ctx.client
    .from(CMS_TABLES.collectionDefinitions)
    .select(DEFINITION_COLUMNS)
    .eq('id', definitionId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  assertNoDbError(error)
  if (!data)
    throw cmsNotFound('Coleção não encontrada')
  return mapDefinition(data as DefinitionRow)
}

export async function listCollectionDefinitions(
  ctx: CmsContext,
  siteId?: string,
): Promise<CmsCollectionDefinition[]> {
  let request = ctx.client
    .from(CMS_TABLES.collectionDefinitions)
    .select(DEFINITION_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
  if (siteId)
    request = request.eq('site_id', siteId)

  const { data, error } = await request.order('name', { ascending: true })
  assertNoDbError(error)
  return ((data ?? []) as DefinitionRow[]).map(mapDefinition)
}

export async function createCollectionDefinition(
  ctx: CmsContext,
  input: CmsCreateCollectionInput,
): Promise<CmsCollectionDefinition> {
  await loadTenantSite(ctx, input.siteId)
  assertSchemaSize(input.schema)

  const { data, error } = await ctx.client
    .from(CMS_TABLES.collectionDefinitions)
    .insert({
      tenant_id: ctx.tenantId,
      site_id: input.siteId,
      key: input.key,
      name: input.name,
      schema: input.schema,
    })
    .select(DEFINITION_COLUMNS)
    .single()

  if (error)
    throwDefinitionWriteError(error as CmsDbError, 'Erro ao criar a coleção')

  const definition = mapDefinition(data as DefinitionRow)
  await recordCmsAudit(ctx, {
    action: 'collection.create',
    siteId: definition.siteId,
    metadata: { definitionId: definition.id, key: definition.key },
  })
  return definition
}

export async function updateCollectionDefinition(
  ctx: CmsContext,
  definitionId: string | null | undefined,
  input: CmsUpdateCollectionInput,
): Promise<CmsCollectionDefinition> {
  const current = await loadCollectionDefinition(ctx, definitionId)
  if (input.schema)
    assertSchemaSize(input.schema)

  const patch: { name?: string, schema?: CmsCollectionSchema } = {}
  if (input.name !== undefined)
    patch.name = input.name
  if (input.schema !== undefined)
    patch.schema = input.schema

  const { data, error } = await ctx.client
    .from(CMS_TABLES.collectionDefinitions)
    .update(patch)
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .select(DEFINITION_COLUMNS)
    .single()

  if (error)
    throwDefinitionWriteError(error as CmsDbError, 'Erro ao salvar a coleção')

  const definition = mapDefinition(data as DefinitionRow)
  await recordCmsAudit(ctx, {
    action: 'collection.update',
    siteId: definition.siteId,
    metadata: { definitionId: definition.id, fields: Object.keys(patch) },
  })
  return definition
}

export async function deleteCollectionDefinition(
  ctx: CmsContext,
  definitionId: string | null | undefined,
): Promise<{ id: string }> {
  const current = await loadCollectionDefinition(ctx, definitionId)
  const { error } = await ctx.client
    .from(CMS_TABLES.collectionDefinitions)
    .delete()
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
  assertNoDbError(error, 'Erro ao excluir a coleção')

  await recordCmsAudit(ctx, {
    action: 'collection.delete',
    siteId: current.siteId,
    metadata: { definitionId: current.id, key: current.key },
  })
  return { id: current.id }
}

async function loadEntry(
  ctx: CmsContext,
  definition: CmsCollectionDefinition,
  entryId: string | null | undefined,
): Promise<CmsEntry> {
  if (!entryId || !uuidSchema.safeParse(entryId).success)
    throw cmsNotFound('Registro não encontrado')

  const { data, error } = await ctx.client
    .from(CMS_TABLES.entries)
    .select(ENTRY_COLUMNS)
    .eq('id', entryId)
    .eq('tenant_id', ctx.tenantId)
    .eq('definition_id', definition.id)
    .maybeSingle()
  assertNoDbError(error)
  if (!data)
    throw cmsNotFound('Registro não encontrado')
  return mapEntry(data as EntryRow)
}

export async function listCollectionEntries(
  ctx: CmsContext,
  definitionId: string | null | undefined,
  query: CmsEntryListQuery,
): Promise<CmsPage<CmsEntry>> {
  const definition = await loadCollectionDefinition(ctx, definitionId)
  let request = ctx.client
    .from(CMS_TABLES.entries)
    .select(ENTRY_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('definition_id', definition.id)

  if (query.status)
    request = request.eq('status', query.status)
  if (query.cursor)
    request = request.or(cursorFilter('updated_at', decodeCmsCursor(query.cursor)))

  const { data, error } = await request
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(query.limit + 1)
  assertNoDbError(error)

  const page = paginate((data ?? []) as EntryRow[], query.limit, row => ({
    key: row.updated_at,
    id: row.id,
  }))
  return { data: page.rows.map(mapEntry), nextCursor: page.nextCursor }
}

export async function getCollectionEntry(
  ctx: CmsContext,
  definitionId: string | null | undefined,
  entryId: string | null | undefined,
): Promise<CmsEntry> {
  const definition = await loadCollectionDefinition(ctx, definitionId)
  return loadEntry(ctx, definition, entryId)
}

export async function createCollectionEntry(
  ctx: CmsContext,
  definitionId: string | null | undefined,
  input: CmsSaveEntryInput,
): Promise<CmsEntry> {
  const definition = await loadCollectionDefinition(ctx, definitionId)
  const payload = coerceEntryPayload(definition.schema, input.payload)
  const status = input.status ?? 'draft'

  const { data, error } = await ctx.client
    .from(CMS_TABLES.entries)
    .insert({
      tenant_id: ctx.tenantId,
      site_id: definition.siteId,
      definition_id: definition.id,
      payload,
      status,
    })
    .select(ENTRY_COLUMNS)
    .single()
  if (error)
    throw cmsDbError(error as CmsDbError, 'Erro ao criar o registro')

  const entry = mapEntry(data as EntryRow)
  await recordCmsAudit(ctx, {
    action: 'entry.create',
    siteId: definition.siteId,
    metadata: { definitionId: definition.id, entryId: entry.id, status },
  })
  return entry
}

export async function updateCollectionEntry(
  ctx: CmsContext,
  definitionId: string | null | undefined,
  entryId: string | null | undefined,
  input: CmsSaveEntryInput,
): Promise<CmsEntry> {
  const definition = await loadCollectionDefinition(ctx, definitionId)
  const current = await loadEntry(ctx, definition, entryId)
  const payload = coerceEntryPayload(definition.schema, input.payload)
  const status = input.status ?? current.status

  const { data, error } = await ctx.client
    .from(CMS_TABLES.entries)
    .update({ payload, status })
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .eq('definition_id', definition.id)
    .select(ENTRY_COLUMNS)
    .single()
  if (error)
    throw cmsDbError(error as CmsDbError, 'Erro ao salvar o registro')

  const entry = mapEntry(data as EntryRow)
  await recordCmsAudit(ctx, {
    action: 'entry.update',
    siteId: definition.siteId,
    metadata: { definitionId: definition.id, entryId: entry.id, status },
  })
  return entry
}

export async function deleteCollectionEntry(
  ctx: CmsContext,
  definitionId: string | null | undefined,
  entryId: string | null | undefined,
): Promise<{ id: string }> {
  const definition = await loadCollectionDefinition(ctx, definitionId)
  const current = await loadEntry(ctx, definition, entryId)
  const { error } = await ctx.client
    .from(CMS_TABLES.entries)
    .delete()
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .eq('definition_id', definition.id)
  assertNoDbError(error, 'Erro ao excluir o registro')

  await recordCmsAudit(ctx, {
    action: 'entry.delete',
    siteId: definition.siteId,
    metadata: { definitionId: definition.id, entryId: current.id },
  })
  return { id: current.id }
}
