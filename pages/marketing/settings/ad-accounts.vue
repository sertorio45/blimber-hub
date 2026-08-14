<script setup lang="ts">
/**
 * Ad-account orientation under Marketing settings.
 * Does not fork OAuth — Meta Ads / Google Ads / Analytics stay in
 * `/settings/integrations` (same SocialProvidersPanel).
 */
import {
  MARKETING_SETTINGS_ROUTE,
  SETTINGS_INTEGRATIONS_ROUTE,
} from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Contas de anúncios',
})

const trail = [
  { title: 'Marketing', href: '/marketing' },
  { title: 'Configurações', href: MARKETING_SETTINGS_ROUTE },
  { title: 'Contas de anúncios', href: '/marketing/settings/ad-accounts' },
]

const accounts = [
  {
    title: 'Meta Ads',
    description: 'Conta de anúncios, páginas e Instagram usados nas campanhas pagas.',
    icon: 'lucide:target',
  },
  {
    title: 'Google Ads',
    description: 'Customer ID da conta de anúncios Google conectada ao tenant.',
    icon: 'lucide:search',
  },
  {
    title: 'Google Analytics',
    description: 'Propriedade de Analytics para relatórios de tráfego e conversão.',
    icon: 'lucide:chart-column',
  },
]
</script>

<template>
  <div class="space-y-6">
    <div>
      <BaseBreadcrumbCustom :links="trail" />
      <h1 class="mt-3 text-2xl font-bold tracking-tight">
        Contas de anúncios
      </h1>
      <p class="mt-1 max-w-2xl text-muted-foreground">
        As contas de mídia paga são as mesmas integrações do Marketing.
        Não há um segundo OAuth nem um painel Ads separado.
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <Card
        v-for="account in accounts"
        :key="account.title"
      >
        <CardContent class="flex items-start gap-4 p-6">
          <div class="h-10 w-10 flex items-center justify-center rounded-lg bg-muted">
            <Icon :name="account.icon" class="h-5 w-5" />
          </div>
          <div>
            <p class="font-medium">
              {{ account.title }}
            </p>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ account.description }}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>

    <Button as-child>
      <NuxtLink :to="SETTINGS_INTEGRATIONS_ROUTE">
        Gerenciar no painel de Integrações
        <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
      </NuxtLink>
    </Button>
  </div>
</template>
