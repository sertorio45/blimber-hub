<script setup lang="ts">
import type { WhatsAppInstanceView } from '~/types/whatsapp'

import ConnectionStatus from '~/components/whatsapp/integrations/ConnectionStatus.vue'
import QrCodeDisplay from '~/components/whatsapp/integrations/QrCodeDisplay.vue'
import WebhookUrlCopy from '~/components/whatsapp/integrations/WebhookUrlCopy.vue'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'

const props = defineProps<{
  instance: WhatsAppInstanceView
  webhookUrl?: string
  actionLoading?: boolean
}>()

const emit = defineEmits<{
  connect: []
  disconnect: []
  test: []
  sync: []
  delete: []
  open: []
  setDefault: [isDefault: boolean]
}>()

const providerLabel = computed(() => {
  if (props.instance.provider === 'cloud_api')
    return 'Cloud API (Meta)'
  return 'Evolution API'
})

// Coexistence keeps the number working in the WhatsApp Business app on the phone.
const isCoexistence = computed(() => Boolean(props.instance.metadata?.is_on_biz_app))
</script>

<template>
  <Card class="overflow-hidden">
    <CardHeader class="flex flex-row items-start justify-between gap-4 space-y-0">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <CardTitle class="text-lg">
            {{ instance.name }}
          </CardTitle>
          <Badge v-if="instance.isDefault" variant="secondary">
            Padrão
          </Badge>
          <Badge v-if="isCoexistence" variant="outline">
            Coexistência ativa
          </Badge>
        </div>
        <p class="text-sm text-muted-foreground">
          {{ providerLabel }}
        </p>
      </div>
      <ConnectionStatus :status="instance.status" :phone-number="instance.phoneNumber" />
    </CardHeader>

    <CardContent class="space-y-4">
      <p v-if="isCoexistence" class="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        O número continua funcionando no aplicativo WhatsApp Business do celular. Peça para a equipe
        abrir o app pelo menos uma vez a cada duas semanas para manter a conexão.
      </p>
      <WebhookUrlCopy
        v-if="webhookUrl"
        :url="webhookUrl"
        label="URL do webhook"
      />
      <div class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
        <div class="min-w-0">
          <Label class="text-sm font-medium">Instância padrão</Label>
          <p class="text-xs text-muted-foreground">
            Usada em campanhas e envios quando nenhuma caixa estiver definida.
          </p>
        </div>
        <Switch
          :checked="instance.isDefault"
          :disabled="actionLoading"
          @update:checked="emit('setDefault', $event)"
        />
      </div>
      <QrCodeDisplay
        v-if="instance.provider === 'evolution' && instance.status === 'connecting'"
        :qr-code="instance.qrCode"
      />
    </CardContent>

    <CardFooter class="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" @click="emit('open')">
        Configurar
      </Button>
      <Button
        v-if="instance.provider === 'evolution' && instance.status !== 'connected'"
        size="sm"
        :disabled="actionLoading"
        @click="emit('connect')"
      >
        Conectar
      </Button>
      <Button
        v-if="instance.status === 'connected' || instance.status === 'connecting'"
        variant="outline"
        size="sm"
        :disabled="actionLoading"
        @click="emit('disconnect')"
      >
        Desconectar
      </Button>
      <Button
        v-if="instance.provider === 'evolution'"
        variant="outline"
        size="sm"
        :disabled="actionLoading"
        @click="emit('sync')"
      >
        Sincronizar
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="actionLoading"
        @click="emit('test')"
      >
        Testar
      </Button>
      <Button
        variant="destructive"
        size="sm"
        :disabled="actionLoading"
        @click="emit('delete')"
      >
        Excluir
      </Button>
    </CardFooter>
  </Card>
</template>
