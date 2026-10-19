import type { CmsBlock } from '~/lib/cms/contracts'

import { CMS_LIMITS } from '~/lib/cms/contracts'

import { getBlockDefinition } from './registry'

export interface CmsBlockLocation {
  block: CmsBlock
  parent: CmsBlock | null
  siblings: CmsBlock[]
  index: number
  depth: number
}

export function createBlockId(): string {
  return crypto.randomUUID()
}

export function createBlock(type: string): CmsBlock {
  const definition = getBlockDefinition(type)
  if (!definition)
    throw new Error(`Unknown CMS block type: ${type}`)
  const block: CmsBlock = {
    id: createBlockId(),
    type: definition.id,
    version: definition.version,
    props: structuredClone(definition.defaults),
  }
  if (definition.acceptsChildren)
    block.children = []
  return block
}

export function blockLabel(block: CmsBlock): string {
  const definition = getBlockDefinition(block.type)
  const custom = block.type === 'section' && typeof block.props.label === 'string'
    ? block.props.label.trim()
    : ''
  return custom || definition?.label || block.type
}

export function countBlocks(blocks: CmsBlock[]): number {
  return blocks.reduce((total, block) => total + 1 + countBlocks(block.children ?? []), 0)
}

export function canAcceptChildren(block: CmsBlock, depth: number): boolean {
  const definition = getBlockDefinition(block.type)
  if (!definition?.acceptsChildren)
    return false
  return depth < definition.maxDepth && depth < CMS_LIMITS.maxBlockDepth
}

export function findBlock(
  blocks: CmsBlock[],
  id: string,
  parent: CmsBlock | null = null,
  depth = 1,
): CmsBlockLocation | null {
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]
    if (!block)
      continue
    if (block.id === id)
      return { block, parent, siblings: blocks, index, depth }
    if (block.children?.length) {
      const found = findBlock(block.children, id, block, depth + 1)
      if (found)
        return found
    }
  }
  return null
}

export function siblingId(blocks: CmsBlock[], id: string, direction: -1 | 1): string | null {
  const found = findBlock(blocks, id)
  if (!found)
    return null
  return found.siblings[found.index + direction]?.id ?? id
}

function mapBlocks(blocks: CmsBlock[], id: string, mapper: (block: CmsBlock) => CmsBlock): CmsBlock[] {
  return blocks.map((block) => {
    if (block.id === id)
      return mapper(block)
    if (!block.children?.length)
      return block
    return { ...block, children: mapBlocks(block.children, id, mapper) }
  })
}

function replaceChildren(blocks: CmsBlock[], parentId: string, children: CmsBlock[]): CmsBlock[] {
  return mapBlocks(blocks, parentId, parent => ({ ...parent, children }))
}

export function updateBlockProps(blocks: CmsBlock[], id: string, props: Record<string, unknown>): CmsBlock[] {
  return mapBlocks(blocks, id, block => ({ ...block, props }))
}

export function insertBlock(
  blocks: CmsBlock[],
  block: CmsBlock,
  parentId: string | null,
  index: number,
): CmsBlock[] {
  if (!parentId) {
    const next = blocks.slice()
    const at = Math.min(Math.max(index, 0), next.length)
    next.splice(at, 0, block)
    return next
  }
  return mapBlocks(blocks, parentId, (parent) => {
    const children = (parent.children ?? []).slice()
    const at = Math.min(Math.max(index, 0), children.length)
    children.splice(at, 0, block)
    return { ...parent, children }
  })
}

export function removeBlock(blocks: CmsBlock[], id: string): CmsBlock[] {
  const found = findBlock(blocks, id)
  if (!found)
    return blocks
  const siblings = found.siblings.filter(block => block.id !== id)
  if (!found.parent)
    return siblings
  return replaceChildren(blocks, found.parent.id, siblings)
}

export function moveBlock(blocks: CmsBlock[], id: string, direction: -1 | 1): CmsBlock[] {
  const found = findBlock(blocks, id)
  if (!found)
    return blocks
  const nextIndex = found.index + direction
  if (nextIndex < 0 || nextIndex >= found.siblings.length)
    return blocks
  const siblings = found.siblings.slice()
  const [item] = siblings.splice(found.index, 1)
  if (!item)
    return blocks
  siblings.splice(nextIndex, 0, item)
  if (!found.parent)
    return siblings
  return replaceChildren(blocks, found.parent.id, siblings)
}

function cloneWithNewIds(block: CmsBlock): CmsBlock {
  return {
    ...block,
    id: createBlockId(),
    props: structuredClone(block.props),
    children: block.children?.map(cloneWithNewIds),
  }
}

/** Deep-copies a section (and its children) with fresh ids, placed just after the original. */
export function duplicateSection(blocks: CmsBlock[], id: string): CmsBlock[] {
  const found = findBlock(blocks, id)
  if (!found)
    return blocks
  const definition = getBlockDefinition(found.block.type)
  if (!definition?.acceptsChildren)
    return blocks
  return insertBlock(blocks, cloneWithNewIds(found.block), found.parent?.id ?? null, found.index + 1)
}

export interface CmsInsertionTarget {
  parentId: string | null
  index: number
}

/** Selected section receives the new block when it can still nest; otherwise it becomes a sibling. */
export function insertionTarget(blocks: CmsBlock[], selectedId: string | null): CmsInsertionTarget {
  if (!selectedId)
    return { parentId: null, index: blocks.length }
  const found = findBlock(blocks, selectedId)
  if (!found)
    return { parentId: null, index: blocks.length }
  if (canAcceptChildren(found.block, found.depth))
    return { parentId: found.block.id, index: found.block.children?.length ?? 0 }
  return { parentId: found.parent?.id ?? null, index: found.index + 1 }
}
