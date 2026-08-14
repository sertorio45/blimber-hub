<script setup lang="ts">
/**
 * Lightweight Brand Context peek for Ads (ETAPA 7).
 * Always reflects the selected client tenant — link opens Brand Center.
 */
import { useAdsBrandContext } from '~/composables/ads/useAdsBrandContext'
import { useAdsShellBase } from '~/composables/ads/useAdsShellBase'
import { ADS_BRAND_CENTER_PATH } from '~/utils/ads-brand'

const { adsBasePath } = useAdsShellBase()
const { currentTenant } = useTenant()
const {
  summary,
  pending,
  showSkeleton,
  canRead,
  tenantId,
} = useAdsBrandContext()

const clientName = computed(() => currentTenant.value?.name?.trim() || 'Cliente selecionado')
</script>

<template>
  <Card v-if="canRead">
    <CardHeader>
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-1">
          <CardTitle class="text-base">
            Contexto da marca
          </CardTitle>
          <CardDescription>
            Brand Context do cliente ativo — base para futuros criativos com Blimber AI.
          </CardDescription>
        </div>
        <Icon name="lucide:palette" class="h-5 w-5 shrink-0 text-muted-foreground" />
      </div>
    </CardHeader>
    <CardContent class="space-y-4">
      <div
        v-if="!tenantId"
        class="text-sm text-muted-foreground"
      >
        Selecione um cliente no workspace para carregar a marca.
      </div>

      <div
        v-else-if="showSkeleton || pending"
        class="space-y-3"
      >
        <div class="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div class="h-2 w-full animate-pulse rounded bg-muted" />
        <div class="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>

      <template v-else-if="summary">
        <div class="space-y-1">
          <p class="text-sm font-medium">
            {{ clientName }}
          </p>
          <p class="text-xs text-muted-foreground">
            <template v-if="summary.hasGuide">
              Guia de marca configurado
            </template>
            <template v-else>
              Ainda sem guia de marca — complete no Brand Center
            </template>
          </p>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>Completude</span>
            <span>{{ summary.completenessPercent }}%</span>
          </div>
          <Progress :model-value="summary.completenessPercent" class="h-2" />
        </div>

        <div class="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p class="text-xs text-muted-foreground">
              Tom de voz
            </p>
            <p class="line-clamp-2 mt-0.5">
              {{ summary.toneOfVoice || '—' }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">
              Estilo
            </p>
            <p class="line-clamp-2 mt-0.5">
              {{ summary.communicationStyle || '—' }}
            </p>
          </div>
        </div>

        <div v-if="summary.primaryColorHexes.length" class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted-foreground">
            Cores
          </span>
          <span
            v-for="hex in summary.primaryColorHexes"
            :key="hex"
            class="h-5 w-5 shrink-0 border border-border rounded-full"
            :style="{ backgroundColor: hex }"
            :title="hex"
          />
        </div>

        <p class="text-xs text-muted-foreground">
          {{ summary.productCount }} produto(s) na marca
        </p>
      </template>

      <div class="flex flex-wrap gap-2">
        <Button
          variant="outline"
          class="flex-1"
          :disabled="!tenantId"
          @click="navigateTo(ADS_BRAND_CENTER_PATH)"
        >
          Abrir Brand Center
          <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          @click="navigateTo(`${adsBasePath}/creatives`)"
        >
          Criativos
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
