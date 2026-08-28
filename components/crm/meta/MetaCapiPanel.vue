<script setup lang="ts">
import { toast } from 'vue-sonner'

import Alert from '@/components/ui/alert/Alert.vue'
import AlertDescription from '@/components/ui/alert/AlertDescription.vue'
import AlertTitle from '@/components/ui/alert/AlertTitle.vue'
import Badge from '@/components/ui/badge/Badge.vue'
import Button from '@/components/ui/button/Button.vue'
import Card from '@/components/ui/card/Card.vue'
import CardContent from '@/components/ui/card/CardContent.vue'
import CardDescription from '@/components/ui/card/CardDescription.vue'
import CardHeader from '@/components/ui/card/CardHeader.vue'
import CardTitle from '@/components/ui/card/CardTitle.vue'
import Input from '@/components/ui/input/Input.vue'
import Label from '@/components/ui/label/Label.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Switch from '@/components/ui/switch/Switch.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import MetaCapiSyncDialog from '@/components/crm/meta/MetaCapiSyncDialog.vue'
import { useTenant } from '~/composables/useTenant'

interface CapiSettings {
  enabled: boolean
  pixel_id: string | null
  dataset_id: string | null
  ad_account_id: string | null
  business_id: string | null
  business_name: string | null
  has_token: boolean
  has_oauth: boolean
  setup_mode: 'manual' | 'oauth'
  test_event_code: string | null
  meta_connected: boolean
  pending_won_count: number
}

interface CapiEventRow {
  id: string
  lead_id: string
  lead_name: string | null
  lead_value: number | null
  event_name: string
  status: string
  attempts: number
  last_error: string | null
  sent_at: string | null
  created_at: string
  is_test?: boolean
}

interface MetaOption {
  id: string
  name: string
}

const props = defineProps<{
  autoFocus?: boolean
}>()

const route = useRoute()
const { tenantId } = useTenant()
const rootEl = ref<HTMLElement | null>(null)

const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const oauthLoading = ref(false)
const accountsLoading = ref(false)
const syncDialogOpen = ref(false)
const settings = ref<CapiSettings | null>(null)
const events = ref<CapiEventRow[]>([])
const enabled = ref(false)
const setupMode = ref<'manual' | 'oauth'>('oauth')
const pixelId = ref('')
const adAccountId = ref('')
const businessId = ref('')
const businessName = ref('')
const accessToken = ref('')
const testEventCode = ref('')
const lastError = ref('')
const metaBusinesses = ref<MetaOption[]>([])
const metaAccounts = ref<MetaOption[]>([])
const metaPixels = ref<MetaOption[]>([])

async function loadAll() {
  if (!tenantId.value)
    return
  loading.value = true
  lastError.value = ''
  try {
    const [settingsRes, eventsRes] = await Promise.all([
      $fetch<{ data: CapiSettings }>('/api/crm/meta-capi/settings', {
        query: { tenant_id: tenantId.value },
      }),
      $fetch<{ data: CapiEventRow[] }>('/api/crm/meta-capi/events', {
        query: { tenant_id: tenantId.value, limit: 20 },
      }),
    ])
    settings.value = settingsRes.data
    enabled.value = Boolean(settingsRes.data.enabled)
    setupMode.value = settingsRes.data.setup_mode || (settingsRes.data.has_oauth ? 'oauth' : 'oauth')
    pixelId.value = settingsRes.data.dataset_id || settingsRes.data.pixel_id || ''
    adAccountId.value = settingsRes.data.ad_account_id || ''
    businessId.value = settingsRes.data.business_id || ''
    businessName.value = settingsRes.data.business_name || ''
    testEventCode.value = settingsRes.data.test_event_code || ''
    events.value = eventsRes.data || []

    if (settingsRes.data.has_oauth)
      await loadMetaWizard({ silent: true })
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao carregar CAPI'
  }
  finally {
    loading.value = false
  }
}

