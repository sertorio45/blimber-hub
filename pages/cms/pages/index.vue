<script setup lang="ts">
import CmsDocumentBrowser from '~/components/cms/CmsDocumentBrowser.vue'
import { useTenantPage } from '~/composables/useTenantPage'

definePageMeta({
  middleware: ['auth'],
  title: 'Páginas',
})

useTenantPage()
</script>

<template>
  <CmsDocumentBrowser
    kind="page"
    title="Páginas"
    description="Páginas fixas do site, como início, sobre e contato."
  />
</template>
