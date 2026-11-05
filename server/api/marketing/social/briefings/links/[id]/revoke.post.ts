import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'

import { holdsCapability } from '~/constants/workspace'
import { recordSocialAudit } from '~/server/utils/social-audit'
import { revokeBriefingLink } from '~/server/utils/social-briefing-links'
import { requireSocialContext } from '~/server/utils/social-context'

const schema = z.object({
  tenant_id: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  const linkId = String(getRouterParam(event, 'id'))
  const input = schema.parse(await readBody(event) || {})
  const { client, tenantId, user, workspace, isPlatformStaff } = await requireSocialContext(
    event,
    'marketing.social.briefing.manage',
    input.tenant_id,
  )

  if (
    !isPlatformStaff
    && !holdsCapability(workspace.capabilities, 'marketing.social.briefing.manage')
    && !holdsCapability(workspace.capabilities, 'marketing.social.manage')
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Sem permissão para excluir link de briefing' })
  }

  const result = await revokeBriefingLink(client, {
    tenantId,
    linkId,
  })

  await recordSocialAudit(event, client, {
    tenantId,
    actorId: user.id,
    action: 'briefing_link.revoked',
    entityType: 'social_briefing_link',
    entityId: linkId,
    after: { revoked: true },
  })

  return { data: result }
})
