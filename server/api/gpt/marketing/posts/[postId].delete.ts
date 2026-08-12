import { defineEventHandler, getRouterParam } from 'h3'
import { runMarketingDeletePost } from '~/server/utils/blimber-gpt-api'

/**
 * Soft-delete de 1 post editorial. dryRun default true.
 * Prefer POST /posts/{postId}/delete from ChatGPT (DELETE body is often stripped).
 */
export default defineEventHandler(async (event) => {
  return runMarketingDeletePost(event, getRouterParam(event, 'postId'))
})
