<script setup lang="ts">
import type { WhatsAppProvider } from '~/types/whatsapp'

import { toast } from 'vue-sonner'

import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { WHATSAPP_CLOUD_API_ENABLED } from '~/constants/whatsapp'

const emit = defineEmits<{
  created: []
}>()

const open = defineModel<boolean>('open', { default: false })

const { createInstance, createInstanceFromEmbeddedSignup, discoverEvolutionInstances } = useWhatsAppInstances()
const { isAvailable: embeddedSignupAvailable, prepare: prepareEmbeddedSignup, launch: launchEmbeddedSignup } = useMetaEmbeddedSignup()
const { userRole, fetchUserRole } = useRole()

const isStaff = computed(() => userRole.value === 'admin' || userRole.value === 'funcionario')
const showManualCloudForm = ref(false)
const connectingMeta = ref(false)

const provider = ref<WhatsAppProvider>('evolution')
const evolutionMode = ref<'create' | 'link'>('link')
const name = ref('')
const apiUrl = ref('')
const apiToken = ref('')
const evolutionInstanceName = ref('')
const remoteInstances = ref<EvolutionRemoteInstanceView[]>([])
const cloudPhoneId = ref('')
const cloudBusinessId = ref('')
const cloudAccessToken = ref('')
const cloudAppSecret = ref('')
const isDefault = ref(false)
const saving = ref(false)
const discovering = ref(false)

// On the Cloud tab the popup does the submitting, unless the manual fallback is open.
const showSubmitButton = computed(() =>
  provider.value !== 'cloud_api'
  || !embeddedSignupAvailable.value
  || showManualCloudForm.value,
)

function resetForm() {
  name.value = ''
  apiUrl.value = ''
  apiToken.value = ''
  evolutionInstanceName.value = ''
  remoteInstances.value = []
  cloudPhoneId.value = ''
  cloudBusinessId.value = ''
  cloudAccessToken.value = ''
  cloudAppSecret.value = ''
  isDefault.value = false
  provider.value = 'evolution'
  evolutionMode.value = 'link'
  showManualCloudForm.value = false
}

onMounted(() => {
  fetchUserRole()
})

// The SDK has to be ready before the click: FB.login must run synchronously inside
// the handler or the browser blocks the popup.
watch([open, provider], ([isOpen, currentProvider]) => {
  if (isOpen && currentProvider === 'cloud_api' && embeddedSignupAvailable.value)
    prepareEmbeddedSignup().catch(() => {})
})

async function handleMetaConnect() {
  connectingMeta.value = true
  try {
    const session = await launchEmbeddedSignup()
    if (!session) {
      toast.message('Conexão cancelada')
      return
    }

    const result = await createInstanceFromEmbeddedSignup({
      code: session.code,
      waba_id: session.wabaId,
      phone_number_id: session.phoneNumberId,
      coexistence: session.coexistence,
      name: name.value.trim() || undefined,
      is_default: isDefault.value,
    })

    toast.success(
      result.coexistence
        ? 'WhatsApp conectado em coexistência — o número segue funcionando no celular'
        : 'WhatsApp conectado com sucesso',
    )

    open.value = false
    resetForm()
    emit('created')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao conectar com a Meta')
  }
  finally {
    connectingMeta.value = false
  }
}

async function handleDiscover() {
  if (!apiUrl.value.trim() || !apiToken.value.trim()) {
    toast.error('Informe URL e token da Evolution API')
    return
  }

  discovering.value = true
  try {
    const response = await discoverEvolutionInstances({
      api_url: apiUrl.value.trim(),
      api_token: apiToken.value.trim(),
    })
    remoteInstances.value = response.data || []
    if (!remoteInstances.value.length) {
      toast.message('Nenhuma instância encontrada na Evolution API')
    }
    else {
      const connected = remoteInstances.value.find(item => item.isConnected)
      if (connected && !evolutionInstanceName.value)
        evolutionInstanceName.value = connected.instanceName
    }
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao buscar instâncias')
  }
  finally {
    discovering.value = false
  }
}

