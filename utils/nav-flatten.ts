import type { NavLink } from '~/types/nav'

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