async function loadMetaWizard(opts?: { silent?: boolean }) {
  if (!tenantId.value)
    return
  accountsLoading.value = true
  if (!opts?.silent)
    lastError.value = ''
  try {
    const businesses = await $fetch<{ data: MetaOption[] }>('/api/crm/meta-capi/accounts', {
      query: {
        tenant_id: tenantId.value,
        resource: 'businesses',
      },
    })
    metaBusinesses.value = businesses.data || []
    if (!businessId.value && metaBusinesses.value.length === 1) {
      businessId.value = metaBusinesses.value[0].id
      businessName.value = metaBusinesses.value[0].name
    }
    if (businessId.value) {
      const match = metaBusinesses.value.find(b => b.id === businessId.value)
      if (match)
        businessName.value = match.name
      else if (!metaBusinesses.value.some(b => b.id === businessId.value))
        businessId.value = ''
    }

    await loadAdAccounts({ silent: true })
    if (adAccountId.value || businessId.value)
      await loadDatasets({ silent: true })
  }
  catch (error: any) {
    if (!opts?.silent) {
      lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao carregar empresas Meta'
      toast.error(lastError.value)
    }
  }
  finally {
    accountsLoading.value = false
  }
}

async function loadAdAccounts(opts?: { silent?: boolean }) {
  if (!tenantId.value)
    return
  const ads = await $fetch<{ data: MetaOption[] }>('/api/crm/meta-capi/accounts', {
    query: {
      tenant_id: tenantId.value,
      resource: 'ad_accounts',
      business_id: businessId.value || undefined,
    },
  }).catch((error: any) => {
    if (!opts?.silent)
      throw error
    return { data: [] as MetaOption[] }
  })
  metaAccounts.value = ads.data || []
  if (adAccountId.value && !metaAccounts.value.some(a => a.id === adAccountId.value))
    adAccountId.value = ''
  if (!adAccountId.value && metaAccounts.value.length === 1)
    adAccountId.value = metaAccounts.value[0].id
}

async function loadDatasets(opts?: { silent?: boolean }) {
  if (!tenantId.value || (!adAccountId.value && !businessId.value)) {
    metaPixels.value = []
    return
  }
  const px = await $fetch<{ data: MetaOption[] }>('/api/crm/meta-capi/accounts', {
    query: {
      tenant_id: tenantId.value,
      resource: 'datasets',
      ad_account_id: adAccountId.value || undefined,
      business_id: businessId.value || undefined,
    },
  }).catch((error: any) => {
    if (!opts?.silent)
      throw error
    return { data: [] as MetaOption[] }
  })
  metaPixels.value = px.data || []
  if (pixelId.value && !metaPixels.value.some(p => p.id === pixelId.value))
    pixelId.value = ''
  if (!pixelId.value && metaPixels.value.length === 1)
    pixelId.value = metaPixels.value[0].id
}

async function onBusinessPicked(value: string | null) {
  businessId.value = value || ''
  const match = metaBusinesses.value.find(b => b.id === businessId.value)
  businessName.value = match?.name || ''
  adAccountId.value = ''
  pixelId.value = ''
  metaAccounts.value = []
  metaPixels.value = []
  if (!value)
    return
  accountsLoading.value = true
  lastError.value = ''
  try {
    await loadAdAccounts()
    if (adAccountId.value)
      await loadDatasets()
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao carregar contas'
    toast.error(lastError.value)
  }
  finally {
    accountsLoading.value = false
  }
}

async function onAdAccountPicked(value: string | null) {
  adAccountId.value = value || ''
  pixelId.value = ''
  metaPixels.value = []
  if (!value)
    return
  accountsLoading.value = true
  lastError.value = ''
  try {
    await loadDatasets()
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao carregar datasets'
    toast.error(lastError.value)
  }
  finally {
    accountsLoading.value = false
  }
}

