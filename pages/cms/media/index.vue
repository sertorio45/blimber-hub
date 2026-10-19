<script setup lang="ts">
import type { CmsMediaAsset, CmsMediaUsages } from '~/composables/cms/useCmsMedia'
import { computed, ref } from 'vue'

import { toast } from 'vue-sonner'
import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import CmsGate from '~/components/cms/CmsGate.vue'
import CmsPageHeader from '~/components/cms/CmsPageHeader.vue'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { normalizeCmsError } from '~/composables/cms/cmsErrors'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { cmsMediaUsageCount, cmsMediaUsagesFromDetails, useCmsMedia } from '~/composables/cms/useCmsMedia'
import { confirmDelete } from '~/composables/useConfirmDelete'
import { useTenantPage } from '~/composables/useTenantPage'
import { mediaAssetMimeType, mediaAssetPreviewUrl } from '~/utils/media-asset'

definePageMeta({
  middleware: ['auth'],
  title: 'Mídia',
})

useTenantPage()

const access = useCmsAccess()
const media = useCmsMedia()

const USAGE_KIND_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  revision: 'Versão publicada',
  global: 'Configuração do site',
}
const fileInput = ref<HTMLInputElement | null>(null)
const usageDialog = ref<{ asset: CmsMediaAsset, usages: CmsMediaUsages } | null>(null)

const gateError = computed(() => media.loadError.value)

function previewOf(asset: CmsMediaAsset): string | null {
  if (!mediaAssetMimeType(asset).startsWith('image/'))
    return null
  return mediaAssetPreviewUrl(asset)
}

async function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  for (const file of files) {
    const uploaded = await media.upload(file)
    if (uploaded)
      toast.success(`Enviado: ${uploaded.name}`)
  }
}

async function confirmRemove(asset: CmsMediaAsset) {
  const confirmed = await confirmDelete({
    title: 'Excluir arquivo?',
    description: `"${asset.name}" será removido permanentemente da biblioteca.`,
    confirmLabel: 'Excluir',
  })
  if (!confirmed)
    return
  try {
    await media.remove(asset.id)
    toast.success('Arquivo excluído.')
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    if (normalized.code === 'aborted')
      return
    if (normalized.code === 'asset_in_use') {
      let usages = cmsMediaUsagesFromDetails(normalized.details)
      if (!usages) {
        try {
          usages = (await media.getAsset(asset.id)).usages
        }
        catch {
          usages = { socialPosts: [], cmsDocuments: [] }
        }
      }
      usageDialog.value = { asset, usages }
      return
    }
    toast.error(normalized.message || 'Não foi possível excluir o arquivo.')
  }
}

