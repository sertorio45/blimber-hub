import type { CmsPublicationJob } from '~/lib/cms/contracts'

import { describe, expect, it } from 'vitest'

import { resolveRunAt } from '~/lib/cms/schedule-time'
import { CMS_JOB_LOCK_MS, processCmsPublicationJob, processDueCmsPublicationJobs } from '~/server/utils/cms/publication-jobs'

interface JobRow {
  id: string
  tenant_id: string
  site_id: string
  document_id: string
  revision_id: string | null
  edit_version: number | null
  run_at: string
  timezone: string
  status: CmsPublicationJob['status']
  attempts: number
  max_attempts: number
  last_error: string | null
  next_attempt_at: string | null
  locked_at: string | null
  locked_by: string | null
  result_revision_id: string | null
  actor_user_id: string | null
  created_at: string
  updated_at: string
}

interface DocumentRow {
  id: string
  tenant_id: string
  edit_version: number
  public_status: string
  has_unpublished_changes: boolean
  published_revision_id: string | null
  deleted_at: string | null
}

interface Store {
  jobs: Map<string, JobRow>
  documents: Map<string, DocumentRow>
  publishCalls: number
  failNextFinish: boolean
  audits: Array<Record<string, unknown>>
}

function job(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 'job-1',
    tenant_id: 'tenant-1',
    site_id: 'site-1',
    document_id: 'doc-1',
    revision_id: null,
    edit_version: 3,
    run_at: '2026-10-19T12:00:00.000Z',
    timezone: 'America/Sao_Paulo',
    status: 'pending',
    attempts: 0,
    max_attempts: 3,
    last_error: null,
    next_attempt_at: null,
    locked_at: null,
    locked_by: null,
    result_revision_id: null,
    actor_user_id: 'user-1',
    created_at: '2026-10-19T11:00:00.000Z',
    updated_at: '2026-10-19T11:00:00.000Z',
    ...overrides,
  }
}

function document(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    tenant_id: 'tenant-1',
    edit_version: 3,
    public_status: 'unpublished',
    has_unpublished_changes: true,
    published_revision_id: null,
    deleted_at: null,
    ...overrides,
  }
}

function createClient(store: Store) {
  function rows(table: string) {
    if (table === 'cms_publication_jobs')
      return [...store.jobs.values()]
    if (table === 'cms_documents')
      return [...store.documents.values()]
    return []
  }

  function from(table: string) {
    const filters: Array<{ op: 'eq' | 'in' | 'lte', col: string, val: unknown }> = []
    let patch: Record<string, unknown> | null = null
    let limit = 50

    const matches = (row: Record<string, unknown>) => filters.every((filter) => {
      if (filter.op === 'eq')
        return row[filter.col] === filter.val
      if (filter.op === 'in')
        return (filter.val as unknown[]).includes(row[filter.col])
      return row[filter.col] != null && String(row[filter.col]) <= String(filter.val)
    })

    const execute = (mode: 'many' | 'single') => {
      if (patch && table === 'cms_publication_jobs' && patch.status === 'published' && store.failNextFinish) {
        store.failNextFinish = false
        throw new Error('finish failed')
      }
      const matched = rows(table).filter(row => matches(row as unknown as Record<string, unknown>))
      if (patch) {
        for (const row of matched)
          Object.assign(row, patch)
      }
      const data = matched.slice(0, limit).map(row => ({ ...row }))
      if (mode === 'single')
        return { data: data[0] ?? null, error: null }
      return { data, error: null }
    }

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        filters.push({ op: 'eq', col, val })
        return builder
      },
      in: (col: string, val: unknown) => {
        filters.push({ op: 'in', col, val })
        return builder
      },
      lte: (col: string, val: unknown) => {
        filters.push({ op: 'lte', col, val })
        return builder
      },
      order: () => builder,
      or: () => builder,
      limit: (value: number) => {
        limit = value
        return builder
      },
      update: (payload: Record<string, unknown>) => {
        patch = { ...payload }
        return builder
      },
      insert: (payload: Record<string, unknown>) => {
        store.audits.push(payload)
        return builder
      },
      maybeSingle: () => Promise.resolve(execute('single')),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        try {
          return resolve(execute('many'))
        }
        catch (error) {
          return reject(error)
        }
      },
    }
    return builder
  }

  return {
    from,
    rpc: async (name: string, args: Record<string, unknown>) => {
      store.publishCalls += 1
      const doc = store.documents.get(String(args.p_document_id))
      if (!doc || doc.deleted_at)
        return { data: null, error: { code: 'P0404', message: 'not_found' } }
      if (name === 'cms_publish_revision' && doc.edit_version !== args.p_expected_version)
        return { data: null, error: { code: 'P0409', message: 'version_conflict' } }
      const revisionId = name === 'cms_publish_pinned_revision'
        ? String(args.p_revision_id)
        : `rev-${store.publishCalls}`
      doc.public_status = 'published'
      doc.has_unpublished_changes = false
      doc.published_revision_id = revisionId
      return {
        data: {
          revision_id: revisionId,
          revision_number: 1,
          path: '/sobre',
          published_at: '2026-10-19T12:00:00.000Z',
        },
        error: null,
      }
    },
  }
}

function seed(jobOverrides: Partial<JobRow> = {}, documentOverrides: Partial<DocumentRow> = {}) {
  const row = job(jobOverrides)
  const doc = document(documentOverrides)
  const store: Store = {
    jobs: new Map([[row.id, row]]),
    documents: new Map([[doc.id, doc]]),
    publishCalls: 0,
    failNextFinish: false,
    audits: [],
  }
  return { store, client: createClient(store), row }
}

