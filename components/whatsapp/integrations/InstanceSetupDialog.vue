<script setup lang="ts">
import type { EvolutionRemoteInstanceView, WhatsAppProvider } from '~/types/whatsapp'

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
const metaAvailable = computed(() => WHATSAPP_CLOUD_API_ENABLED && embeddedSignupAvailable.value)

const showAdvanced = ref(false)
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

// The Meta popup submits on its own; the footer button only serves the manual paths.
const advancedOpen = computed(() => showAdvanced.value || !metaAvailable.value)

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
  showAdvanced.value = false
}

onMounted(() => {
  fetchUserRole()
})

// The SDK has to be ready before the click: FB.login must run synchronously inside
// the handler or the browser blocks the popup.
watch(open, (isOpen) => {
  if (isOpen && metaAvailable.value)
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
        ? 'WhatsApp conectado — o número segue funcionando no celular'
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
        <DialogTitle>Conectar WhatsApp</DialogTitle>
      </DialogHeader>

      <div class="py-2 space-y-5">
        <div v-if="metaAvailable" class="border border-border/60 rounded-lg bg-muted/20 p-4 space-y-3">
          <div class="space-y-1">
            <p class="text-sm text-foreground font-medium">
              WhatsApp oficial da Meta
            </p>
            <p class="text-xs text-muted-foreground leading-relaxed">
              Você escolhe a conta e o número numa janela da Meta, sem token nem código. O número
              continua funcionando no aplicativo WhatsApp Business do celular, e só assim o sistema
              consegue identificar quais conversas vieram de anúncios.
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

        <div v-if="metaAvailable" class="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-auto p-0 text-xs text-muted-foreground"
            @click="showAdvanced = !showAdvanced"
          >
            {{ showAdvanced ? 'Ocultar outras formas de conectar' : 'Outras formas de conectar' }}
          </Button>
        </div>

        <div v-if="advancedOpen" class="space-y-4">
          <div class="space-y-2">
            <Label for="instance-name">Nome no sistema</Label>
            <Input id="instance-name" v-model="name" placeholder="Ex: Atendimento principal" />
          </div>

          <Tabs v-model="provider">
            <TabsList class="grid w-full" :class="isStaff ? 'grid-cols-2' : 'grid-cols-1'">
              <TabsTrigger value="evolution">
                Evolution API
              </TabsTrigger>
              <TabsTrigger v-if="isStaff" value="cloud_api">
                Cloud API manual
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

            <TabsContent v-if="isStaff" value="cloud_api" class="mt-4 space-y-3">
              <p class="text-xs text-muted-foreground">
                Use apenas quando o número já foi cadastrado direto no painel da Meta.
              </p>
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
            </TabsContent>
          </Tabs>
        </div>

        <label class="flex items-center gap-2 text-sm">
          <input v-model="isDefault" type="checkbox" class="border rounded">
          Definir como instância padrão
        </label>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">
          Cancelar
        </Button>
        <Button v-if="advancedOpen" :disabled="saving" @click="handleSubmit">
          {{ saving ? 'Salvando...' : (provider === 'evolution' && evolutionMode === 'link' ? 'Vincular instância' : 'Criar instância') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