async function retry() {
  await media.refresh()
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <CmsPageHeader
      title="Mídia"
      description="Imagens e arquivos usados nas páginas e publicações."
    >
      <template #actions>
        <Button
          v-if="access.canUploadMedia.value"
          size="sm"
          @click="fileInput?.click()"
        >
          <Icon name="lucide:upload" class="mr-2 size-4" aria-hidden="true" />
          Enviar
        </Button>
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          accept="image/*,video/mp4,video/quicktime,application/pdf"
          multiple
          @change="onFilesSelected"
        >
      </template>
    </CmsPageHeader>

    <CmsGate :allowed="access.canReadMedia.value" :error="gateError" @retry="retry">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="relative max-w-sm flex-1">
          <Icon name="lucide:search" class="pointer-events-none absolute left-3 top-1/2 size-4 text-muted-foreground -translate-y-1/2" aria-hidden="true" />
          <Input
            v-model="media.search.value"
            class="pl-9"
            placeholder="Buscar arquivos…"
            aria-label="Buscar arquivos"
          />
        </div>
      </div>

      <div v-if="media.uploads.value.length" class="space-y-2">
        <div
          v-for="upload in media.uploads.value"
          :key="upload.id"
          class="flex items-center justify-between gap-3 border rounded-lg px-3 py-2 text-sm"
        >
          <div class="min-w-0 flex items-center gap-2">
            <Icon
              :name="upload.status === 'uploading' ? 'lucide:loader-circle' : 'lucide:triangle-alert'"
              class="size-4 shrink-0"
              :class="upload.status === 'uploading' ? 'animate-spin text-muted-foreground' : 'text-destructive'"
              aria-hidden="true"
            />
            <span class="truncate">{{ upload.name }}</span>
            <span v-if="upload.error" class="truncate text-destructive">{{ upload.error }}</span>
          </div>
          <Button variant="ghost" size="sm" @click="media.dismissUpload(upload.id)">
            Fechar
          </Button>
        </div>
      </div>

      <div v-if="media.showSkeleton.value" class="grid grid-cols-2 gap-3 lg:grid-cols-6 md:grid-cols-4 sm:grid-cols-3">
        <div v-for="n in 12" :key="n" class="aspect-square animate-pulse rounded-xl bg-muted" />
      </div>

      <CmsEmptyState
        v-else-if="!media.assets.value.length"
        :icon="media.hasSearch.value ? 'lucide:search-x' : 'lucide:image'"
        :title="media.hasSearch.value ? 'Nenhum arquivo encontrado' : 'Biblioteca vazia'"
        :description="media.hasSearch.value ? 'Tente outro termo.' : 'Envie imagens para usar nas páginas e publicações.'"
      >
        <Button v-if="!media.hasSearch.value && access.canUploadMedia.value" @click="fileInput?.click()">
          Enviar arquivo
        </Button>
      </CmsEmptyState>

      <template v-else>
        <ul class="grid grid-cols-2 gap-3 lg:grid-cols-6 md:grid-cols-4 sm:grid-cols-3">
          <li
            v-for="asset in media.assets.value"
            :key="asset.id"
            class="group relative overflow-hidden border rounded-xl bg-muted/30"
          >
            <div class="aspect-square">
              <img
                v-if="previewOf(asset)"
                :src="previewOf(asset) || undefined"
                :alt="asset.name"
                class="size-full object-cover"
                loading="lazy"
              >
              <div
                v-else
                class="size-full flex items-center justify-center text-muted-foreground"
              >
                <Icon name="lucide:file" class="size-8" aria-hidden="true" />
              </div>
            </div>
            <div class="p-2 space-y-1">
              <p class="truncate text-xs font-medium" :title="asset.name">
                {{ asset.name }}
              </p>
              <Button
                v-if="access.canDeleteMedia.value"
                variant="ghost"
                size="sm"
                class="h-7 w-full text-xs text-destructive hover:text-destructive"
                @click="confirmRemove(asset)"
              >
                Excluir
              </Button>
            </div>
          </li>
        </ul>

        <div v-if="media.hasMore.value || media.loadMoreError.value" class="flex flex-col items-center gap-2 pt-2">
          <p v-if="media.loadMoreError.value" role="alert" class="text-xs text-destructive">
            {{ media.loadMoreError.value }}
          </p>
          <Button
            variant="outline"
            size="sm"
            :disabled="media.loadingMore.value"
            @click="media.loadMore()"
          >
            {{ media.loadingMore.value ? 'Carregando…' : 'Carregar mais' }}
          </Button>
        </div>
      </template>
    </CmsGate>

    <div
      v-if="usageDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cms-media-usage-title"
      @click.self="usageDialog = null"
    >
      <div class="max-w-md w-full border rounded-xl bg-background p-5 shadow-lg space-y-4">
        <div class="space-y-1">
          <h2 id="cms-media-usage-title" class="text-base font-semibold">
            Onde este arquivo é usado
          </h2>
          <p class="text-sm text-muted-foreground">
            “{{ usageDialog.asset.name }}” aparece em {{ cmsMediaUsageCount(usageDialog.usages) }} vínculo(s). Remova esses usos antes de excluir.
          </p>
        </div>
        <ul class="max-h-60 overflow-auto text-sm space-y-2">
          <li
            v-for="post in usageDialog.usages.socialPosts"
            :key="`social-${post.id}`"
            class="rounded-lg bg-muted/50 px-3 py-2"
          >
            Post social · {{ post.title || 'Sem título' }}
          </li>
          <li
            v-for="(doc, index) in usageDialog.usages.cmsDocuments"
            :key="`cms-${doc.documentId ?? index}-${doc.fieldPath}`"
            class="rounded-lg bg-muted/50 px-3 py-2"
          >
            {{ USAGE_KIND_LABEL[doc.usageKind] ?? 'Conteúdo' }}
            <span v-if="doc.fieldPath" class="text-muted-foreground"> · {{ doc.fieldPath }}</span>
            <NuxtLink
              v-if="doc.documentId"
              :to="`/cms/documents/${doc.documentId}`"
              class="ml-1 text-primary underline-offset-2 hover:underline"
            >
              abrir
            </NuxtLink>
          </li>
        </ul>
        <div class="flex justify-end">
          <Button variant="outline" @click="usageDialog = null">
            Fechar
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
