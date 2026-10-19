<script setup lang="ts">
import type { CmsAuditEvent, CmsPage } from '~/lib/cms/contracts'

import { ref, watch } from 'vue'

import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import { CMS_AUDIT_ACTION_LABELS, formatCmsDateTime } from '~/composables/cms/cmsDisplay'
import { useCmsApi, visibleCmsError } from '~/composables/cms/useCmsApi'

const props = withDefaults(defineProps<{
  siteId?: string | null
  documentId?: string | null
  title?: string
}>(), {
  siteId: null,
  documentId: null,
  title: 'Atividade',
})

const api = useCmsApi()
const events = ref<CmsAuditEvent[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
let token = 0

function detail(event: CmsAuditEvent): string | null {
  const metadata = event.metadata
  if (typeof metadata.path === 'string')
    return metadata.path
  if (typeof metadata.message === 'string')
    return metadata.message
  if (typeof metadata.runAt === 'string')
    return formatCmsDateTime(metadata.runAt)
  return null
}

async function load(cursor?: string | null) {
  if (!props.siteId && !props.documentId)
    return
  const current = ++token
  const appending = Boolean(cursor)
  if (appending)
    loadingMore.value = true
  else
    loading.value = true
  error.value = null
  try {
    const page = await api.request<CmsPage<CmsAuditEvent>>('/api/cms/audit', {
      query: {
        siteId: props.siteId ?? undefined,
        documentId: props.documentId ?? undefined,
        cursor: cursor ?? undefined,
        limit: 20,
      },
    })
    if (current !== token)
      return
    events.value = appending ? [...events.value, ...page.data] : page.data
    nextCursor.value = page.nextCursor
  }
  catch (err: unknown) {
    if (current === token)
      error.value = visibleCmsError(err)?.message ?? 'Não foi possível carregar a atividade'
  }
  finally {
    if (current === token) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

watch(() => [props.siteId, props.documentId, api.tenantId.value], () => {
  events.value = []
  nextCursor.value = null
  void load(null)
}, { immediate: true })
</script>

<template>
  <section class="space-y-3" :aria-labelledby="title ? 'cms-audit-title' : undefined">
    <h2 v-if="title" id="cms-audit-title" class="text-sm font-medium">
      {{ title }}
    </h2>

    <div v-if="loading && !events.length" class="space-y-2" aria-busy="true">
      <Skeleton v-for="index in 3" :key="index" class="h-12 w-full" />
    </div>

    <CmsEmptyState
      v-else-if="error && !events.length"
      tone="error"
      icon="lucide:triangle-alert"
      title="Não foi possível carregar a atividade"
      :description="error"
    >
      <Button size="sm" variant="outline" @click="load(null)">
        Tentar novamente
      </Button>
    </CmsEmptyState>

    <CmsEmptyState
      v-else-if="!events.length"
      icon="lucide:scroll-text"
      title="Nenhuma atividade ainda"
      description="Publicações, agendamentos e redirecionamentos aparecem aqui."
    />

    <ol v-else class="space-y-2">
      <li v-for="event in events" :key="event.id" class="border rounded-lg px-3 py-2">
        <p class="text-sm font-medium">
          {{ CMS_AUDIT_ACTION_LABELS[event.action] ?? event.action }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ formatCmsDateTime(event.createdAt) }}
          <template v-if="detail(event)">
            · {{ detail(event) }}
          </template>
        </p>
      </li>
    </ol>

    <Button
      v-if="nextCursor"
      variant="ghost"
      size="sm"
      class="w-full"
      :disabled="loadingMore"
      @click="load(nextCursor)"
    >
      {{ loadingMore ? 'Carregando…' : 'Carregar anteriores' }}
    </Button>
  </section>
</template>
