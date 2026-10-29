import { describe, expect, it } from 'vitest'

import { authorizeCmsMcpTool, CMS_TOOL_CAPABILITY, CMS_TOOL_NAMES } from '~/lib/blimber-mcp/cms'
import { BlimberMcpError } from '~/lib/blimber-mcp/errors'
import { resolveBlimberMcpToolName } from '~/lib/blimber-mcp/tool-name'

const TENANT = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const ROLE = '33333333-3333-4333-8333-333333333333'
const ORG = '44444444-4444-4444-8444-444444444444'
const MEMBERSHIP = '55555555-5555-4555-8555-555555555555'

type Row = Record<string, unknown>

function query(rows: Row[]) {
  const filters: Array<(row: Row) => boolean> = []
  const builder = {
    select() { return builder },
    eq(column: string, value: unknown) {
      filters.push(row => row[column] === value)
      return builder
    },
    in(column: string, values: unknown[]) {
      const allowed = new Set(values)
      filters.push(row => allowed.has(row[column]))
      return builder
    },
    then(
      onFulfilled: (value: { data: Row[], error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      const data = rows.filter(row => filters.every(filter => filter(row)))
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
    },
  }
  return builder
}

function client(capabilities: string[], moduleName: string | null = 'cms') {
  const tables: Record<string, Row[]> = {
    organization_memberships: [{
      id: MEMBERSHIP,
      organization_id: ORG,
      user_id: USER,
      role: 'atendente',
      role_id: ROLE,
      access_all_tenants: true,
      is_active: true,
    }],
    organization_tenants: [{ organization_id: ORG, tenant_id: TENANT, is_active: true }],
    organization_member_tenants: [],
    organization_role_capabilities: capabilities.map(capability => ({
      role_id: ROLE,
      capability,
      allowed: true,
    })),
    tenant_capability_grants: [],
    tenant_modules: moduleName
      ? [{ tenant_id: TENANT, module_name: moduleName, is_active: true }]
      : [],
  }

  return {
    from(table: string) {
      return query(tables[table] ?? [])
    },
    auth: {
      admin: {
        async getUserById(id: string) {
          return { data: { user: { id, app_metadata: {} } }, error: null }
        },
      },
    },
  }
}

const WRITE_ONLY = ['cms.read', 'cms.pages.update', 'cms.publications.update']
const AUTHOR = ['cms.read', 'cms.publications.create', 'cms.publications.update']

describe('tools mcp de conteúdo do cms', () => {
  it('separa leitura, criação/edição e publicação', () => {
    expect(CMS_TOOL_NAMES).toEqual([
      'cms.list_documents',
      'cms.get_document',
      'cms.create_document',
      'cms.save_draft',
      'cms.publish_document',
    ])
    expect(CMS_TOOL_CAPABILITY['cms.list_documents']).toEqual(['cms.read'])
    expect(CMS_TOOL_CAPABILITY['cms.get_document']).toEqual(['cms.read'])
    expect(CMS_TOOL_CAPABILITY['cms.create_document']).toEqual([
      'cms.pages.create',
      'cms.publications.create',
    ])
    expect(CMS_TOOL_CAPABILITY['cms.save_draft']).toEqual([
      'cms.pages.update',
      'cms.publications.update',
    ])
    expect(CMS_TOOL_CAPABILITY['cms.publish_document']).toEqual(['cms.publish'])
    expect(CMS_TOOL_CAPABILITY['cms.publish_document']).not.toContain('cms.pages.update')
    expect(CMS_TOOL_CAPABILITY['cms.publish_document']).not.toContain('cms.publications.update')
  })

  it('resolve o nome com prefixo do conector sem cortar cms.', () => {
    const known = new Set<string>(CMS_TOOL_NAMES)
    expect(resolveBlimberMcpToolName('cms.list_documents', known)).toBe('cms.list_documents')
    expect(resolveBlimberMcpToolName('Blimber_Hub.cms.publish_document', known)).toBe('cms.publish_document')
    expect(resolveBlimberMcpToolName('Blimber_Hub.cms.create_document', known)).toBe('cms.create_document')
    expect(resolveBlimberMcpToolName('Blimber_Hub.cms.save_draft', known)).toBe('cms.save_draft')
    expect(resolveBlimberMcpToolName('Blimber_Hub.meta_create_ad', known)).toBeNull()
  })

  it('cms.read lista; cms.pages.update não publica', async () => {
    const ctx = { client: client(WRITE_ONLY), actorUserId: USER }
    await expect(authorizeCmsMcpTool(ctx, TENANT, 'cms.list_documents')).resolves.toMatchObject({ userId: USER })
    await expect(authorizeCmsMcpTool(ctx, TENANT, 'cms.save_draft')).resolves.toMatchObject({ userId: USER })
    await expect(authorizeCmsMcpTool(ctx, TENANT, 'cms.publish_document')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    })
  })

  it('autor cria e salva publicação; sem create não cria', async () => {
    const author = { client: client(AUTHOR), actorUserId: USER }
    await expect(authorizeCmsMcpTool(author, TENANT, 'cms.create_document')).resolves.toMatchObject({
      userId: USER,
    })
    await expect(authorizeCmsMcpTool(author, TENANT, 'cms.save_draft')).resolves.toMatchObject({
      userId: USER,
    })

    const reader = { client: client(['cms.read']), actorUserId: USER }
    await expect(authorizeCmsMcpTool(reader, TENANT, 'cms.create_document')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('cms.publish publica e quem só publica não lista sem cms.read', async () => {
    const publisher = { client: client(['cms.read', 'cms.publish']), actorUserId: USER }
    await expect(authorizeCmsMcpTool(publisher, TENANT, 'cms.publish_document')).resolves.toMatchObject({
      userId: USER,
    })

    const publishOnly = { client: client(['cms.publish']), actorUserId: USER }
    await expect(authorizeCmsMcpTool(publishOnly, TENANT, 'cms.get_document')).rejects.toBeInstanceOf(BlimberMcpError)
  })

  it('recusa tenant sem o módulo CMS', async () => {
    const ctx = { client: client(WRITE_ONLY, 'crm'), actorUserId: USER }
    await expect(authorizeCmsMcpTool(ctx, TENANT, 'cms.list_documents')).rejects.toMatchObject({
      code: 'MODULE_DISABLED',
    })
  })

  it('exige um ator para checar a permissão', async () => {
    const ctx = { client: client(WRITE_ONLY) }
    await expect(authorizeCmsMcpTool(ctx, TENANT, 'cms.list_documents')).rejects.toMatchObject({
      code: 'ACTOR_REQUIRED',
    })
  })
})
