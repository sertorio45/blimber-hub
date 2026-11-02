<script setup lang="ts">
import type { WhatsAppCampaign, WhatsAppCampaignRecipient } from '~/types/whatsapp'

import CampaignStatusBadge from '~/components/whatsapp/campaigns/CampaignStatusBadge.vue'
import WhatsAppPageHeader from '~/components/whatsapp/shared/WhatsAppPageHeader.vue'
import WhatsAppStatusBadge from '~/components/whatsapp/shared/WhatsAppStatusBadge.vue'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Progress } from '~/components/ui/progress'
import { Skeleton } from '~/components/ui/skeleton'
import { toast } from 'vue-sonner'

definePageMeta({
  middleware: ['auth'],
  title: 'Campanha',
})

const route = useRoute()
const campaignId = computed(() => route.params.id as string)
const { tenantId } = useTenant()
const { startCampaign, pauseCampaign, tickCampaign, fetchCampaign, fetchRecipients } = useWhatsAppCampaigns()

const actionLoading = ref(false)
const recipients = ref<WhatsAppCampaignRecipient[]>([])
const recipientsPending = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const { data, pending, refresh, showSkeleton } = useCachedAsyncData(
  () => `whatsapp-campaign-${campaignId.value}-${tenantId.value}`,
  async () => {
    if (!tenantId.value || !campaignId.value)
      return null
    return fetchCampaign(campaignId.value)
  },
  { watch: [tenantId, campaignId], default: () => null },
)

const campaign = computed(() => data.value?.data as WhatsAppCampaign | undefined)

const stats = computed(() => campaign.value?.stats || {})
const progress = computed(() => {
  const total = stats.value.total || 0
  if (!total)
    return 0
  const done = (stats.value.sent || 0) + (stats.value.failed || 0) + (stats.value.skipped || 0)
  return Math.round((done / total) * 100)
})

async function loadRecipients() {
  if (!tenantId.value || !campaignId.value)
    return
  recipientsPending.value = true
  try {
    const response = await fetchRecipients(campaignId.value, { limit: 20 })
    recipients.value = response.data
  }
  finally {
    recipientsPending.value = false
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    // Drive the next bounded send batch while the detail page is open.
    if (campaign.value?.status === 'running') {
      try {
        await tickCampaign(campaignId.value)
      }
      catch {
        // Keep polling UI even if one tick fails (network/auth blip).
      }
    }
    await refresh()
    await loadRecipients()
    if (campaign.value && !['running', 'scheduled'].includes(campaign.value.status))
      stopPolling()
  }, 4000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(campaign, (value) => {
  if (value?.status === 'running')
    startPolling()
  else
    stopPolling()
}, { immediate: true })

onMounted(loadRecipients)
onUnmounted(stopPolling)

async function handleStart() {
  actionLoading.value = true
  try {
    const result = await startCampaign(campaignId.value)
    toast.success(`Campanha iniciada — ${result.audienceSize} destinatários`)
    await refresh()
    await loadRecipients()
    startPolling()
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao iniciar')
  }
  finally {
    actionLoading.value = false
  }
}

async function handlePause() {
  actionLoading.value = true
  try {
    await pauseCampaign(campaignId.value)
    toast.success('Campanha pausada')
    await refresh()
    stopPolling()
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao pausar')
  }
  finally {
    actionLoading.value = false
  }
}
</script>

<template>
  <div>
    <WhatsAppPageHeader
      :title="campaign?.name || 'Campanha'"
      description="Acompanhe envios e status dos destinatários."
    >
      <template #actions>
        <div class="flex flex-wrap gap-2">
          <NuxtLink to="/whatsapp/campaigns">
            <Button variant="outline">
              Voltar
            </Button>
          </NuxtLink>
          <NuxtLink
            v-if="campaign && ['draft', 'paused'].includes(campaign.status)"
            :to="`/whatsapp/campaigns/${campaign.id}/edit`"
          >
            <Button variant="outline">
              Editar
            </Button>
          </NuxtLink>
          <Button
            v-if="campaign && ['draft', 'paused', 'scheduled'].includes(campaign.status)"
            :disabled="actionLoading"
            @click="handleStart"
          >
            {{ campaign.status === 'paused' ? 'Retomar envio' : 'Iniciar envio' }}
          </Button>
          <Button
            v-if="campaign?.status === 'running'"
            variant="secondary"
            :disabled="actionLoading"
            @click="handlePause"
          >
            Pausar
          </Button>
        </div>
      </template>
    </WhatsAppPageHeader>

    <Skeleton v-if="showSkeleton" class="mb-6 h-40 w-full" />

    <template v-else-if="campaign">
      <div class="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CampaignStatusBadge :status="campaign.status" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              Destinatários
            </CardTitle>
          </CardHeader>
          <CardContent class="text-2xl font-semibold">
            {{ stats.total ?? 0 }}
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              Enviadas
            </CardTitle>
          </CardHeader>
          <CardContent class="text-2xl font-semibold text-primary">
            {{ stats.sent ?? 0 }}
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              Falhas
            </CardTitle>
          </CardHeader>
          <CardContent class="text-2xl font-semibold text-destructive">
            {{ stats.failed ?? 0 }}
          </CardContent>
        </Card>
      </div>

      <Card class="mb-6">
        <CardHeader>
          <CardTitle>Progresso</CardTitle>
        </CardHeader>
        <CardContent class="space-y-2">
          <Progress :model-value="progress" />
          <p class="text-sm text-muted-foreground">
            {{ progress }}% concluído · {{ stats.pending ?? 0 }} pendentes
          </p>
        </CardContent>
      </Card>

      <Card class="mb-6">
        <CardHeader>
          <CardTitle>Mensagem</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="whitespace-pre-wrap rounded-lg bg-muted/40 p-4 text-sm">
            {{ campaign.audienceFilter.message }}
          </p>
          <p class="mt-2 text-xs text-muted-foreground">
            Instância: {{ campaign.instanceName || '—' }}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="flex flex-row items-center justify-between">
          <CardTitle>Últimos destinatários</CardTitle>
          <Button variant="outline" size="sm" :disabled="recipientsPending" @click="loadRecipients">
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          <Skeleton v-if="recipientsPending && !recipients.length" class="h-32 w-full" />
          <div v-else-if="!recipients.length" class="py-8 text-center text-sm text-muted-foreground">
            Nenhum destinatário ainda. Inicie a campanha para gerar a fila.
          </div>
          <div v-else class="divide-y">
            <div
              v-for="recipient in recipients"
              :key="recipient.id"
              class="flex items-center justify-between gap-4 py-3 text-sm"
            >
              <div>
                <p class="font-medium">
                  {{ recipient.contactName || recipient.phone }}
                </p>
                <p class="text-muted-foreground">
                  {{ recipient.phone }}
                </p>
                <p v-if="recipient.errorMessage" class="text-xs text-destructive">
                  {{ recipient.errorMessage }}
                </p>
              </div>
              <WhatsAppStatusBadge :status="recipient.status" />
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
