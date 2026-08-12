import { defineEventHandler, getRouterParam } from 'h3'
import { runMarketingDeleteAsset } from '~/server/utils/blimber-gpt-api'

/** Remove 1 mídia da Biblioteca (POST alias — confiável para ChatGPT Actions). */
export default defineEventHandler(async (event) => {
  return runMarketingDeleteAsset(event, getRouterParam(event, 'assetId'))
})
