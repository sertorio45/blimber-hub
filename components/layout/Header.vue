<script setup lang="ts">
import DarkToggle from '~/components/DarkToggle.vue'
import ApprovalInboxBell from '~/components/layout/ApprovalInboxBell.vue'
</script>

<template>
  <header class="sticky top-0 z-20 h-14 w-full flex items-center justify-between gap-4 border-b bg-background px-4 md:px-6">
    <div class="flex items-center gap-4">
      <SidebarTrigger />
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <slot />
      <ApprovalInboxBell />
      <DarkToggle />
    </div>
  </header>
</template>
