/**
 * Editor sessions register a reset here. Switching company aborts in-flight
 * requests and calls every reset so a dirty form is never flushed into the
 * next tenant.
 */
const sessionResets = new Set<() => void>()

export function onCmsTenantReset(handler: () => void): () => void {
  sessionResets.add(handler)
  return () => {
    sessionResets.delete(handler)
  }
}

export function resetCmsSessions(): void {
  for (const reset of sessionResets)
    reset()
}
