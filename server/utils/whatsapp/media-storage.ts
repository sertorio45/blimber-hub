import type { SupabaseClient } from '@supabase/supabase-js'

const WHATSAPP_MEDIA_BUCKET = 'whatsapp-media'

function extensionFromMime(mime: string | null | undefined): string {
  const value = String(mime || '').toLowerCase()
  if (value.includes('jpeg') || value.includes('jpg'))
    return 'jpg'
  if (value.includes('png'))
    return 'png'
  if (value.includes('webp'))
    return 'webp'
  if (value.includes('gif'))
    return 'gif'
  if (value.includes('mp4'))
    return 'mp4'
  if (value.includes('ogg'))
    return 'ogg'
  if (value.includes('mpeg') || value.includes('mp3'))
    return 'mp3'
  if (value.includes('pdf'))
    return 'pdf'
  return 'bin'
}

function stripDataUrl(base64OrDataUrl: string): { base64: string, mime?: string } {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(base64OrDataUrl)
  if (match)
    return { mime: match[1], base64: match[2] }
  return { base64: base64OrDataUrl }
}

export async function uploadWhatsAppMediaBase64(
  client: SupabaseClient,
  params: {
    tenantId: string
    conversationId?: string | null
    externalId?: string | null
    base64: string
    mimeType?: string | null
    fileName?: string | null
  },
): Promise<{ mediaUrl: string, mediaMime: string, fileName: string, objectPath: string } | null> {
  const parsed = stripDataUrl(params.base64)
  const mimeType = params.mimeType || parsed.mime || 'application/octet-stream'
  const ext = extensionFromMime(mimeType)
  const safeName = (params.fileName || `${params.externalId || crypto.randomUUID()}.${ext}`)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
  const objectPath = [
    params.tenantId,
    params.conversationId || 'unassigned',
    `${Date.now()}-${safeName}`,
  ].join('/')

  const buffer = Buffer.from(parsed.base64, 'base64')
  if (!buffer.length)
    return null

  const { error } = await client.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(objectPath, buffer, {
      contentType: mimeType,
      upsert: true,
    })

  if (error)
    throw error

  const { data: signed, error: signError } = await client.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .createSignedUrl(objectPath, 60 * 60 * 24 * 7)

  if (signError || !signed?.signedUrl)
    throw signError || new Error('Failed to sign WhatsApp media URL')

  return {
    mediaUrl: signed.signedUrl,
    mediaMime: mimeType,
    fileName: safeName,
    objectPath,
  }
}
