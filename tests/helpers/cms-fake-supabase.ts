import { randomUUID } from 'node:crypto'

/**
 * In-memory PostgREST double for the CMS services. Besides answering queries it
 * records every call (table, action, selected columns and filters) so tests can
 * assert tenant scoping and that public delivery never selects `draft_payload`.
 */

export type CmsFakeRow = Record<string, unknown>
export type CmsFakeDatabase = Record<string, CmsFakeRow[]>

export interface CmsFakeFilter {
  op: 'eq' | 'neq' | 'is' | 'in' | 'like' | 'ilike' | 'lt' | 'not_is' | 'or'
  column: string
  value: unknown
}

export interface CmsFakeCall {
  table: string
  action: 'select' | 'insert' | 'update' | 'delete'
  columns: string | null
  filters: CmsFakeFilter[]
  payload: unknown
}

export interface CmsFakeRpcCall {
  name: string
  args: Record<string, unknown>
}

export interface CmsFakeError {
  code: string
  message: string
  details?: string | null
}

export type CmsFakeRpcHandler = (args: Record<string, unknown>, db: CmsFakeDatabase) => {
  data?: unknown
  error?: CmsFakeError | null
}

interface QueryResult {
  data: unknown
  error: CmsFakeError | null
  count?: number | null
}

/**
 * NOT NULL defaults from the CMS migration. PostgREST returns them on INSERT;
 * the double applies the same so handlers can map the row they just wrote.
 */
const TABLE_DEFAULTS: Record<string, CmsFakeRow> = {
  cms_sites: {
    default_locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    status: 'active',
    settings: {},
  },
  cms_documents: {
    publication_type: null,
    locale: 'pt-BR',
    title: '',
    slug: null,
    parent_id: null,
    is_home: false,
    workflow_status: 'draft',
    public_status: 'unpublished',
    draft_payload: {},
    edit_version: 0,
    published_revision_id: null,
    published_at: null,
    has_unpublished_changes: false,
    created_by: null,
    updated_by: null,
    deleted_at: null,
  },
  cms_revisions: {
    created_by: null,
  },
  cms_routes: {
    locale: 'pt-BR',
    document_id: null,
    revision_id: null,
    route_kind: 'document',
  },
  cms_audit_events: {
    site_id: null,
    actor_user_id: null,
    document_id: null,
    revision_id: null,
    metadata: {},
  },
}