async function connectMeta() {
  if (!tenantId.value)
    return
  oauthLoading.value = true
  lastError.value = ''
  try {
    const res = await $fetch<{ redirectTo: string }>('/api/crm/meta-capi/oauth/start', {
      query: {
        tenant_id: tenantId.value,
        redirect_path: '/settings/integrations/meta-capi',
      },
    })
    if (res.redirectTo)
      window.location.href = res.redirectTo
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao iniciar OAuth'
    toast.error(lastError.value)
    oauthLoading.value = false
  }
}

function buildSaveBody(): Record<string, unknown> {
  const body: Record<string, unknown> = {
    tenant_id: tenantId.value,
    enabled: enabled.value,
    setup_mode: setupMode.value,
    pixel_id: pixelId.value,
    dataset_id: pixelId.value,
    ad_account_id: adAccountId.value,
    business_id: businessId.value,
    business_name: businessName.value,
    test_event_code: testEventCode.value,
  }
  if (accessToken.value.trim())
    body.access_token = accessToken.value.trim()
  return body
}

async function saveSettings() {
  if (!tenantId.value)
    return
  if (setupMode.value === 'oauth') {
    if (metaBusinesses.value.length && !businessId.value.trim()) {
      toast.error('Selecione a empresa (Gerenciador de Negócios)')
      return
    }
    if (!adAccountId.value.trim()) {
      toast.error('Selecione a conta de anúncios')
      return
    }
    if (!pixelId.value.trim()) {
      toast.error('Selecione o Dataset (Pixel)')
      return
    }
  }
  if (setupMode.value === 'manual' && !pixelId.value.trim()) {
    toast.error('Informe o ID do Dataset/Pixel')
    return
  }
  saving.value = true
  lastError.value = ''
  try {
    const res = await $fetch<{ data: CapiSettings }>('/api/crm/meta-capi/settings', {
      method: 'PUT',
      body: buildSaveBody(),
    })
    settings.value = res.data
    enabled.value = Boolean(res.data.enabled)
    setupMode.value = res.data.setup_mode
    pixelId.value = res.data.dataset_id || res.data.pixel_id || ''
    adAccountId.value = res.data.ad_account_id || ''
    businessId.value = res.data.business_id || ''
    businessName.value = res.data.business_name || ''
    testEventCode.value = res.data.test_event_code || ''
    accessToken.value = ''
    toast.success('Configuração CAPI salva')
    await loadAll()
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Erro ao salvar'
    toast.error(lastError.value)
  }
  finally {
    saving.value = false
  }
}

async function sendTest(mode: 'default' | 'ctwa' = 'default') {
  if (!tenantId.value)
    return
  testing.value = true
  lastError.value = ''
  try {
    await $fetch('/api/crm/meta-capi/settings', {
      method: 'PUT',
      body: buildSaveBody(),
    })
    accessToken.value = ''

    await $fetch('/api/crm/meta-capi/test', {
      method: 'POST',
      body: { tenant_id: tenantId.value, mode },
    })
    toast.success(
      mode === 'ctwa'
        ? 'Evento CTWA de teste aceito pela Meta. Confira no Gerenciador de Eventos.'
        : 'Evento de teste enviado. Confira no Gerenciador de Eventos.',
    )
    await loadAll()
  }
  catch (error: any) {
    lastError.value = error?.data?.statusMessage || error?.message || 'Falha no teste'
    toast.error(lastError.value)
  }
  finally {
    testing.value = false
  }
}

async function syncPending() {
  if (!tenantId.value)
    return
  if (!enabled.value) {
    toast.error('Ative as Conversões Meta e salve antes de sincronizar')
    return
  }
  const hasAuth = Boolean(settings.value?.has_token || accessToken.value.trim() || settings.value?.has_oauth)
  if (!pixelId.value.trim() || !hasAuth) {
    toast.error('Configure Pixel e autenticação Meta antes de sincronizar')
    return
  }
  if (
    accessToken.value.trim()
    || pixelId.value !== (settings.value?.dataset_id || settings.value?.pixel_id || '')
    || adAccountId.value !== (settings.value?.ad_account_id || '')
    || businessId.value !== (settings.value?.business_id || '')
    || setupMode.value !== settings.value?.setup_mode
  ) {
    await saveSettings()
  }
  syncDialogOpen.value = true
}

