import type { WorkspaceContext, WorkspaceModule } from '~/server/utils/workspace-context'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import deleteArticle from '~/server/api/articles/[id].delete'
import getArticle from '~/server/api/articles/[id].get'
import updateArticle from '~/server/api/articles/[id].put'
import createCategory from '~/server/api/articles/category/index.post'
import listArticles from '~/server/api/articles/index.get'
import createArticle from '~/server/api/articles/index.post'
import saveTagRelations from '~/server/api/articles/tag/relations/index.post'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return { ...actual, readBody: vi.fn(async (event: any) => event.__body) }
})

vi.mock('~/server/utils/workspace-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/server/utils/workspace-context')>()
  return { ...actual, requireWorkspaceContext: vi.fn() }
})

const TENANT_A = '00000000-0000-4000-8000-00000000a100'
const TENANT_B = '00000000-0000-4000-8000-00000000b100'

type Row = Record<string, any>
type Database = Record<string, Row[]>

interface Filter {
  kind: 'eq' | 'neq' | 'in'
  column: string
  value: any
}

/** In-memory PostgREST double covering the read and write shapes used by the article handlers. */
class FakeQuery implements PromiseLike<{ data: any, error: null }> {
  private filters: Filter[] = []
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | Row[] | null = null
  private limitTo: number | null = null

  constructor(private readonly db: Database, private readonly table: string) {}

  select(_columns = '*') {
    return this
  }

  insert(payload: Row | Row[]) {
    this.action = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  eq(column: string, value: any) {
    this.filters.push({ kind: 'eq', column, value })
    return this
  }

  neq(column: string, value: any) {
    this.filters.push({ kind: 'neq', column, value })
    return this
  }

  in(column: string, value: any[]) {
    this.filters.push({ kind: 'in', column, value })
    return this
  }

  order(_column: string, _options?: unknown) {
    return this
  }

  limit(count: number) {
    this.limitTo = count
    return this
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      if (filter.kind === 'eq')
        return row[filter.column] === filter.value
      if (filter.kind === 'neq')
        return row[filter.column] !== filter.value
      return (filter.value as any[]).includes(row[filter.column])
    })
  }

  private run(): Row[] {
    const rows = (this.db[this.table] ??= [])

    if (this.action === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map(item => ({
        id: rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1,
        created_at: new Date().toISOString(),
        ...item,
      }))
      for (const row of inserted)
        rows.push(row)
      return inserted.map(row => ({ ...row }))
    }

    if (this.action === 'update') {
      const updated = rows.filter(row => this.matches(row))
      for (const row of updated)
        Object.assign(row, this.payload)
      return updated.map(row => ({ ...row }))
    }

    if (this.action === 'delete') {
      const removed = rows.filter(row => this.matches(row))
      this.db[this.table] = rows.filter(row => !this.matches(row))
      return removed
    }

    const selected = rows.filter(row => this.matches(row)).map(row => ({ ...row }))
    return this.limitTo === null ? selected : selected.slice(0, this.limitTo)
  }

  async single() {
    const rows = this.run()
    return { data: rows[0] ?? null, error: rows.length === 1 ? null : { code: 'PGRST116', message: 'not single' } }
  }

  async maybeSingle() {
    return { data: this.run()[0] ?? null, error: null }
  }

  then<TResult1 = { data: any, error: null }, TResult2 = never>(
    onFulfilled?: ((value: { data: any, error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.run(), error: null }).then(onFulfilled, onRejected)
  }
}

function createClient(db: Database) {
  return { from: (table: string) => new FakeQuery(db, table) }
}

function createDatabase(): Database {
  return {
    articles: [
      { id: 1, tenant_id: TENANT_A, title: 'Artigo A', slug: 'artigo-a', category_id: 10 },
      { id: 2, tenant_id: TENANT_B, title: 'Artigo B', slug: 'artigo-b', category_id: 20 },
    ],
    articles_category: [
      { id: 10, tenant_id: TENANT_A, title: 'Categoria A', slug: 'categoria-a' },
      { id: 20, tenant_id: TENANT_B, title: 'Categoria B', slug: 'categoria-b' },
    ],
    articles_tag: [
      { id: 100, tenant_id: TENANT_A, title: 'tag-a', slug: 'tag-a' },
      { id: 200, tenant_id: TENANT_B, title: 'tag-b', slug: 'tag-b' },
    ],
    articles_tag_relations: [],
  }
}

interface ContextInput {
  tenantId?: string
  isPlatformStaff?: boolean
  role?: WorkspaceContext['effectiveRole']
  modules?: WorkspaceModule[]
}

