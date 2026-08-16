/**
 * Shared API-key resolution for Blimber MCP / GPT Actions.
 * Assertion (H3) lives in server/utils/blimber-gpt-auth (re-exports meta-gpt-auth).
 */

export function resolveBlimberMcpApiSecret(): string {
  return process.env.BLIMBER_MCP_API_KEY
    || process.env.MARKETING_WORKER_SECRET
    || ''
}

/**
 * Optional system actor for marketing writes (created_by FK → auth.users).
 * Prefer actorUserId per call; env is a deployment-level fallback.
 * Required only when executing (dryRun=false); preview does not need an actor.
 *
 * For approvePost / editorialStatus on any tenant without org membership,
 * this UUID must be Hub platform staff: `auth.users.app_metadata.role`
 * is `admin` (Superadministrador) or `funcionario` — same as the Hub
 * workspace JWT, never `user_metadata` and never tenant role `cliente`.
 * Any user with that app_metadata role works as actor; a non-staff UUID
 * still needs organization membership + capabilities.
 */
export function resolveMcpActorUserId(explicit?: string | null): string | null {
  const fromArgs = typeof explicit === 'string' ? explicit.trim() : ''
  if (fromArgs)
    return fromArgs
  const fromEnv = (process.env.BLIMBER_MCP_ACTOR_USER_ID || '').trim()
  return fromEnv || null
}
