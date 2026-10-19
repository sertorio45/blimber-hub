<script setup lang="ts">
import { computed, ref } from 'vue'

import CmsCreateDocumentDialog from '~/components/cms/CmsCreateDocumentDialog.vue'
import CmsCreateSiteDialog from '~/components/cms/CmsCreateSiteDialog.vue'
import CmsGate from '~/components/cms/CmsGate.vue'
import CmsPageHeader from '~/components/cms/CmsPageHeader.vue'
import CmsStatusBadge from '~/components/cms/CmsStatusBadge.vue'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { formatCmsRelative } from '~/composables/cms/cmsDisplay'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { useCmsOverview } from '~/composables/cms/useCmsOverview'
import { useCmsSites } from '~/composables/cms/useCmsSites'

definePageMeta({
  middleware: ['auth'],
  title: 'CMS',
})

const access = useCmsAccess()
const sites = useCmsSites()
const overview = useCmsOverview(() => sites.currentSite.value?.id)
const createSiteOpen = ref(false)
const createPageOpen = ref(false)
const createPublicationOpen = ref(false)

const gateError = computed(() => sites.loadError.value || overview.loadError.value)
const hasSite = computed(() => Boolean(sites.currentSite.value || overview.site.value))

const countCards = computed(() => [
  { label: 'Páginas', value: overview.counts.value.pages, icon: 'lucide:layout-template' },
  { label: 'Publicações', value: overview.counts.value.publications, icon: 'lucide:newspaper' },
  { label: 'Publicados', value: overview.counts.value.published, icon: 'lucide:globe' },
  { label: 'Rascunhos', value: overview.counts.value.drafts, icon: 'lucide:file-pen-line' },
])

async function retry() {
  await Promise.all([sites.refresh(), overview.refresh()])
}
</script>

<template>
  <div class="mx-auto max-w-6xl p-4 space-y-6 sm:p-6">
    <CmsPageHeader
      title="Visão geral"
      description="Acompanhe o site, as alterações recentes e as próximas ações."
      :sites="sites.sites.value"
      :current-site-id="sites.currentSite.value?.id"
      @select-site="sites.selectSite"
    >
      <template #actions>
        <Button
          v-if="hasSite && access.canCreate('page')"
          variant="outline"
          size="sm"
          @click="createPageOpen = true"
        >
          <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
          Nova página
        </Button>
        <Button
          v-if="hasSite && access.canCreate('publication')"
          size="sm"
          @click="createPublicationOpen = true"
        >
          <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
          Nova publicação
        </Button>
      </template>
    </CmsPageHeader>

    <CmsGate :allowed="access.canRead.value" :error="gateError" @retry="retry">
      <div v-if="sites.showSkeleton.value || overview.showSkeleton.value" class="grid gap-4 lg:grid-cols-4 sm:grid-cols-2">
        <div v-for="n in 4" :key="n" class="h-28 animate-pulse rounded-xl bg-muted" />
      </div>

      <template v-else-if="!hasSite">
        <div class="flex flex-col items-center justify-center gap-4 border rounded-xl border-dashed px-6 py-16 text-center">
          <div class="size-12 flex items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon name="lucide:globe" class="size-6" aria-hidden="true" />
          </div>
          <div class="max-w-md space-y-1">
            <p class="text-base font-medium">
              Nenhum site ainda
            </p>
            <p class="text-sm text-muted-foreground">
              Crie o site desta empresa para começar a editar páginas e publicações.
            </p>
          </div>
          <Button
            v-if="access.canManageSettings.value"
            @click="createSiteOpen = true"
          >
            <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
            Criar site
          </Button>
          <p v-else class="text-sm text-muted-foreground">
            Peça a um administrador para criar o site.
          </p>
        </div>
      </template>

      <template v-else>
        <div class="grid gap-4 lg:grid-cols-4 sm:grid-cols-2">
          <Card v-for="card in countCards" :key="card.label">
            <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle class="text-sm text-muted-foreground font-medium">
                {{ card.label }}
              </CardTitle>
              <Icon :name="card.icon" class="size-4 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p class="text-2xl font-semibold tracking-tight">
                {{ card.value }}
              </p>
            </CardContent>
          </Card>
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
          <Card class="lg:col-span-2">
            <CardHeader>
              <CardTitle>Alterações recentes</CardTitle>
              <CardDescription>Últimos documentos editados neste site.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul v-if="overview.recent.value.length" class="divide-y">
                <li
                  v-for="item in overview.recent.value"
                  :key="item.id"
                >
                  <NuxtLink
                    :to="`/cms/documents/${item.id}`"
                    class="flex items-center justify-between gap-3 rounded-sm py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium">
                        {{ item.title || 'Sem título' }}
                      </p>
                      <p class="text-xs text-muted-foreground">
                        {{ item.kind === 'page' ? 'Página' : 'Publicação' }}
                        · {{ formatCmsRelative(item.updatedAt) }}
                      </p>
                    </div>
                    <CmsStatusBadge
                      :status="item.publicStatus"
                      :has-unpublished-changes="item.hasUnpublishedChanges"
                    />
                  </NuxtLink>
                </li>
              </ul>
              <p v-else class="py-8 text-center text-sm text-muted-foreground">
                Nenhuma alteração recente.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Atalhos</CardTitle>
              <CardDescription>Áreas do CMS.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-2">
              <Button variant="outline" class="w-full justify-start" as-child>
                <NuxtLink to="/cms/pages">
                  <Icon name="lucide:layout-template" class="mr-2 size-4" aria-hidden="true" />
                  Páginas
                </NuxtLink>
              </Button>
              <Button variant="outline" class="w-full justify-start" as-child>
                <NuxtLink to="/cms/publications">
                  <Icon name="lucide:newspaper" class="mr-2 size-4" aria-hidden="true" />
                  Publicações
                </NuxtLink>
              </Button>
              <Button
                v-if="access.canReadMedia.value"
                variant="outline"
                class="w-full justify-start"
                as-child
              >
                <NuxtLink to="/cms/media">
                  <Icon name="lucide:image" class="mr-2 size-4" aria-hidden="true" />
                  Mídia
                </NuxtLink>
              </Button>
              <Button
                v-if="access.canManageSettings.value"
                variant="outline"
                class="w-full justify-start"
                as-child
              >
                <NuxtLink to="/cms/settings">
                  <Icon name="lucide:settings" class="mr-2 size-4" aria-hidden="true" />
                  Configurações
                </NuxtLink>
              </Button>
            </CardContent>
          </Card>
        </div>
      </template>
    </CmsGate>

    <CmsCreateSiteDialog
      v-model:open="createSiteOpen"
      :create="sites.createSite"
      @created="overview.refresh()"
    />
    <CmsCreateDocumentDialog
      v-model:open="createPageOpen"
      kind="page"
      :site="sites.currentSite.value"
    />
    <CmsCreateDocumentDialog
      v-model:open="createPublicationOpen"
      kind="publication"
      :site="sites.currentSite.value"
    />
  </div>
</template>
