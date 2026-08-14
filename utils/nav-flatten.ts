import type { NavLink } from '~/types/nav'

interface NavTreeNode {
  link?: string
  defaultExpanded?: boolean
  children?: NavTreeNode[]
}

/**
 * Flatten nested MVP folders into sidebar items.
 * Groups with `keepGroup` stay collapsible (children are not promoted).
 */
export function flattenModuleNavItems(children: NavLink[] = []): NavLink[] {
  const items: NavLink[] = []
  for (const child of children) {
    if (child.children?.length) {
      if (child.keepGroup) {
        items.push(child)
        continue
      }
      items.push(...flattenModuleNavItems(child.children))
      continue
    }
    if (child.link)
      items.push(child)
  }
  return items
}

/** True when `path` is the nav link or a nested path under it. */
export function navPathMatchesLink(path: string, link: string): boolean {
  return path === link || path.startsWith(`${link}/`)
}

/** True when the current path belongs to the group index or any descendant link. */
export function isNavGroupActive(item: NavTreeNode, path: string): boolean {
  if (item.link && navPathMatchesLink(path, item.link))
    return true
  return (item.children ?? []).some(child => isNavGroupActive(child, path))
}

/**
 * Collapsible open state: always open on an active child route.
 * `defaultExpanded: false` stays closed otherwise (Marketing Ads / Configurações).
 * Other groups keep the small-folder heuristic (open when there are 6 or fewer children).
 */
export function resolveNavGroupOpen(item: NavTreeNode, path: string): boolean {
  if (isNavGroupActive(item, path))
    return true
  if (item.defaultExpanded === false)
    return false
  return (item.children?.length || 0) <= 6
}
