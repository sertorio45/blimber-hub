<script setup lang="ts">
import type { IntegrationConnectionStatus } from '~/composables/marketing/useIntegrationConnectionStatus'
import IntegrationStatusBadge from '@/components/settings/integrations/IntegrationStatusBadge.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  status: IntegrationConnectionStatus
  statusLabel?: string
  accountLabel: string
  connecting?: boolean
  disconnecting?: boolean
  reconnecting?: boolean
  busy?: boolean
  showEdit?: boolean
  showReconnect?: boolean
  note?: string
}>(), {
  subtitle: undefined,
  statusLabel: undefined,
  connecting: false,
  disconnecting: false,
  reconnecting: false,
  busy: false,
  showEdit: false,
  showReconnect: false,
  note: undefined,
})

const emit = defineEmits<{
  connect: []
  disconnect: []
  edit: []
  reconnect: []
}>()

const isConnectedLike = computed(() =>
  props.status === 'connected'
  || props.status === 'needs_setup'
  || props.status === 'expired'
  || props.status === 'error',
)

const primaryLabel = computed(() => {
  if (props.connecting)
    return 'Redirecionando...'
  if (props.status === 'expired')
    return 'Reconectar'
  if (props.status === 'needs_setup')
    return 'Configurar'
  return 'Conectar conta'
})

const actionsDisabled = computed(() =>
  Boolean(props.busy || props.connecting || props.disconnecting || props.reconnecting),
)
</script>

<template>
  <Card
    class="relative h-full overflow-hidden border border-border/70 rounded-2xl bg-card shadow-sm transition-shadow duration-200 hover:shadow-md"
    :aria-busy="actionsDisabled"
  >
    <Button
      v-if="showEdit && isConnectedLike"
      variant="ghost"
      size="icon"
      class="absolute right-2 top-2 z-10 h-9 w-9 text-muted-foreground hover:text-foreground"
      :disabled="actionsDisabled"
      :aria-label="`Configurar ${title}`"
      @click="emit('edit')"
    >
      <Icon name="lucide:square-pen" class="h-4 w-4" />
    </Button>

    <CardContent class="h-full flex flex-col items-center px-6 pb-7 pt-8 text-center">
      <div class="h-14 w-14 flex items-center justify-center">
        <slot name="icon" />
      </div>

      <h3 class="mt-4 text-lg text-foreground font-semibold tracking-tight">
        {{ title }}
      </h3>
      <p v-if="subtitle" class="mt-1 text-sm text-muted-foreground">
        {{ subtitle }}
      </p>

      <div class="mt-3">
        <IntegrationStatusBadge :status="status" :label="statusLabel" />
      </div>

      <p
        class="mt-4 max-w-[260px] min-h-8 text-xs text-muted-foreground font-medium leading-snug tracking-wide"
        :class="!accountLabel || accountLabel === '—' || accountLabel.includes('Selecione') || accountLabel.includes('Nenhuma') ? 'normal-case' : 'uppercase'"
      >
        <span class="line-clamp-2">{{ accountLabel }}</span>
      </p>

      <p
        v-if="note"
        class="mt-2 max-w-[260px] text-xs text-muted-foreground leading-relaxed"
      >
        {{ note }}
      </p>

      <div class="mt-auto max-w-[240px] w-full flex flex-col items-stretch gap-2 pt-6">
        <!-- Disconnected / expired: primary connect -->
        <Button
          v-if="status === 'disconnected' || status === 'expired'"
          class="w-full rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90"
          :disabled="actionsDisabled"
          @click="emit('connect')"
        >
          <Icon
            v-if="connecting"
            name="lucide:loader-2"
            class="mr-2 h-4 w-4 animate-spin"
          />
          {{ primaryLabel }}
        </Button>

        <!-- Needs setup / connected: configure + optional disconnect -->
        <template v-else-if="status === 'needs_setup' || status === 'connected'">
          <Button
            :variant="status === 'needs_setup' ? 'default' : 'outline'"
            class="w-full rounded-full"
            :class="status === 'needs_setup'
              ? 'bg-foreground text-background shadow-sm hover:bg-foreground/90'
              : ''"
            :disabled="actionsDisabled"
            @click="emit('edit')"
          >
            {{ status === 'needs_setup' ? primaryLabel : 'Configurar' }}
          </Button>
          <Button
            variant="ghost"
            class="w-full rounded-full text-muted-foreground hover:text-destructive"
            :disabled="actionsDisabled"
            @click="emit('disconnect')"
          >
            <Icon
              v-if="disconnecting"
              name="lucide:loader-2"
              class="mr-2 h-4 w-4 animate-spin"
            />
            {{ disconnecting ? 'Desconectando...' : 'Desconectar' }}
          </Button>
        </template>

        <!-- Error: reconnect -->
        <Button
          v-else-if="status === 'error'"
          class="w-full rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90"
          :disabled="actionsDisabled"
          @click="emit('connect')"
        >
          <Icon
            v-if="connecting"
            name="lucide:loader-2"
            class="mr-2 h-4 w-4 animate-spin"
          />
          {{ connecting ? 'Redirecionando...' : 'Tentar novamente' }}
        </Button>

        <Button
          v-if="showReconnect && isConnectedLike && status !== 'expired'"
          variant="outline"
          size="sm"
          class="w-full rounded-full"
          :disabled="actionsDisabled"
          @click="emit('reconnect')"
        >
          <Icon
            v-if="reconnecting"
            name="lucide:loader-2"
            class="mr-2 h-4 w-4 animate-spin"
          />
          {{ reconnecting ? 'Redirecionando...' : 'Reconectar permissões' }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
