<script setup lang="ts">
import { computed, ref } from 'vue'

import CmsCreateDocumentDialog from '~/components/cms/CmsCreateDocumentDialog.vue'
import CmsCreateSiteDialog from '~/components/cms/CmsCreateSiteDialog.vue'
import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import CmsGate from '~/components/cms/CmsGate.vue'
import CmsPageHeader from '~/components/cms/CmsPageHeader.vue'
import CmsStatusBadge from '~/components/cms/CmsStatusBadge.vue'
import { cmsPathPrefix, CMS_PUBLICATION_TYPE_LABELS, formatCmsRelative } from '~/composables/cms/cmsDisplay'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { useCmsOverview } from '~/composables/cms/useCmsOverview'
import { useCmsSites } from '~/composables/cms/useCmsSites'
import { useTenantPage } from '~/composables/useTenantPage'

definePageMeta({
  middleware: ['auth'],
  title: 'Visão geral',
})

useTenantPage()

const access = useCmsAccess()
const overview = useCmsOverview()
const {
  sites,
  currentSite,
  showSkeleton: sitesSkeleton,
  loadError: sitesError,
  refresh: refreshSites,
  selectSite,
  createSite,
} = useCmsSites()

const createSiteOpen = ref(false)
const createPageOpen = ref(false)
const createPublicationOpen = ref(false)

const gateError = computed(() => overview.loadError.value ?? sitesError.value)
const loading = computed(() => !access.ready.value || overview.showSkeleton.value || sitesSkeleton.value)
const activeSite = computed(() => currentSite.value ?? overview.site.value)
const countsBelongElsewhere = computed(() =>
  Boolean(overview.site.value && currentSite.value && overview.site.value.id !== currentSite.value.id),
)

const countCards = computed(() => [
  { label: 'Páginas', value: overview.counts.value.pages, icon: 'lucide:file', to: '/cms/pages' },
  { label: 'Publicações', value: overview.counts.value.publications, icon: 'lucide:newspaper', to: '/cms/publications' },
  { label: 'Artigos', value: overview.counts.value.articles, icon: 'lucide:file-text', to: '/cms/publications' },
  { label: 'Notícias', value: overview.counts.value.news, icon: 'lucide:megaphone', to: '/cms/publications' },
  { label: 'No ar', value: overview.counts.value.published, icon: 'lucide:globe', to: '/cms/pages' },
  { label: 'Rascunhos', value: overview.counts.value.drafts, icon: 'lucide:pencil-line', to: '/cms/pages' },
])

function retry() {
  void overview.refresh()
  void refreshSites()
}

async function onSiteCreated() {
  await Promise.all([overview.refresh(), refreshSites()])
}

function openRecent(id: string) {
  void navigateTo(`/cms/documents/${id}`)
}
</script>

<template>
  <CmsGate :allowed="access.canRead.value" :error="gateError" @retry="retry">
    <div class="space-y-6">
      <CmsPageHeader
        title="Visão geral"
        :description="activeSite ? `Conteúdo de ${activeSite.name}.` : 'O site desta empresa ainda não foi criado.'"
        :sites="sites"
        :current-site-id="currentSite?.id"
        @select-site="selectSite"
      >
        <template v-if="activeSite" #actions>
          <Button v-if="access.canCreate('page')" variant="outline" @click="createPageOpen = true">
            <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
            Nova página
          </Button>
          <Button v-if="access.canCreate('publication')" @click="createPublicationOpen = true">
            <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
            Nova publicação
          </Button>
        </template>
      </CmsPageHeader>

      <div v-if="loading" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        <Skeleton v-for="index in 6" :key="index" class="h-24 w-full" />
      </div>

      <CmsEmptyState
        v-else-if="!activeSite"
        icon="lucide:globe"
        title="Nenhum site ainda"
        description="Crie o site desta empresa para publicar páginas, artigos e notícias."
      >
        <Button v-if="access.canManageSettings.value" @click="createSiteOpen = true">
          <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
          Criar site
        </Button>
        <p v-else class="text-sm text-muted-foreground">
          Peça a um administrador para criar o site.
        </p>
      </CmsEmptyState>

      <template v-else>
        <p v-if="countsBelongElsewhere" class="text-sm text-muted-foreground">
          Os números e os recentes são de {{ overview.site.value?.name }}. As listas usam o site selecionado.
        </p>

        <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Resumo">
          <NuxtLink
            v-for="card in countCards"
            :key="card.label"
            :to="card.to"
            class="border rounded-xl bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm text-muted-foreground">
                {{ card.label }}
              </p>
              <Icon :name="card.icon" class="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <p class="mt-2 text-2xl font-semibold tracking-tight">
              {{ card.value }}
            </p>
          </NuxtLink>
        </section>

        <section class="flex flex-wrap gap-2" aria-label="Atalhos">
          <Button v-if="access.canReadMedia.value" variant="outline" as-child>
            <NuxtLink to="/cms/media">
              <Icon name="lucide:images" class="mr-2 size-4" aria-hidden="true" />
              Mídia
            </NuxtLink>
          </Button>
          <Button v-if="access.canManageSettings.value" variant="outline" as-child>
            <NuxtLink to="/cms/settings">
              <Icon name="lucide:settings" class="mr-2 size-4" aria-hidden="true" />
              Configurações
            </NuxtLink>
          </Button>
        </section>

        <section class="space-y-3">
          <h2 class="text-sm font-medium">
            Atualizados recentemente
          </h2>
          <CmsEmptyState
            v-if="!overview.recent.value.length"
            icon="lucide:inbox"
            title="Nada por aqui ainda"
            description="Páginas e publicações aparecem nesta lista assim que forem criadas."
          />
          <ul v-else class="divide-y overflow-hidden border rounded-xl">
            <li v-for="item in overview.recent.value" :key="item.id">
              <button
                type="button"
                class="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                @click="openRecent(item.id)"
              >
                <Icon
                  :name="item.kind === 'page' ? 'lucide:file' : item.publicationType === 'news' ? 'lucide:newspaper' : 'lucide:file-text'"
                  class="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ item.title || 'Sem título' }}</span>
                  <span class="block truncate text-xs text-muted-foreground">
                    {{ item.kind === 'page' ? 'Página' : (item.publicationType ? CMS_PUBLICATION_TYPE_LABELS[item.publicationType] : 'Publicação') }}
                    <template v-if="item.slug">
                      · {{ cmsPathPrefix(item.kind, item.publicationType, overview.site.value) }}{{ item.slug }}
                    </template>
                  </span>
                </span>
                <CmsStatusBadge :status="item.publicStatus" :has-unpublished-changes="item.hasUnpublishedChanges" />
                <time :datetime="item.updatedAt" class="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {{ formatCmsRelative(item.updatedAt) }}
                </time>
              </button>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <CmsCreateSiteDialog v-model:open="createSiteOpen" :create="createSite" @created="onSiteCreated" />
    <CmsCreateDocumentDialog v-model:open="createPageOpen" kind="page" :site="activeSite" />
    <CmsCreateDocumentDialog v-model:open="createPublicationOpen" kind="publication" :site="activeSite" />
  </CmsGate>
</template>