async function onSyncDone() {
  await loadAll()
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: 'Pendente',
    processing: 'Processando',
    sent: 'Enviado',
    failed: 'Erro',
    skipped: 'Ignorado',
  }
  return map[status] || status
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'sent')
    return 'default'
  if (status === 'failed')
    return 'destructive'
  if (status === 'skipped')
    return 'outline'
  return 'secondary'
}

function formatDate(value?: string | null) {
  if (!value)
    return '—'
  return new Date(value).toLocaleString('pt-BR')
}

function consumeOauthQuery() {
  const oauth = String(route.query.oauth || '')
  const message = typeof route.query.message === 'string' ? route.query.message : ''
  if (!oauth)
    return
  if (oauth === 'success') {
    toast.success('Conta Meta conectada')
    setupMode.value = 'oauth'
  }
  else if (oauth === 'error') {
    toast.error(message || 'Falha na autenticação Meta')
  }
  const nextQuery = { ...route.query }
  delete nextQuery.oauth
  delete nextQuery.provider
  delete nextQuery.message
  navigateTo({ path: route.path, query: nextQuery }, { replace: true })
}

watch(tenantId, () => {
  if (tenantId.value)
    loadAll()
}, { immediate: true })

onMounted(() => {
  consumeOauthQuery()
  if (props.autoFocus && rootEl.value)
    rootEl.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
})
</script>

