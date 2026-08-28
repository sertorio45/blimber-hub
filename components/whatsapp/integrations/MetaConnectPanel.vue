<script setup lang="ts">
import type { WhatsAppInstanceView } from '~/types/whatsapp'

import { toast } from 'vue-sonner'

import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
import { WHATSAPP_CLOUD_API_ENABLED } from '~/constants/whatsapp'

const props = withDefaults(defineProps<{
  /** Tenant without the WhatsApp module: the number only feeds ad attribution. */
  attributionOnly?: boolean
  /** Link to the full instance management screen, when the module is contracted. */
  manageHref?: string
}>(), {
  attributionOnly: false,
  manageHref: '',
})

const emit = defineEmits<{
  connected: []
}>()

const { instances, showSkeleton, createInstanceFromEmbeddedSignup } = useWhatsAppInstances()
const {
  isAvailable: embeddedSignupAvailable,
  prepare: prepareEmbeddedSignup,
  launch: launchEmbeddedSignup,
} = useMetaEmbeddedSignup()

const connecting = ref(false)

const officialNumbers = computed<WhatsAppInstanceView[]>(() =>
  instances.value.filter(instance => instance.provider === 'cloud_api'),
)

const canConnect = computed(() => WHATSAPP_CLOUD_API_ENABLED && embeddedSignupAvailable.value)

// FB.login must run synchronously inside the click handler or the browser blocks the popup.
onMounted(() => {
  if (canConnect.value)
    prepareEmbeddedSignup().catch(() => {})
})

function isCoexistence(instance: WhatsAppInstanceView) {
  return Boolean(instance.metadata?.is_on_biz_app)
}

async function handleConnect() {
  connecting.value = true
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
    })

    toast.success(
      result.coexistence
        ? 'Número conectado — ele segue funcionando no celular normalmente'
        : 'Número conectado com sucesso',
    )
    emit('connected')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao conectar com a Meta')
  }
  finally {
    connecting.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="border border-border/60 rounded-xl bg-muted/15 p-5 sm:p-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="max-w-xl space-y-1.5">
          <h2 class="text-base text-foreground font-semibold">
            WhatsApp oficial da Meta
          </h2>
          <p class="text-sm text-muted-foreground leading-relaxed">
            <template v-if="props.attributionOnly">
              Conectar o número permite identificar quais vendas vieram dos seus anúncios de clique
              para o WhatsApp e devolver esse resultado para a Meta otimizar as campanhas.
            </template>
            <template v-else>
              Conecte o número numa janela da Meta, sem token nem código. Ele continua funcionando
              no aplicativo WhatsApp Business do celular.
            </template>
          </p>
        </div>

        <Button
          v-if="canConnect"
          class="shrink-0"
          :disabled="connecting"
          @click="handleConnect"
        >
          <span class="i-lucide-plug-zap mr-2 h-4 w-4" />
          {{ connecting ? 'Conectando...' : 'Conectar número' }}
        </Button>
      </div>

      <p
        v-if="props.attributionOnly"
        class="mt-4 border rounded-lg border-dashed bg-background/60 px-3 py-2 text-xs text-muted-foreground leading-relaxed"
      >
        Esta conexão é usada apenas para atribuição de anúncios. Caixa de entrada, conversas e
        atendimento fazem parte do módulo WhatsApp.
      </p>

      <p
        v-else-if="!canConnect"
        class="mt-4 border rounded-lg border-dashed bg-background/60 px-3 py-2 text-xs text-muted-foreground leading-relaxed"
      >
        A conexão automática com a Meta não está disponível nesta instalação. Fale com o suporte
        para configurar o número manualmente.
      </p>
    </div>

    <div v-if="showSkeleton" class="space-y-2">
      <Skeleton v-for="i in 2" :key="i" class="h-16 w-full rounded-lg" />
    </div>

    <ul v-else-if="officialNumbers.length" class="space-y-2">
      <li
        v-for="instance in officialNumbers"
        :key="instance.id"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 border border-border/60 rounded-lg bg-background px-4 py-3"
      >
        <span
          class="h-2 w-2 shrink-0 rounded-full"
          :class="instance.status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-foreground font-medium">
            {{ instance.phoneNumber || instance.name }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{ instance.status === 'connected' ? 'Conectado' : 'Aguardando conexão' }}
          </p>
        </div>
        <Badge v-if="isCoexistence(instance)" variant="outline" class="shrink-0">
          Também no celular
        </Badge>
      </li>
    </ul>

    <p v-else class="border rounded-lg border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      Nenhum número oficial conectado ainda.
    </p>

    <div v-if="props.manageHref && officialNumbers.length" class="flex justify-end">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink :to="props.manageHref">
          Gerenciar conexões
          <span class="i-lucide-arrow-right ml-2 h-4 w-4" />
        </NuxtLink>
      </Button>
    </div>
  </section>
</template>
