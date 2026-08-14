import type { ModuleMeta } from '~/constants/modules'

import { useSupabaseClient } from '#imports'
import { createSharedComposable } from '@vueuse/core'

import { computed, onMounted, watch } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useTenant } from '~/composables/useTenant'
import {
  DEFAULT_MODULE_SLUG,
  expandTenantModuleRows,
  MODULE_META,
  normalizeCommercialModuleSlug,
  resolveModuleSlugFromPath,
} from '~/constants/modules'

function getModuleSlugFromPath(path: string): string | null {
  return resolveModuleSlugFromPath(path)
}

function getModuleMetaBySlug(slug: string): ModuleMeta | undefined {
  const commercial = normalizeCommercialModuleSlug(slug)
  if (!commercial)
    return undefined
  return MODULE_META[commercial]
}

const STORAGE_KEY = 'current-module-slug'

function isUuid(value: string | null | undefined) {
  if (!value)
    return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function persistModuleSlug(slug: string) {
  if (import.meta.client)
    localStorage.setItem(STORAGE_KEY, slug)
}

function restoreModuleSlug(): string {
  if (import.meta.client) {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && getModuleMetaBySlug(saved))
      return saved
  }
  return DEFAULT_MODULE_SLUG
}

function _useModule() {
  // useState must run inside setup (shared composable) so SSR state hydrates.
  const currentModuleSlug = useState<string>('current-module-slug', () => DEFAULT_MODULE_SLUG)
  const tenantModules = useState<Array<{ id: string, module_name: string, is_active: boolean }>>('tenant-modules', () => [])
  const isLoadingModules = useState('tenant-modules-loading', () => false)
  const includeAllModulesForStaff = useState('modules-include-all-staff', () => false)
  const hasResolvedRole = useState('modules-has-resolved-role', () => false)

  const { currentTenant, tenantId } = useTenant()
  const { currentRole, currentUser } = useAuth()
  const route = useRoute()

  const availableModules = computed(() => {
    const fromTenant = tenantModules.value
      .map((tm) => {
        if (tm.module_name === 'ads')
          return null
        const meta = MODULE_META[tm.module_name]
        if (!meta)
          return null
        return { ...meta, id: tm.id, module_name: tm.module_name }
      })
      .filter((m): m is ModuleMeta & { id: string, module_name: string } => m !== null)

    if (!includeAllModulesForStaff.value)
      return fromTenant

    const registeredNames = new Set(fromTenant.map(m => m.module_name))
    const staffExtras = Object.entries(MODULE_META)
      .filter(([moduleName]) => moduleName !== 'ads' && !registeredNames.has(moduleName))
      .map(([module_name, meta]) => ({
        ...meta,
        id: `local-${module_name}`,
        module_name,
      }))

    return [...fromTenant, ...staffExtras]
  })

  const currentModuleMeta = computed(() => {
    return getModuleMetaBySlug(currentModuleSlug.value) ?? MODULE_META.crm
  })

  async function fetchTenantModules(id: string | null) {
    if (!id || !isUuid(id)) {
      tenantModules.value = []
      return []
    }
    isLoadingModules.value = true
    const supabase = useSupabaseClient()
    const { data, error } = await supabase
      .from('tenant_modules')
      .select('id, module_name, is_active')
      .eq('tenant_id', id)
      .eq('is_active', true)
    isLoadingModules.value = false
    if (error) {
      console.error('Error loading tenant modules:', error)
      tenantModules.value = []
      return []
    }

    const rows = data ?? []
    // Commercial shells only — Ads is a Marketing submenu, not a companion tile.
    tenantModules.value = expandTenantModuleRows(rows) as Array<{
      id: string
      module_name: string
      is_active: boolean
    }>
    return tenantModules.value
  }

  function ensureValidModuleSlug(currentPath?: string) {
    const slug = currentModuleSlug.value
    const list = availableModules.value

    const stillValid = list.some(m => m.slug === slug)
      || (includeAllModulesForStaff.value && !!getModuleMetaBySlug(slug))

    if (stillValid)
      return

    if (!hasResolvedRole.value)
      return

    const pathSlug = currentPath ? getModuleSlugFromPath(currentPath) : null
    if (pathSlug && getModuleMetaBySlug(pathSlug)) {
      if (includeAllModulesForStaff.value || list.some(m => m.slug === pathSlug)) {
        currentModuleSlug.value = pathSlug
        persistModuleSlug(pathSlug)
        return
      }
    }

    if (list.length > 0) {
      currentModuleSlug.value = list[0].slug
      persistModuleSlug(currentModuleSlug.value)
    }
  }

  // Prefer route path on SSR so client hydrate matches.
  if (import.meta.server) {
    const pathSlug = getModuleSlugFromPath(route.path)
    if (pathSlug)
      currentModuleSlug.value = pathSlug
  }

  watch([currentRole, currentUser], ([role, user]) => {
    const globalRole = user?.user_metadata?.role || user?.app_metadata?.role
    includeAllModulesForStaff.value = role === 'admin'
      || role === 'funcionario'
      || globalRole === 'admin'
      || globalRole === 'funcionario'
    hasResolvedRole.value = !user || role !== null
    if (hasResolvedRole.value)
      ensureValidModuleSlug(route.path)
  }, { immediate: true })

  onMounted(async () => {
    const pathSlug = getModuleSlugFromPath(route.path)
    if (pathSlug)
      currentModuleSlug.value = pathSlug
    else
      currentModuleSlug.value = restoreModuleSlug()

    await fetchTenantModules(tenantId.value ?? currentTenant.value?.id ?? null)
    ensureValidModuleSlug(route.path)
  })

  watch(() => route.path, (path) => {
    const slug = getModuleSlugFromPath(path)
    if (slug && slug !== currentModuleSlug.value) {
      currentModuleSlug.value = slug
      persistModuleSlug(slug)
    }
    ensureValidModuleSlug(path)
  }, { immediate: true })

  watch(tenantId, async (newTenantId) => {
    await fetchTenantModules(newTenantId ?? null)
    ensureValidModuleSlug(route.path)
  })

  watch(availableModules, () => {
    ensureValidModuleSlug(route.path)
  })

  async function loadModules() {
    await fetchTenantModules(currentTenant.value?.id ?? tenantId.value ?? null)
    ensureValidModuleSlug(route.path)
  }

  function setCurrentModuleBySlug(slug: string) {
    if (!getModuleMetaBySlug(slug))
      return

    currentModuleSlug.value = slug
    persistModuleSlug(slug)
  }

  function getModulePath(slug: string) {
    const meta = getModuleMetaBySlug(slug)
    return meta?.defaultPath ?? meta?.basePath ?? null
  }

  return {
    currentModuleSlug,
    currentModuleMeta,
    availableModules,
    tenantModules,
    isLoadingModules,
    loadModules,
    setCurrentModuleBySlug,
    getModulePath,
    MODULE_META,
  }
}

export const useModule = createSharedComposable(_useModule)
