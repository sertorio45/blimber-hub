<script setup lang="ts">
/**
 * Standard shadcn Skeleton layouts for Marketing pages.
 * Use `contentOnly` when the page already renders a real header/filters.
 */
withDefaults(defineProps<{
  variant?: 'dashboard' | 'list' | 'grid' | 'kanban' | 'calendar' | 'detail' | 'integrations' | 'reports'
  rows?: number
  cards?: number
  contentOnly?: boolean
}>(), {
  variant: 'list',
  rows: 5,
  cards: 8,
  contentOnly: false,
})
</script>

<template>
  <div class="space-y-6" aria-busy="true" aria-live="polite">
    <!-- Page header -->
    <div
      v-if="!contentOnly"
      class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <Skeleton class="h-8 w-48" />
        <Skeleton class="h-4 max-w-full w-72" />
      </div>
      <Skeleton class="h-9 w-36" />
    </div>

    <!-- Filters / toolbar -->
    <div
      v-if="!contentOnly && variant !== 'detail'"
      class="flex flex-col gap-3 border rounded-lg p-4 sm:flex-row sm:flex-wrap"
    >
      <Skeleton class="h-9 w-full sm:w-40" />
      <Skeleton class="h-9 w-full sm:w-36" />
      <Skeleton class="h-9 w-full sm:w-44" />
    </div>

    <!-- Dashboard metrics -->
    <div v-if="variant === 'dashboard'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card v-for="i in 4" :key="`metric-${i}`">
        <CardContent class="flex items-center gap-4 p-6">
          <Skeleton class="h-10 w-10 rounded-lg" />
          <div class="flex-1 space-y-2">
            <Skeleton class="h-3 w-24" />
            <Skeleton class="h-7 w-16" />
          </div>
        </CardContent>
      </Card>
    </div>

    <div v-if="variant === 'dashboard'" class="grid gap-6 lg:grid-cols-3">
      <Card class="lg:col-span-2">
        <CardHeader class="space-y-2">
          <Skeleton class="h-5 w-40" />
          <Skeleton class="h-4 w-64" />
        </CardHeader>
        <CardContent class="grid gap-3 sm:grid-cols-2">
          <Skeleton v-for="i in 4" :key="`dash-btn-${i}`" class="h-16 w-full rounded-lg" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="space-y-2">
          <Skeleton class="h-5 w-32" />
          <Skeleton class="h-4 w-48" />
        </CardHeader>
        <CardContent class="space-y-3">
          <Skeleton v-for="i in 4" :key="`dash-side-${i}`" class="h-10 w-full" />
        </CardContent>
      </Card>
    </div>

    <!-- List rows -->
    <div v-else-if="variant === 'list'" class="space-y-2">
      <div
        v-for="i in rows"
        :key="`row-${i}`"
        class="flex items-center gap-3 border rounded-lg p-4"
      >
        <Skeleton class="h-10 w-10 shrink-0 rounded-md" />
        <div class="min-w-0 flex-1 space-y-2">
          <Skeleton class="h-4 w-40" />
          <Skeleton class="h-3 max-w-full w-64" />
        </div>
        <Skeleton class="h-8 w-20 shrink-0" />
      </div>
    </div>

    <!-- Card grid -->
    <div
      v-else-if="variant === 'grid'"
      class="grid gap-4 2xl:grid-cols-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      <Skeleton
        v-for="i in cards"
        :key="`card-${i}`"
        class="aspect-square w-full rounded-xl"
      />
    </div>

    <!-- Kanban columns -->
    <div v-else-if="variant === 'kanban'" class="flex gap-3 overflow-x-auto pb-2">
      <div
        v-for="i in 5"
        :key="`col-${i}`"
        class="w-72 shrink-0 border rounded-lg p-3 space-y-3"
      >
        <Skeleton class="h-5 w-28" />
        <Skeleton class="h-28 w-full rounded-lg" />
        <Skeleton class="h-28 w-full rounded-lg" />
        <Skeleton class="h-20 w-full rounded-lg" />
      </div>
    </div>

    <!-- Calendar -->
    <Card v-else-if="variant === 'calendar'">
      <CardHeader class="flex-row items-center justify-between gap-3">
        <div class="space-y-2">
          <Skeleton class="h-5 w-40" />
          <Skeleton class="h-3 w-24" />
        </div>
        <div class="flex gap-2">
          <Skeleton class="h-9 w-9" />
          <Skeleton class="h-9 w-16" />
          <Skeleton class="h-9 w-9" />
        </div>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-7 gap-px overflow-hidden border rounded-lg">
          <Skeleton
            v-for="i in 35"
            :key="`day-${i}`"
            class="min-h-28 w-full rounded-none"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Detail / form -->
    <div v-else-if="variant === 'detail'" class="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardHeader class="space-y-2">
          <Skeleton class="h-5 w-40" />
          <Skeleton class="h-4 w-64" />
        </CardHeader>
        <CardContent class="space-y-4">
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-32 w-full" />
          <div class="grid gap-4 md:grid-cols-2">
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-6 space-y-3">
          <Skeleton class="h-4 w-32" />
          <Skeleton class="h-24 w-full" />
        </CardContent>
      </Card>
    </div>

    <!-- Integrations cards — mirrors SocialProviderCard to avoid layout shift -->
    <div
      v-else-if="variant === 'integrations'"
      class="grid gap-4 lg:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <Card
        v-for="i in 4"
        :key="`int-${i}`"
        class="overflow-hidden border border-border/70 rounded-2xl shadow-sm"
      >
        <CardContent class="flex flex-col items-center px-6 pb-7 pt-8 text-center">
          <Skeleton class="h-14 w-14 rounded-xl" />
          <Skeleton class="mt-4 h-5 w-28" />
          <Skeleton class="mt-2 h-3 w-36" />
          <Skeleton class="mt-3 h-5 w-24 rounded-full" />
          <Skeleton class="mt-4 h-3 w-40" />
          <Skeleton class="mt-6 h-10 max-w-[240px] w-full rounded-full" />
          <Skeleton class="mt-2 h-9 max-w-[240px] w-full rounded-full" />
        </CardContent>
      </Card>
    </div>

    <!-- Reports -->
    <div v-else-if="variant === 'reports'" class="grid gap-6 md:grid-cols-[240px_1fr]">
      <div class="space-y-3">
        <Skeleton class="h-8 w-full" />
        <Skeleton class="h-8 w-full" />
        <Skeleton class="h-8 w-full" />
        <Skeleton class="h-8 w-full" />
      </div>
      <div class="space-y-4">
        <div class="grid gap-4 lg:grid-cols-4 sm:grid-cols-2">
          <Skeleton v-for="i in 4" :key="`rep-${i}`" class="h-24 w-full rounded-xl" />
        </div>
        <Skeleton class="h-72 w-full rounded-xl" />
        <Skeleton class="h-48 w-full rounded-xl" />
      </div>
    </div>
  </div>
</template>
