import { beforeEach, describe, expect, it, vi } from 'vitest'

const upsertWhatsappAttribution = vi.fn(async (_client: unknown, _input: Record<string, any>) => null)
const upsertConversation = vi.fn(async (_client: unknown, _params: Record<string, any>) => 'conversation-1')
const broadcast = vi.fn(async () => {})

vi.mock('~/server/utils/whatsapp/ctwa-attribution', async () => {
  const actual = await vi.importActual<typeof import('~/server/utils/whatsapp/ctwa-attribution')>(
    '~/server/utils/whatsapp/ctwa-attribution',
  )
  return { ...actual, upsertWhatsappAttribution }
})

vi.mock('~/server/utils/whatsapp/conversation-utils', async () => {
  const actual = await vi.importActual<typeof import('~/server/utils/whatsapp/conversation-utils')>(
    '~/server/utils/whatsapp/conversation-utils',
  )
  return { ...actual, findOrUpsertWhatsAppConversation: upsertConversation }
})

vi.mock('~/server/utils/whatsapp/realtime-broadcast', () => ({
  broadcastWhatsAppEvent: broadcast,
}))

vi.mock('~/server/utils/whatsapp/conversation-agent', () => ({
  conversationHasActiveAgent: vi.fn(async () => false),
  dispatchConversationAgentReply: vi.fn(async () => {}),
}))

vi.mock('~/server/utils/whatsapp/flow-dispatcher', () => ({
  dispatchWhatsAppFlows: vi.fn(async () => {}),
}))

const { processCloudWebhook } = await import('~/server/utils/whatsapp/webhook-processor')

const insertedMessages: Record<string, any>[] = []
const existingExternalIds = new Set<string>()

/** Minimal Supabase stub covering the tables processCloudWebhook touches. */
function createClient() {
  return {
    from(table: string) {
      if (table === 'whatsapp_message') {
        const filters: Record<string, string> = {}
        const builder: any = {
          select: () => builder,
          eq: (column: string, value: string) => {
            filters[column] = value
            return builder
          },
          maybeSingle: async () => ({
            data: existingExternalIds.has(filters.external_id) ? { id: 'existing' } : null,
          }),
          insert: (row: Record<string, any>) => {
            insertedMessages.push(row)
            existingExternalIds.add(String(row.external_id))
            return {
              select: () => ({ single: async () => ({ data: { ...row, id: `msg-${insertedMessages.length}` } }) }),
            }
          },
          update: () => builder,
        }
        return builder
      }

      if (table === 'whatsapp_contact') {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: { id: 'contact-1' } }),
          insert: () => ({
            select: () => ({ single: async () => ({ data: { id: 'contact-1' }, error: null }) }),
          }),
        }
        return builder
      }

      const noop: any = {
        select: () => noop,
        eq: () => noop,
        maybeSingle: async () => ({ data: null }),
        insert: () => ({ select: () => ({ single: async () => ({ data: null }) }) }),
        update: () => noop,
      }
      return noop
    },
  } as any
}

function buildCloudMessage(id: string, referral?: Record<string, unknown>) {
  return {
    from: '5511987654321',
    id,
    timestamp: '1787000000',
    type: 'text',
    text: { body: 'Olá, vi o anúncio' },
    ...(referral ? { referral } : {}),
  }
}

const instance = { id: 'instance-1', tenant_id: 'tenant-1' }