function formatRemoteLabel(item: EvolutionRemoteInstanceView) {
  const status = item.isConnected ? 'conectada' : item.status
  const phone = item.phoneNumber ? ` · ${item.phoneNumber}` : ''
  return `${item.instanceName} (${status})${phone}`
}

async function handleSubmit() {
  if (!name.value.trim()) {
    toast.error('Informe o nome da instância')
    return
  }

  if (provider.value === 'evolution' && evolutionMode.value === 'link' && !evolutionInstanceName.value.trim()) {
    toast.error('Informe o nome da instância na Evolution API')
    return
  }

  if (provider.value === 'cloud_api') {
    if (!cloudPhoneId.value.trim() || !cloudBusinessId.value.trim() || !cloudAccessToken.value.trim()) {
      toast.error('Informe Phone Number ID, WABA ID e token de acesso')
      return
    }
  }

  saving.value = true
  try {
    const result = await createInstance({
      name: name.value.trim(),
      provider: provider.value,
      is_default: isDefault.value,
      api_url: provider.value === 'evolution' ? apiUrl.value.trim() : undefined,
      api_token: provider.value === 'evolution' ? apiToken.value.trim() : undefined,
      evolution_instance_name: provider.value === 'evolution' && evolutionMode.value === 'link'
        ? evolutionInstanceName.value.trim()
        : undefined,
      link_existing: provider.value === 'evolution' && evolutionMode.value === 'link',
      cloud_phone_id: provider.value === 'cloud_api' ? cloudPhoneId.value.trim() : undefined,
      cloud_business_id: provider.value === 'cloud_api' ? cloudBusinessId.value.trim() : undefined,
      cloud_access_token: provider.value === 'cloud_api' ? cloudAccessToken.value.trim() : undefined,
      cloud_app_secret: provider.value === 'cloud_api' ? cloudAppSecret.value.trim() || undefined : undefined,
    })

    const linked = provider.value === 'evolution' && evolutionMode.value === 'link'
    const status = result.data?.status
    if (linked && status === 'connected') {
      toast.success('Instância existente vinculada e sincronizada')
    }
    else {
      toast.success('Instância criada com sucesso')
    }

    open.value = false
    resetForm()
    emit('created')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao criar instância')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Nova instância WhatsApp</DialogTitle>
      </DialogHeader>

      <div class="py-2 space-y-4">
        <div class="space-y-2">
          <Label for="instance-name">Nome no sistema</Label>
          <Input id="instance-name" v-model="name" placeholder="Ex: Atendimento principal" />
        </div>

        <Tabs v-model="provider">
          <TabsList class="grid grid-cols-2 w-full">
            <TabsTrigger value="evolution">
              Evolution API
            </TabsTrigger>
            <TabsTrigger value="cloud_api" :disabled="!WHATSAPP_CLOUD_API_ENABLED">
              Cloud API
              <span
                v-if="!WHATSAPP_CLOUD_API_ENABLED"
                class="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-medium tracking-wide uppercase"
              >
                Em breve
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="evolution" class="mt-4 space-y-3">
            <div class="space-y-2">
              <Label for="api-url">URL da API</Label>
              <Input id="api-url" v-model="apiUrl" placeholder="https://sua-evolution.com" />
            </div>
            <div class="space-y-2">
              <Label for="api-token">Token (apikey)</Label>
              <Input id="api-token" v-model="apiToken" type="password" autocomplete="off" />
            </div>

            <Tabs v-model="evolutionMode" class="w-full">
              <TabsList class="grid grid-cols-2 w-full">
                <TabsTrigger value="link">
                  Vincular existente
                </TabsTrigger>
                <TabsTrigger value="create">
                  Criar nova
                </TabsTrigger>
              </TabsList>

              <TabsContent value="link" class="mt-3 space-y-3">
                <p class="text-xs text-muted-foreground">
                  Use quando a instância já está conectada na Evolution API. O sistema sincroniza status e webhook.
                </p>
                <div class="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    class="shrink-0"
                    :disabled="discovering"
                    @click="handleDiscover"
                  >
                    {{ discovering ? 'Buscando...' : 'Buscar instâncias' }}
                  </Button>
                </div>
                <div v-if="remoteInstances.length" class="space-y-2">
                  <Label>Instâncias encontradas</Label>
                  <Select v-model="evolutionInstanceName">
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma instância" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="item in remoteInstances"
                        :key="item.instanceName"
                        :value="item.instanceName"
                      >
                        {{ formatRemoteLabel(item) }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="space-y-2">
                  <Label for="evolution-instance-name">Nome na Evolution API</Label>
                  <Input
                    id="evolution-instance-name"
                    v-model="evolutionInstanceName"
                    placeholder="Ex: minha-instancia"
                  />
                </div>
              </TabsContent>

              <TabsContent value="create" class="mt-3">
                <p class="text-xs text-muted-foreground">
                  Cria uma nova instância na Evolution API e gera QR Code para conexão.
                </p>
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="cloud_api" class="mt-4 space-y-4">
            <p class="text-xs text-muted-foreground">
              API oficial da Meta. Necessária para capturar a origem de anúncios que clicam para o WhatsApp.
            </p>

            <div v-if="embeddedSignupAvailable" class="border rounded-lg p-4 space-y-3">
              <div class="space-y-1">
                <p class="text-sm font-medium">
                  Conectar pela Meta
                </p>
                <p class="text-xs text-muted-foreground">
                  Você escolhe a conta e o número numa janela da Meta. O número continua funcionando
                  no aplicativo WhatsApp Business do celular.
                </p>
              </div>
              <Button
                type="button"
                class="w-full"
                :disabled="connectingMeta"
                @click="handleMetaConnect"
              >
                {{ connectingMeta ? 'Conectando...' : 'Conectar com a Meta' }}
              </Button>
            </div>

            <div v-if="isStaff || !embeddedSignupAvailable" class="space-y-3">
              <Button
                v-if="embeddedSignupAvailable"
                type="button"
                variant="ghost"
                size="sm"
                class="h-auto p-0 text-xs text-muted-foreground"
                @click="showManualCloudForm = !showManualCloudForm"
              >
                {{ showManualCloudForm ? 'Ocultar configuração manual' : 'Configuração manual (interno)' }}
              </Button>

              <div v-if="showManualCloudForm || !embeddedSignupAvailable" class="space-y-3">
                <div class="space-y-2">
                  <Label for="cloud-phone-id">Phone Number ID</Label>
                  <Input id="cloud-phone-id" v-model="cloudPhoneId" placeholder="Ex: 123456789012345" />
                </div>
                <div class="space-y-2">
                  <Label for="cloud-business-id">WABA ID</Label>
                  <Input id="cloud-business-id" v-model="cloudBusinessId" placeholder="ID da conta do WhatsApp Business" />
                </div>
                <div class="space-y-2">
                  <Label for="cloud-access-token">Token de acesso permanente</Label>
                  <Input id="cloud-access-token" v-model="cloudAccessToken" type="password" autocomplete="off" />
                </div>
                <div class="space-y-2">
                  <Label for="cloud-app-secret">App Secret (opcional)</Label>
                  <Input id="cloud-app-secret" v-model="cloudAppSecret" type="password" autocomplete="off" />
                  <p class="text-xs text-muted-foreground">
                    Só é necessário quando o número foi cadastrado em outro app da Meta.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <label class="flex items-center gap-2 text-sm">
          <input v-model="isDefault" type="checkbox" class="border rounded">
          Definir como instância padrão
        </label>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">
          Cancelar
        </Button>
        <Button v-if="showSubmitButton" :disabled="saving" @click="handleSubmit">
          {{ saving ? 'Salvando...' : (provider === 'evolution' && evolutionMode === 'link' ? 'Vincular instância' : 'Criar instância') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
