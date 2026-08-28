<script setup lang="ts">
import MetaConnectPanel from '~/components/whatsapp/integrations/MetaConnectPanel.vue'
import { useModule } from '~/composables/useModule'
import { useWorkspace } from '~/composables/useWorkspace'

definePageMeta({
  middleware: ['auth'],
  title: 'WhatsApp',
})

useSeoMeta({
  title: 'WhatsApp',
  description: 'Conecte o WhatsApp oficial da Meta para atendimento e atribuição de anúncios.',
})

const { modules } = useWorkspace()
const { availableModules } = useModule()

// Same resolution used by the integrations index: workspace first, module list as fallback.
const contractedSlugs = computed(() => {
  const fromWorkspace = new Set(modules.value || [])
  if (fromWorkspace.size)
    return fromWorkspace
  return new Set(availableModules.value.map(m => m.slug))
})

const hasWhatsAppModule = computed(() => contractedSlugs.value.has('whatsapp'))
</script>

<template>
  <div class="mx-auto max-w-3xl w-full px-4 py-8 space-y-8 md:py-10">
    <header class="space-y-2">
      <NuxtLink
        to="/settings/integrations"
        class="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span class="i-lucide-chevron-left h-4 w-4" />
        Integrações
      </NuxtLink>
      <h1 class="text-2xl text-foreground font-semibold tracking-tight md:text-3xl">
        WhatsApp
      </h1>
      <p class="max-w-2xl text-sm text-muted-foreground leading-relaxed">
        {{
          hasWhatsAppModule
            ? 'Conecte números oficiais da Meta para atendimento e para medir o resultado dos anúncios.'
            : 'Conecte o número oficial da Meta para medir quais vendas vieram dos seus anúncios.'
        }}
      </p>
    </header>

    <MetaConnectPanel
      :attribution-only="!hasWhatsAppModule"
      :manage-href="hasWhatsAppModule ? '/whatsapp/integrations' : ''"
    />
  </div>
</template>
