<script setup lang="ts">
import {
  GOOGLE_ADS_API_CENTER_URL,
  GOOGLE_ADS_TEST_TOKEN_USER_MESSAGE,
} from '~/constants/google-ads'

withDefaults(defineProps<{
  /** Override message; defaults to the shared Test-token copy. */
  message?: string
  title?: string
}>(), {
  message: GOOGLE_ADS_TEST_TOKEN_USER_MESSAGE,
  title: 'Acesso do developer token',
})
</script>

<template>
  <Alert class="text-left">
    <Icon name="lucide:shield-alert" class="h-4 w-4" />
    <AlertTitle>{{ title }}</AlertTitle>
    <AlertDescription class="space-y-2">
      <p>{{ message }}</p>
      <p>
        <a
          :href="GOOGLE_ADS_API_CENTER_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="font-medium underline underline-offset-2 hover:text-foreground"
        >
          Abrir Google Ads API Center
        </a>
        <span class="text-muted-foreground"> — solicitar Basic ou Standard (admin da plataforma).</span>
      </p>
    </AlertDescription>
  </Alert>
</template>
