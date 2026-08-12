import type { MaybeRefOrGetter, Ref, WatchSource } from 'vue'

const DEFAULT_TTL_MS = 90_000
const STAMPS_STATE_KEY = 'marketing-fetch-stamps'

interface CacheMeta { at: number }

export interface UseMarketingFetchOptions<T> {
  /** Unique cache key — string or getter/computed that returns a string. */
  key: MaybeRefOrGetter<string>
  handler: () => Promise<T>
  default: () => T
  watch?: WatchSource[]
  /** When false, skip the request. Cached/in-memory data is kept (SWR). */
  enabled?: MaybeRefOrGetter<boolean>
  immediate?: boolean
  /** Skip network when cached data is younger than this (ms). Default 90s. */
  ttlMs?: number
}

export interface UseMarketingFetchReturn<T> {
  data: Ref<T>
  pending: Ref<boolean>
  /** True only on first load without payload cache (SWR keeps previous data visible). */
  showSkeleton: Ref<boolean>
  /** True while a background revalidation is in flight and cached/stale data is already shown. */
  revalidating: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
}

function matchesPrefix(key: string, prefixes: string[]): boolean {
  return prefixes.some(prefix => prefix.length > 0 && key.startsWith(prefix))
}

/**
 * Drop payload + TTL stamps so the next fetch is forced.
 * In-memory `data` on mounted composables is kept — call `refresh()` to revalidate.
 */
export function invalidateMarketingCache(prefixes: string | string[]): void {
  const nuxtApp = useNuxtApp()
  const stamps = useState<Record<string, CacheMeta>>(STAMPS_STATE_KEY, () => ({}))
  const list = Array.isArray(prefixes) ? prefixes : [prefixes]

  for (const key of Object.keys(nuxtApp.payload.data || {})) {
    if (matchesPrefix(key, list))
      delete nuxtApp.payload.data[key]
  }

  const staticData = nuxtApp.static?.data
  if (staticData) {
    for (const key of Object.keys(staticData)) {
      if (matchesPrefix(key, list))
        delete staticData[key]
    }
  }

  const next: Record<string, CacheMeta> = {}
  for (const [key, meta] of Object.entries(stamps.value)) {
    if (!matchesPrefix(key, list))
      next[key] = meta
  }
  stamps.value = next
}

/**
 * Non-blocking marketing data loader based on `$fetch`.
 * Paints from `payload.data` immediately and revalidates only after TTL (stale-while-revalidate).
 */
export function useMarketingFetch<T>(
  options: UseMarketingFetchOptions<T>,
): UseMarketingFetchReturn<T> {
  const nuxtApp = useNuxtApp()
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const data = ref(options.default()) as Ref<T>
  const pending = ref(false)
  const error = ref<unknown>(null)
  const stamps = useState<Record<string, CacheMeta>>(STAMPS_STATE_KEY, () => ({}))
  const seenKeys = new Set<string>()

  let requestId = 0
  let lastKey = ''

  function resolveKey(): string {
    return toValue(options.key)
  }

  function isEnabled(): boolean {
    return options.enabled === undefined ? true : Boolean(toValue(options.enabled))
  }

  function readCache(key: string): T | undefined {
    const fromPayload = nuxtApp.payload.data[key]
    if (fromPayload !== undefined)
      return fromPayload as T
    return nuxtApp.static.data[key] as T | undefined
  }

  function writeCache(key: string, value: T): void {
    nuxtApp.payload.data[key] = value
    stamps.value = { ...stamps.value, [key]: { at: Date.now() } }
    seenKeys.add(key)
  }

  function isFresh(key: string): boolean {
    const meta = stamps.value[key]
    if (!meta)
      return false
    return Date.now() - meta.at < ttlMs
  }

  function markSeenFromCache(key: string, cached: T | undefined): void {
    if (cached !== undefined)
      seenKeys.add(key)
  }

  async function refresh(force = false): Promise<void> {
    const currentRequest = ++requestId
    const key = resolveKey()
    const keyChanged = Boolean(lastKey) && lastKey !== key
    lastKey = key

    if (!isEnabled()) {
      if (currentRequest !== requestId)
        return
      error.value = null
      const cached = readCache(key)
      markSeenFromCache(key, cached)
      if (cached !== undefined)
        data.value = cached
      pending.value = !seenKeys.has(key)
      return
    }

    if (force) {
      const { [key]: _removed, ...rest } = stamps.value
      stamps.value = rest
    }

    const cached = readCache(key)
    markSeenFromCache(key, cached)

    if (cached !== undefined) {
      // Keep optimistic in-memory updates on force refresh of the same key.
      if (!force || keyChanged)
        data.value = cached
      pending.value = false
      if (!force && isFresh(key))
        return
    }
    else if (keyChanged) {
      data.value = options.default()
      pending.value = !seenKeys.has(key)
    }
    else {
      pending.value = !seenKeys.has(key)
    }

    error.value = null
    try {
      const result = await options.handler()
      if (currentRequest !== requestId)
        return
      data.value = result
      writeCache(key, result)
    }
    catch (err) {
      if (currentRequest !== requestId)
        return
      error.value = err
      if (!force && cached === undefined && !seenKeys.has(key))
        data.value = options.default()
    }
    finally {
      if (currentRequest === requestId)
        pending.value = false
    }
  }

  const showSkeletonSafe = computed(() => {
    if (!pending.value)
      return false
    const key = resolveKey()
    if (seenKeys.has(key) || readCache(key) !== undefined)
      return false
    return true
  })

  const revalidating = computed(() => pending.value && !showSkeletonSafe.value)

  const watchSources: WatchSource[] = [
    () => resolveKey(),
    ...(options.watch || []),
  ]
  if (options.enabled !== undefined)
    watchSources.push(() => isEnabled())

  watch(watchSources, () => {
    void refresh(false)
  }, { flush: 'post' })

  if (options.immediate !== false) {
    const key = resolveKey()
    lastKey = key
    const cached = isEnabled() ? readCache(key) : undefined
    markSeenFromCache(key, cached)
    if (cached !== undefined) {
      data.value = cached
      pending.value = false
    }
    else {
      pending.value = true
    }
    void refresh(false)
  }

  return {
    data,
    pending,
    showSkeleton: showSkeletonSafe,
    revalidating,
    error,
    refresh: () => refresh(true),
  }
}
