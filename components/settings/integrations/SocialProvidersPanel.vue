<script setup lang="ts">
import GoogleAdsBrandIcon from '@/components/brand/GoogleAdsBrandIcon.vue'
import GoogleAnalyticsBrandIcon from '@/components/brand/GoogleAnalyticsBrandIcon.vue'
import MetaBrandIcon from '@/components/brand/MetaBrandIcon.vue'
import MarketingPageSkeleton from '@/components/marketing/MarketingPageSkeleton.vue'

type Provider = 'google_ads' | 'google_analytics' | 'meta' | 'linkedin'

const SETTINGS_INTEGRATIONS_PATH = '/settings/integrations'

const { tenantId } = useTenant()
const route = useRoute()
type GoogleAdsAccountOption = {
  id: string
  name: string
  is_manager?: boolean
  login_customer_id?: string | null
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

const { data: integrations, refresh, pending, showSkeleton } = useMarketingFetch({
  key: () => `marketing-integrations-${tenantId.value}`,
  handler: async () => {
    const response = await $fetch<{ data: any[] }>('/api/marketing/integrations', {
      query: {
        tenant_id: tenantId.value || undefined,
      },
    })
    return response.data || []
  },
  default: () => [] as any[],
  watch: [tenantId],
  enabled: () => Boolean(tenantId.value),
})

const connectedProviders = computed(() => new Set((integrations.value || []).map((i: any) => i.provider)))

function isConnected(provider: string) {
  return connectedProviders.value.has(provider)
}

function rowFor(provider: Provider) {
  return integrations.value?.find((r: any) => r.provider === provider)
}

const metaPublishReady = computed(() => {
  const row = rowFor('meta')
  if (!row?.has_key)
    return false
  return Boolean(row.can_publish)
})

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
    return '—'
  const c = row.config || {}
  if (provider === 'google_ads') {
    const id = c.customer_id ? String(c.customer_id) : ''
    if (!id)
      return row.google_ads_needs_account ? 'Selecione a conta de anúncios' : 'Selecione a conta em editar'
    const acc = googleAdsAccounts.value.find(a => String(a.id) === id)
    return acc ? googleAdsAccountLabel(acc) : `Conta ${formatGoogleAdsCustomerId(id)}`
  }
  if (provider === 'google_analytics') {
    const id = String(c.property_id || c.analytics_account_id || '')
    if (!id)
      return 'Selecione a conta em editar'
    const acc = googleAnalyticsAccounts.value.find(a => String(a.id) === id)
    return acc?.name || id
  }
  if (provider === 'meta') {
    if (!c.ad_account_id)
      return 'Selecione em editar'
    const adId = String(c.ad_account_id)
    const adName = metaAccounts.value.find(a => String(a.id) === adId)?.name || adId
    const parts: string[] = [adName]
    if (c.page_id) {
      const pn = metaPages.value.find(p => String(p.id) === String(c.page_id))?.name
      parts.push(pn || `Página ${c.page_id}`)
    }
    if (c.pixel_id)
      parts.push(metaPixels.value.find(p => String(p.id) === String(c.pixel_id))?.name || `Pixel ${c.pixel_id}`)
    if (c.instagram_business_account_id) {
      const ig = metaInstagramAccounts.value.find(i => String(i.id) === String(c.instagram_business_account_id))
      parts.push(ig?.name || `IG ${c.instagram_business_account_id}`)
    }
    return parts.join(' · ')
  }
  if (provider === 'linkedin') {
    const id = String(c.organization_id || '')
    if (!id)
      return 'Selecione a organização em editar'
    return linkedinOrganizations.value.find(item => item.id === id)?.name
      || c.organization_name
      || id
  }
  return '—'
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

watch(
  () => integrations.value,
  async (rows) => {
    if (!rows?.length || !import.meta.client)
      return
    for (const r of rows) {
      if (!r.has_key)
        continue
      const p = r.provider as Provider
      if (p === 'google_ads' || p === 'google_analytics')
        await loadAccounts(p)
      if (p === 'linkedin')
        await loadAccounts('linkedin')
      if (p === 'meta') {
        await loadAccounts('meta')
        await loadMetaAuxiliaryListsForCard()
      }
    }
  },
  { immediate: true },
)

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

/** Load pages / pixels / IG names for summary line when integration already configured */
async function loadMetaAuxiliaryListsForCard() {
  if (!isConnected('meta'))
    return
  const tid = tenantId.value || undefined
  try {
    const [pages, pixels] = await Promise.all([
      $fetch<{ data: Array<{ id: string, name: string }> }>('/api/marketing/oauth/accounts', {
        query: { provider: 'meta', resource: 'pages', tenant_id: tid },
      }),
      selectedMetaAdAccount.value
        ? $fetch<{ data: Array<{ id: string, name: string }> }>('/api/marketing/oauth/accounts', {
            query: {
              provider: 'meta',
              resource: 'pixels',
              ad_account_id: selectedMetaAdAccount.value,
              tenant_id: tid,
            },
          })
        : Promise.resolve({ data: [] }),
    ])
    metaPages.value = pages.data || []
    metaPixels.value = pixels.data || []
    await refreshMetaInstagramList()
  }
  catch {
    /* non-blocking for card label */
  }
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
    if (!response?.redirectTo)
      return
    if (import.meta.client)
      window.location.assign(response.redirectTo)
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao iniciar OAuth'
  }
  finally {
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
    const selected = googleAdsAccounts.value.find(a => String(a.id) === String(selectedGoogleAds.value))
    await $fetch('/api/marketing/integrations', {
      method: 'POST',
      body: {
        tenant_id: tenantId.value || undefined,
        provider: 'google_ads',
        config: {
          customer_id: selectedGoogleAds.value,
          // Auto-detected MCC when the selected client account requires it.
          login_customer_id: selected?.login_customer_id || null,
        },
        is_active: true,
      },
    })
    await refresh()
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
  actionLoading.value = null
}

async function saveMetaAccount() {
  actionLoading.value = 'meta'
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
  await loadMetaAuxiliaryListsForCard()
  actionLoading.value = null
}

async function saveLinkedinOrganization() {
  actionLoading.value = 'linkedin'
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
  actionLoading.value = null
}

async function disconnectProvider(provider: Provider) {
  actionLoading.value = `disconnect:${provider}`
  try {
    await $fetch('/api/marketing/integrations', {
      method: 'DELETE',
      body: {
        tenant_id: tenantId.value || undefined,
        provider,
      },
    })
    await refresh()
  }
  finally {
    actionLoading.value = null
  }
}

function openEdit(provider: Provider) {
  editProvider.value = provider
  editDialogOpen.value = true
  if (provider === 'meta')
    loadMetaIntegrationLists()
  else
    loadAccounts(provider)
}

const dialogSaveDisabled = computed(() => {
  if (pending.value || actionLoading.value === editProvider.value)
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
  editDialogOpen.value = false
}

async function primaryAction(provider: Provider) {
  if (isConnected(provider)) {
    await disconnectProvider(provider)
    return
  }
  await connectProvider(provider)
}

function primaryButtonLabel(provider: Provider) {
  if (oauthLoading.value === provider)
    return 'Conectando...'
  if (actionLoading.value === `disconnect:${provider}`)
    return 'Desconectando...'
  return isConnected(provider) ? 'Desconectar' : 'Conectar conta'
}

function primaryDisabled(provider: Provider) {
  if (oauthLoading.value)
    return true
  if (actionLoading.value === `disconnect:${provider}`)
    return true
  return false
}

watch(
  () => route.query.oauth,
  async (oauthStatus) => {
    if (oauthStatus === 'success') {
      await refresh()
    }
    if (oauthStatus === 'error') {
      lastError.value = String(route.query.message || 'Falha na autenticação OAuth')
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="w-full flex flex-col gap-6">
    <div>
      <h2 class="text-lg text-foreground font-semibold tracking-tight">
        Redes e anúncios
      </h2>
      <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
        Meta, Google e LinkedIn — mesmas contas usadas no Marketing. Credenciais só no servidor, por empresa.
      </p>
    </div>

    <Alert v-if="!pending && lastError" variant="destructive">
      <Icon name="lucide:triangle-alert" class="h-4 w-4" />
      <AlertTitle>Falha na integração</AlertTitle>
      <AlertDescription>{{ lastError }}</AlertDescription>
    </Alert>

    <Alert v-if="!pending && isConnected('meta') && metaPublishIssues.length">
      <Icon name="lucide:info" class="h-4 w-4" />
      <AlertTitle>Meta conectada, mas publicação incompleta</AlertTitle>
      <AlertDescription class="space-y-1">
        <p v-for="issue in metaPublishIssues" :key="issue">
          {{ issue }}
        </p>
        <p>
          Clique em <strong>Conectar conta</strong> novamente, aceite todas as permissões e selecione a Página vinculada ao Instagram.
        </p>
      </AlertDescription>
    </Alert>

    <MarketingPageSkeleton v-if="showSkeleton" variant="integrations" content-only />

    <div v-else class="grid gap-6 lg:grid-cols-3 sm:grid-cols-2">
      <!-- Google Ads -->
      <Card class="relative overflow-hidden border rounded-2xl bg-card shadow-md">
        <Button
          variant="ghost"
          size="icon"
          class="absolute right-2 top-2 z-10 h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="Edit Google Ads integration"
          @click="openEdit('google_ads')"
        >
          <Icon name="lucide:square-pen" class="h-4 w-4" />
        </Button>
        <CardContent class="flex flex-col items-center px-6 pb-8 pt-10 text-center">
          <div class="h-14 w-14 flex items-center justify-center">
            <GoogleAdsBrandIcon size="lg" />
          </div>
          <h2 class="mt-4 text-lg text-foreground font-semibold">
            Google Ads
          </h2>
          <Button
            class="mt-6 max-w-[240px] w-full rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90"
            :disabled="primaryDisabled('google_ads')"
            @click="primaryAction('google_ads')"
          >
            {{ primaryButtonLabel('google_ads') }}
          </Button>
          <p class="mt-4 max-w-[240px] truncate text-xs text-muted-foreground font-medium tracking-wide uppercase">
            {{ displayAccountLabel('google_ads') }}
          </p>
          <div
            v-if="isConnected('google_ads')"
            class="mt-6 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span class="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            <span>Conectado</span>
          </div>
        </CardContent>
      </Card>

      <!-- Google Analytics -->
      <Card class="relative overflow-hidden border rounded-2xl bg-card shadow-md">
        <Button
          variant="ghost"
          size="icon"
          class="absolute right-2 top-2 z-10 h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="Edit Google Analytics integration"
          @click="openEdit('google_analytics')"
        >
          <Icon name="lucide:square-pen" class="h-4 w-4" />
        </Button>
        <CardContent class="flex flex-col items-center px-6 pb-8 pt-10 text-center">
          <div class="h-14 w-14 flex items-center justify-center">
            <GoogleAnalyticsBrandIcon size="lg" />
          </div>
          <h2 class="mt-4 text-lg text-foreground font-semibold">
            Google Analytics
          </h2>
          <Button
            class="mt-6 max-w-[240px] w-full rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90"
            :disabled="primaryDisabled('google_analytics')"
            @click="primaryAction('google_analytics')"
          >
            {{ primaryButtonLabel('google_analytics') }}
          </Button>
          <p class="mt-4 max-w-[240px] truncate text-xs text-muted-foreground font-medium tracking-wide uppercase">
            {{ displayAccountLabel('google_analytics') }}
          </p>
          <div
            v-if="isConnected('google_analytics')"
            class="mt-6 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span class="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            <span>Conectado</span>
          </div>
        </CardContent>
      </Card>

      <!-- Meta -->
      <Card class="relative overflow-hidden border rounded-2xl bg-card shadow-md">
        <Button
          variant="ghost"
          size="icon"
          class="absolute right-2 top-2 z-10 h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="Edit Meta integration"
          @click="openEdit('meta')"
        >
          <Icon name="lucide:square-pen" class="h-4 w-4" />
        </Button>
        <CardContent class="flex flex-col items-center px-6 pb-8 pt-10 text-center">
          <div class="h-14 w-14 flex items-center justify-center text-[#0866FF]">
            <MetaBrandIcon size="lg" />
          </div>
          <h2 class="mt-4 text-lg text-foreground font-semibold">
            Meta
          </h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Facebook &amp; Instagram
          </p>
          <Button
            class="mt-6 max-w-[240px] w-full rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90"
            :disabled="primaryDisabled('meta')"
            @click="primaryAction('meta')"
          >
            {{ primaryButtonLabel('meta') }}
          </Button>
          <p class="line-clamp-2 mt-4 max-w-[260px] text-xs text-muted-foreground font-medium tracking-wide uppercase">
            {{ displayAccountLabel('meta') }}
          </p>
          <div
            v-if="isConnected('meta')"
            class="mt-6 flex items-center gap-2 text-sm"
            :class="metaPublishReady ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'"
          >
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :class="metaPublishReady ? 'bg-emerald-500' : 'bg-amber-500'"
              aria-hidden="true"
            />
            <span>{{ metaPublishReady ? 'Pronto para publicar' : 'Conectado — falta configurar publicação' }}</span>
          </div>
          <p
            v-if="isConnected('meta') && rowFor('meta')?.capi_enabled"
            class="mt-2 text-xs text-muted-foreground"
          >
            CAPI CRM {{ rowFor('meta')?.has_capi_token ? 'ativo' : 'ativo — falta token' }}
          </p>
          <Button
            v-if="isConnected('meta') && !metaPublishReady"
            variant="outline"
            size="sm"
            class="mt-3 rounded-full"
            :disabled="primaryDisabled('meta')"
            @click="connectProvider('meta')"
          >
            Reconectar Meta
          </Button>
        </CardContent>
      </Card>

      <!-- LinkedIn -->
      <Card class="relative overflow-hidden border rounded-2xl bg-card shadow-md">
        <Button
          variant="ghost"
          size="icon"
          class="absolute right-2 top-2 z-10 h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="Editar integração LinkedIn"
          @click="openEdit('linkedin')"
        >
          <Icon name="lucide:square-pen" class="h-4 w-4" />
        </Button>
        <CardContent class="flex flex-col items-center px-6 pb-8 pt-10 text-center">
          <div class="h-14 w-14 flex items-center justify-center rounded-xl bg-[#0A66C2] text-white">
            <Icon name="lucide:linkedin" class="h-8 w-8" />
          </div>
          <h2 class="mt-4 text-lg text-foreground font-semibold">
            LinkedIn
          </h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Páginas de empresas
          </p>
          <Button
            class="mt-6 max-w-[240px] w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
            :disabled="primaryDisabled('linkedin')"
            @click="primaryAction('linkedin')"
          >
            {{ primaryButtonLabel('linkedin') }}
          </Button>
          <p class="line-clamp-2 mt-4 max-w-[260px] text-xs text-muted-foreground font-medium tracking-wide uppercase">
            {{ displayAccountLabel('linkedin') }}
          </p>
          <div
            v-if="isConnected('linkedin')"
            class="mt-6 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span class="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <span>Conectado</span>
          </div>
        </CardContent>
      </Card>
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

        <div v-if="editProvider === 'google_ads'" class="py-2 space-y-3">
          <Button
            variant="outline"
            class="w-full"
            :disabled="accountsLoading === 'google_ads'"
            @click="loadAccounts('google_ads')"
          >
            <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" />
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
            <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" />
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
          </div>
        </div>

        <div v-else-if="editProvider === 'meta'" class="max-h-[70vh] overflow-y-auto py-2 space-y-3">
          <Button
            variant="outline"
            class="w-full"
            :disabled="accountsLoading === 'meta'"
            @click="loadMetaIntegrationLists"
          >
            <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" />
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
            <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" />
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
            <Icon name="lucide:save" class="mr-2 h-4 w-4" />
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
