<script setup lang="ts">
import type { CmsSite } from '~/lib/cms/contracts'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

withDefaults(defineProps<{
  title: string
  description?: string
  sites?: CmsSite[]
  currentSiteId?: string | null
}>(), {
  description: '',
  sites: () => [],
  currentSiteId: null,
})

const emit = defineEmits<{ selectSite: [siteId: string] }>()
</script>

<template>
  <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div class="min-w-0 space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        {{ title }}
      </h1>
      <p v-if="description" class="text-sm text-muted-foreground">
        {{ description }}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <!-- A selector only exists when there is a real choice; one site is implicit. -->
      <Select
        v-if="sites.length > 1"
        :model-value="currentSiteId ?? undefined"
        @update:model-value="value => value && emit('selectSite', String(value))"
      >
        <SelectTrigger class="w-full sm:w-52" aria-label="Site">
          <Icon name="lucide:globe" class="mr-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <SelectValue placeholder="Selecione o site" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="site in sites" :key="site.id" :value="site.id">
            {{ site.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <slot name="actions" />
    </div>
  </header>
</template>