describe('processCloudWebhook', () => {
  beforeEach(() => {
    insertedMessages.length = 0
    existingExternalIds.clear()
    upsertWhatsappAttribution.mockClear()
    upsertConversation.mockClear()
  })

  it('captures CTWA referral with the WABA id from entry.id', async () => {
    const result = await processCloudWebhook(createClient(), instance, {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '987654321098765',
          changes: [
            {
              value: {
                metadata: { phone_number_id: '111222333' },
                contacts: [{ profile: { name: 'Maria' } }],
                messages: [
                  buildCloudMessage('wamid.1', {
                    source_url: 'https://fb.me/x',
                    source_id: 'ad_123',
                    source_type: 'ad',
                    headline: 'Promo',
                    body: 'Fale conosco',
                    ctwa_clid: 'clid_real_1',
                  }),
                ],
              },
            },
          ],
        },
      ],
    })

    expect(result).toEqual({ handled: true, type: 'message' })
    expect(upsertWhatsappAttribution).toHaveBeenCalledTimes(1)

    const call = upsertWhatsappAttribution.mock.calls[0][1]
    expect(call.wabaId).toBe('987654321098765')
    expect(call.referral.ctwaClid).toBe('clid_real_1')
    expect(call.referral.sourceId).toBe('ad_123')
    expect(insertedMessages[0].metadata).toEqual({
      ctwa: {
        ctwa_clid: 'clid_real_1',
        source_id: 'ad_123',
        source_type: 'ad',
        headline: 'Promo',
        body: 'Fale conosco',
      },
    })
  })

  it('processes every entry and change in a batched delivery', async () => {
    const result = await processCloudWebhook(createClient(), instance, {
      entry: [
        {
          id: 'waba-a',
          changes: [
            { value: { messages: [buildCloudMessage('wamid.a1')] } },
            { value: { messages: [buildCloudMessage('wamid.a2')] } },
          ],
        },
        {
          id: 'waba-b',
          changes: [{ value: { messages: [buildCloudMessage('wamid.b1')] } }],
        },
      ],
    })

    expect(result.handled).toBe(true)
    expect(insertedMessages.map(m => m.external_id)).toEqual(['wamid.a1', 'wamid.a2', 'wamid.b1'])
  })

  it('skips messages already stored so Meta retries do not duplicate', async () => {
    const client = createClient()
    const payload = {
      entry: [{ id: 'waba-a', changes: [{ value: { messages: [buildCloudMessage('wamid.dup')] } }] }],
    }

    await processCloudWebhook(client, instance, payload)
    await processCloudWebhook(client, instance, payload)

    expect(insertedMessages).toHaveLength(1)
  })

  it('mirrors smb_message_echoes as outbound messages', async () => {
    const result = await processCloudWebhook(createClient(), instance, {
      entry: [
        {
          id: 'waba-a',
          changes: [
            {
              field: 'smb_message_echoes',
              value: {
                metadata: { phone_number_id: '111222333' },
                message_echoes: [
                  {
                    from: '5511999990000',
                    to: '5511987654321',
                    id: 'wamid.echo1',
                    timestamp: '1787000100',
                    type: 'text',
                    text: { body: 'Bom dia, já vou verificar' },
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    expect(result).toEqual({ handled: true, type: 'message' })
    expect(insertedMessages).toHaveLength(1)
    expect(insertedMessages[0]).toMatchObject({
      external_id: 'wamid.echo1',
      from_me: true,
      status: 'sent',
      content: 'Bom dia, já vou verificar',
      remote_jid: '5511987654321@s.whatsapp.net',
      metadata: { source: 'smb_message_echo' },
    })
    // The customer is the recipient on an echo, never the sender.
    expect(upsertConversation.mock.calls[0][1]).toMatchObject({
      contactPhone: '5511987654321',
      fromMe: true,
    })
  })

  it('does not duplicate an echo of a message we already sent', async () => {
    const client = createClient()

    await processCloudWebhook(client, instance, {
      entry: [{ id: 'waba-a', changes: [{ value: { messages: [buildCloudMessage('wamid.shared')] } }] }],
    })

    await processCloudWebhook(client, instance, {
      entry: [
        {
          id: 'waba-a',
          changes: [
            {
              field: 'smb_message_echoes',
              value: {
                message_echoes: [
                  { to: '5511987654321', id: 'wamid.shared', timestamp: '1787000100', type: 'text', text: { body: 'x' } },
                ],
              },
            },
          ],
        },
      ],
    })

    expect(insertedMessages).toHaveLength(1)
  })

  it('ignores deliveries without messages or statuses', async () => {
    const result = await processCloudWebhook(createClient(), instance, {
      entry: [{ id: 'waba-a', changes: [{ value: { metadata: {} } }] }],
    })

    expect(result).toEqual({ handled: false, type: 'ignored' })
  })
})
