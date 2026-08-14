<script setup lang="ts">
import { useWorkspace } from '~/composables/useWorkspace'
import { SETTINGS_INTEGRATIONS_ROUTE } from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Configurações de Marketing',
})

const workspace = useWorkspace()
const { isClientExperience } = useMarketingAudience()

const canBrandGuide = computed(() =>
  workspace.can('marketing.social.brand_guide.read') && !isClientExperience.value,
)

const settingsTrail = [
  { title: 'Marketing', href: '/marketing' },
  { title: 'Configurações', href: '/marketing/settings' },
]
</script>

<template>
  <div class="space-y-6">
    <div>
      <BaseBreadcrumbCustom :links="settingsTrail" />
      <h1 class="mt-3 text-2xl font-bold tracking-tight">
        Configurações
      </h1>
      <p class="mt-1 text-muted-foreground">
        Brand Center do cliente ativo. Contas e OAuth ficam em Integrações.
      </p>
    </div>

    <NuxtLink
      v-if="canBrandGuide"
      to="/marketing/brand"
    >
      <Card class="max-w-lg transition-colors hover:bg-muted/40">
        <CardContent class="flex items-start gap-4 p-6">
          <div class="h-10 w-10 flex items-center justify-center rounded-lg bg-muted">
            <Icon name="lucide:book-open" class="h-5 w-5" />
          </div>
          <div>
            <p class="font-medium">
              Marca
            </p>
            <p class="mt-1 text-sm text-muted-foreground">
              Identidade, comunicação e restrições do cliente.
            </p>
          </div>
        </CardContent>
      </Card>
    </NuxtLink>

    <p
      v-else
      class="text-sm text-muted-foreground"
    >
      Conecte redes e contas de anúncios em
      <NuxtLink
        :to="SETTINGS_INTEGRATIONS_ROUTE"
        class="underline underline-offset-4"
      >
        Configurações → Integrações
      </NuxtLink>.
    </p>
  </div>
</template>
