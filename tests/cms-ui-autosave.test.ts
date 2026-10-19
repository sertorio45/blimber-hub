import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'

import { createCmsAutosave } from '~/composables/cms/useCmsAutosave'

interface Form { title: string, body: string }

function conflictError(currentVersion: number) {
  return {
    statusCode: 409,
    data: { error: { code: 'version_conflict', message: 'Versão desatualizada', details: { currentVersion, updatedAt: '2026-10-19T10:00:00Z', updatedBy: null } } },
  }
}

function setup(overrides: { save?: (input: { expectedVersion: number, payload: Form }) => Promise<{ version: number }> } = {}) {
  const form = reactive<Form>({ title: 'Inicial', body: '' })
  const version = ref(1)
  const save = vi.fn(overrides.save ?? (async ({ expectedVersion }: { expectedVersion: number }) => ({ version: expectedVersion + 1 })))
  const apply = vi.fn((payload: Form) => Object.assign(form, payload))
  const loadLatest = vi.fn(async () => ({ version: 9, payload: { title: 'Servidor', body: 'remoto' } }))

  const autosave = createCmsAutosave<Form>({
    getPayload: () => ({ ...form }),
    source: () => form,
    version,
    save,
    apply,
    loadLatest,
    delayMs: 1500,
    retryDelaysMs: [3000],
  })

  return { form, version, save, apply, loadLatest, autosave }
}

describe('createCmsAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces edits and keeps expectedVersion in sync', async () => {
    const { form, version, save, autosave } = setup()

    form.title = 'A'
    form.title = 'AB'
    expect(autosave.isDirty.value).toBe(true)
    expect(autosave.state.value).toBe('idle')

    await vi.advanceTimersByTimeAsync(1499)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![0]).toEqual({ expectedVersion: 1, payload: { title: 'AB', body: '' } })
    expect(version.value).toBe(2)
    expect(autosave.state.value).toBe('saved')
    expect(autosave.isDirty.value).toBe(false)

    form.body = 'texto'
    expect(autosave.state.value).toBe('idle')
    await vi.advanceTimersByTimeAsync(1500)
    expect(save.mock.calls[1]![0].expectedVersion).toBe(2)
    expect(version.value).toBe(3)
  })

  it('saves again when the user types during an in-flight save', async () => {
    let resolveFirst: ((value: { version: number }) => void) | null = null
    const { form, save, autosave } = setup({
      save: ({ expectedVersion }) => (resolveFirst === null
        ? new Promise((resolve) => { resolveFirst = resolve })
        : Promise.resolve({ version: expectedVersion + 1 })),
    })

    form.title = 'primeiro'
    await vi.advanceTimersByTimeAsync(1500)
    expect(autosave.state.value).toBe('saving')

    form.title = 'segundo'
    resolveFirst!({ version: 2 })
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    expect(autosave.state.value).toBe('idle')
    expect(autosave.isDirty.value).toBe(true)

    await vi.advanceTimersByTimeAsync(1500)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]![0]).toEqual({ expectedVersion: 2, payload: { title: 'segundo', body: '' } })
    expect(autosave.state.value).toBe('saved')
  })

  it('enters conflict on 409, keeps local work and stops autosaving', async () => {
    const { form, save, autosave } = setup({ save: async () => Promise.reject(conflictError(5)) })

    form.title = 'minha versão'
    await vi.advanceTimersByTimeAsync(1500)

    expect(autosave.state.value).toBe('conflict')
    expect(autosave.conflict.value?.currentVersion).toBe(5)
    expect(form.title).toBe('minha versão')
    expect(autosave.isDirty.value).toBe(true)

    form.title = 'minha versão 2'
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(await autosave.flush()).toBe(false)
  })

  it('"Manter minha versão" retries with the server version', async () => {
    let calls = 0
    const { form, version, save, autosave } = setup({
      save: async ({ expectedVersion }) => {
        calls++
        if (calls === 1)
          throw conflictError(7)
        return { version: expectedVersion + 1 }
      },
    })

    form.title = 'local'
    await vi.advanceTimersByTimeAsync(1500)
    expect(autosave.state.value).toBe('conflict')

    expect(await autosave.keepMine()).toBe(true)
    expect(save.mock.calls[1]![0]).toEqual({ expectedVersion: 7, payload: { title: 'local', body: '' } })
    expect(version.value).toBe(8)
    expect(autosave.state.value).toBe('saved')
    expect(autosave.conflict.value).toBeNull()
  })

  it('"Recarregar versão do servidor" applies the remote payload without scheduling a save', async () => {
    const { form, version, save, apply, autosave } = setup({ save: async () => Promise.reject(conflictError(9)) })

    form.title = 'local'
    await vi.advanceTimersByTimeAsync(1500)
    expect(autosave.state.value).toBe('conflict')

    expect(await autosave.reloadFromServer()).toBe(true)
    expect(apply).toHaveBeenCalledWith({ title: 'Servidor', body: 'remoto' })
    expect(form.title).toBe('Servidor')
    expect(version.value).toBe(9)
    expect(autosave.state.value).toBe('idle')
    expect(autosave.isDirty.value).toBe(false)

    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('retries transient failures automatically and on demand', async () => {
    let calls = 0
    const { form, save, autosave } = setup({
      save: async ({ expectedVersion }) => {
        calls++
        if (calls <= 2) {
          throw Object.assign(new Error('Indisponível'), {
            statusCode: 503,
            data: { error: { code: 'internal_error', message: 'Indisponível' } },
          })
        }
        return { version: expectedVersion + 1 }
      },
    })

    form.title = 'x'
    await vi.advanceTimersByTimeAsync(1500)
    expect(autosave.state.value).toBe('error')
    expect(autosave.lastError.value?.message).toBe('Indisponível')

    await vi.advanceTimersByTimeAsync(3000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(autosave.state.value).toBe('error')

    // Automatic retries exhausted: nothing else happens until the user asks.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(save).toHaveBeenCalledTimes(2)

    expect(await autosave.retry()).toBe(true)
    expect(autosave.state.value).toBe('saved')
  })

  it('does not auto-retry client errors such as 422', async () => {
    const { form, save, autosave } = setup({
      save: async () => Promise.reject(Object.assign(new Error('Inválido'), {
        statusCode: 422,
        data: { error: { code: 'validation_failed', message: 'Inválido' } },
      })),
    })

    form.title = 'x'
    await vi.advanceTimersByTimeAsync(1500)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(autosave.state.value).toBe('error')
  })

  it('flush saves immediately and reset ignores programmatic writes', async () => {
    const { form, save, autosave } = setup()

    form.body = 'rápido'
    expect(await autosave.flush()).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)

    autosave.reset(4, { title: 'restaurado', body: '' })
    expect(form.title).toBe('restaurado')
    expect(autosave.isDirty.value).toBe(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('stops everything after dispose', async () => {
    const { form, save, autosave } = setup()
    form.title = 'x'
    autosave.dispose()
    form.title = 'y'
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()
  })
})
