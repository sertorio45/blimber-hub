/**
 * Google Ads stub — documented namespace for future ads.google.* tools.
 */

import { z } from 'zod'
import { BlimberMcpToolError } from '../errors'
import type { BlimberMcpToolDescriptor } from '../types'

export const adsGoogleStatusSchema = z.object({
  tenantId: z.string().uuid().optional(),
})

export const ADS_GOOGLE_TOOL_DESCRIPTORS: BlimberMcpToolDescriptor[] = [
  {
    name: 'ads_google_status',
    domain: 'ads.google',
    description: 'Stub: status do adapter Google Ads (ainda não implementado).',
    status: 'stub',
    httpPath: '/api/gpt/ads/google/status',
    httpMethod: 'GET',
    arguments: ['tenantId?'],
    notes: 'Coming soon — não cria campanhas nem conecta OAuth Google Ads nesta fase.',
  },
]

export async function adsGoogleStatus(_args: unknown) {
  adsGoogleStatusSchema.parse(_args ?? {})
  return {
    ok: true as const,
    provider: 'google_ads' as const,
    status: 'coming_soon' as const,
    tools: [] as string[],
    message: 'Google Ads ainda não está disponível no MCP Blimber. Use ads.meta (Meta) por enquanto.',
  }
}

export async function invokeAdsGoogleTool(name: string, args: unknown) {
  if (name === 'ads_google_status')
    return adsGoogleStatus(args)

  throw new BlimberMcpToolError(
    'NOT_IMPLEMENTED',
    `Tool Google Ads não implementada: ${name}`,
    501,
  )
}
