import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'

import { ACCEPTED_TENANT_MODULE_INPUT_NAMES, LEGACY_MODULE_ALIASES } from '~/constants/modules'
import { assertAgencyOrganization } from '~/server/utils/agency-ops'
import { recordAuditEvent } from '~/server/utils/audit-events'
import { inviteOrLinkAuthUserByEmail, resolveAuthRedirectOrigin } from '~/server/utils/auth-invite'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'

const paramsSchema = z.object({
  id: z.string().uuid(),
  onboardingId: z.string().uuid(),
})

const schema = z.object({
  tenantMode: z.enum(['create', 'select']).default('create'),
  tenantId: z.string().uuid().optional(),
  tenantName: z.string().trim().min(2).max(160).optional(),
  tenantSlug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
  logoUrl: z.string().url().nullable().optional(),
  internalOwnerUserId: z.string().uuid().nullable().optional(),
  modules: z.array(z.enum(ACCEPTED_TENANT_MODULE_INPUT_NAMES))
    .default(['marketing'])
    .transform(modules => [...new Set(modules.map(name => LEGACY_MODULE_ALIASES[name] ?? name))]),
  agencyOwnerMembershipIds: z.array(z.string().uuid()).default([]),
  clientInvite: z.object({
    email: z.string().email(),
    name: z.string().trim().min(1).max(120).optional(),
  }),
  approvalFlow: z.object({
    policy: z.string().trim().max(80).optional(),
    minimumApprovals: z.number().int().min(1).max(10).optional(),
    requireInternal: z.boolean().optional(),
    requireClient: z.boolean().optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
}).superRefine((value, ctx) => {
  if (value.tenantMode === 'select' && !value.tenantId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione um tenant existente', path: ['tenantId'] })
  }
  if (value.tenantMode === 'create' && (!value.tenantName || !value.tenantSlug)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe nome e slug do tenant', path: ['tenantName'] })
  }
})

/**
 * Completes onboarding through the transactional RPC, then applies invites and
 * team assignments outside the DB function (auth.admin cannot run in SQL).
 */
export default defineEventHandler(async (event) => {
  const params = paramsSchema.parse({
    id: getRouterParam(event, 'id'),
    onboardingId: getRouterParam(event, 'onboardingId'),
  })
  const input = schema.parse(await readBody(event))

  const context = await requireWorkspaceContext(event, {
    organizationId: params.id,
    capability: 'agency.clients.manage',
  })

  assertAgencyOrganization(context)

  const { data: onboarding } = await context.client
    .from('agency_client_onboardings')
    .select('*')
    .eq('id', params.onboardingId)
    .eq('organization_id', params.id)
    .maybeSingle()

  if (!onboarding)
    throw createError({ statusCode: 404, statusMessage: 'Onboarding não encontrado' })

  if (onboarding.status === 'completed') {
    return { data: { tenant_id: onboarding.tenant_id, onboarding } }
  }

  // Block duplicate display names within this agency's portfolio (create mode).
  if (input.tenantMode === 'create' && input.tenantName) {
    const normalizedName = input.tenantName.trim().toLowerCase()
    const { data: links } = await context.client
      .from('organization_tenants')
      .select('tenant_id, tenant:tenant_id (id, name)')
      .eq('organization_id', params.id)
      .eq('is_active', true)

    const duplicate = (links || []).find((row: any) => {
      const name = String(row.tenant?.name || '').trim().toLowerCase()
      return name && name === normalizedName
    })

    if (duplicate) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Já existe uma empresa com este nome na carteira da agência',
      })
    }
  }

  const payload = {
    ...(onboarding.payload || {}),
    ...input,
  }

  await context.client
    .from('agency_client_onboardings')
    .update({
      status: 'in_progress',
      current_step: 'review',
      payload,
      error_message: null,
    })
    .eq('id', params.onboardingId)

  const { data: tenantId, error: provisionError } = await context.client.rpc(
    'provision_agency_client',
    {
      p_organization_id: params.id,
      p_onboarding_id: params.onboardingId,
      p_actor_id: context.userId,
      p_tenant_id: input.tenantMode === 'select' ? input.tenantId : null,
      p_tenant_name: input.tenantName ?? null,
      p_tenant_slug: input.tenantSlug ?? null,
      p_display_name: input.displayName ?? input.tenantName ?? null,
      p_logo_url: input.logoUrl ?? null,
      p_internal_owner_user_id: input.internalOwnerUserId ?? null,
      p_modules: input.modules,
      p_metadata: {
        ...(input.metadata || {}),
        approval_flow: input.approvalFlow || null,
        social_connect: (onboarding.payload as any)?.social_connect || null,
      },
    },
  )

  if (provisionError || !tenantId) {
    await context.client
      .from('agency_client_onboardings')
      .update({
        status: 'failed',
        error_message: provisionError?.message || 'Falha ao provisionar',
      })
      .eq('id', params.onboardingId)

    throw createError({
      statusCode: 400,
      statusMessage: provisionError?.message || 'Falha ao provisionar cliente',
    })
  }

  const resolvedTenantId = String(tenantId)

  // Assign selected agency memberships to the new client.
  if (input.agencyOwnerMembershipIds.length) {
    for (const membershipId of input.agencyOwnerMembershipIds) {
      await context.client
        .from('organization_member_tenants')
        .upsert({
          organization_membership_id: membershipId,
          tenant_id: resolvedTenantId,
          is_active: true,
          created_by: context.userId,
        }, { onConflict: 'organization_membership_id,tenant_id' })
    }
  }

  const email = input.clientInvite.email.trim().toLowerCase()
  const displayName = input.clientInvite.name || email.split('@')[0]
  const siteUrl = resolveAuthRedirectOrigin(event)

  // Supabase Auth default invite email (Invite User template via inviteUserByEmail).
  // Landing: /confirm exchanges the token, then /invite asks for the first password.
  const invite = await inviteOrLinkAuthUserByEmail(context.client, {
    email,
    name: displayName,
    redirectTo: `${siteUrl}/confirm?flow=invite`,
  })

  await context.client
    .from('user_tenant_role')
    .upsert({
      user_id: invite.userId,
      tenant_id: resolvedTenantId,
      role: 'cliente',
    }, { onConflict: 'user_id,tenant_id' })

  const inviteResult = {
    email: invite.email,
    invite_sent: invite.invite_sent,
    existing_user: invite.existing_user,
  }

  const { data: refreshed } = await context.client
    .from('agency_client_onboardings')
    .select('*')
    .eq('id', params.onboardingId)
    .single()

  await recordAuditEvent(event, context.client, {
    tenantId: resolvedTenantId,
    organizationId: params.id,
    actorId: context.userId,
    action: 'agency.onboarding.complete',
    entityType: 'agency_client_onboarding',
    entityId: params.onboardingId,
    after: {
      tenant_id: resolvedTenantId,
      modules: input.modules,
      invite_email: inviteResult.email,
      invite_sent: inviteResult.invite_sent,
    },
  })

  return {
    data: {
      tenant_id: resolvedTenantId,
      onboarding: refreshed,
      invite: {
        email: inviteResult.email,
        invite_sent: inviteResult.invite_sent,
        existing_user: inviteResult.existing_user,
      },
    },
  }
})