function likeToRegExp(pattern: string, insensitive: boolean): RegExp {
  let source = ''
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!
    if (char === '\\' && index + 1 < pattern.length) {
      source += pattern[++index]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      continue
    }
    if (char === '%')
      source += '.*'
    else if (char === '_')
      source += '.'
    else
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`, insensitive ? 'is' : 's')
}

const CURSOR_OR_PATTERN = /^(\w+)\.lt\."([^"]+)",and\(\1\.eq\."\2",id\.lt\.([0-9a-f-]+)\)$/i

function matchesFilter(row: CmsFakeRow, filter: CmsFakeFilter): boolean {
  const value = row[filter.column]
  switch (filter.op) {
    case 'eq':
      return value === filter.value
    case 'neq':
      return value !== filter.value
    case 'is':
      return filter.value === null ? value === null || value === undefined : value === filter.value
    case 'not_is':
      return value !== null && value !== undefined
    case 'in':
      return (filter.value as unknown[]).includes(value)
    case 'like':
    case 'ilike':
      return typeof value === 'string' && likeToRegExp(String(filter.value), filter.op === 'ilike').test(value)
    case 'lt':
      return typeof value === 'number' ? value < Number(filter.value) : String(value) < String(filter.value)
    case 'or': {
      const match = CURSOR_OR_PATTERN.exec(String(filter.value))
      if (!match)
        throw new Error(`fake supabase: unsupported or() filter ${String(filter.value)}`)
      const [, column, key, id] = match
      const current = String(row[column!] ?? '')
      return current < key! || (current === key && String(row.id) < id!)
    }
  }
}

/** Supports `*`, plain columns and `alias:column->key` / `alias:column->>key` JSON paths. */
function project(row: CmsFakeRow, columns: string | null): CmsFakeRow {
  if (!columns || columns.trim() === '*')
    return { ...row }
  const projected: CmsFakeRow = {}
  for (const raw of columns.split(',')) {
    const token = raw.trim()
    if (!token)
      continue
    const json = /^(\w+):(\w+)->>?(\w+)$/.exec(token)
    if (json) {
      const [, alias, column, key] = json
      const source = row[column!] as Record<string, unknown> | null | undefined
      projected[alias!] = source && typeof source === 'object' ? source[key!] ?? null : null
      continue
    }
    projected[token] = row[token]
  }
  return projected
}

class CmsFakeQuery implements PromiseLike<QueryResult> {
  private action: CmsFakeCall['action'] = 'select'
  private columns: string | null = null
  private filters: CmsFakeFilter[] = []
  private payload: CmsFakeRow | CmsFakeRow[] | null = null
  private orders: Array<{ column: string, ascending: boolean }> = []
  private limitTo: number | null = null
  private head = false
  private countRequested = false
  private returning = false

  constructor(private readonly fake: CmsFakeSupabase, private readonly table: string) {}

  select(columns = '*', options: { count?: string, head?: boolean } = {}) {
    if (this.action !== 'select')
      this.returning = true
    this.columns = columns
    this.head = Boolean(options.head)
    this.countRequested = Boolean(options.count)
    return this
  }

  insert(payload: CmsFakeRow | CmsFakeRow[]) {
    this.action = 'insert'
    this.payload = payload
    return this
  }

  update(payload: CmsFakeRow) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  private push(op: CmsFakeFilter['op'], column: string, value: unknown) {
    this.filters.push({ op, column, value })
    return this
  }

  eq(column: string, value: unknown) { return this.push('eq', column, value) }
  neq(column: string, value: unknown) { return this.push('neq', column, value) }
  is(column: string, value: unknown) { return this.push('is', column, value) }
  in(column: string, value: unknown[]) { return this.push('in', column, value) }
  like(column: string, value: string) { return this.push('like', column, value) }
  ilike(column: string, value: string) { return this.push('ilike', column, value) }
  lt(column: string, value: unknown) { return this.push('lt', column, value) }
  or(expression: string) { return this.push('or', '', expression) }

  not(column: string, operator: string, value: unknown) {
    if (operator !== 'is' || value !== null)
      throw new Error('fake supabase: only not(column, "is", null) is supported')
    return this.push('not_is', column, null)
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending ?? true })
    return this
  }

  limit(count: number) {
    this.limitTo = count
    return this
  }

  private matches(row: CmsFakeRow): boolean {
    return this.filters.every(filter => matchesFilter(row, filter))
  }

  private execute(): QueryResult {
    this.fake.beforeExecute?.({ table: this.table, action: this.action })
    this.fake.calls.push({
      table: this.table,
      action: this.action,
      columns: this.columns,
      filters: [...this.filters],
      payload: this.payload,
    })

    const injected = this.fake.takeError(this.table, this.action)
    if (injected)
      return { data: null, error: injected }

    const rows = (this.fake.db[this.table] ??= [])
    const now = this.fake.now()

    if (this.action === 'insert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload!]
      const defaults = TABLE_DEFAULTS[this.table] ?? {}
      const inserted = items.map(item => ({
        id: randomUUID(),
        created_at: now,
        updated_at: now,
        ...structuredClone(defaults),
        ...item,
      }))
      rows.push(...inserted)
      return { data: this.returning ? inserted.map(row => project(row, this.columns)) : null, error: null }
    }

    if (this.action === 'update') {
      const updated = rows.filter(row => this.matches(row))
      for (const row of updated)
        Object.assign(row, this.payload, { updated_at: now })
      return { data: this.returning ? updated.map(row => project(row, this.columns)) : null, error: null }
    }

    if (this.action === 'delete') {
      const removed = rows.filter(row => this.matches(row))
      this.fake.db[this.table] = rows.filter(row => !this.matches(row))
      return { data: this.returning ? removed : null, error: null }
    }

    let selected = rows.filter(row => this.matches(row))
    if (this.orders.length) {
      selected = [...selected].sort((a, b) => {
        for (const { column, ascending } of this.orders) {
          const left = a[column]
          const right = b[column]
          if (left === right)
            continue
          const result = typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left ?? '').localeCompare(String(right ?? ''))
          return ascending ? result : -result
        }
        return 0
      })
    }
    const count = selected.length
    if (this.limitTo !== null)
      selected = selected.slice(0, this.limitTo)
    if (this.head)
      return { data: null, error: null, count: this.countRequested ? count : null }
    return {
      data: selected.map(row => project(row, this.columns)),
      error: null,
      ...(this.countRequested ? { count } : {}),
    }
  }

  async single(): Promise<QueryResult> {
    const result = this.execute()
    if (result.error)
      return result
    const rows = (result.data as CmsFakeRow[] | null) ?? []
    return rows.length === 1
      ? { data: rows[0], error: null }
      : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
  }

  async maybeSingle(): Promise<QueryResult> {
    const result = this.execute()
    if (result.error)
      return result
    return { data: ((result.data as CmsFakeRow[] | null) ?? [])[0] ?? null, error: null }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve().then(() => this.execute()).then(onFulfilled, onRejected)
  }
}

export type CmsFakeHook = (call: Pick<CmsFakeCall, 'table' | 'action'>) => void

export class CmsFakeSupabase {
  calls: CmsFakeCall[] = []
  rpcCalls: CmsFakeRpcCall[] = []
  rpcHandlers: Record<string, CmsFakeRpcHandler> = {}
  /** Runs before a query reads or writes, so a test can lose an optimistic race. */
  beforeExecute: CmsFakeHook | null = null
  private errors: Array<{ table: string, action: CmsFakeCall['action'], error: CmsFakeError }> = []
  private clock = Date.parse('2026-10-19T12:00:00.000Z')

  constructor(public db: CmsFakeDatabase) {}

  now(): string {
    this.clock += 1000
    return new Date(this.clock).toISOString()
  }

  /** The next matching call answers with `error` instead of touching the data. */
  failNext(table: string, action: CmsFakeCall['action'], error: CmsFakeError) {
    this.errors.push({ table, action, error })
  }

  takeError(table: string, action: CmsFakeCall['action']): CmsFakeError | null {
    const index = this.errors.findIndex(item => item.table === table && item.action === action)
    if (index < 0)
      return null
    return this.errors.splice(index, 1)[0]!.error
  }

  from(table: string) {
    return new CmsFakeQuery(this, table)
  }

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args })
    const handler = this.rpcHandlers[name]
    if (!handler)
      return { data: null, error: { code: '42883', message: `function ${name} does not exist` } }
    const result = handler(args, this.db)
    return { data: result.data ?? null, error: result.error ?? null }
  }

  callsTo(table: string, action?: CmsFakeCall['action']): CmsFakeCall[] {
    return this.calls.filter(call => call.table === table && (!action || call.action === action))
  }
}

export interface CmsTestEvent {
  path: string
  method: string
  node: {
    req: { url: string, headers: Record<string, string | undefined>, method: string }
    res: CmsTestResponse
  }
  context: { params: Record<string, string> }
  __body?: unknown
  __testUser?: unknown
  __testClient?: unknown
}

interface CmsTestResponse {
  statusCode: number
  statusMessage: string
  setHeader: (name: string, value: string | number | readonly string[]) => void
  getHeader: (name: string) => string | number | readonly string[] | undefined
  getHeaders: () => Record<string, string | number | readonly string[]>
  removeHeader: (name: string) => void
}

/** Minimal Nitro event: real h3 helpers read `path`, `context.params` and `node.res`. */
export function createCmsEvent(input: {
  params?: Record<string, string>
  body?: unknown
  query?: Record<string, string | undefined>
  path?: string
  headers?: Record<string, string>
  client?: unknown
  user?: unknown
} = {}): CmsTestEvent {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined)
      search.set(key, value)
  }
  const qs = search.toString()
  const path = `${input.path ?? '/api/cms'}${qs ? `?${qs}` : ''}`
  const stored = new Map<string, string | number | readonly string[]>()
  const res: CmsTestResponse = {
    statusCode: 200,
    statusMessage: '',
    setHeader(name, value) {
      stored.set(name.toLowerCase(), value)
    },
    getHeader(name) {
      return stored.get(name.toLowerCase())
    },
    getHeaders() {
      return Object.fromEntries(stored)
    },
    removeHeader(name) {
      stored.delete(name.toLowerCase())
    },
  }

  return {
    path,
    method: 'GET',
    node: {
      req: { url: path, headers: { ...(input.headers ?? {}) }, method: 'GET' },
      res,
    },
    context: { params: { ...(input.params ?? {}) } },
    __body: input.body,
    __testUser: input.user,
    __testClient: input.client,
  }
}
