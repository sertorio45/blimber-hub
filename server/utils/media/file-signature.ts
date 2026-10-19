export type SniffedMediaKind = 'image' | 'video' | 'document' | 'markup' | 'unknown'

export interface SniffedMedia {
  kind: SniffedMediaKind
  /** Canonical MIME derived from the bytes, or null when the format is unknown. */
  mime: string | null
}

function ASCII(buffer: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...buffer.subarray(start, Math.min(end, buffer.length)))
}

function startsWith(buffer: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length)
    return false
  return bytes.every((byte, index) => buffer[offset + index] === byte)
}

const QUICKTIME_BRANDS = new Set(['qt  '])
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis'])

/**
 * Identifies a file by its leading bytes. The declared MIME and extension are
 * client-controlled, so uploads that must be safe to serve publicly (CMS) are
 * classified from content instead.
 */
export function sniffMediaType(buffer: Uint8Array): SniffedMedia {
  if (startsWith(buffer, [0xFF, 0xD8, 0xFF]))
    return { kind: 'image', mime: 'image/jpeg' }
  if (startsWith(buffer, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
    return { kind: 'image', mime: 'image/png' }
  const head6 = ASCII(buffer, 0, 6)
  if (head6 === 'GIF87a' || head6 === 'GIF89a')
    return { kind: 'image', mime: 'image/gif' }
  if (ASCII(buffer, 0, 4) === 'RIFF' && ASCII(buffer, 8, 12) === 'WEBP')
    return { kind: 'image', mime: 'image/webp' }
  if (ASCII(buffer, 0, 5) === '%PDF-')
    return { kind: 'document', mime: 'application/pdf' }

  if (ASCII(buffer, 4, 8) === 'ftyp') {
    const brand = ASCII(buffer, 8, 12)
    if (HEIF_BRANDS.has(brand))
      return { kind: 'image', mime: brand.startsWith('avi') ? 'image/avif' : 'image/heic' }
    if (QUICKTIME_BRANDS.has(brand))
      return { kind: 'video', mime: 'video/quicktime' }
    return { kind: 'video', mime: 'video/mp4' }
  }

  // SVG, HTML and XML can carry scripts; detect them even behind a BOM or whitespace.
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(buffer.subarray(0, 1024))
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase()
  if (text.startsWith('<') || text.includes('<svg') || text.includes('<script'))
    return { kind: 'markup', mime: text.includes('<svg') ? 'image/svg+xml' : 'text/html' }

  return { kind: 'unknown', mime: null }
}

export function fileExtension(filename: string | null | undefined): string | null {
  const name = String(filename || '')
  if (!name.includes('.'))
    return null
  return name.split('.').pop()?.trim().toLowerCase() || null
}

/** Extensions accepted for each sniffed MIME in strict (CMS) uploads. */
export const STRICT_UPLOAD_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg', 'jpe', 'jfif'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'video/mp4': ['mp4', 'm4v'],
  'video/quicktime': ['mov', 'qt'],
}

export const ACTIVE_CONTENT_EXTENSIONS = new Set([
  'svg',
  'svgz',
  'html',
  'htm',
  'xhtml',
  'xml',
  'js',
  'mjs',
])
