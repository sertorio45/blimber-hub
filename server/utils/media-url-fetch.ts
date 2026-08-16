import { assertSafeMediaUrl } from '~/lib/meta-ads/safe-url'
import { MetaAdsToolError } from '~/lib/meta-ads/types'
import { BlimberMcpError } from '~/lib/blimber-mcp/errors'
import { LIBRARY_UPLOAD_MAX_BYTES } from '~/server/utils/media-library-upload'

const MAX_REDIRECTS = 3
const DEFAULT_TIMEOUT_MS = 20_000

function mapSafeUrlError(error: unknown): never {
  if (error instanceof BlimberMcpError)
    throw error
  if (error instanceof MetaAdsToolError) {
    throw new BlimberMcpError(error.code, error.message, error.statusCode, error.details)
  }
  throw new BlimberMcpError(
    'MEDIA_URL_INVALID',
    error instanceof Error ? error.message : 'URL de mídia inválida.',
    400,
  )
}

export async function assertPublicMediaUrl(rawUrl: string, resolveDns = true): Promise<URL> {
  try {
    return await assertSafeMediaUrl(rawUrl, { resolveDns })
  }
  catch (error) {
    mapSafeUrlError(error)
  }
}

async function assertHttpsPublicUrl(raw: string, resolveDns: boolean): Promise<URL> {
  return assertPublicMediaUrl(raw, resolveDns)
}

/**
 * Server-side HTTPS fetch for library uploads (SSRF-checked, size-capped).
 */
export async function fetchPublicHttpsMedia(
  rawUrl: string,
  options?: {
    maxBytes?: number
    timeoutMs?: number
    resolveDns?: boolean
    fetchImpl?: typeof fetch
  },
): Promise<{ buffer: Buffer, contentType: string | undefined, filenameHint: string }> {
  const maxBytes = options?.maxBytes ?? LIBRARY_UPLOAD_MAX_BYTES
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const resolveDns = options?.resolveDns !== false
  const fetchImpl = options?.fetchImpl || globalThis.fetch

  if (typeof fetchImpl !== 'function') {
    throw new BlimberMcpError('FETCH_UNAVAILABLE', 'fetch não disponível no servidor.', 503)
  }

  let current = await assertHttpsPublicUrl(rawUrl, resolveDns)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let response: Response
      try {
        response = await fetchImpl(current.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            Accept: 'image/*,video/mp4,video/quicktime,*/*;q=0.5',
          },
        })
      }
      catch (error: any) {
        if (error?.name === 'AbortError') {
          throw new BlimberMcpError('FETCH_TIMEOUT', 'Timeout ao baixar a mídia.', 504)
        }
        throw new BlimberMcpError(
          'FETCH_FAILED',
          error instanceof Error ? error.message : 'Falha ao baixar a mídia.',
          502,
        )
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) {
          throw new BlimberMcpError('FETCH_REDIRECT', 'Redirect sem Location.', 502)
        }
        if (hop === MAX_REDIRECTS) {
          throw new BlimberMcpError('FETCH_REDIRECT', 'Muitos redirects na URL de mídia.', 400)
        }
        const next = new URL(location, current)
        current = await assertHttpsPublicUrl(next.toString(), resolveDns)
        continue
      }

      if (!response.ok) {
        throw new BlimberMcpError(
          'FETCH_FAILED',
          `HTTP ${response.status} ao baixar a mídia.`,
          502,
        )
      }

      const declared = Number(response.headers.get('content-length') || 0)
      if (declared > maxBytes) {
        throw new BlimberMcpError(
          'FILE_TOO_LARGE',
          `Arquivo excede ${maxBytes} bytes (limite da biblioteca).`,
          413,
        )
      }

      const chunks: Uint8Array[] = []
      let received = 0
      if (response.body) {
        const reader = response.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done)
            break
          if (!value)
            continue
          received += value.byteLength
          if (received > maxBytes) {
            await reader.cancel().catch(() => undefined)
            throw new BlimberMcpError(
              'FILE_TOO_LARGE',
              `Arquivo excede ${maxBytes} bytes (limite da biblioteca).`,
              413,
            )
          }
          chunks.push(value)
        }
      }
      else {
        const arrayBuffer = await response.arrayBuffer()
        received = arrayBuffer.byteLength
        if (received > maxBytes) {
          throw new BlimberMcpError(
            'FILE_TOO_LARGE',
            `Arquivo excede ${maxBytes} bytes (limite da biblioteca).`,
            413,
          )
        }
        chunks.push(new Uint8Array(arrayBuffer))
      }

      if (!received) {
        throw new BlimberMcpError('FILE_EMPTY', 'A URL retornou um arquivo vazio.', 400)
      }

      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim()
      const disposition = response.headers.get('content-disposition') || ''
      const named = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i)?.[1]
      const filenameHint = named
        ? decodeURIComponent(named.replace(/"/g, '')).slice(0, 255)
        : current.pathname.split('/').filter(Boolean).pop() || 'upload.bin'

      return {
        buffer: Buffer.concat(chunks.map(chunk => Buffer.from(chunk))),
        contentType,
        filenameHint,
      }
    }
  }
  finally {
    clearTimeout(timer)
  }

  throw new BlimberMcpError('FETCH_REDIRECT', 'Muitos redirects na URL de mídia.', 400)
}
