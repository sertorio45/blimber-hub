import { defineEventHandler, readBody } from 'h3'
import {
  optionalStringArray,
  parseConfirmTrue,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalBool,
  optionalString,
} from '~/server/utils/meta-gpt-api'

/** Atualiza Brand Center (dryRun default true). */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_update_brand', {
    tenantId: optionalString(body.tenantId),
    toneOfVoice: optionalString(body.toneOfVoice),
    audience: optionalString(body.audience),
    allowedWords: optionalStringArray(body.allowedWords),
    forbiddenWords: optionalStringArray(body.forbiddenWords),
    ctas: optionalStringArray(body.ctas),
    hashtags: optionalStringArray(body.hashtags),
    restrictions: optionalString(body.restrictions),
    legalNotes: optionalString(body.legalNotes),
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: parseConfirmTrue(body.confirm),
    dryRun: optionalBool(body.dryRun),
  })
})
