<script setup lang="ts">
import type { IntegrationConnectionStatus } from '~/composables/marketing/useIntegrationConnectionStatus'
import type { MarketingProvider } from '~/types/marketing'

import GoogleAdsBrandIcon from '@/components/brand/GoogleAdsBrandIcon.vue'
import GoogleAnalyticsBrandIcon from '@/components/brand/GoogleAnalyticsBrandIcon.vue'
import MetaBrandIcon from '@/components/brand/MetaBrandIcon.vue'
import MarketingPageSkeleton from '@/components/marketing/MarketingPageSkeleton.vue'
import IntegrationStatusBadge from '@/components/settings/integrations/IntegrationStatusBadge.vue'
import SocialProviderCard from '@/components/settings/integrations/SocialProviderCard.vue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/components/ui/toast'
import { resolveIntegrationConnectionStatus } from '~/composables/marketing/useIntegrationConnectionStatus'

type Provider = MarketingProvider

const SETTINGS_INTEGRATIONS_PATH = '/settings/integrations'
const PROVIDERS: Provider[] = ['google_ads', 'google_analytics', 'meta', 'linkedin']

const { tenantId } = useTenant()
const route = useRoute()
const router = useRouter()
const { toast } = useToast()

interface GoogleAdsAccountOption {
  id: string
  name: string
  is_manager?: boolean
  has_name?: boolean
}

const oauthLoading = ref<string | null>(null)
const accountsLoading = ref<string | null>(null)
const actionLoading = ref<string | null>(null)
const lastError = ref('')
const googleAdsAccountsWarning = ref('')
const selectedGoogleAds = ref('')
const selectedGoogleAnalytics = ref('')
const selectedMetaAdAccount = ref('')
const selectedMetaPage = ref('')
const selectedMetaPixel = ref('')
const selectedMetaInstagram = ref('')
const selectedLinkedinOrganization = ref('')
const googleAdsAccounts = ref<GoogleAdsAccountOption[]>([])
const googleAnalyticsAccounts = ref<Array<{ id: string, name: string, account_id?: string }>>([])
const metaAccounts = ref<Array<{ id: string, name: string }>>([])
const metaPages = ref<Array<{ id: string, name: string }>>([])
const metaPixels = ref<Array<{ id: string, name: string }>>([])
const metaInstagramAccounts = ref<Array<{ id: string, name: string }>>([])
const linkedinOrganizations = ref<Array<{ id: string, name: string }>>([])

const disconnectDialogOpen = ref(false)
const disconnectTarget = ref<Provider | null>(null)
const oauthCallbackHandled = ref(false)


