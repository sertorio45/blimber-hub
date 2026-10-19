import { CalendarDateTime, fromAbsolute, toZoned } from '@internationalized/date'

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const HAS_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/i

export class ScheduleTimeError extends Error {
  constructor(readonly field: 'timezone' | 'runAt') {
    super(field)
    this.name = 'ScheduleTimeError'
  }
}

export function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  }
  catch {
    return false
  }
}

/** Wall clock in `timeZone` (`YYYY-MM-DDTHH:mm`) as a UTC instant. */
export function zonedWallTimeToUtc(wall: string, timeZone: string): Date {
  const match = WALL_TIME.exec(wall.trim())
  if (!match || !isValidTimeZone(timeZone))
    return new Date(Number.NaN)

  const zoned = toZoned(
    new CalendarDateTime(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] ?? 0),
    ),
    timeZone,
  )
  return zoned.toDate()
}

/** `datetime-local` value for an instant shown in `timeZone`. */
export function formatWallInZone(date: Date, timeZone: string): string {
  const zoned = fromAbsolute(date.getTime(), timeZone)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}T${pad(zoned.hour)}:${pad(zoned.minute)}`
}

const PAST_SKEW_MS = 60_000
const MAX_HORIZON_MS = 366 * 24 * 60 * 60 * 1000

/**
 * Resolves a schedule instant. Values with `Z` or a numeric offset are absolute.
 * Values without an offset are wall times in `timeZone` (the value stored as reference).
 */
export function resolveRunAt(runAt: string, timeZone: string, now = new Date()): Date {
  if (!isValidTimeZone(timeZone))
    throw new ScheduleTimeError('timezone')

  const raw = runAt.trim()
  const instant = HAS_OFFSET.test(raw) ? new Date(raw) : zonedWallTimeToUtc(raw, timeZone)
  if (Number.isNaN(instant.getTime()))
    throw new ScheduleTimeError('runAt')
  if (instant.getTime() < now.getTime() - PAST_SKEW_MS)
    throw new ScheduleTimeError('runAt')
  if (instant.getTime() > now.getTime() + MAX_HORIZON_MS)
    throw new ScheduleTimeError('runAt')
  return instant
}
