/**
 * ads.meta namespace: thin aliases over lib/meta-ads (no duplicate Graph logic).
 */

import {
  formatToolError,
  invokeMetaTool,
  META_TOOL_DESCRIPTIONS,
  type MetaToolContext,
  type MetaToolName,
} from '../../meta-ads'
import type { BlimberMcpToolDescriptor } from '../types'

/** Prefix used in the unified registry / invoke surface. */
export const ADS_META_TOOL_PREFIX = 'ads_meta_'

export function toAdsMetaToolName(metaName: MetaToolName): string {
  return `${ADS_META_TOOL_PREFIX}${metaName.replace(/^meta_/, '')}`
}

export function fromAdsMetaToolName(name: string): MetaToolName | null {
  if (name in META_TOOL_DESCRIPTIONS)
    return name as MetaToolName

  if (name.startsWith(ADS_META_TOOL_PREFIX)) {
    const suffix = name.slice(ADS_META_TOOL_PREFIX.length)
    const legacy = `meta_${suffix}` as MetaToolName
    if (legacy in META_TOOL_DESCRIPTIONS)
      return legacy
  }

  return null
}

export function listAdsMetaAliasDescriptors(): BlimberMcpToolDescriptor[] {
  return (Object.keys(META_TOOL_DESCRIPTIONS) as MetaToolName[]).map((name) => {
    const alias = toAdsMetaToolName(name)
    return {
      name: alias,
      domain: 'ads.meta' as const,
      description: META_TOOL_DESCRIPTIONS[name],
      status: 'alias' as const,
      aliasOf: name,
      httpPath: '/api/gpt/meta/*',
      notes: 'Alias unificado → lib/meta-ads. HTTP REST continua em /api/gpt/meta/*.',
    }
  })
}

export async function invokeAdsMetaTool(
  name: string,
  ctx: MetaToolContext,
  args: unknown,
) {
  const metaName = fromAdsMetaToolName(name)
  if (!metaName) {
    return formatToolError(new Error(`Tool Meta desconhecida: ${name}`))
  }
  try {
    const data = await invokeMetaTool(metaName, ctx, args)
    return { ok: true as const, tool: metaName, alias: name, data }
  }
  catch (error) {
    return formatToolError(error)
  }
}
