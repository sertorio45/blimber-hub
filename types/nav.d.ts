export interface NavBase {
  roles?: string[]
  capability?: string
  /** Restricts the item to specific commercial models (agency, direct, platform). */
  organizationTypes?: Array<'platform' | 'agency' | 'direct'>
  /**
   * Who should see the item in the sidebar.
   * - agency: staff / agency ops only
   * - client: end-customer portal only
   * - both / omitted: everyone who passes other gates
   */
  audience?: 'agency' | 'client' | 'both'
  /** Label when the current workspace is the client portal experience. */
  clientTitle?: string
  /**
   * Keep this folder as a collapsible in the flattened module sidebar
   * (e.g. Marketing → Ads) so sibling leaves do not reuse the same labels.
   */
  keepGroup?: boolean
  /**
   * Initial collapsible state when the current route is not inside the group.
   * `false` starts collapsed; omit to keep the small-group heuristic.
   */
  defaultExpanded?: boolean
}

export interface NavLink extends NavBase {
  title: string
  link: string
  icon?: string
  new?: boolean
  /** Optional sidebar chip (e.g. "Em evolução") — distinct from the `new` flag. */
  badge?: string
  children?: NavLink[]
}

export interface NavSectionTitle {
  heading: string
}

export interface NavGroup extends NavBase {
  title: string
  icon?: string
  new?: boolean
  /** Group index route; used to auto-expand when the path is inside this folder. */
  link?: string
  children: NavLink[]
}

export interface NavMenu {
  heading: string
  items: NavMenuItems
}

export declare type NavMenuItems = (NavLink | NavGroup | NavSectionTitle)[]
