import { defineEventHandler, getRouterParam } from 'h3'
import { runMarketingDeletePost } from '~/server/utils/blimber-gpt-api'

/** Soft-delete de 1 post editorial (POST alias — confiável para ChatGPT Actions). */
export default defineEventHandler(async (event) => {
  return runMarketingDeletePost(event, getRouterParam(event, 'postId'))
})
