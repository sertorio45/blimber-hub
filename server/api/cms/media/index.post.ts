import type { CmsItem } from '~/lib/cms/contracts'
import type { MediaUploadResult } from '~/server/utils/media/service'

import { readMultipartFormData } from 'h3'

import { cmsError, requireCmsMediaContext, withCmsErrors } from '~/server/utils/media/cms-adapter'
import { uploadAsset } from '~/server/utils/media/service'

type CmsUploadResponse = CmsItem<MediaUploadResult['asset']> & { meta: MediaUploadResult['meta'] }

/** Multipart upload (`file` field). Tenant and purpose are fixed server-side. */
export default defineEventHandler(async (event): Promise<CmsUploadResponse> => withCmsErrors(async () => {
  const ctx = await requireCmsMediaContext(event, 'upload')

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(part => part.name === 'file')
  if (!filePart?.data?.length)
    throw cmsError(400, 'validation_failed', 'Envie um arquivo no campo "file"')

  const result = await uploadAsset(ctx, {
    filename: filePart.filename || 'upload',
    data: filePart.data,
    type: filePart.type ?? null,
  }, {
    purpose: 'reference',
  })

  return { data: result.asset, meta: result.meta }
}))
