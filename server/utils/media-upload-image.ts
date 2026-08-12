type SharpModule = typeof import('sharp')
type SharpInstance = ReturnType<SharpModule['default']>

let sharpModulePromise: Promise<SharpModule> | null = null

/** Lazy-load sharp so Nitro cold start does not crash unrelated API routes. */
async function loadSharp(): Promise<SharpModule['default']> {
  if (!sharpModulePromise) {
    sharpModulePromise = import('sharp').catch((error) => {
      // Allow a later request to retry if the native binary becomes available.
      sharpModulePromise = null
      throw error
    })
  }
  const mod = await sharpModulePromise
  return mod.default
}

function originalImageFallback(
  buffer: Buffer,
  inputMime: string,
  width: number | null = null,
  height: number | null = null,
): CompressedImageResult {
  const fallbackMime = isBucketAllowedImageMime(inputMime)
    ? inputMime
    : inferImageMimeType(inputMime, undefined)

  if (!isBucketAllowedImageMime(fallbackMime))
    throw new Error('Unsupported image format')

  return {
    data: buffer,
    mimeType: fallbackMime,
    width,
    height,
    format: 'original',
    compressed: false,
  }
}

export const IMAGE_UPLOAD_PRESETS = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
} as const

export type ImageUploadFormatHint = keyof typeof IMAGE_UPLOAD_PRESETS | 'auto'

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}

const BUCKET_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export function detectBestPreset(width: number, height: number): keyof typeof IMAGE_UPLOAD_PRESETS {
  const ratio = width / height
  if (ratio >= 0.9 && ratio <= 1.1) return 'square'
  if (ratio >= 0.7 && ratio < 0.9) return 'portrait'
  if (ratio < 0.7) return 'story'
  return 'landscape'
}

export function inferImageMimeType(type: string | undefined, filename: string | undefined): string {
  const normalized = (type || '').trim().toLowerCase()
  if (normalized.startsWith('image/'))
    return normalized

  const extension = filename?.includes('.') ? filename.split('.').pop()?.toLowerCase() : null
  if (extension && EXTENSION_MIME[extension])
    return EXTENSION_MIME[extension]

  return normalized || 'application/octet-stream'
}

export function isLikelyImageFile(type: string | undefined, filename: string | undefined): boolean {
  const mime = inferImageMimeType(type, filename)
  if (mime.startsWith('image/'))
    return true

  const extension = filename?.includes('.') ? filename.split('.').pop()?.toLowerCase() : null
  return Boolean(extension && extension in EXTENSION_MIME)
}

export function isBucketAllowedImageMime(mime: string): boolean {
  return BUCKET_IMAGE_MIMES.has(mime)
}

export interface CompressedImageResult {
  data: Buffer
  mimeType: string
  width: number | null
  height: number | null
  format: 'jpeg' | 'png' | 'original'
  compressed: boolean
}

export async function compressImageForUpload(
  buffer: Buffer,
  input: {
    inputMime: string
    formatHint?: ImageUploadFormatHint
  },
): Promise<CompressedImageResult> {
  let sharp: SharpModule['default']
  try {
    sharp = await loadSharp()
  }
  catch {
    // Missing native binary (e.g. linux-x64 on Vercel) — keep original bytes.
    return originalImageFallback(buffer, input.inputMime)
  }

  try {
    const metadata = await sharp(buffer).metadata()
    if (!metadata.width || !metadata.height || !metadata.format)
      throw new Error('Unsupported image')

    const inputWidth = metadata.width
    const inputHeight = metadata.height
    const formatHint = input.formatHint || 'auto'
    const preset = formatHint !== 'auto'
      ? IMAGE_UPLOAD_PRESETS[formatHint]
      : IMAGE_UPLOAD_PRESETS[detectBestPreset(inputWidth, inputHeight)]

    const keepPng = (input.inputMime === 'image/png' || input.inputMime === 'image/webp') && metadata.hasAlpha
    const outputFormat = keepPng ? 'png' as const : 'jpeg' as const

    let pipeline: SharpInstance = sharp(buffer)
      .rotate()
      .resize({
        width: preset.width,
        height: preset.height,
        fit: 'inside',
        withoutEnlargement: true,
      })

    if (outputFormat === 'jpeg')
      pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true })
    else
      pipeline = pipeline.png({ compressionLevel: 9 })

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })

    return {
      data,
      mimeType: outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
      width: info.width ?? null,
      height: info.height ?? null,
      format: outputFormat,
      compressed: true,
    }
  }
  catch {
    let width: number | null = null
    let height: number | null = null
    try {
      const metadata = await sharp(buffer).metadata()
      width = metadata.width ?? null
      height = metadata.height ?? null
    }
    catch {
      // Keep original bytes even when metadata cannot be parsed.
    }

    return originalImageFallback(buffer, input.inputMime, width, height)
  }
}
