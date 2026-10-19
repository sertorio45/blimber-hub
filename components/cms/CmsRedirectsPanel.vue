<script setup lang="ts">
import type { CmsDocumentSummary, CmsPage, CmsRedirect } from '~/lib/cms/contracts'

import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import { normalizeCmsError, useCmsApi, visibleCmsError } from '~/composables/cms/useCmsApi'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'

const props = defineProps<{
  siteId: string
  canManage: boolean
}>()

const api = useCmsApi()
const redirects = ref<CmsRedirect[]>([])
const documents = ref<CmsDocumentSummary[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const path = ref('')
const documentId = ref('')
const formError = ref<string | null>(null)

const documentOptions = computed(() =>
  documents.value.map(document => ({
    id: document.id,
    label: document.title || 'Sem título',
  })),
)

async function load() {
  const siteId = props.siteId
  const tenant = api.tenantId.value
  if (!siteId || !tenant)
    return
  loading.value = true
  error.value = null
  try {
    const [redirectPage, pages, publications] = await Promise.all([
      api.request<CmsPage<CmsRedirect>>(`/api/cms/sites/${siteId}/redirects`),
      api.request<CmsPage<CmsDocumentSummary>>('/api/cms/pages', { query: { siteId, limit: 50 } }).catch(() => ({ data: [], nextCursor: null })),
      api.request<CmsPage<CmsDocumentSummary>>('/api/cms/publications', { query: { siteId, limit: 50 } }).catch(() => ({ data: [], nextCursor: null })),
    ])
    if (api.tenantId.value !== tenant || props.siteId !== siteId)
      return
    redirects.value = redirectPage.data
    documents.value = [...pages.data, ...publications.data]
    if (!documentId.value && documents.value[0])
      documentId.value = documents.value[0].id
  }
  catch (err: unknown) {
    error.value = visibleCmsError(err)?.message ?? 'Não foi possível carregar os redirecionamentos'
  }
  finally {
    loading.value = false
  }
}

async function createRedirect() {
  if (!props.canManage || saving.value)
    return
  formError.value = null
  if (!path.value.trim() || !documentId.value) {
    formError.value = 'Informe o endereço antigo e o conteúdo de destino.'
    return
  }
  saving.value = true
  try {
    await api.request(`/api/cms/sites/${props.siteId}/redirects`, {
      method: 'POST',
      body: { path: path.value.trim(), documentId: documentId.value },
    })
    path.value = ''
    toast.success('Redirecionamento salvo')
    await load()
  }
  catch (err: unknown) {
    const normalized = normalizeCmsError(err)
    if (normalized.code !== 'aborted')
      formError.value = normalized.message
  }
  finally {
    saving.value = false
  }
}

async function removeRedirect(redirect: CmsRedirect) {
  if (!props.canManage)
    return
  await deleteWithConfirm(
    async () => {
      await api.request(`/api/cms/sites/${props.siteId}/redirects/${redirect.id}`, { method: 'DELETE' })
      redirects.value = redirects.value.filter(item => item.id !== redirect.id)
    },
    {
      title: 'Remover redirecionamento?',
      description: `${redirect.path} deixa de apontar para este conteúdo.`,
      confirmLabel: 'Remover',
      successMessage: 'Redirecionamento removido.',
      errorMessage: 'Não foi possível remover o redirecionamento.',
    },
  )
}

watch(() => [props.siteId, api.tenantId.value], () => {
  redirects.value = []
  documents.value = []
  documentId.value = ''
  void load()
}, { immediate: true })
</script>

<template>
  <section class="border rounded-xl bg-card p-5 space-y-4" aria-labelledby="cms-redirects-title">
    <div class="space-y-1">
      <h2 id="cms-redirects-title" class="text-sm font-medium">
        Redirecionamentos
      </h2>
      <p class="text-xs text-muted-foreground">
        Endereços antigos que continuam abrindo um conteúdo. Trocar o slug na publicação também cria um automaticamente.
      </p>
    </div>

    <div v-if="loading && !redirects.length" class="space-y-2" aria-busy="true">
      <Skeleton class="h-10 w-full" />
      <Skeleton class="h-10 w-full" />
    </div>

    <CmsEmptyState
      v-else-if="error && !redirects.length"
      tone="error"
      icon="lucide:triangle-alert"
      title="Não foi possível carregar"
      :description="error"
    >
      <Button size="sm" variant="outline" @click="load">
        Tentar novamente
      </Button>
    </CmsEmptyState>

    <p v-else-if="!redirects.length" class="text-sm text-muted-foreground">
      Nenhum redirecionamento neste site.
    </p>

    <ul v-else class="border rounded-lg divide-y">
      <li v-for="redirect in redirects" :key="redirect.id" class="flex items-center justify-between gap-3 px-3 py-2">
        <div class="min-w-0">
          <p class="truncate text-sm font-mono">
            {{ redirect.path }}
          </p>
          <p class="truncate text-xs text-muted-foreground">
            {{ redirect.documentTitle || 'Conteúdo removido' }}
          </p>
        </div>
        <Button
          v-if="canManage"
          type="button"
          size="sm"
          variant="ghost"
          @click="removeRedirect(redirect)"
        >
          Remover
        </Button>
      </li>
    </ul>

    <form v-if="canManage" class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" @submit.prevent="createRedirect">
      <div class="space-y-1.5">
        <Label for="cms-redirect-path">Endereço antigo</Label>
        <Input id="cms-redirect-path" v-model="path" placeholder="/pagina-antiga" class="font-mono" autocomplete="off" spellcheck="false" />
      </div>
      <div class="space-y-1.5">
        <Label for="cms-redirect-document">Abre o conteúdo</Label>
        <Select :model-value="documentId" @update:model-value="value => (documentId = String(value))">
          <SelectTrigger id="cms-redirect-document" aria-label="Conteúdo de destino">
            <SelectValue placeholder="Escolha um conteúdo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in documentOptions" :key="option.id" :value="option.id">
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="sm" :disabled="saving || !documentOptions.length">
        {{ saving ? 'Salvando…' : 'Adicionar' }}
      </Button>
    </form>
    <p v-if="formError" class="text-sm text-destructive" role="alert">
      {{ formError }}
    </p>
  </section>
</template>
