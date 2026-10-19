import type { Ref, WatchSource } from 'vue'
import type { CmsApiError } from '~/composables/cms/cmsErrors'
import type { CmsVersionConflictDetails } from '~/lib/cms/contracts'

import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

import { normalizeCmsError } from '~/composables/cms/cmsErrors'
import { onCmsTenantReset } from '~/composables/cms/cmsSession'

export type CmsAutosaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

export interface CmsAutosaveOptions<T> {
  /** Snapshot of the local working copy sent to the server. */
  getPayload: () => T
  /** What to deep-watch for changes. Defaults to `getPayload`. */
  source?: WatchSource<unknown>
  /** `expectedVersion` for optimistic locking; updated after every successful save. */
  version: Ref<number>
  save: (input: { expectedVersion: number, payload: T }) => Promise<{ version: number }>
  /** Needed for "Recarregar versão do servidor". */
  loadLatest?: () => Promise<{ version: number, payload: T }>
  /** Writes a server payload into the local form without counting as an edit. */
  apply?: (payload: T) => void
  enabled?: () => boolean
  delayMs?: number
  /** Automatic retries for transient failures (network / 5xx). */
  retryDelaysMs?: number[]
  normalizeError?: (error: unknown) => CmsApiError
  now?: () => number
}

const RETRYABLE_CODES = new Set(['network_error', 'internal_error'])

function isRetryable(error: CmsApiError): boolean {
  return RETRYABLE_CODES.has(error.code) || error.status === 429 || error.status >= 500
}

function readConflict(details: unknown): CmsVersionConflictDetails {
  const found = findConflict(details)
  return found ?? { currentVersion: Number.NaN, updatedAt: '', updatedBy: null }
}

/** Accepts the details object or one more wrapping `{ details }` / `{ error }` layer. */
function findConflict(value: unknown, depth = 0): CmsVersionConflictDetails | null {
  if (!value || typeof value !== 'object' || depth > 3)
    return null
  const record = value as Record<string, unknown>
  if (typeof record.currentVersion === 'number') {
    return {
      currentVersion: record.currentVersion,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
      updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : null,
    }
  }
  return findConflict(record.details, depth + 1) ?? findConflict(record.error, depth + 1)
}

/**
 * Framework-free autosave state machine (no router / DOM), so it can be unit
 * tested. Edits are tracked with a monotonic counter instead of diffing the
 * payload: cheap on every keystroke and immune to key-order noise.
 *
 * idle ──edit──▶ (debounce) ──▶ saving ──ok──▶ saved
 *                                  │ └─409──▶ conflict ──keepMine/reload──▶ idle
 *                                  └─fail──▶ error ──retry──▶ saving
 */
