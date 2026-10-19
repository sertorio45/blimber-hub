import type { CmsBlock } from '~/lib/cms/contracts'

import { CMS_LIMITS } from '~/lib/cms/contracts'

import { getBlockDefinition } from './registry'

export type CmsBlockIssueCode
  = | 'unknown_block'
    | 'invalid_version'
    | 'invalid_props'
    | 'children_not_allowed'
    | 'max_depth'
    | 'max_blocks'

export interface CmsBlockValidationIssue {
  path: Array<string | number>
  code: CmsBlockIssueCode
  message: string
}

/**
 * Validates a page block tree against the registry.
 * Depth starts at 1 for the document root and stops at `CMS_LIMITS.maxBlockDepth`.
 * Unknown types are reported and their children are not walked.
 */
export function validatePageBlocks(blocks: unknown): CmsBlockValidationIssue[] {
  if (blocks == null)
    return []
  if (!Array.isArray(blocks)) {
    return [{
      path: ['blocks'],
      code: 'invalid_props',
      message: 'Os blocos da página precisam ser uma lista.',
    }]
  }

  const issues: CmsBlockValidationIssue[] = []
  let count = 0
  let stop = false

  function walk(items: unknown[], depth: number, path: Array<string | number>) {
    if (stop)
      return
    if (depth > CMS_LIMITS.maxBlockDepth) {
      issues.push({
        path,
        code: 'max_depth',
        message: `Os blocos passam de ${CMS_LIMITS.maxBlockDepth} níveis.`,
      })
      return
    }

    for (let index = 0; index < items.length; index++) {
      if (stop)
        return
      const item = items[index]
      const itemPath = [...path, index]
      count++
      if (count > CMS_LIMITS.maxBlocksPerDocument) {
        issues.push({
          path: itemPath,
          code: 'max_blocks',
          message: 'O conteúdo tem blocos demais.',
        })
        stop = true
        return
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        issues.push({ path: itemPath, code: 'invalid_props', message: 'Bloco inválido.' })
        continue
      }

      const block = item as Partial<CmsBlock>
      const type = typeof block.type === 'string' ? block.type : ''
      const definition = type ? getBlockDefinition(type) : undefined
      if (!definition) {
        issues.push({
          path: [...itemPath, 'type'],
          code: 'unknown_block',
          message: type ? `Tipo de bloco desconhecido: ${type}.` : 'Tipo de bloco ausente.',
        })
        continue
      }

      if (block.version !== definition.version) {
        issues.push({
          path: [...itemPath, 'version'],
          code: 'invalid_version',
          message: `A versão do bloco ${definition.label} não é suportada.`,
        })
      }

      if (!definition.propsSchema.safeParse(block.props ?? {}).success) {
        issues.push({
          path: [...itemPath, 'props'],
          code: 'invalid_props',
          message: `Revise as propriedades do bloco ${definition.label}.`,
        })
      }

      const children = block.children
      if (children == null)
        continue
      if (!Array.isArray(children)) {
        issues.push({
          path: [...itemPath, 'children'],
          code: 'invalid_props',
          message: 'Os blocos filhos precisam ser uma lista.',
        })
        continue
      }
      if (!children.length)
        continue

      const tooDeep = depth >= definition.maxDepth
      if (!definition.acceptsChildren || tooDeep) {
        issues.push({
          path: [...itemPath, 'children'],
          code: tooDeep && definition.acceptsChildren ? 'max_depth' : 'children_not_allowed',
          message: definition.acceptsChildren
            ? `A seção não pode ter blocos além do nível ${definition.maxDepth}.`
            : `O bloco ${definition.label} não pode conter outros blocos.`,
        })
        continue
      }

      walk(children, depth + 1, [...itemPath, 'children'])
    }
  }

  walk(blocks, 1, ['blocks'])
  return issues
}
