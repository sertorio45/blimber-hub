/**
 * SSRF protection for media URLs fetched/posted to Meta Graph.
 * Blocks private/link-local/metadata hosts before server-side fetch or Graph URL upload.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { MetaAdsToolError } from './types'

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
])

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  const ranges: Array<[number, number]> = [
    [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')],
    [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')],
    [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')],
    [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')],
    [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')],
    [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')],
  ]
  return ranges.some(([start, end]) => n >= start && n <= end)
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  return (
    normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80')
    || normalized === '::'
  )
}

export function assertPublicHostnameOrIp(host: string): void {
  const hostname = String(host || '').trim().toLowerCase().replace(/\.$/, '')
  if (!hostname) {
    throw new MetaAdsToolError('MEDIA_URL_INVALID', 'URL de mídia sem hostname.', 400)
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new MetaAdsToolError(
      'MEDIA_URL_SSRF_BLOCKED',
      'URL de mídia aponta para host bloqueado (SSRF).',
      400,
      { hostname },
    )
  }

  const ipVersion = isIP(hostname)
  if (ipVersion === 4 && isPrivateIpv4(hostname)) {
    throw new MetaAdsToolError(
      'MEDIA_URL_SSRF_BLOCKED',
      'URL de mídia aponta para IP privado (SSRF).',
      400,
      { hostname },
    )
  }
  if (ipVersion === 6 && isPrivateIpv6(hostname)) {
    throw new MetaAdsToolError(
      'MEDIA_URL_SSRF_BLOCKED',
      'URL de mídia aponta para IPv6 privado/link-local (SSRF).',
      400,
      { hostname },
    )
  }
}

/**
 * Validate https media URL shape + block obvious private hosts.
 * Optionally resolve DNS and block private A/AAAA records (use before server fetch).
 */
export async function assertSafeMediaUrl(
  raw: string,
  options?: { resolveDns?: boolean },
): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(String(raw || '').trim())
  }
  catch {
    throw new MetaAdsToolError('MEDIA_URL_INVALID', 'URL de mídia inválida.', 400)
  }

  if (parsed.protocol !== 'https:') {
    throw new MetaAdsToolError(
      'MEDIA_URL_HTTPS_REQUIRED',
      'URL de mídia deve usar https://.',
      400,
    )
  }
  if (parsed.username || parsed.password) {
    throw new MetaAdsToolError(
      'MEDIA_URL_SSRF_BLOCKED',
      'URL de mídia não pode incluir credenciais.',
      400,
    )
  }

  assertPublicHostnameOrIp(parsed.hostname)

  if (options?.resolveDns && !isIP(parsed.hostname)) {
    try {
      const records = await lookup(parsed.hostname, { all: true })
      for (const record of records) {
        assertPublicHostnameOrIp(record.address)
      }
    }
    catch (err) {
      if (err instanceof MetaAdsToolError)
        throw err
      throw new MetaAdsToolError(
        'MEDIA_URL_DNS_FAILED',
        'Não foi possível resolver o hostname da URL de mídia.',
        400,
        { hostname: parsed.hostname },
      )
    }
  }

  return parsed
}