<template>
  <div ref="rootEl">
    <Card id="meta-capi" class="border rounded-2xl shadow-sm">
      <CardHeader class="pb-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle class="text-lg">
              Conversões CRM (Meta CAPI)
            </CardTitle>
            <CardDescription class="mt-1 max-w-2xl">
              Conecte à Meta (empresa → anúncios → dataset) no padrão do Gerenciador de Eventos.
              Envio semi-manual de ganhos (evento Purchase, BRL, action_source system_generated, event_source crm).
            </CardDescription>
          </div>
          <Badge
            v-if="settings"
            :variant="settings.meta_connected && settings.enabled ? 'default' : 'outline'"
          >
            {{ settings.enabled && settings.meta_connected ? 'Ativo' : settings.meta_connected ? 'Configurado' : 'Pendente' }}
          </Badge>
        </div>
      </CardHeader>

      <CardContent class="space-y-6">
        <Alert v-if="lastError" variant="destructive">
          <Icon name="lucide:triangle-alert" class="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{{ lastError }}</AlertDescription>
        </Alert>

        <div v-if="loading" class="text-sm text-muted-foreground">
          Carregando configuração...
        </div>

        <template v-else-if="settings">
          <div class="flex items-center justify-between gap-3 border rounded-xl px-4 py-3">
            <div>
                <p class="text-sm font-medium">
                  Ativar Conversões Meta
                </p>
                <p class="text-xs text-muted-foreground">
                  Permite o envio semi-manual de ganhos qualificáveis (evento Purchase)
                </p>
            </div>
            <Switch v-model:checked="enabled" />
          </div>

          <Tabs v-model="setupMode" class="w-full">
            <TabsList class="grid w-full grid-cols-2">
              <TabsTrigger value="oauth">
                Conectar Meta
              </TabsTrigger>
              <TabsTrigger value="manual">
                Manual
              </TabsTrigger>
            </TabsList>

            <TabsContent value="oauth" class="mt-4 space-y-4">
              <Alert>
                <Icon name="lucide:info" class="h-4 w-4" />
                <AlertTitle>App Blimber na Meta</AlertTitle>
                <AlertDescription class="text-sm">
                  1) Conectar com a Meta · 2) escolher a empresa · 3) conta de anúncios ·
                  4) dataset CRM. Eventos: action_source=<code>system_generated</code>,
                  lead_event_source=<code>Blimber</code>, event_source=<code>crm</code>.
                  Em modo Development, use um usuário tester/admin do app.
                </AlertDescription>
              </Alert>

              <div class="flex flex-wrap items-center gap-2">
                <Button
                  :disabled="oauthLoading"
                  @click="connectMeta"
                >
                  <Icon name="lucide:link" class="mr-2 h-4 w-4" />
                  {{ oauthLoading ? 'Redirecionando...' : settings.has_oauth ? 'Reconectar Meta' : 'Conectar com a Meta' }}
                </Button>
                <Button
                  v-if="settings.has_oauth"
                  variant="outline"
                  size="sm"
                  :disabled="accountsLoading"
                  @click="loadMetaWizard()"
                >
                  <Icon name="lucide:refresh-cw" class="mr-1 h-3.5 w-3.5" :class="{ 'animate-spin': accountsLoading }" />
                  Atualizar listas
                </Button>
                <Badge :variant="settings.has_oauth ? 'default' : 'outline'">
                  {{ settings.has_oauth ? 'Autorizado' : 'Não conectado' }}
                </Badge>
              </div>

              <div v-if="settings.has_oauth" class="grid gap-4 md:grid-cols-2">
                <div class="space-y-2 md:col-span-2">
                  <Label>1. Empresa (Gerenciador de Negócios)</Label>
                  <Select
                    :model-value="businessId || undefined"
                    :disabled="accountsLoading"
                    @update:model-value="onBusinessPicked"
                  >
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="business in metaBusinesses"
                        :key="business.id"
                        :value="business.id"
                      >
                        {{ business.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div class="space-y-2">
                  <Label>2. Conta de anúncios</Label>
                  <Select
                    :model-value="adAccountId || undefined"
                    :disabled="accountsLoading || (!businessId && metaBusinesses.length > 0)"
                    @update:model-value="onAdAccountPicked"
                  >
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="account in metaAccounts"
                        :key="account.id"
                        :value="account.id"
                      >
                        {{ account.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div class="space-y-2">
                  <Label>3. Dataset (Pixel)</Label>
                  <Select
                    v-model="pixelId"
                    :disabled="!adAccountId || accountsLoading"
                  >
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Selecione o dataset" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="pixel in metaPixels"
                        :key="pixel.id"
                        :value="pixel.id"
                      >
                        {{ pixel.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div class="space-y-2">
                  <Label>Código de teste (opcional)</Label>
                  <Input
                    v-model="testEventCode"
                    autocomplete="off"
                    placeholder="TEST12345"
                  />
                </div>

                <div class="space-y-2">
                  <Label>Token CAPI (opcional)</Label>
                  <Input
                    v-model="accessToken"
                    type="password"
                    autocomplete="off"
                    :placeholder="settings.has_token ? '•••••••• (já há token)' : 'Alternativa do Gerenciador de Eventos — opcional'"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="manual" class="mt-4 space-y-4">
              <Alert>
                <Icon name="lucide:info" class="h-4 w-4" />
                <AlertTitle>Cadastro manual (alternativa)</AlertTitle>
                <AlertDescription class="text-sm">
                  Preferimos o fluxo Conectar Meta. Use o cadastro manual só se precisar colar o ID do Dataset e o token do Gerenciador de Eventos.
                </AlertDescription>
              </Alert>

              <div class="grid gap-4 md:grid-cols-2">
                <div class="space-y-2">
                  <Label>ID do Dataset / Pixel</Label>
                  <Input
                    v-model="pixelId"
                    autocomplete="off"
                    placeholder="Ex: 123456789012345"
                  />
                </div>

                <div class="space-y-2">
                  <Label>Código de teste (opcional)</Label>
                  <Input
                    v-model="testEventCode"
                    autocomplete="off"
                    placeholder="TEST12345"
                  />
                </div>

                <div class="space-y-2 md:col-span-2">
                  <Label>Token da API de Conversões</Label>
                  <Input
                    v-model="accessToken"
                    type="password"
                    autocomplete="off"
                    :placeholder="settings.has_token ? '•••••••• (já configurado — cole para substituir)' : 'Cole o token do Gerenciador de Eventos'"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div class="rounded-xl border border-dashed bg-muted/20 p-4 space-y-3">
            <div>
              <p class="text-sm font-semibold">
                Envio semi-manual (ganhos)
              </p>
              <p class="text-xs text-muted-foreground">
                Abra a seleção e escolha quais leads em Ganho enviar à Meta.
                Telefone obrigatório; valor em BRL e data/hora inclusos.
                {{ settings.pending_won_count
                  ? `Há ${settings.pending_won_count} ganho(s) elegível(is).`
                  : 'Nenhum ganho elegível no momento.' }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button :disabled="saving" @click="saveSettings">
                <Icon name="lucide:save" class="mr-2 h-4 w-4" />
                {{ saving ? 'Salvando...' : 'Salvar' }}
              </Button>
              <Button variant="outline" :disabled="testing || saving" @click="sendTest('default')">
                <Icon name="lucide:flask-conical" class="mr-2 h-4 w-4" />
                {{ testing ? 'Enviando...' : 'Evento de teste' }}
              </Button>
              <Button variant="outline" :disabled="testing || saving" @click="sendTest('ctwa')">
                <Icon name="lucide:message-circle" class="mr-2 h-4 w-4" />
                Teste CTWA (WhatsApp)
              </Button>
              <Button variant="default" :disabled="saving" @click="syncPending">
                <Icon name="lucide:share-2" class="mr-2 h-4 w-4" />
                Selecionar ganhos e enviar
                <Badge v-if="settings.pending_won_count" variant="secondary" class="ml-2">
                  {{ settings.pending_won_count }}
                </Badge>
              </Button>
            </div>
            <p v-if="!enabled" class="text-xs text-amber-700 dark:text-amber-400">
              Ative as Conversões Meta e salve antes de sincronizar.
            </p>
          </div>

          <div>
            <div class="mb-3 flex items-center justify-between gap-2">
              <h3 class="text-sm font-semibold">
                Últimos envios
              </h3>
              <Button variant="ghost" size="sm" @click="loadAll">
                <Icon name="lucide:rotate-cw" class="mr-1 h-3.5 w-3.5" />
                Atualizar
              </Button>
            </div>

            <div v-if="!events.length" class="text-sm text-muted-foreground">
              Nenhum evento enviado ainda.
            </div>

            <div v-else class="overflow-x-auto border rounded-xl">
              <table class="w-full text-sm">
                <thead class="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th class="px-3 py-2 font-medium">
                      Lead
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Evento
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Status
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Data
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in events" :key="row.id" class="border-t">
                    <td class="px-3 py-2">
                      <div class="font-medium">
                        {{ row.lead_name || row.lead_id || '—' }}
                      </div>
                      <Badge v-if="row.is_test" variant="outline" class="mt-1">
                        Teste
                      </Badge>
                      <div v-if="row.last_error" class="max-w-xs truncate text-xs text-destructive">
                        {{ row.last_error }}
                      </div>
                    </td>
                    <td class="px-3 py-2">
                      {{ row.event_name }}
                    </td>
                    <td class="px-3 py-2">
                      <Badge :variant="statusVariant(row.status)">
                        {{ statusLabel(row.status) }}
                      </Badge>
                    </td>
                    <td class="px-3 py-2 text-muted-foreground">
                      {{ formatDate(row.sent_at || row.created_at) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </CardContent>
    </Card>

    <MetaCapiSyncDialog v-model:open="syncDialogOpen" @synced="onSyncDone" />
  </div>
</template>
