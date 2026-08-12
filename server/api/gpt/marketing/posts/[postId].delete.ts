import { defineEventHandler, getRouterParam } from 'h3'
import {
  buildMarketingDeletePostArgs,
  readGptMutationBody,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Soft-delete de 1 post editorial. dryRun default true. */
export default defineEventHandler(async (event) => {
  const payload = await readGptMutationBody(event)
  return runMarketingGptTool(
    event,
    'marketing_delete_post',
    buildMarketingDeletePostArgs(getRouterParam(event, 'postId'), payload),
  )
})
