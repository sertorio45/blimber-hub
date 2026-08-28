import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | null = null

function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const url = process.env.SUPABASE_URL || ''
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return adminClient
}

export async function broadcastWhatsAppEvent(
  tenantId: string,
  event: 'message' | 'conversation' | 'instance',
  payload: Record<string, unknown>,
): Promise<void> {
  if (!tenantId)
    return

  const supabase = getAdminClient()
  const channelName = `whatsapp:tenant:${tenantId}`

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled)
        return
      settled = true
      resolve()
    }

    const channel = supabase.channel(channelName)
    const timeout = setTimeout(() => {
      supabase.removeChannel(channel)
      finish()
    }, 4000)

    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED')
        return

      try {
        await channel.send({
          type: 'broadcast',
          event,
          payload,
        })
      }
      catch (error) {
        console.warn('[WhatsApp] Realtime broadcast failed:', error)
      }
      finally {
        clearTimeout(timeout)
        supabase.removeChannel(channel)
        finish()
      }
    })
  })
}
