/**
 * Metadata for modules displayed in the module selector.
 * module_name must match tenant_modules.module_name in the database
 * (except companion modules — see resolveTenantModuleSlugs).
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
    icon: 'lucide:megaphone',
    basePath: '/marketing',
    defaultPath: '/marketing',
  },
  /**
   * Paid media product shell (Meta / Google Ads / Analytics).
   * ETAPA 1: companion of Marketing — not a separate tenant_modules toggle yet.
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
    icon: 'lucide:message-circle',
    basePath: '/whatsapp',
    defaultPath: '/whatsapp/dashboard',
  },
}

export const DEFAULT_MODULE_SLUG = 'crm'

/** Bundle row in tenant_modules that grants every module in MODULE_META. */
export const TENANT_MODULE_BUNDLE_ALL = 'all'

/**
 * Modules that can be toggled in admin `tenant_modules`.
 * Ads is intentionally omitted: it unlocks with Marketing until a dedicated catalog/billing row exists.
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
  marketing: 'Conteúdo, calendário e aprovações',
  ads: 'Mídia paga, Meta, Google Ads e Analytics',
  whatsapp: 'Inbox, campanhas e automações',
  article: 'Conteúdo e publicações no CMS',
  all: 'Libera todos os módulos para este cliente',
}

/**
 * Resolves active product shells for a tenant.
 * Marketing also unlocks the Ads companion module (ETAPA 1).
 */
export function resolveTenantModuleSlugs(
  activeModuleNames: string[],
): string[] {
  const catalogSlugs = Object.keys(MODULE_META)

  if (activeModuleNames.includes(TENANT_MODULE_BUNDLE_ALL))
    return [...catalogSlugs]

  const resolved = catalogSlugs.filter(slug => activeModuleNames.includes(slug))

  // Companion product: Ads ships with Marketing until standalone assignment exists.
  if (
    (activeModuleNames.includes('marketing') || resolved.includes('marketing'))
    && MODULE_META.ads
    && !resolved.includes('ads')
  ) {
    const marketingIdx = resolved.indexOf('marketing')
    if (marketingIdx >= 0)
      resolved.splice(marketingIdx + 1, 0, 'ads')
    else
      resolved.push('ads')
  }

  return resolved
}

/**
 * Expands tenant_modules rows with companion shells (e.g. Marketing → Ads).
 * Keeps catalog order from resolveTenantModuleSlugs.
 */
export function expandTenantModuleRows<T extends { module_name: string, is_active?: boolean }>(
  rows: T[],
): Array<T | { id: string, module_name: string, is_active: boolean }> {
  const activeNames = rows
    .filter(row => row.is_active !== false)
    .map(row => row.module_name)

  if (activeNames.includes(TENANT_MODULE_BUNDLE_ALL)) {
    return Object.keys(MODULE_META).map(module_name => ({
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