function formatGoogleAdsCustomerId(value?: string | null): string {
  const id = String(value || '').replace(/-/g, '').trim()
  if (id.length !== 10 || !/^\d+$/.test(id))
    return id
  return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`
}

function googleAdsAccountLabel(account: GoogleAdsAccountOption): string {
  const formattedId = formatGoogleAdsCustomerId(account.id)
  const suffix = account.is_manager ? ' (gerente)' : ''
  if (account.has_name && account.name)
    return `${account.name}${suffix} · ${formattedId}`
  return `${account.name || `Conta ${formattedId}`}${suffix}`
}

const editDialogOpen = ref(false)
const editProvider = ref<Provider | null>(null)
const editDialogInitialLoad = ref(false)

interface IntegrationListRow {
  id?: string
  provider: Provider
  has_key?: boolean
  can_publish?: boolean
  has_page_token?: boolean
  has_capi_token?: boolean
  google_ads_needs_account?: boolean
  google_analytics_needs_property?: boolean
  capi_enabled?: boolean
  missing_publish_scopes?: string[]
  config?: Record<string, unknown> | null
}

const {
  data: integrations,
  refresh,
  pending,
  showSkeleton,
  error: fetchError,
} = useMarketingFetch({
  key: () => `marketing-integrations-${tenantId.value}`,
  handler: async () => {
    const response = await $fetch<{ data: IntegrationListRow[] }>('/api/marketing/integrations', {
      query: {
        tenant_id: tenantId.value || undefined,
      },
    })
    return response.data || []
  },
  default: () => [] as IntegrationListRow[],
  watch: [tenantId],
  enabled: () => Boolean(tenantId.value),
  ttlMs: 60_000,
})

const connectedProviders = computed(() =>
  new Set(
    (integrations.value || [])
      .filter(i => i.has_key)
      .map(i => i.provider),
  ),
)

const connectedCount = computed(() => connectedProviders.value.size)

function rowFor(provider: Provider): IntegrationListRow | undefined {
  return integrations.value?.find(r => r.provider === provider)
}

function statusFor(provider: Provider): IntegrationConnectionStatus {
  return resolveIntegrationConnectionStatus(provider, rowFor(provider))
}

const metaPublishReady = computed(() => {
  const row = rowFor('meta')
  if (!row?.has_key)
    return false
  return Boolean(row.can_publish)
})

function statusLabelFor(provider: Provider): string | undefined {
  if (provider !== 'meta')
    return undefined
  const status = statusFor(provider)
  if (status === 'connected' && metaPublishReady.value)
    return 'Pronto para publicar'
  if (status === 'needs_setup')
    return 'Publicação incompleta'
  return undefined
}

const metaPublishIssues = computed(() => {
  const row = rowFor('meta')
  if (!row?.has_key)
    return [] as string[]
  const issues: string[] = []
  if (Array.isArray(row.missing_publish_scopes) && row.missing_publish_scopes.length)
    issues.push(`Permissões faltando: ${row.missing_publish_scopes.join(', ')}`)
  if (!row.has_page_token)
    issues.push('Selecione a Página do Facebook (necessário para publicar no Facebook e no Instagram).')
  return issues
})

function displayAccountLabel(provider: Provider): string {
  const row = rowFor(provider)
  if (!row?.has_key)
    return 'Nenhuma conta conectada'
  const c = row.config || {}
  if (provider === 'google_ads') {
    const id = c.customer_id ? String(c.customer_id) : ''
    if (!id)
      return row.google_ads_needs_account ? 'Selecione a conta de anúncios' : 'Selecione a conta em configurar'
    const acc = googleAdsAccounts.value.find(a => String(a.id) === id)
    return acc ? googleAdsAccountLabel(acc) : `Conta ${formatGoogleAdsCustomerId(id)}`
  }
  if (provider === 'google_analytics') {
    const id = String(c.property_id || c.analytics_account_id || '')
    if (!id)
      return row.google_analytics_needs_property ? 'Selecione a propriedade GA4' : 'Selecione a propriedade em configurar'
    const acc = googleAnalyticsAccounts.value.find(a => String(a.id) === id)
    return acc?.name || `Propriedade ${id}`
  }
  if (provider === 'meta') {
    if (!c.ad_account_id)
      return 'Selecione conta, página e Instagram'
    const adId = String(c.ad_account_id)
    const adName = metaAccounts.value.find(a => String(a.id) === adId)?.name || adId
    const parts: string[] = [adName]
    if (c.page_id) {
      const pn = metaPages.value.find(p => String(p.id) === String(c.page_id))?.name
        || (c.page_name ? String(c.page_name) : null)
      parts.push(pn || `Página ${c.page_id}`)
    }
    if (c.pixel_id)
      parts.push(metaPixels.value.find(p => String(p.id) === String(c.pixel_id))?.name || `Pixel ${c.pixel_id}`)
    if (c.instagram_business_account_id) {
      const ig = metaInstagramAccounts.value.find(i => String(i.id) === String(c.instagram_business_account_id))
      const igFallback = c.instagram_username
        ? `@${c.instagram_username}`
        : (c.instagram_name ? String(c.instagram_name) : null)
      parts.push(ig?.name || igFallback || `IG ${c.instagram_business_account_id}`)
    }
    return parts.join(' · ')
  }
  if (provider === 'linkedin') {
    const id = String(c.organization_id || '')
    if (!id)
      return 'Selecione a organização em configurar'
    return linkedinOrganizations.value.find(item => item.id === id)?.name
      || (c.organization_name ? String(c.organization_name) : null)
      || id
  }
  return '—'
}

function metaNote(): string | undefined {
  const row = rowFor('meta')
  if (!row?.has_key)
    return undefined
  if (row.capi_enabled)
    return row.has_capi_token ? 'CAPI CRM ativo' : 'CAPI CRM ativo — falta token'
  return undefined
}

watch(
  () => integrations.value,
  (rows) => {
    if (!rows?.length)
      return
    for (const row of rows) {
      const c = row.config || {}
      if (row.provider === 'google_ads' && c.customer_id)
        selectedGoogleAds.value = String(c.customer_id)
      if (row.provider === 'google_analytics') {
        const pid = c.property_id || c.analytics_account_id
        if (pid)
          selectedGoogleAnalytics.value = String(pid)
      }
      if (row.provider === 'meta') {
        if (c.ad_account_id)
          selectedMetaAdAccount.value = String(c.ad_account_id)
        if (c.page_id)
          selectedMetaPage.value = String(c.page_id)
        if (c.pixel_id)
          selectedMetaPixel.value = String(c.pixel_id)
        if (c.instagram_business_account_id)
          selectedMetaInstagram.value = String(c.instagram_business_account_id)
      }
      if (row.provider === 'linkedin' && c.organization_id)
        selectedLinkedinOrganization.value = String(c.organization_id)
    }
  },
  { immediate: true, deep: true },
)

async function clearOauthQuery() {
  if (!import.meta.client)
    return
  if (!route.query.oauth && !route.query.message && !route.query.provider)
    return
  const nextQuery = { ...route.query }
  delete nextQuery.oauth
  delete nextQuery.message
  delete nextQuery.provider
  await router.replace({ path: route.path, query: nextQuery })
}

function parseProviderParam(value: unknown): Provider | null {
  const raw = String(value || '')
  return (PROVIDERS as string[]).includes(raw) ? (raw as Provider) : null
}

async function connectProvider(provider: Provider) {
  oauthLoading.value = provider
  lastError.value = ''
  try {
    const response = await $fetch<{ redirectTo: string }>(`/api/marketing/oauth/${provider}/start`, {
      query: {
        tenant_id: tenantId.value || undefined,
        redirect_path: SETTINGS_INTEGRATIONS_PATH,
      },
    })
    if (!response?.redirectTo) {
      lastError.value = 'Não foi possível iniciar a conexão. Tente novamente.'
      oauthLoading.value = null
      return
    }
    if (import.meta.client) {
      toast({
        title: 'Abrindo autenticação',
        description: 'Você será redirecionado para autorizar o acesso.',
      })
      // Keep loading UI until navigation completes.
      window.location.assign(response.redirectTo)
    }
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao iniciar OAuth'
    oauthLoading.value = null
  }
}

async function loadAccounts(provider: Provider) {
  accountsLoading.value = provider
  lastError.value = ''
  if (provider === 'google_ads')
    googleAdsAccountsWarning.value = ''
  try {
    const response = await $fetch<{ data: GoogleAdsAccountOption[], warning?: string }>('/api/marketing/oauth/accounts', {
      query: {
        provider,
        tenant_id: tenantId.value || undefined,
      },
    })
    if (provider === 'google_ads') {
      googleAdsAccounts.value = [...(response.data || [])].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }),
      )
      googleAdsAccountsWarning.value = response.warning || ''
      if (!selectedGoogleAds.value) {
        const preferred = googleAdsAccounts.value.find(a => !a.is_manager) || googleAdsAccounts.value[0]
        if (preferred)
          selectedGoogleAds.value = preferred.id
      }
    }
    if (provider === 'google_analytics')
      googleAnalyticsAccounts.value = response.data || []
    if (provider === 'meta')
      metaAccounts.value = response.data || []
    if (provider === 'linkedin')
      linkedinOrganizations.value = response.data || []
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao carregar contas'
  }
  finally {
    accountsLoading.value = null
  }
}

async function refreshMetaInstagramList() {
  const tid = tenantId.value || undefined
  if (!selectedMetaAdAccount.value && !selectedMetaPage.value) {
    metaInstagramAccounts.value = []
    return
  }
  const q: Record<string, string | undefined> = {
    provider: 'meta',
    resource: 'instagram',
    tenant_id: tid,
  }
  if (selectedMetaAdAccount.value)
    q.ad_account_id = selectedMetaAdAccount.value
  if (selectedMetaPage.value)
    q.page_id = selectedMetaPage.value
  const ig = await $fetch<{ data: Array<{ id: string, name: string }> }>('/api/marketing/oauth/accounts', {
    query: q,
  })
  metaInstagramAccounts.value = ig.data || []
}

async function loadMetaIntegrationLists() {
  accountsLoading.value = 'meta'
  lastError.value = ''
  const tid = tenantId.value || undefined
  try {
    const [ads, pages] = await Promise.all([
      $fetch<{ data: Array<{ id: string, name: string }> }>('/api/marketing/oauth/accounts', {
        query: { provider: 'meta', resource: 'ad_accounts', tenant_id: tid },
      }),
      $fetch<{ data: Array<{ id: string, name: string }> }>('/api/marketing/oauth/accounts', {
        query: { provider: 'meta', resource: 'pages', tenant_id: tid },
      }),
    ])
    metaAccounts.value = ads.data || []
    metaPages.value = pages.data || []

    if (selectedMetaAdAccount.value) {
      const px = await $fetch<{ data: Array<{ id: string, name: string }> }>('/api/marketing/oauth/accounts', {
        query: {
          provider: 'meta',
          resource: 'pixels',
          ad_account_id: selectedMetaAdAccount.value,
          tenant_id: tid,
        },
      })
      metaPixels.value = px.data || []
      if (selectedMetaPixel.value && !metaPixels.value.some(p => p.id === selectedMetaPixel.value))
        selectedMetaPixel.value = ''
      if (!selectedMetaPixel.value && metaPixels.value.length === 1)
        selectedMetaPixel.value = metaPixels.value[0].id
    }
    else {
      metaPixels.value = []
      selectedMetaPixel.value = ''
    }

    await refreshMetaInstagramList()
    if (selectedMetaInstagram.value && !metaInstagramAccounts.value.some(i => i.id === selectedMetaInstagram.value))
      selectedMetaInstagram.value = ''
    if (!selectedMetaInstagram.value && metaInstagramAccounts.value.length === 1)
      selectedMetaInstagram.value = metaInstagramAccounts.value[0].id
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao carregar dados Meta'
  }
  finally {
    accountsLoading.value = null
  }
}

async function onMetaAdAccountPicked(value: string) {
  selectedMetaAdAccount.value = value
  selectedMetaPixel.value = ''
  metaPixels.value = []
  accountsLoading.value = 'meta'
  const tid = tenantId.value || undefined
  try {
    if (!value) {
      await refreshMetaInstagramList()
      return
    }
    const px = await $fetch<{ data: Array<{ id: string, name: string }> }>('/api/marketing/oauth/accounts', {
      query: {
        provider: 'meta',
        resource: 'pixels',
        ad_account_id: value,
        tenant_id: tid,
      },
    })
    metaPixels.value = px.data || []
    if (metaPixels.value.length === 1)
      selectedMetaPixel.value = metaPixels.value[0].id
    await refreshMetaInstagramList()
    if (selectedMetaInstagram.value && !metaInstagramAccounts.value.some(i => i.id === selectedMetaInstagram.value))
      selectedMetaInstagram.value = ''
    if (!selectedMetaInstagram.value && metaInstagramAccounts.value.length === 1)
      selectedMetaInstagram.value = metaInstagramAccounts.value[0].id
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao carregar pixels'
  }
  finally {
    accountsLoading.value = null
  }
}

async function onMetaPagePicked(value: string) {
  selectedMetaPage.value = value
  selectedMetaInstagram.value = ''
  metaInstagramAccounts.value = []
  accountsLoading.value = 'meta'
  try {
    await refreshMetaInstagramList()
    if (metaInstagramAccounts.value.length === 1)
      selectedMetaInstagram.value = metaInstagramAccounts.value[0].id
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao carregar Instagram'
  }
  finally {
    accountsLoading.value = null
  }
}

async function saveGoogleAdsAccount() {
  actionLoading.value = 'google_ads'
  lastError.value = ''
  try {
    await $fetch('/api/marketing/integrations', {
      method: 'POST',
      body: {
        tenant_id: tenantId.value || undefined,
        provider: 'google_ads',
        config: {
          customer_id: selectedGoogleAds.value,
        },
        is_active: true,
      },
    })
    await refresh()
    toast({ title: 'Conta salva', description: 'Google Ads atualizado com sucesso.' })
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao salvar conta Google Ads'
  }
  finally {
    actionLoading.value = null
  }
}

async function saveGoogleAnalyticsAccount() {
  actionLoading.value = 'google_analytics'
  lastError.value = ''
  try {
    await $fetch('/api/marketing/integrations', {
      method: 'POST',
      body: {
        tenant_id: tenantId.value || undefined,
        provider: 'google_analytics',
        config: {
          analytics_account_id: selectedGoogleAnalytics.value,
          property_id: selectedGoogleAnalytics.value,
        },
        is_active: true,
      },
    })
    await refresh()
    toast({ title: 'Propriedade salva', description: 'Google Analytics atualizado com sucesso.' })
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao salvar Google Analytics'
  }
  finally {
    actionLoading.value = null
  }
}

async function saveMetaAccount() {
  actionLoading.value = 'meta'
  lastError.value = ''
  try {
    await $fetch('/api/marketing/integrations', {
      method: 'POST',
      body: {
        tenant_id: tenantId.value || undefined,
        provider: 'meta',
        config: {
          ad_account_id: selectedMetaAdAccount.value,
          page_id: selectedMetaPage.value,
          pixel_id: selectedMetaPixel.value,
          instagram_business_account_id: selectedMetaInstagram.value,
        },
        is_active: true,
      },
    })
    await refresh()
    toast({ title: 'Meta atualizada', description: 'Configuração de publicação salva.' })
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao salvar Meta'
  }
  finally {
    actionLoading.value = null
  }
}

async function saveLinkedinOrganization() {
  actionLoading.value = 'linkedin'
  lastError.value = ''
  try {
    const organization = linkedinOrganizations.value.find(item => item.id === selectedLinkedinOrganization.value)
    await $fetch('/api/marketing/integrations', {
      method: 'POST',
      body: {
        tenant_id: tenantId.value || undefined,
        provider: 'linkedin',
        config: {
          organization_id: selectedLinkedinOrganization.value,
          organization_name: organization?.name,
        },
        is_active: true,
      },
    })
    await refresh()
    toast({ title: 'Organização salva', description: 'LinkedIn atualizado com sucesso.' })
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao salvar LinkedIn'
  }
  finally {
    actionLoading.value = null
  }
}

function requestDisconnect(provider: Provider) {
  disconnectTarget.value = provider
  disconnectDialogOpen.value = true
}

async function confirmDisconnect() {
  const provider = disconnectTarget.value
  if (!provider)
    return
  actionLoading.value = `disconnect:${provider}`
  lastError.value = ''
  try {
    await $fetch('/api/marketing/integrations', {
      method: 'DELETE',
      body: {
        tenant_id: tenantId.value || undefined,
        provider,
      },
    })
    await refresh()
    toast({
      title: 'Conta desconectada',
      description: 'A integração foi removida desta empresa.',
    })
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao desconectar'
  }
  finally {
    actionLoading.value = null
    disconnectDialogOpen.value = false
    disconnectTarget.value = null
  }
}

async function openEdit(provider: Provider) {
  editProvider.value = provider
  editDialogOpen.value = true
  editDialogInitialLoad.value = true
  try {
    if (provider === 'meta')
      await loadMetaIntegrationLists()
    else
      await loadAccounts(provider)
  }
  finally {
    editDialogInitialLoad.value = false
  }
}

const dialogSaveDisabled = computed(() => {
  if (pending.value || actionLoading.value === editProvider.value || editDialogInitialLoad.value)
    return true
  const p = editProvider.value
  if (!p)
    return true
  if (p === 'google_ads')
    return !selectedGoogleAds.value
  if (p === 'google_analytics')
    return !selectedGoogleAnalytics.value
  if (p === 'linkedin')
    return !selectedLinkedinOrganization.value
  if (p === 'meta')
    return !selectedMetaAdAccount.value || !selectedMetaPage.value
  return false
})

async function saveFromDialog() {
  const p = editProvider.value
  if (!p)
    return
  if (p === 'google_ads')
    await saveGoogleAdsAccount()
  else if (p === 'google_analytics')
    await saveGoogleAnalyticsAccount()
  else if (p === 'meta')
    await saveMetaAccount()
  else if (p === 'linkedin')
    await saveLinkedinOrganization()
  if (!lastError.value)
    editDialogOpen.value = false
}

function providerTitle(provider: Provider): string {
  if (provider === 'google_ads')
    return 'Google Ads'
  if (provider === 'google_analytics')
    return 'Google Analytics'
  if (provider === 'meta')
    return 'Meta'
  return 'LinkedIn'
}

function anyBusy(): boolean {
  return Boolean(oauthLoading.value || actionLoading.value)
}

watch(
  () => [route.query.oauth, tenantId.value] as const,
  async ([oauthStatus]) => {
    if (!oauthStatus || oauthCallbackHandled.value)
      return
    oauthCallbackHandled.value = true
    const provider = parseProviderParam(route.query.provider)
    if (oauthStatus === 'success') {
      await refresh()
      const needsSetup = provider ? statusFor(provider) === 'needs_setup' : false
      toast({
        title: 'Conexão concluída',
        description: needsSetup
          ? 'Conta autorizada. Escolha a conta ou página para concluir.'
          : 'Conta autorizada com sucesso.',
      })
      if (provider && needsSetup)
        await openEdit(provider)
    }
    else if (oauthStatus === 'error') {
      lastError.value = String(route.query.message || 'Falha na autenticação OAuth')
      toast({
        title: 'Falha na autenticação',
        description: lastError.value,
        variant: 'destructive',
      })
    }
    await clearOauthQuery()
  },
  { immediate: true },
)

watch(tenantId, () => {
  oauthCallbackHandled.value = false
})

const fetchErrorMessage = computed(() => {
  if (!fetchError.value)
    return ''
  const err = fetchError.value as any
  return err?.data?.statusMessage || err?.message || 'Não foi possível carregar as integrações.'
})
</script>

<template>
  <div class="w-full flex flex-col gap-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 class="text-lg text-foreground font-semibold tracking-tight">
          Redes e anúncios
        </h2>
        <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
          Meta, Google e LinkedIn — mesmas contas usadas no Marketing. Credenciais só no servidor, por empresa.
        </p>
      </div>
      <div
        v-if="!showSkeleton"
        class="flex flex-wrap items-center gap-2"
        aria-live="polite"
      >
        <IntegrationStatusBadge
          :status="connectedCount > 0 ? 'connected' : 'disconnected'"
          :label="`${connectedCount} de ${PROVIDERS.length} conectadas`"
        />
        <Button
          variant="ghost"
          size="sm"
          class="h-8 text-muted-foreground"
          :disabled="pending || anyBusy()"
          aria-label="Atualizar integrações"
          @click="refresh()"
        >
          <Icon
            name="lucide:refresh-cw"
            class="h-4 w-4"
            :class="pending ? 'animate-spin' : ''"
          />
          <span class="ml-1.5 hidden sm:inline">Atualizar</span>
        </Button>
      </div>
    </div>

    <div
      v-if="oauthLoading"
      class="flex items-center gap-3 border border-border/70 rounded-xl bg-muted/30 px-4 py-3 text-sm"
      role="status"
      aria-live="polite"
    >
      <Icon name="lucide:loader-2" class="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      <span>
        Abrindo autenticação do {{ providerTitle(oauthLoading as Provider) }}…
        Não feche esta aba.
      </span>
    </div>

    <Alert v-if="!pending && lastError" variant="destructive">
      <Icon name="lucide:triangle-alert" class="h-4 w-4" />
      <AlertTitle>Falha na integração</AlertTitle>
      <AlertDescription class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{{ lastError }}</span>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0 self-start"
          @click="lastError = ''"
        >
          Dispensar
        </Button>
      </AlertDescription>
    </Alert>

    <Alert v-else-if="fetchErrorMessage && !showSkeleton" variant="destructive">
      <Icon name="lucide:wifi-off" class="h-4 w-4" />
      <AlertTitle>Não foi possível carregar</AlertTitle>
      <AlertDescription class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{{ fetchErrorMessage }}</span>
        <Button variant="outline" size="sm" class="shrink-0 self-start" :disabled="pending" @click="refresh()">
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>

    <Alert v-if="!pending && statusFor('meta') !== 'disconnected' && metaPublishIssues.length">
      <Icon name="lucide:info" class="h-4 w-4" />
      <AlertTitle>Meta conectada, mas publicação incompleta</AlertTitle>
      <AlertDescription class="space-y-1">
        <p v-for="issue in metaPublishIssues" :key="issue">
          {{ issue }}
        </p>
        <p>
          Use <strong>Configurar</strong> para escolher a Página ou
          <strong>Reconectar permissões</strong> e aceite todas as autorizações.
        </p>
      </AlertDescription>
    </Alert>

    <MarketingPageSkeleton v-if="showSkeleton" variant="integrations" content-only />

    <div
      v-else
      class="grid gap-4 lg:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4"
      role="list"
      aria-label="Provedores de integração"
    >
      <div role="listitem">
        <SocialProviderCard
          title="Google Ads"
          :status="statusFor('google_ads')"
          :account-label="displayAccountLabel('google_ads')"
          :connecting="oauthLoading === 'google_ads'"
          :disconnecting="actionLoading === 'disconnect:google_ads'"
          :busy="anyBusy()"
          show-edit
          @connect="connectProvider('google_ads')"
          @disconnect="requestDisconnect('google_ads')"
          @edit="openEdit('google_ads')"
          @reconnect="connectProvider('google_ads')"
        >
          <template #icon>
            <GoogleAdsBrandIcon size="lg" />
          </template>
        </SocialProviderCard>
      </div>

      <div role="listitem">
        <SocialProviderCard
          title="Google Analytics"
          :status="statusFor('google_analytics')"
          :account-label="displayAccountLabel('google_analytics')"
          :connecting="oauthLoading === 'google_analytics'"
          :disconnecting="actionLoading === 'disconnect:google_analytics'"
          :busy="anyBusy()"
          show-edit
          @connect="connectProvider('google_analytics')"
          @disconnect="requestDisconnect('google_analytics')"
          @edit="openEdit('google_analytics')"
          @reconnect="connectProvider('google_analytics')"
        >
          <template #icon>
            <GoogleAnalyticsBrandIcon size="lg" />
          </template>
        </SocialProviderCard>
      </div>

      <div role="listitem">
        <SocialProviderCard
          title="Meta"
          subtitle="Facebook & Instagram"
          :status="statusFor('meta')"
          :status-label="statusLabelFor('meta')"
          :account-label="displayAccountLabel('meta')"
          :note="metaNote()"
          :connecting="oauthLoading === 'meta'"
          :disconnecting="actionLoading === 'disconnect:meta'"
          :reconnecting="oauthLoading === 'meta'"
          :busy="anyBusy()"
          show-edit
          :show-reconnect="statusFor('meta') === 'needs_setup' || statusFor('meta') === 'connected'"
          @connect="connectProvider('meta')"
          @disconnect="requestDisconnect('meta')"
          @edit="openEdit('meta')"
          @reconnect="connectProvider('meta')"
        >
          <template #icon>
            <div class="text-[#0866FF]">
              <MetaBrandIcon size="lg" />
            </div>
          </template>
        </SocialProviderCard>
      </div>

      <div role="listitem">
        <SocialProviderCard
          title="LinkedIn"
          subtitle="Páginas de empresas"
          :status="statusFor('linkedin')"
          :account-label="displayAccountLabel('linkedin')"
          :connecting="oauthLoading === 'linkedin'"
          :disconnecting="actionLoading === 'disconnect:linkedin'"
          :busy="anyBusy()"
          show-edit
          @connect="connectProvider('linkedin')"
          @disconnect="requestDisconnect('linkedin')"
          @edit="openEdit('linkedin')"
          @reconnect="connectProvider('linkedin')"
        >
          <template #icon>
            <div class="h-14 w-14 flex items-center justify-center rounded-xl bg-[#0A66C2] text-white">
              <Icon name="lucide:linkedin" class="h-8 w-8" />
            </div>
          </template>
        </SocialProviderCard>
      </div>
    </div>

    <Dialog v-model:open="editDialogOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle v-if="editProvider === 'google_ads'">
            Google Ads — escolher conta
          </DialogTitle>
          <DialogTitle v-else-if="editProvider === 'google_analytics'">
            Google Analytics — escolher propriedade
          </DialogTitle>
          <DialogTitle v-else-if="editProvider === 'meta'">
            Meta — configurar publicação
          </DialogTitle>
          <DialogTitle v-else-if="editProvider === 'linkedin'">
            LinkedIn — escolher organização
          </DialogTitle>
          <DialogDescription>
            Selecione a conta desejada e salve. Tokens e credenciais ficam apenas no servidor.
          </DialogDescription>
        </DialogHeader>

        <div
          v-if="editDialogInitialLoad || accountsLoading === editProvider"
          class="flex items-center gap-2 border rounded-lg border-dashed px-3 py-2 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" />
          Carregando contas…
        </div>

        <div v-if="editProvider === 'google_ads'" class="py-2 space-y-3">
          <Button
            variant="outline"
            class="w-full"
            :disabled="accountsLoading === 'google_ads'"
            @click="loadAccounts('google_ads')"
          >
            <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" :class="accountsLoading === 'google_ads' ? 'animate-spin' : ''" />
            {{ accountsLoading === 'google_ads' ? 'Carregando...' : 'Atualizar contas' }}
          </Button>
          <Alert v-if="googleAdsAccountsWarning" class="text-left">
            <Icon name="lucide:info" class="h-4 w-4" />
            <AlertTitle>Nomes parciais</AlertTitle>
            <AlertDescription>{{ googleAdsAccountsWarning }}</AlertDescription>
          </Alert>
          <div class="space-y-2">
            <Label>Conta de anúncios</Label>
            <Select v-model="selectedGoogleAds">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="account in googleAdsAccounts" :key="account.id" :value="account.id">
                  {{ googleAdsAccountLabel(account) }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-if="!googleAdsAccounts.length && accountsLoading !== 'google_ads'" class="text-xs text-muted-foreground">
              Nenhuma conta encontrada. Confirme que o Google Ads está conectado e que o usuário tem acesso a pelo menos uma conta.
            </p>
          </div>
        </div>

        <div v-else-if="editProvider === 'google_analytics'" class="py-2 space-y-3">
          <Button
            variant="outline"
            class="w-full"
            :disabled="accountsLoading === 'google_analytics'"
            @click="loadAccounts('google_analytics')"
          >
            <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" :class="accountsLoading === 'google_analytics' ? 'animate-spin' : ''" />
            {{ accountsLoading === 'google_analytics' ? 'Carregando...' : 'Carregar contas' }}
          </Button>
          <div class="space-y-2">
            <Label>Conta / propriedade</Label>
            <Select v-model="selectedGoogleAnalytics">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="account in googleAnalyticsAccounts" :key="account.id" :value="account.id">
                  {{ account.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-if="!googleAnalyticsAccounts.length && accountsLoading !== 'google_analytics'" class="text-xs text-muted-foreground">
              Nenhuma propriedade encontrada. Reconecte o Google Analytics e aceite o escopo de leitura.
            </p>
          </div>
        </div>

        <div v-else-if="editProvider === 'meta'" class="max-h-[70vh] overflow-y-auto py-2 space-y-3">
          <Button
            variant="outline"
            class="w-full"
            :disabled="accountsLoading === 'meta'"
            @click="loadMetaIntegrationLists"
          >
            <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" :class="accountsLoading === 'meta' ? 'animate-spin' : ''" />
            {{ accountsLoading === 'meta' ? 'Carregando...' : 'Recarregar listas' }}
          </Button>
          <div class="space-y-2">
            <Label>Conta de anúncios</Label>
            <Select
              :model-value="selectedMetaAdAccount"
              @update:model-value="onMetaAdAccountPicked($event)"
            >
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Selecione a conta de anúncios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="account in metaAccounts" :key="account.id" :value="account.id">
                  {{ account.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label>Página (Facebook)</Label>
            <Select
              :model-value="selectedMetaPage"
              @update:model-value="onMetaPagePicked($event)"
            >
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Selecione a página" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="page in metaPages" :key="page.id" :value="page.id">
                  {{ page.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label>Pixel</Label>
            <Select v-model="selectedMetaPixel" :disabled="!selectedMetaAdAccount">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Opcional — selecione o pixel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="px in metaPixels" :key="px.id" :value="px.id">
                  {{ px.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-if="selectedMetaAdAccount && !metaPixels.length" class="text-xs text-muted-foreground">
              Nenhum pixel nesta conta de anúncios (pode guardar na mesma).
            </p>
          </div>
          <div class="space-y-2">
            <Label>Instagram</Label>
            <Select
              v-model="selectedMetaInstagram"
              :disabled="!selectedMetaAdAccount && !selectedMetaPage"
            >
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Opcional — conta Business" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="ig in metaInstagramAccounts" :key="ig.id" :value="ig.id">
                  {{ ig.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-muted-foreground">
              Lista junta contas ligadas à <span class="font-medium">conta de anúncios</span> e à <span class="font-medium">página</span> (quando aplicável).
            </p>
            <p
              v-if="(selectedMetaAdAccount || selectedMetaPage) && !metaInstagramAccounts.length && accountsLoading !== 'meta'"
              class="text-xs text-muted-foreground"
            >
              Nenhuma conta Instagram encontrada por estes critérios (pode guardar na mesma).
            </p>
          </div>
        </div>

        <div v-else-if="editProvider === 'linkedin'" class="py-2 space-y-3">
          <Button
            variant="outline"
            class="w-full"
            :disabled="accountsLoading === 'linkedin'"
            @click="loadAccounts('linkedin')"
          >
            <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" :class="accountsLoading === 'linkedin' ? 'animate-spin' : ''" />
            {{ accountsLoading === 'linkedin' ? 'Carregando...' : 'Carregar organizações' }}
          </Button>
          <div class="space-y-2">
            <Label>Organização</Label>
            <Select v-model="selectedLinkedinOrganization">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Selecione a página da empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="organization in linkedinOrganizations"
                  :key="organization.id"
                  :value="organization.id"
                >
                  {{ organization.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-muted-foreground">
              O usuário conectado deve ser administrador ou gestor de conteúdo da página.
            </p>
          </div>
        </div>

        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" @click="editDialogOpen = false">
            Fechar
          </Button>
          <Button
            :disabled="dialogSaveDisabled"
            @click="saveFromDialog"
          >
            <Icon
              v-if="actionLoading === editProvider"
              name="lucide:loader-2"
              class="mr-2 h-4 w-4 animate-spin"
            />
            <Icon
              v-else
              name="lucide:save"
              class="mr-2 h-4 w-4"
            />
            {{ actionLoading === editProvider ? 'Salvando...' : 'Salvar' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="disconnectDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desconectar integração?</AlertDialogTitle>
          <AlertDialogDescription>
            Isso remove o acesso de
            {{ disconnectTarget ? providerTitle(disconnectTarget) : 'esta conta' }}
            nesta empresa. Você poderá conectar novamente depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="Boolean(actionLoading?.startsWith('disconnect:'))">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            :disabled="Boolean(actionLoading?.startsWith('disconnect:'))"
            @click.prevent="confirmDisconnect"
          >
            {{ actionLoading?.startsWith('disconnect:') ? 'Desconectando...' : 'Desconectar' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
