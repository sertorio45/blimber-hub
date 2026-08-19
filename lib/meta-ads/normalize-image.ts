/**
 * Normalize images for Meta Marketing API (adimages endpoint).
 * Pipeline: EXIF rotate → flatten alpha to white (RGB/sRGB) → strip metadata → resize ≤8MB recommended.
 * Outputs JPEG by default; caller may request original format first with JPEG fallback.
 * Uses Sharp (lazy-loaded from server/utils).
 */

type SharpModule = typeof import('sharp')

let sharpModulePromise: Promise<SharpModule> | null = null

async function loadSharp(): Promise<SharpModule['default']> {
  if (!sharpModulePromise) {
    sharpModulePromise = import('sharp').catch((error) => {
      sharpModulePromise = null
      throw error
    })
  }
  const mod = await sharpModulePromise
  return mod.default
}

export const META_IMAGE_RECOMMENDED_MAX_BYTES = 8 * 1024 * 1024
export const META_IMAGE_HARD_MAX_BYTES = 30 * 1024 * 1024

export interface NormalizedImageResult {
  data: Buffer
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif'
  width: number
  height: number
  normalized: boolean
  originalMimeType: string
  convertedToJpeg: boolean
}

/**
 * Detect whether the image needs normalization (alpha, non-sRGB, orientation, WebP, etc.).
 * Returns the Sharp metadata if Sharp is available, null otherwise.
 */
async function probeImage(buffer: Buffer) {
  const sharp = await loadSharp()
  const metadata = await sharp(buffer).metadata()
  if (!metadata.width || !metadata.height)
    throw new Error('Cannot read image dimensions')
  return { sharp, metadata }
}

/**
 * Normalize an image buffer for Meta adimages.
 * - EXIF auto-rotate
 * - Flatten alpha channel (white background) → ensures RGB
 * - Convert to sRGB color space
 * - Strip all metadata
 * - Resize if exceeds recommended size
 * - Output JPEG (quality 90) unless forceOriginalFormat + format is GIF
 */
export async function normalizeImageForMeta(
  buffer: Buffer,
  options: {
    originalMimeType: string
    forceJpeg?: boolean
    maxWidth?: number
    maxHeight?: number
  },
): Promise<NormalizedImageResult> {
  const { sharp, metadata } = await probeImage(buffer)

  const inputMime = options.originalMimeType.toLowerCase()
  const isGif = inputMime === 'image/gif'

  // GIFs may be animated — pass through without Sharp processing
  if (isGif && !options.forceJpeg) {
    if (buffer.byteLength > META_IMAGE_HARD_MAX_BYTES)
      throw new Error('Image exceeds Meta 30MB limit')
    return {
      data: buffer,
      mimeType: 'image/gif',
      width: metadata.width!,
      height: metadata.height!,
      normalized: false,
      originalMimeType: inputMime,
      convertedToJpeg: false,
    }
  }

  const needsAlphaFlatten = metadata.hasAlpha === true
  const needsColorSpaceFix = metadata.space !== 'srgb' && metadata.space !== 'rgb'
  const isWebP = inputMime === 'image/webp'
  const isPng = inputMime === 'image/png'
  const forceJpeg = options.forceJpeg === true
  const outputJpeg = forceJpeg || isWebP || needsAlphaFlatten || needsColorSpaceFix || !(isPng)

  const maxW = options.maxWidth ?? 4096
  const maxH = options.maxHeight ?? 4096

  let pipeline = sharp(buffer)
    .rotate() // EXIF orientation
    .toColorspace('srgb')

  if (needsAlphaFlatten || outputJpeg) {
    pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } })
  }

  pipeline = pipeline.resize({
    width: maxW,
    height: maxH,
    fit: 'inside',
    withoutEnlargement: true,
  })

  if (outputJpeg) {
    pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true })
  }
  else {
    pipeline = pipeline.png({ compressionLevel: 9 })
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })

  if (data.byteLength > META_IMAGE_HARD_MAX_BYTES)
    throw new Error('Normalized image still exceeds Meta 30MB limit')

  // If still over recommended, try lower quality JPEG
  let finalData = data
  if (data.byteLength > META_IMAGE_RECOMMENDED_MAX_BYTES && outputJpeg) {
    const reduced = await sharp(buffer)
      .rotate()
      .toColorspace('srgb')
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize({ width: maxW, height: maxH, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75, mozjpeg: true })
      .toBuffer()
    if (reduced.byteLength < data.byteLength)
      finalData = reduced
  }

  return {
    data: Buffer.from(finalData),
    mimeType: outputJpeg ? 'image/jpeg' : 'image/png',
    width: info.width,
    height: info.height,
    normalized: true,
    originalMimeType: inputMime,
    convertedToJpeg: outputJpeg,
  }
}

/**
 * Quick probe: returns dimensions + whether normalization is needed.
 * Does not transform the image.
 */
export async function shouldNormalizeForMeta(
  buffer: Buffer,
  mimeType: string,
): Promise<{ needsNormalization: boolean, width: number, height: number, reason: string | null }> {
  try {
    const { metadata } = await probeImage(buffer)
    const mime = mimeType.toLowerCase()
    const reasons: string[] = []

    if (metadata.hasAlpha) reasons.push('alpha_channel')
    if (metadata.space !== 'srgb' && metadata.space !== 'rgb') reasons.push('color_space')
    if (metadata.orientation && metadata.orientation > 1) reasons.push('exif_orientation')
    if (mime === 'image/webp') reasons.push('webp_format')
    if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/gif') reasons.push('unsupported_format')

    return {
      needsNormalization: reasons.length > 0,
      width: metadata.width!,
      height: metadata.height!,
      reason: reasons.length ? reasons.join(', ') : null,
    }
  }
  catch {
    return { needsNormalization: true, width: 0, height: 0, reason: 'probe_failed' }
  }
}