export function createCmsAutosave<T>(options: CmsAutosaveOptions<T>) {
  const delayMs = options.delayMs ?? 1500
  const retryDelays = options.retryDelaysMs ?? [3000, 10_000]
  const normalize = options.normalizeError ?? normalizeCmsError
  const now = options.now ?? Date.now
  const enabled = () => (options.enabled ? options.enabled() : true)

  const state = ref<CmsAutosaveState>('idle')
  const conflict = shallowRef<CmsVersionConflictDetails | null>(null)
  const lastError = shallowRef<CmsApiError | null>(null)
  const lastSavedAt = ref<number | null>(null)
  const reloading = ref(false)
  const editCount = ref(0)
  const savedCount = ref(0)
  let abandoned = false

  const isDirty = computed(() => !abandoned && editCount.value !== savedCount.value)
  const hasPendingChanges = computed(() => !abandoned && (isDirty.value || state.value === 'saving'))

  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<boolean> | null = null
  let retryAttempt = 0
  let suppress = 0
  let disposed = false

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule(delay = delayMs) {
    if (disposed || abandoned || !enabled() || state.value === 'conflict')
      return
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void persist()
    }, delay)
  }

  // `flush: 'sync'` lets `withoutTracking` reliably ignore programmatic writes.
  const stopWatch = watch(options.source ?? options.getPayload, () => {
    if (suppress > 0 || disposed || abandoned)
      return
    editCount.value++
    if (state.value === 'saved')
      state.value = 'idle'
    if (state.value === 'error')
      retryAttempt = 0
    schedule()
  }, { deep: true, flush: 'sync' })

  function withoutTracking(mutate: () => void) {
    suppress++
    try {
      mutate()
    }
    finally {
      suppress--
    }
  }

  async function persist(): Promise<boolean> {
    if (disposed || abandoned || state.value === 'conflict')
      return false
    if (!enabled())
      return !isDirty.value
    if (inFlight) {
      await inFlight
      if (!isDirty.value)
        return state.value !== 'error' && state.value !== 'conflict'
      return persist()
    }
    clearTimer()
    if (!isDirty.value) {
      if (state.value === 'error')
        state.value = lastSavedAt.value ? 'saved' : 'idle'
      return true
    }

    const target = editCount.value
    const payload = options.getPayload()
    state.value = 'saving'
    lastError.value = null

    inFlight = (async () => {
      try {
        const result = await options.save({ expectedVersion: options.version.value, payload })
        if (disposed || abandoned)
          return false
        options.version.value = result.version
        savedCount.value = target
        lastSavedAt.value = now()
        retryAttempt = 0
        if (isDirty.value) {
          state.value = 'idle'
          schedule()
        }
        else {
          state.value = 'saved'
        }
        return true
      }
      catch (error: unknown) {
        if (disposed || abandoned)
          return false
        const normalized = normalize(error)
        if (normalized.code === 'aborted') {
          state.value = 'idle'
          return false
        }
        if (normalized.code === 'version_conflict') {
          clearTimer()
          conflict.value = readConflict(normalized.details)
          state.value = 'conflict'
          return false
        }
        lastError.value = normalized
        state.value = 'error'
        if (isRetryable(normalized) && retryAttempt < retryDelays.length)
          schedule(retryDelays[retryAttempt++])
        return false
      }
      finally {
        inFlight = null
      }
    })()

    return inFlight
  }

  /**
   * Company switch: forget local edits so route-leave cannot flush them into
   * the next tenant. The in-flight request is aborted separately.
   */
  function abandon() {
    abandoned = true
    clearTimer()
    savedCount.value = editCount.value
    conflict.value = null
    lastError.value = null
    state.value = 'idle'
  }

  /** Save now. Resolves `true` only when nothing is left unsaved. */
  async function flush(): Promise<boolean> {
    if (abandoned)
      return true
    clearTimer()
    if (inFlight)
      await inFlight
    if (isDirty.value)
      await persist()
    return !isDirty.value && state.value !== 'conflict' && state.value !== 'error'
  }

  function retry(): Promise<boolean> {
    retryAttempt = 0
    return persist()
  }

  /** "Manter minha versão": overwrite the server copy using its current version. */
  async function keepMine(): Promise<boolean> {
    if (state.value !== 'conflict')
      return false
    let target = conflict.value?.currentVersion ?? Number.NaN
    if (!Number.isFinite(target) && options.loadLatest) {
      try {
        target = (await options.loadLatest()).version
      }
      catch (error: unknown) {
        lastError.value = normalize(error)
        return false
      }
    }
    if (!Number.isFinite(target))
      return false
    options.version.value = target
    conflict.value = null
    state.value = 'idle'
    retryAttempt = 0
    if (!isDirty.value)
      editCount.value++
    return persist()
  }

  /** Replace local state with a server payload and mark it clean (load, reload, restore). */
  function reset(version: number, payload?: T) {
    abandoned = false
    clearTimer()
    if (payload !== undefined && options.apply) {
      const apply = options.apply
      withoutTracking(() => apply(payload))
    }
    savedCount.value = editCount.value
    options.version.value = version
    conflict.value = null
    lastError.value = null
    retryAttempt = 0
    state.value = 'idle'
  }

  /** "Recarregar versão do servidor": discards local work. */
  async function reloadFromServer(): Promise<boolean> {
    if (!options.loadLatest)
      return false
    clearTimer()
    reloading.value = true
    try {
      const latest = await options.loadLatest()
      if (disposed)
        return false
      reset(latest.version, latest.payload)
      return true
    }
    catch (error: unknown) {
      lastError.value = normalize(error)
      return false
    }
    finally {
      reloading.value = false
    }
  }

  /** Conflicts found by other calls (e.g. publish) share the same resolution UI. */
  function markConflict(details: unknown) {
    clearTimer()
    conflict.value = readConflict(details)
    state.value = 'conflict'
  }

  function syncVersion(version: number) {
    options.version.value = version
  }

  function dispose() {
    disposed = true
    clearTimer()
    stopWatch()
  }

  return {
    state,
    conflict,
    lastError,
    lastSavedAt,
    reloading,
    isDirty,
    hasPendingChanges,
    flush,
    retry,
    keepMine,
    reloadFromServer,
    reset,
    markConflict,
    syncVersion,
    withoutTracking,
    abandon,
    dispose,
  }
}

export type CmsAutosave<T = unknown> = ReturnType<typeof createCmsAutosave<T>>

const LEAVE_CONFIRM = 'Existem alterações que não foram salvas. Deseja sair mesmo assim?'

/** Component binding: flushes on route leave, warns on tab close, saves when the tab is hidden. */
export function useCmsAutosave<T>(options: CmsAutosaveOptions<T>) {
  const autosave = createCmsAutosave(options)

  onBeforeRouteLeave(async () => {
    if (!autosave.hasPendingChanges.value)
      return true
    if (await autosave.flush())
      return true
    // Browser confirm is intentional: leave guards need a sync, blocking prompt.
    // eslint-disable-next-line no-alert
    return import.meta.client ? window.confirm(LEAVE_CONFIRM) : true
  })

  if (import.meta.client) {
    useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
      if (!autosave.hasPendingChanges.value)
        return
      event.preventDefault()
      event.returnValue = ''
    })
    useEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden' && autosave.isDirty.value)
        void autosave.flush()
    })
  }

  const stopTenantReset = onCmsTenantReset(() => autosave.abandon())

  onBeforeUnmount(() => {
    stopTenantReset()
    autosave.dispose()
  })

  return autosave
}