function createContext(db: Database, input: ContextInput = {}): WorkspaceContext {
  const isPlatformStaff = input.isPlatformStaff ?? false
  return {
    client: createClient(db),
    user: { id: 'user-1' } as WorkspaceContext['user'],
    userId: 'user-1',
    globalRole: isPlatformStaff ? 'admin' : null,
    isPlatformStaff,
    organization: null,
    organizationMembership: null,
    organizationRole: null,
    organizationRoleId: null,
    organizationRoleSlug: null,
    organizationRoleName: null,
    organizationTenantLink: null,
    tenant: { id: input.tenantId ?? TENANT_A, name: 'Empresa', slug: 'empresa', isActive: true },
    tenantId: input.tenantId ?? TENANT_A,
    tenantRole: input.role ?? (isPlatformStaff ? 'admin' : 'cliente'),
    effectiveRole: input.role ?? (isPlatformStaff ? 'admin' : 'cliente'),
    capabilities: [],
    modules: input.modules ?? ['article'],
    canAccessAllOrganizationTenants: isPlatformStaff,
    requested: { organizationId: null, tenantId: input.tenantId ?? TENANT_A, source: 'header' },
    has: () => false,
  }
}

function createEvent(input: { id?: string | number, body?: unknown, query?: Record<string, string> } = {}) {
  const search = new URLSearchParams(input.query ?? {}).toString()
  const path = search ? `/api/articles?${search}` : '/api/articles'
  return {
    path,
    method: 'GET',
    node: { req: { url: path, headers: {}, method: 'GET' }, res: {} },
    context: { params: input.id === undefined ? {} : { id: String(input.id) } },
    __body: input.body,
  } as any
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise
    return { status: 200, code: null as string | null }
  }
  catch (error: any) {
    return { status: Number(error?.statusCode ?? 500), code: error?.data?.error?.code ?? null }
  }
}

const mockedContext = vi.mocked(requireWorkspaceContext)

let db: Database

beforeEach(() => {
  db = createDatabase()
  mockedContext.mockReset()
})

function actAs(input: ContextInput = {}) {
  mockedContext.mockResolvedValue(createContext(db, input))
}

describe('articles — autenticação', () => {
  it('sem sessão retorna 401 com envelope de erro', async () => {
    const actual = await vi.importActual<typeof import('~/server/utils/workspace-context')>(
      '~/server/utils/workspace-context',
    )
    mockedContext.mockImplementation(actual.requireWorkspaceContext)

    expect(await failureOf(listArticles(createEvent()))).toEqual({ status: 401, code: 'unauthenticated' })
  })

  it('resolve o contexto exigindo empresa, sem confiar no módulo enviado pelo cliente', async () => {
    actAs()
    await listArticles(createEvent())
    expect(mockedContext).toHaveBeenCalledWith(expect.anything(), { requireTenant: true })
  })

  it('empresa sem módulo de artigos nem CMS retorna 403', async () => {
    actAs({ modules: ['crm'] })
    expect(await failureOf(listArticles(createEvent()))).toEqual({ status: 403, code: 'module_disabled' })
  })

  it('empresa contratada apenas com CMS acessa artigos', async () => {
    actAs({ modules: ['cms'] })
    const response = await listArticles(createEvent())
    expect(response.data.map(row => row.id)).toEqual([1])
  })
})

describe('articles — isolamento por empresa', () => {
  it('empresa A não lê artigo da empresa B (404)', async () => {
    actAs({ tenantId: TENANT_A })
    expect(await failureOf(getArticle(createEvent({ id: 2 })))).toEqual({ status: 404, code: 'not_found' })
  })

  it('empresa A não altera nem exclui artigo da empresa B', async () => {
    actAs({ tenantId: TENANT_A })

    const update = updateArticle(createEvent({ id: 2, body: { title: 'Invadido', slug: 'invadido' } }))
    expect(await failureOf(update)).toEqual({ status: 404, code: 'not_found' })
    expect(await failureOf(deleteArticle(createEvent({ id: 2 })))).toEqual({ status: 404, code: 'not_found' })

    expect(db.articles!.find(row => row.id === 2)).toMatchObject({ title: 'Artigo B', tenant_id: TENANT_B })
  })

  it('staff lista apenas artigos da empresa selecionada', async () => {
    actAs({ isPlatformStaff: true, tenantId: TENANT_B })
    const response = await listArticles(createEvent())
    expect(response.data.map(row => row.tenant_id)).toEqual([TENANT_B])
  })
})

