<script setup lang="ts">
import type { CmsApiError } from '~/composables/cms/useCmsApi'

import { computed } from 'vue'

import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import { Button } from '~/components/ui/button'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { useCmsApi } from '~/composables/cms/useCmsApi'

const props = withDefaults(defineProps<{
  /** Capability check for this screen; evaluated only once the workspace context is loaded. */
  allowed: boolean
  /** Blocking load error (module disabled, forbidden…). */
  error?: CmsApiError | null
}>(), {
  error: null,
})

const emit = defineEmits<{ retry: [] }>()

const { hasTenant } = useCmsApi()
const access = useCmsAccess()

const blocking = computed(() => {
  if (!hasTenant.value)
    return { icon: 'lucide:building-2', title: 'Selecione uma empresa', description: 'Escolha uma empresa no seletor do topo para gerenciar o site dela.', retry: false }
  if (access.ready.value && !props.allowed)
    return { icon: 'lucide:lock', title: 'Sem acesso', description: 'Você não tem permissão para ver esta área do CMS. Fale com um administrador.', retry: false }
  if (props.error?.code === 'module_disabled')
    return { icon: 'lucide:package-x', title: 'CMS não contratado', description: props.error.message, retry: false }
  if (props.error?.code === 'forbidden')
    return { icon: 'lucide:lock', title: 'Sem acesso', description: props.error.message, retry: false }
  if (props.error)
    return { icon: 'lucide:triangle-alert', title: 'Não foi possível carregar', description: props.error.message, retry: true }
  return null
})
</script>

<template>
  <CmsEmptyState
    v-if="blocking"
    :icon="blocking.icon"
    :title="blocking.title"
    :description="blocking.description"
    :tone="blocking.retry ? 'error' : 'default'"
  >
    <Button v-if="blocking.retry" variant="outline" size="sm" @click="emit('retry')">
      <Icon name="lucide:refresh-cw" class="mr-2 size-4" aria-hidden="true" />
      Tentar novamente
    </Button>
  </CmsEmptyState>
  <slot v-else />
</template>
