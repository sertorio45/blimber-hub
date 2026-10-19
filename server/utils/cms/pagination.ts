import { Buffer } from 'node:buffer'

import { cmsError } from '~/server/utils/cms/errors'

export interface CmsCursor {
  /** Sort key value (an ISO timestamp such as `updated_at` or `published_at`). */
  key: string
  id: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/

export function encodeCmsCursor(cursor: CmsCursor): string {
  return Buffer.from(JSON.stringify({ k: cursor.key, i: cursor.id }), 'utf8').toString('base64url')
}

/** Cursor values end up inside a PostgREST `or` filter, so both parts are strictly validated. */
export function decodeCmsCursor(value: string): CmsCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { k?: unknown, i?: unknown }
    const key = typeof parsed.k === 'string' ? parsed.k : ''
    const id = typeof parsed.i === 'string' ? parsed.i : ''
    if (TIMESTAMP_PATTERN.test(key) && UUID_PATTERN.test(id))
      return { key, id }
  }
  catch {
    // Fall through to the validation error below.
  }
  throw cmsError(400, 'validation_failed', 'Cursor de paginação inválido')
}

/** `(column, id) < (cursor.key, cursor.id)` for a `column desc, id desc` ordering. */
export function cursorFilter(column: string, cursor: CmsCursor): string {
  return `${column}.lt."${cursor.key}",and(${column}.eq."${cursor.key}",id.lt.${cursor.id})`
}

/** Splits the `limit + 1` probe row off and builds the next cursor from the last kept row. */
export function paginate<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => CmsCursor,
): { rows: T[], nextCursor: string | null } {
  const hasMore = rows.length > limit
  const kept = hasMore ? rows.slice(0, limit) : rows
  const last = kept[kept.length - 1]
  return {
    rows: kept,
    nextCursor: hasMore && last ? encodeCmsCursor(cursorOf(last)) : null,
  }
}

/** Escapes LIKE wildcards; `*` is PostgREST's alias for `%`, so it is dropped. */
export function escapeLikePattern(value: string): string {
  return value
    .replace(/\*/g, '')
    .replace(/[\\%_]/g, match => `\\${match}`)
}
