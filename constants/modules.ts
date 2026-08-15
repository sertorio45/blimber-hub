/**
 * Metadata for modules displayed in the module selector.
 * module_name must match tenant_modules.module_name in the database.
 * Ads is a Marketing subdomain, not a commercial companion tile.
 */
export interface ModuleMeta {
  slug: string
  title: string
  icon: string
  basePath: string
  /** Initial page when entering the module. Falls back to basePath if not set. */
  defaultPath?: string
}

export const MODULE_META: Record<string, ModuleMeta> = {
  crm: {
    slug: 'crm',
    title: 'CRM',
    icon: '/icons/modules/crm/crm.svg',
    basePath: '/crm',
    defaultPath: '/crm/dashboard',
  },
  article: {
    slug: 'article',
    title: 'Articles',
    icon: 'lucide:book-a',
    basePath: '/articles',
  },
  marketing: {
    slug: 'marketing',
    title: 'Marketing',
    icon: '/icons/modules/marketing/marketing.svg',
    basePath: '/marketing',
    defaultPath: '/marketing',
  },
  /**
   * Technical Ads shell metadata (legacy `/ads` basePath).
   * ETAPA 6: Ads is not a commercial product — omitted from
   * `resolveTenantModuleSlugs` / switcher / hub tiles.
   */
  ads: {
    slug: 'ads',
    title: 'Ads',
    icon: 'lucide:circle-dollar-sign',
    basePath: '/ads',
    defaultPath: '/ads',
  },
  whatsapp: {
    slug: 'whatsapp',
    title: 'WhatsApp',
    icon: '/icons/modules/inbox/inbox.svg',
    basePath: '/whatsapp',
    defaultPath: '/whatsapp/dashboard',
  },
}

export const DEFAULT_MODULE_SLUG = 'crm'

/** Bundle row in tenant_modules that grants every module in MODULE_META. */
export const TENANT_MODULE_BUNDLE_ALL = 'all'

/**
 * Modules that can be toggled in admin `tenant_modules`.
 * Ads is omitted: paid media ships inside Marketing, not as a billing row.
 */
export const ASSIGNABLE_MODULE_SLUGS = (
  Object.keys(MODULE_META) as Array<keyof typeof MODULE_META>
).filter(slug => slug !== 'ads')

export const ASSIGNABLE_TENANT_MODULE_NAMES = [
  ...ASSIGNABLE_MODULE_SLUGS,
  TENANT_MODULE_BUNDLE_ALL,
] as const

export type AssignableTenantModuleName = typeof ASSIGNABLE_TENANT_MODULE_NAMES[number]

/** Portuguese labels for admin / onboarding module pickers. */
export const MODULE_LABELS_PT: Record<string, string> = {
  crm: 'CRM',
  article: 'Artigos',
  marketing: 'Marketing',
  ads: 'Ads',
  whatsapp: 'WhatsApp',
  all: 'Todos os módulos',
}

/** Short descriptions shown in module switchers and hub tiles. */
export const MODULE_DESCRIPTIONS_PT: Record<string, string> = {
  crm: 'Funil, contatos e negócios',
  marketing: 'Conteúdo, calendário, Ads e aprovações',
  ads: 'Mídia paga, Meta, Google Ads e Analytics',
  whatsapp: 'Inbox, campanhas e automações',
  article: 'Conteúdo e publicações no CMS',
  all: 'Libera todos os módulos para este cliente',
}

/**
 * Product shells shown in the module switcher and hub tiles.
 * Ads remains in MODULE_META for path/legacy metadata only.
 */
export const COMMERCIAL_MODULE_SLUGS = (
  Object.keys(MODULE_META) as Array<keyof typeof MODULE_META>
).filter(slug => slug !== 'ads')

/**
 * Resolves active commercial product shells for a tenant.
 * Ads is a Marketing subdomain — never a companion tile.
 */
export function resolveTenantModuleSlugs(
  activeModuleNames: string[],
): string[] {
  const catalogSlugs = [...COMMERCIAL_MODULE_SLUGS]

  if (activeModuleNames.includes(TENANT_MODULE_BUNDLE_ALL))
    return catalogSlugs

  return catalogSlugs.filter(slug => activeModuleNames.includes(slug))
}

/**
 * Maps a Hub URL to the commercial module that owns the sidebar.
 * Legacy `/ads*` bookmarks still show the Marketing shell (ETAPA 6).
 */
export function resolveModuleSlugFromPath(path: string): string | null {
  if (path === '/ads' || path.startsWith('/ads/'))
    return 'marketing'

  for (const slug of COMMERCIAL_MODULE_SLUGS) {
    const meta = MODULE_META[slug]
    if (path === meta.basePath || path.startsWith(`${meta.basePath}/`))
      return slug
  }
  return null
}

export function normalizeCommercialModuleSlug(slug: string | null | undefined): string | null {
  if (!slug)
    return null
  if (slug === 'ads')
    return 'marketing'
  return MODULE_META[slug] ? slug : null
}

/**
 * Expands tenant_modules rows to commercial shells (no Ads companion tile).
 * Keeps catalog order from resolveTenantModuleSlugs.
 */
export function expandTenantModuleRows<T extends { module_name: string, is_active?: boolean }>(
  rows: T[],
): Array<T | { id: string, module_name: string, is_active: boolean }> {
  const activeNames = rows
    .filter(row => row.is_active !== false)
    .map(row => row.module_name)

  if (activeNames.includes(TENANT_MODULE_BUNDLE_ALL)) {
    return COMMERCIAL_MODULE_SLUGS.map(module_name => ({
      id: `all-${module_name}`,
      module_name,
      is_active: true,
    }))
  }

  const byName = new Map(rows.map(row => [row.module_name, row]))
  return resolveTenantModuleSlugs(activeNames).map((slug) => {
    const existing = byName.get(slug)
    if (existing)
      return existing
    return {
      id: `derived-${slug}`,
      module_name: slug,
      is_active: true,
    }
  })
}
