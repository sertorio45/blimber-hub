<script setup lang="ts">
import type { SidebarMenuButtonVariants } from '~/components/ui/sidebar'
import type { NavLink } from '~/types/nav'
import { useSidebar } from '~/components/ui/sidebar'

withDefaults(
  defineProps<{
    item: NavLink
    size?: SidebarMenuButtonVariants['size']
  }>(),
  {
    size: 'default',
  },
)

const { setOpenMobile } = useSidebar()
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <SidebarMenuButton as-child :tooltip="item.title" :size="size">
        <NuxtLink :to="item.link" @click="setOpenMobile(false)">
          <ModuleIcon :name="item.icon || ''" class="size-4 shrink-0" :alt="item.title" />
          <span>{{ item.title }}</span>
          <span
            v-if="item.new"
            class="rounded-md bg-#adfa1d px-1.5 py-0.5 text-xs text-black leading-none no-underline group-hover:no-underline"
          >
            New
          </span>
          <span
            v-if="item.badge"
            class="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground leading-none no-underline group-hover:no-underline"
          >
            {{ item.badge }}
          </span>
        </NuxtLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</template>

<style scoped></style>
