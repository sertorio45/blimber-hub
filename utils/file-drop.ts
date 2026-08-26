export type MediaFileAcceptKind = 'publication' | 'reference'

/** True when the drag payload includes filesystem files (not text/html links alone). */
export function hasFileDragPayload(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  if (!types)
    return false
  return Array.from(types).includes('Files')
}

/**
 * Accept rules shared by media library and social post form:
 * - publication: images + MP4/MOV
 * - reference: images + MP4/MOV + PDF
 */
export function isAcceptedMediaFile(file: File, kind: MediaFileAcceptKind): boolean {
  const mime = (file.type || '').toLowerCase()
  if (mime.startsWith('image/'))
    return true
  if (mime === 'video/mp4' || mime === 'video/quicktime')
    return true
  if (kind === 'reference' && mime === 'application/pdf')
    return true

  // Some OS/browsers omit MIME — fall back to extension.
  const name = file.name.toLowerCase()
  if (/\.(?:jpe?g|png|gif|webp|svg|heic|heif|avif|bmp)$/i.test(name))
    return true
  if (/\.(?:mp4|mov)$/i.test(name))
    return true
  if (kind === 'reference' && name.endsWith('.pdf'))
    return true
  return false
}

export function mediaFileAcceptAttr(kind: MediaFileAcceptKind): string {
  return kind === 'publication'
    ? 'image/*,video/mp4,video/quicktime'
    : 'image/*,video/mp4,video/quicktime,application/pdf'
}

export function mediaFileRejectMessage(kind: MediaFileAcceptKind): string {
  return kind === 'publication'
    ? 'Use imagens ou vídeos (MP4/MOV) para peças finais'
    : 'Formato não suportado. Use imagem, vídeo (MP4/MOV) ou PDF'
}
