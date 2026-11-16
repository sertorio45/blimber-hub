import { createError, getHeader, readMultipartFormData } from 'h3'

import { resolveWhatsAppTenantContext } from '~/server/utils/whatsapp/context'
import { uploadWhatsAppMediaBase64 } from '~/server/utils/whatsapp/media-storage'
import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  if (!form?.length)
    throw createError({ statusCode: 400, statusMessage: 'Arquivo obrigatório' })

  const filePart = form.find(part => part.name === 'file' && part.data)
  const tenantPart = form.find(part => part.name === 'tenant_id')
  const tenantFromForm = tenantPart?.data ? Buffer.from(tenantPart.data).toString('utf8') : undefined

  const { tenantId } = await resolveWhatsAppTenantContext(event, tenantFromForm)

  if (!filePart?.data?.length)
    throw createError({ statusCode: 400, statusMessage: 'Arquivo obrigatório' })

  const mimeType = filePart.type || getHeader(event, 'content-type') || 'application/octet-stream'
  const fileName = filePart.filename || `upload-${Date.now()}`
  const base64 = Buffer.from(filePart.data).toString('base64')
  const client = serverSupabaseServiceRole(event)

  const uploaded = await uploadWhatsAppMediaBase64(client, {
    tenantId,
    base64,
    mimeType,
    fileName,
  })

  if (!uploaded)
    throw createError({ statusCode: 400, statusMessage: 'Falha no upload da mídia' })

  return {
    url: uploaded.mediaUrl,
    data: {
      url: uploaded.mediaUrl,
      signedUrl: uploaded.mediaUrl,
      mimeType: uploaded.mediaMime,
      fileName: uploaded.fileName,
      objectPath: uploaded.objectPath,
    },
  }
})
