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
 */
export function resolveMcpActorUserId(explicit?: string | null): string | null {
  const fromArgs = typeof explicit === 'string' ? explicit.trim() : ''
  if (fromArgs)
    return fromArgs
  const fromEnv = (process.env.BLIMBER_MCP_ACTOR_USER_ID || '').trim()
  return fromEnv || null
}