describe('articles — criação e edição', () => {
  it('ignora tenant_id do corpo e grava a empresa do contexto', async () => {
    actAs({ tenantId: TENANT_A })
    const response = await createArticle(createEvent({
      body: { title: 'Novo', slug: 'novo', content: '<p>x</p>', tenant_id: TENANT_B },
    }))

    expect(response.data.tenant_id).toBe(TENANT_A)
    expect(db.articles!.filter(row => row.slug === 'novo')).toHaveLength(1)
    expect(db.articles!.find(row => row.slug === 'novo')?.tenant_id).toBe(TENANT_A)
  })

  it('persiste category_id no POST', async () => {
    actAs({ tenantId: TENANT_A })
    const response = await createArticle(createEvent({
      body: { title: 'Com categoria', slug: 'com-categoria', category_id: '10' },
    }))

    expect(response.data.category_id).toBe(10)
  })

  it('rejeita categoria de outra empresa com 422', async () => {
    actAs({ tenantId: TENANT_A })
    const create = createArticle(createEvent({ body: { title: 'X', slug: 'x', category_id: 20 } }))
    expect(await failureOf(create)).toEqual({ status: 422, code: 'validation_failed' })

    const update = updateArticle(createEvent({ id: 1, body: { title: 'X', slug: 'x', category_id: 20 } }))
    expect(await failureOf(update)).toEqual({ status: 422, code: 'validation_failed' })
    expect(db.articles!.find(row => row.id === 1)?.category_id).toBe(10)
  })

  it('corpo inválido retorna 422', async () => {
    actAs()
    expect(await failureOf(createArticle(createEvent({ body: { slug: 'sem-titulo' } }))))
      .toEqual({ status: 422, code: 'validation_failed' })
  })

  it('pUT grava meta_description e aceita o campo legado description', async () => {
    actAs({ tenantId: TENANT_A })

    await updateArticle(createEvent({ id: 1, body: { title: 'A', slug: 'artigo-a', meta_description: 'Resumo' } }))
    expect(db.articles!.find(row => row.id === 1)?.meta_description).toBe('Resumo')

    await updateArticle(createEvent({ id: 1, body: { title: 'A', slug: 'artigo-a', description: 'Legado' } }))
    expect(db.articles!.find(row => row.id === 1)?.meta_description).toBe('Legado')
  })

  it('slug duplicado na mesma empresa retorna 409', async () => {
    actAs({ tenantId: TENANT_A })
    expect(await failureOf(createArticle(createEvent({ body: { title: 'Dup', slug: 'artigo-a' } }))))
      .toEqual({ status: 409, code: 'route_conflict' })
  })

  it('categoria criada usa a empresa do contexto', async () => {
    actAs({ tenantId: TENANT_A })
    const response = await createCategory(createEvent({
      body: { title: 'Nova', slug: 'nova', tenant_id: TENANT_B },
    }))
    expect(response.data.tenant_id).toBe(TENANT_A)
  })
})

describe('articles — relações de tags', () => {
  it('rejeita tag de outra empresa com 422', async () => {
    actAs({ tenantId: TENANT_A })
    const save = saveTagRelations(createEvent({ body: { article_id: 1, tag_ids: [100, 200] } }))
    expect(await failureOf(save)).toEqual({ status: 422, code: 'validation_failed' })
    expect(db.articles_tag_relations).toHaveLength(0)
  })

  it('não vincula tags a artigo de outra empresa', async () => {
    actAs({ tenantId: TENANT_A })
    const save = saveTagRelations(createEvent({ body: { article_id: 2, tag_ids: [100], tenant_id: TENANT_B } }))
    expect(await failureOf(save)).toEqual({ status: 404, code: 'not_found' })
  })

  it('grava relações com a empresa do contexto', async () => {
    actAs({ tenantId: TENANT_A })
    const response = await saveTagRelations(createEvent({ body: { article_id: 1, tag_ids: [100] } }))
    expect(response.data).toEqual([expect.objectContaining({ article_id: 1, tag_id: 100, tenant_id: TENANT_A })])
  })
})

describe('articles — permissões de escrita', () => {
  it('papel sem acesso legado nem capability CMS não escreve', async () => {
    mockedContext.mockResolvedValue({
      ...createContext(db, { tenantId: TENANT_A }),
      tenantRole: null,
      effectiveRole: null,
    })
    expect(await failureOf(createArticle(createEvent({ body: { title: 'X', slug: 'x' } }))))
      .toEqual({ status: 403, code: 'forbidden' })
  })
})
