<script setup lang="ts">
import CmsDocumentBrowser from '~/components/cms/CmsDocumentBrowser.vue'
import { useTenantPage } from '~/composables/useTenantPage'

definePageMeta({
  middleware: ['auth'],
  title: 'Publicações',
})

useTenantPage()
</script>

<template>
  <CmsDocumentBrowser
    kind="publication"
    title="Publicações"
    description="Artigos e notícias deste site."
  />
</template>
