<script setup lang="ts">
import { useWorkspace } from '~/composables/useWorkspace'
import {
  MARKETING_AD_ACCOUNTS_ROUTE,
  MARKETING_ADS_CREATIVES_ROUTE,
  MARKETING_SETTINGS_INTEGRATIONS_ROUTE,
  SETTINGS_INTEGRATIONS_ROUTE,
} from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Configurações de Marketing',
})

const workspace = useWorkspace()
const { isClientExperience } = useMarketingAudience()

const canIntegrations = computed(() => workspace.can('marketing.social.integrations'))
const canReports = computed(() => workspace.can('marketing.social.reports'))
const canBrandGuide = computed(() =>
  workspace.can('marketing.social.brand_guide.read') && !isClientExperience.value,
)

const settingsTrail = [
  { title: 'Marketing', href: '/marketing' },
  { title: 'Configurações', href: '/marketing/settings' },
]

const links = computed(() => [
  {
    title: 'Marca',
    description: 'Brand Center: identidade, comunicação e restrições do cliente.',
    icon: 'lucide:book-open',
    to: '/marketing/brand',
    enabled: canBrandGuide.value,
  },
  {
    title: 'Contas sociais',
    description: 'Instagram, LinkedIn e páginas Meta no painel único de OAuth.',
    icon: 'lucide:share-2',
    to: SETTINGS_INTEGRATIONS_ROUTE,
    enabled: canIntegrations.value,
  },
  {
    title: 'Contas de anúncios',
    description: 'Meta Ads, Google Ads e Analytics — mesma conexão, foco em mídia paga.',
    icon: 'lucide:circle-dollar-sign',
    to: MARKETING_AD_ACCOUNTS_ROUTE,
    enabled: canIntegrations.value,
  },
  {
    title: 'Integrações',
    description: 'Painel único de OAuth. Não há um segundo fluxo de conexão.',
    icon: 'lucide:plug',
    to: MARKETING_SETTINGS_INTEGRATIONS_ROUTE,
    enabled: canIntegrations.value,
  },
  {
    title: 'Ads',
    description: 'Mídia paga: campanhas, criativos e relatórios de Meta e Google.',
    icon: 'lucide:megaphone',
    to: '/marketing/ads',
    enabled: canReports.value,
  },
].filter(item => item.enabled))
</script>

<template>
  <div class="space-y-6">
    <div>
      <BaseBreadcrumbCustom :links="settingsTrail" />
      <h1 class="mt-3 text-2xl font-bold tracking-tight">
        Configurações
      </h1>
      <p class="mt-1 text-muted-foreground">
        Marca, contas sociais, contas de anúncios e integrações — um único OAuth.
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

    <p
      v-if="canReports"
      class="text-sm text-muted-foreground"
    >
      Criativos de Ads continuam em
      <NuxtLink
        :to="MARKETING_ADS_CREATIVES_ROUTE"
        class="underline underline-offset-4"
      >
        Marketing → Ads → Criativos
      </NuxtLink>.
    </p>
  </div>
</template>
