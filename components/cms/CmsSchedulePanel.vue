<script setup lang="ts">
import type { CmsPublicationJob } from '~/lib/cms/contracts'

import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { CMS_JOB_STATUS_LABELS, formatCmsDateTimeInZone } from '~/composables/cms/cmsDisplay'
import { normalizeCmsError } from '~/composables/cms/useCmsApi'
import { formatWallInZone } from '~/lib/cms/schedule-time'

const props = defineProps<{
  timezone: string
  currentVersion: number
  load: () => Promise<CmsPublicationJob | null>
  schedule: (input: { runAt: string, timezone: string }) => Promise<CmsPublicationJob | null>
  cancel: () => Promise<CmsPublicationJob | null>
}>()

const OPEN = new Set(['pending', 'processing', 'retrying'])

const runAt = ref('')
const job = ref<CmsPublicationJob | null>(null)
const loading = ref(true)
const saving = ref(false)
const cancelling = ref(false)
const errorMessage = ref<string | null>(null)

const openJob = computed(() => (job.value && OPEN.has(job.value.status) ? job.value : null))
const drifted = computed(() => {
  const current = openJob.value
  return Boolean(current && current.editVersion != null && current.editVersion !== props.currentVersion)
})

function defaultRunAt() {
  try {
    return formatWallInZone(new Date(Date.now() + 60 * 60 * 1000), props.timezone)
  }
  catch {
    return ''
  }
}

async function refresh() {
  loading.value = true
  errorMessage.value = null
  try {
    job.value = await props.load()
  }
  catch (error: unknown) {
    errorMessage.value = normalizeCmsError(error).message
  }
  finally {
    loading.value = false
  }
}

async function submit() {
  if (saving.value || !runAt.value)
    return
  saving.value = true
  errorMessage.value = null
  try {
    const saved = await props.schedule({ runAt: runAt.value, timezone: props.timezone })
    if (saved) {
      job.value = saved
      toast.success('Publicação agendada')
    }
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    if (normalized.code !== 'aborted')
      errorMessage.value = normalized.message
  }
  finally {
    saving.value = false
  }
}

async function cancelSchedule() {
  if (cancelling.value)
    return
  cancelling.value = true
  errorMessage.value = null
  try {
    const cancelled = await props.cancel()
    if (cancelled)
      job.value = cancelled.status === 'cancelled' ? null : cancelled
    toast.success('Agendamento cancelado')
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    if (normalized.code !== 'aborted')
      errorMessage.value = normalized.message
  }
  finally {
    cancelling.value = false
  }
}

onMounted(() => {
  runAt.value = defaultRunAt()
  void refresh()
})

watch(() => props.timezone, () => {
  if (!runAt.value)
    runAt.value = defaultRunAt()
})
</script>

<template>
  <section class="border rounded-xl bg-card p-4 space-y-3" aria-labelledby="cms-schedule-title">
    <div class="space-y-1">
      <h2 id="cms-schedule-title" class="text-sm font-medium">
        Agendar publicação
      </h2>
      <p class="text-xs text-muted-foreground">
        Vai ao ar a versão salva agora, no fuso {{ timezone }}. Se o texto mudar depois, a publicação não acontece sozinha.
      </p>
    </div>

    <p v-if="loading" class="text-sm text-muted-foreground">
      Carregando agendamento…
    </p>

    <div v-else-if="openJob" class="border rounded-lg bg-muted/40 p-3 space-y-2">
      <p class="text-sm">
        <span class="font-medium">{{ CMS_JOB_STATUS_LABELS[openJob.status] }}</span>
        para {{ formatCmsDateTimeInZone(openJob.runAt, openJob.timezone) }}
      </p>
      <p v-if="drifted" class="text-xs text-amber-700 dark:text-amber-400">
        O rascunho mudou desde o agendamento. Salve de novo o horário para publicar esta versão.
      </p>
      <p v-if="openJob.lastError" class="text-xs text-destructive">
        {{ openJob.lastError }}
      </p>
      <Button
        v-if="openJob.status !== 'processing'"
        type="button"
        size="sm"
        variant="outline"
        :disabled="cancelling"
        @click="cancelSchedule"
      >
        {{ cancelling ? 'Cancelando…' : 'Cancelar agendamento' }}
      </Button>
    </div>

    <form v-if="!loading && openJob?.status !== 'processing'" class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="submit">
      <div class="min-w-0 flex-1 space-y-1.5">
        <Label for="cms-schedule-at">Data e hora</Label>
        <Input id="cms-schedule-at" v-model="runAt" type="datetime-local" required />
      </div>
      <Button type="submit" size="sm" :disabled="saving || !runAt">
        <Icon name="lucide:calendar-clock" class="mr-2 size-4" aria-hidden="true" />
        {{ openJob ? 'Atualizar horário' : 'Agendar' }}
      </Button>
    </form>

    <p v-if="errorMessage" class="text-sm text-destructive" role="alert">
      {{ errorMessage }}
    </p>
  </section>
</template>
