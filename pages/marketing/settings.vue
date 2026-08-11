<script setup lang="ts">
import { useWorkspace } from '~/composables/useWorkspace'

definePageMeta({
  middleware: ['auth'],
  title: 'Configurações de Marketing',
})

const workspace = useWorkspace()
const { isClientExperience } = useMarketingAudience()

const canIntegrations = computed(() => workspace.can('marketing.social.integrations'))
const canBrandGuide = computed(() =>
  workspace.can('marketing.social.brand_guide.read') && !isClientExperience.value,
)

const links = computed(() => [
  {
    title: 'Contas sociais',
    description: 'Conecte Instagram, Facebook, LinkedIn e demais redes.',
    icon: 'lucide:share-2',
    to: '/settings/integrations',
    enabled: canIntegrations.value,
  },
  {
    title: 'Marca',
    description: 'Brand Center: identidade, comunicação e restrições do cliente.',
    icon: 'lucide:book-open',
    to: '/marketing/brand',
    enabled: canBrandGuide.value,
  },
].filter(item => item.enabled))
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">
        Configurações
      </h1>
      <p class="mt-1 text-muted-foreground">
        Contas sociais e atalhos secundários. Marca também está no menu principal.
      </p>
    </div>

    <div class="grid gap-4 lg:grid-cols-3 sm:grid-cols-2">
      <NuxtLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
      >
        <Card class="h-full transition-colors hover:bg-muted/40">
          <CardContent class="flex items-start gap-4 p-6">
            <div class="h-10 w-10 flex items-center justify-center rounded-lg bg-muted">
              <Icon :name="link.icon" class="h-5 w-5" />
            </div>
            <div>
              <p class="font-medium">
                {{ link.title }}
              </p>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ link.description }}
              </p>
            </div>
          </CardContent>
        </Card>
      </NuxtLink>
    </div>
  </div>
</template>
