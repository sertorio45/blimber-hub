<script setup lang="ts">
import { computed, ref } from 'vue'

import CmsCreateCollectionDialog from '~/components/cms/CmsCreateCollectionDialog.vue'
import CmsCreateSiteDialog from '~/components/cms/CmsCreateSiteDialog.vue'
import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import CmsGate from '~/components/cms/CmsGate.vue'
import CmsPageHeader from '~/components/cms/CmsPageHeader.vue'
import { CMS_COLLECTION_FIELD_LABELS } from '~/composables/cms/cmsDisplay'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { useCmsCollections } from '~/composables/cms/useCmsCollections'
import { useCmsSites } from '~/composables/cms/useCmsSites'
import { useTenantPage } from '~/composables/useTenantPage'

definePageMeta({
  middleware: ['auth'],
  title: 'Coleções',
})

useTenantPage()

const access = useCmsAccess()
const {
  sites,
  currentSite,
  showSkeleton: sitesSkeleton,
  loadError: sitesError,
  refresh: refreshSites,
  selectSite,
  createSite,
} = useCmsSites()

const siteId = computed(() => currentSite.value?.id ?? null)
const collections = useCmsCollections(siteId)

const createSiteOpen = ref(false)
const createOpen = ref(false)

const gateError = computed(() => sitesError.value ?? collections.loadError.value)
const loading = computed(() => !access.ready.value || sitesSkeleton.value || (Boolean(siteId.value) && collections.showSkeleton.value))

function fieldSummary(types: Array<'text' | 'number' | 'boolean' | 'media'>): string {
  return types.map(type => CMS_COLLECTION_FIELD_LABELS[type]).join(', ')
}

function retry() {
  void refreshSites()
  void collections.refresh()
}
</script>

<template>
  <CmsGate :allowed="access.canRead.value" :error="gateError" @retry="retry">
    <div class="space-y-6">
      <CmsPageHeader
        title="Coleções"
        description="Registros estruturados, como depoimentos, planos ou perguntas frequentes."
        :sites="sites"
        :current-site-id="currentSite?.id"
        @select-site="selectSite"
      >
        <template v-if="currentSite && access.canManageSchemas.value" #actions>
          <Button @click="createOpen = true">
            <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
            Nova coleção
          </Button>
        </template>
      </CmsPageHeader>

      <div v-if="loading" class="space-y-3" aria-busy="true">
        <Skeleton class="h-16 w-full" />
        <Skeleton class="h-16 w-full" />
      </div>

      <CmsEmptyState
        v-else-if="!currentSite"
        icon="lucide:globe"
        title="Nenhum site ainda"
        description="Crie o site desta empresa para cadastrar coleções."
      >
        <Button v-if="access.canManageSettings.value" @click="createSiteOpen = true">
          <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
          Criar site
        </Button>
      </CmsEmptyState>

      <CmsEmptyState
        v-else-if="!collections.definitions.value.length"
        icon="lucide:layers"
        title="Nenhuma coleção"
        description="Uma coleção define os campos de cada registro. O conteúdo entra depois, um registro por vez."
      >
        <Button v-if="access.canManageSchemas.value" @click="createOpen = true">
          <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
          Nova coleção
        </Button>
      </CmsEmptyState>

      <ul v-else class="border rounded-xl bg-card divide-y">
        <li v-for="definition in collections.definitions.value" :key="definition.id">
          <NuxtLink
            :to="`/cms/collections/${definition.id}`"
            class="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">
                {{ definition.name }}
              </p>
              <p class="truncate text-xs text-muted-foreground font-mono">
                {{ definition.key }}
                <span class="font-sans"> · {{ fieldSummary(definition.schema.fields.map(field => field.type)) }}</span>
              </p>
            </div>
            <Icon name="lucide:chevron-right" class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </NuxtLink>
        </li>
      </ul>
    </div>

    <CmsCreateSiteDialog v-if="createSiteOpen" v-model:open="createSiteOpen" :create="createSite" />
    <CmsCreateCollectionDialog
      v-if="currentSite"
      v-model:open="createOpen"
      :site-id="currentSite.id"
      :create="collections.createDefinition"
    />
  </CmsGate>
</template>
