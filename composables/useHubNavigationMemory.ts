/**
 * Client memory for hub “Continuar de onde parou”.
 * Recents + preferred destination, scoped per auth user in localStorage.
 */

import { MODULE_LABELS_PT, MODULE_META } from '~/constants/modules'

export interface HubRecentItem {
  to: string
  title: string
  icon: string
  at: number
}

const RECENTS_MAX = 3
const RECENTS_PREFIX = 'hub-recents:'
const PREFERRED_PREFIX = 'hub-preferred:'

/** Auth / utility routes that should never enter the recents list. */
const SKIP_PREFIXES = [
  '/login',
  '/confirm',
  '/register',
  '/forgot',
  '/reset',
  '/auth',
  '/api',
  '/_nuxt',
]

const DESTINATION_CATALOG: Array<{ prefix: string, title: string, icon: string }> = [
  { prefix: '/admin/tenants', title: 'Empresas', icon: 'lucide:building-2' },
  { prefix: '/admin/users', title: 'Usuários', icon: 'lucide:users' },
  { prefix: '/admin/agencies', title: 'Agências', icon: 'lucide:network' },
  { prefix: '/agency/clients/onboarding', title: 'Novo cliente', icon: 'lucide:user-plus' },
  { prefix: '/agency/clients', title: 'Clientes', icon: 'lucide:building-2' },
  { prefix: '/agency/production', title: 'Produção geral', icon: 'lucide:kanban' },
  { prefix: '/agency/calendar', title: 'Calendário consolidado', icon: 'lucide:calendar-days' },
  { prefix: '/agency/approvals', title: 'Aprovações pendentes', icon: 'lucide:badge-check' },
  { prefix: '/agency/team', title: 'Equipe', icon: 'lucide:users' },
  { prefix: '/agency', title: 'Visão da agência', icon: 'lucide:layout-dashboard' },
  { prefix: '/organization/clients/onboarding', title: 'Novo cliente', icon: 'lucide:user-plus' },
  { prefix: '/organization/clients', title: 'Clientes', icon: 'lucide:building-2' },
  { prefix: '/organization/team', title: 'Equipe', icon: 'lucide:users' },
  { prefix: '/organization/roles', title: 'Papéis', icon: 'lucide:shield' },
  { prefix: '/organization/settings', title: 'Configurações da agência', icon: 'lucide:settings' },
  { prefix: '/organization', title: 'Visão da agência', icon: 'lucide:layout-dashboard' },
  { prefix: '/crm/funnel', title: 'Funil de vendas', icon: 'lucide:trending-up' },
  { prefix: '/crm/contacts', title: 'Contatos', icon: 'lucide:contact' },
  { prefix: '/crm/dashboard', title: 'Painel CRM', icon: 'lucide:layout-dashboard' },
  { prefix: '/crm', title: 'CRM', icon: '/icons/modules/crm/crm.svg' },
  { prefix: '/whatsapp/conversations', title: 'Conversas', icon: 'lucide:messages-square' },
  { prefix: '/whatsapp/dashboard', title: 'Painel WhatsApp', icon: 'lucide:layout-dashboard' },
  { prefix: '/whatsapp', title: 'WhatsApp', icon: 'lucide:message-circle' },
  { prefix: '/marketing/approvals', title: 'Aprovações', icon: 'lucide:badge-check' },
  { prefix: '/marketing/production/tasks', title: 'Filas de produção', icon: 'lucide:list-todo' },
  { prefix: '/marketing/production', title: 'Produção', icon: 'lucide:kanban' },
  { prefix: '/marketing/content', title: 'Conteúdos', icon: 'lucide:file-pen-line' },
  { prefix: '/marketing/publishing', title: 'Publicações', icon: 'lucide:send' },
  { prefix: '/marketing/media', title: 'Biblioteca', icon: 'lucide:images' },
  { prefix: '/marketing/calendar', title: 'Calendário', icon: 'lucide:calendar-days' },
  { prefix: '/marketing/settings', title: 'Configurações de Marketing', icon: 'lucide:settings' },
  { prefix: '/marketing/logs', title: 'Logs de marketing', icon: 'lucide:scroll-text' },
  { prefix: '/marketing/integrations', title: 'Integrações', icon: 'lucide:plug' },
  { prefix: '/marketing', title: 'Marketing', icon: '/icons/modules/marketing/marketing.svg' },
  { prefix: '/articles', title: 'Artigos', icon: 'lucide:book-a' },
  { prefix: '/settings', title: 'Configurações', icon: 'lucide:settings' },
]

function readStorage<T>(key: string): T | null {
  if (!import.meta.client)
    return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw)
      return null
    return JSON.parse(raw) as T
  }
  catch {
    return null
  }
}

function writeStorage(key: string, value: unknown) {
  if (!import.meta.client)
    return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  }
  catch {
    // ignore quota / private mode
  }
}