describe('processCmsPublicationJob', () => {
  it('publishes a due job once and ignores a second delivery', async () => {
    const { store, client, row } = seed()

    const first = await processCmsPublicationJob(client, { ...row }, 'worker-a')
    expect(first).toMatchObject({ success: true, idempotent: false, revisionId: 'rev-1' })
    expect(store.publishCalls).toBe(1)
    expect(store.jobs.get('job-1')?.status).toBe('published')

    const second = await processCmsPublicationJob(client, { ...row, status: 'pending' }, 'worker-b')
    expect(second).toMatchObject({ success: true, idempotent: true, revisionId: 'rev-1' })
    expect(store.publishCalls).toBe(1)
  })

  it('does not publish again when the status update failed after a successful publish', async () => {
    const { store, client, row } = seed()
    store.failNextFinish = true

    await expect(processCmsPublicationJob(client, { ...row }, 'worker-a')).rejects.toThrow('finish failed')
    expect(store.publishCalls).toBe(1)
    expect(store.jobs.get('job-1')?.status).toBe('processing')
    expect(store.documents.get('doc-1')?.public_status).toBe('published')

    const stuck = store.jobs.get('job-1')!
    stuck.locked_at = new Date(Date.now() - CMS_JOB_LOCK_MS - 1_000).toISOString()

    const second = await processCmsPublicationJob(client, { ...stuck }, 'worker-b')
    expect(second).toMatchObject({ success: true, idempotent: true, revisionId: 'rev-1' })
    expect(store.publishCalls).toBe(1)
    expect(store.jobs.get('job-1')?.status).toBe('published')
  })

  it('fails a drifted draft without calling publish', async () => {
    const { store, client, row } = seed({}, { edit_version: 4 })

    const result = await processCmsPublicationJob(client, { ...row }, 'worker-a')
    expect(result.success).toBe(false)
    expect(result.code).toBe('version_conflict')
    expect(store.publishCalls).toBe(0)
    expect(store.jobs.get('job-1')?.status).toBe('failed')
    expect(store.jobs.get('job-1')?.last_error).toMatch(/mudou/)
  })

  it('skips cancelled jobs', async () => {
    const { store, client, row } = seed({ status: 'cancelled' })
    const result = await processCmsPublicationJob(client, { ...row }, 'worker-a')
    expect(result).toMatchObject({ skipped: true, reason: 'cancelled' })
    expect(store.publishCalls).toBe(0)
  })

  it('treats an already live pinned revision as done', async () => {
    const { store, client, row } = seed(
      { revision_id: 'rev-live', edit_version: null },
      { public_status: 'published', has_unpublished_changes: false, published_revision_id: 'rev-live' },
    )
    const result = await processCmsPublicationJob(client, { ...row }, 'worker-a')
    expect(result).toMatchObject({ success: true, idempotent: true, revisionId: 'rev-live' })
    expect(store.publishCalls).toBe(0)
    expect(store.jobs.get('job-1')?.status).toBe('published')
  })

  it('leaves a fresh processing lock alone', async () => {
    const { store, client, row } = seed({
      status: 'processing',
      locked_at: new Date().toISOString(),
      locked_by: 'worker-a',
    })
    const result = await processCmsPublicationJob(client, { ...row, status: 'pending' }, 'worker-b')
    expect(result).toMatchObject({ skipped: true, reason: 'in_progress' })
    expect(store.publishCalls).toBe(0)
  })
})

describe('processDueCmsPublicationJobs', () => {
  it('skips jobs whose next attempt is still in the future', async () => {
    const { store, client, row } = seed({
      run_at: '2020-01-01T00:00:00.000Z',
      next_attempt_at: '2999-01-01T00:00:00.000Z',
      status: 'retrying',
    })
    const results = await processDueCmsPublicationJobs(client, 'worker-a', 10)
    expect(results).toEqual([])
    expect(store.publishCalls).toBe(0)
    expect(store.jobs.get(row.id)?.status).toBe('retrying')
  })

  it('publishes a due job from the queue only once across two passes', async () => {
    const { store, client } = seed({ run_at: '2020-01-01T00:00:00.000Z' })
    const first = await processDueCmsPublicationJobs(client, 'worker-a', 10)
    const second = await processDueCmsPublicationJobs(client, 'worker-b', 10)
    expect(first).toHaveLength(1)
    expect(first[0]?.success).toBe(true)
    expect(second).toEqual([])
    expect(store.publishCalls).toBe(1)
  })
})

describe('resolveRunAt', () => {
  const now = new Date('2026-10-19T15:00:00.000Z')

  it('interprets a wall clock in the site timezone as UTC', () => {
    const instant = resolveRunAt('2026-10-19T18:00', 'America/Sao_Paulo', now)
    expect(instant.toISOString()).toBe('2026-10-19T21:00:00.000Z')
  })

  it('keeps an offset instant as an absolute time', () => {
    const instant = resolveRunAt('2026-10-19T18:00:00-03:00', 'UTC', now)
    expect(instant.toISOString()).toBe('2026-10-19T21:00:00.000Z')
  })

  it('rejects a time in the past', () => {
    expect(() => resolveRunAt('2026-10-19T09:00', 'America/Sao_Paulo', now)).toThrow()
  })
})