function normalizePath(fullPath: string): string | null {
  if (!fullPath || fullPath === '/')
    return null

  const pathOnly = fullPath.split('?')[0]?.split('#')[0] || ''
  if (!pathOnly || pathOnly === '/')
    return null

  if (SKIP_PREFIXES.some(prefix => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)))
    return null

  // Drop deep detail ids for noisier recents (keep list/section roots when possible).
  const detailStripped = pathOnly
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, '')
    .replace(/\/\d+$/, '')

  return detailStripped || pathOnly
}

export function resolveHubDestinationMeta(to: string): { title: string, icon: string } {
  const path = to.split('?')[0] || to
  const hit = DESTINATION_CATALOG.find(item => path === item.prefix || path.startsWith(`${item.prefix}/`))
  if (hit)
    return { title: hit.title, icon: hit.icon }

  for (const meta of Object.values(MODULE_META)) {
    if (path === meta.basePath || path.startsWith(`${meta.basePath}/`)) {
      return {
        title: MODULE_LABELS_PT[meta.slug] || meta.title,
        icon: meta.icon,
      }
    }
  }

  return { title: path, icon: 'lucide:history' }
}

function storageUserKey(userId: string | null | undefined): string {
  return userId && userId.length > 0 ? userId : 'anonymous'
}

export function useHubNavigationMemory() {
  const { currentUser } = useAuth()
  const userId = computed(() => currentUser.value?.id ?? null)

  const recentsKey = computed(() => `${RECENTS_PREFIX}${storageUserKey(userId.value)}`)
  const preferredKey = computed(() => `${PREFERRED_PREFIX}${storageUserKey(userId.value)}`)

  const recents = useState<HubRecentItem[]>('hub-recents-items', () => [])
  const preferred = useState<HubRecentItem | null>('hub-preferred-item', () => null)
  const hydrated = useState('hub-nav-memory-hydrated', () => false)

function isValidRecentItem(value: unknown): value is HubRecentItem {
  if (!value || typeof value !== 'object')
    return false
  const item = value as Partial<HubRecentItem>
  return typeof item.to === 'string'
    && item.to.length > 0
    && typeof item.title === 'string'
    && typeof item.icon === 'string'
}

function hydrateFromStorage() {
  if (!import.meta.client)
    return
  const savedRecents = readStorage<HubRecentItem[]>(recentsKey.value)
  recents.value = Array.isArray(savedRecents)
    ? savedRecents.filter(isValidRecentItem).slice(0, RECENTS_MAX)
    : []
  const savedPreferred = readStorage<HubRecentItem>(preferredKey.value)
  preferred.value = isValidRecentItem(savedPreferred) ? savedPreferred : null
  hydrated.value = true
}

  function persistRecents() {
    writeStorage(recentsKey.value, recents.value)
  }

  function persistPreferred() {
    if (preferred.value)
      writeStorage(preferredKey.value, preferred.value)
    else if (import.meta.client)
      localStorage.removeItem(preferredKey.value)
  }

  function trackPath(fullPath: string) {
    const to = normalizePath(fullPath)
    if (!to)
      return

    const meta = resolveHubDestinationMeta(to)
    const next: HubRecentItem = {
      to,
      title: meta.title,
      icon: meta.icon,
      at: Date.now(),
    }

    const withoutDup = recents.value.filter(item => item.to !== to)
    recents.value = [next, ...withoutDup].slice(0, RECENTS_MAX)
    persistRecents()
  }

  function setPreferredPath(to: string, title?: string, icon?: string) {
    const path = normalizePath(to) || to
    if (!path || path === '/')
      return
    const meta = resolveHubDestinationMeta(path)
    preferred.value = {
      to: path,
      title: title || meta.title,
      icon: icon || meta.icon,
      at: Date.now(),
    }
    persistPreferred()
  }

  function setPreferredModule(slug: string) {
    const moduleMeta = MODULE_META[slug]
    if (!moduleMeta)
      return
    const to = moduleMeta.defaultPath || moduleMeta.basePath
    setPreferredPath(
      to,
      MODULE_LABELS_PT[slug] || moduleMeta.title,
      moduleMeta.icon,
    )
  }

  function clearPreferred() {
    preferred.value = null
    persistPreferred()
  }

  /** Recents excluding current preferred (avoid duplicate tiles). */
  const continueItems = computed(() => {
    const pref = preferred.value
    const list = pref
      ? recents.value.filter(item => item.to !== pref.to)
      : recents.value
    return list.slice(0, RECENTS_MAX)
  })

  watch(userId, () => {
    hydrateFromStorage()
  }, { immediate: true })

  return {
    recents,
    preferred,
    continueItems,
    hydrated,
    hydrateFromStorage,
    trackPath,
    setPreferredPath,
    setPreferredModule,
    clearPreferred,
  }
}
