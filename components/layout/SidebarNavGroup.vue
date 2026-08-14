<script setup lang="ts">
import type { SidebarMenuButtonVariants } from '~/components/ui/sidebar'
import type { NavGroup } from '~/types/nav'
import { useSidebar } from '~/components/ui/sidebar'
import { resolveNavGroupOpen } from '~/utils/nav-flatten'

const props = withDefaults(
  defineProps<{
    item: NavGroup
    size?: SidebarMenuButtonVariants['size']
  }>(),
  {
    size: 'default',
  },
)

const { setOpenMobile } = useSidebar()
const route = useRoute()

const openCollapsible = ref(resolveNavGroupOpen(props.item, route.path))

watch(
  () => route.path,
  (path) => {
    openCollapsible.value = resolveNavGroupOpen(props.item, path)
  },
)
</script>

<template>
  <SidebarMenu>
    <Collapsible :key="item.title" v-model:open="openCollapsible" as-child class="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger as-child>
          <SidebarMenuButton :tooltip="item.title" :size="size">
            <ModuleIcon :name="item.icon || ''" class="size-4 shrink-0" :alt="item.title" />
            <span>{{ item.title }}</span>
            <span
              v-if="item.new"
              class="rounded-md bg-#adfa1d px-1.5 py-0.5 text-xs text-black leading-none no-underline group-hover:no-underline"
            >
              New
            </span>
            <Icon
              name="i-lucide-chevron-right"
              class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            <SidebarMenuSubItem v-for="subItem in item.children" :key="subItem.title">
              <SidebarMenuSubButton as-child>
                <NuxtLink :to="subItem.link" @click="setOpenMobile(false)">
                  <span>{{ subItem.title }}</span>
                  <span
                    v-if="subItem.new"
                    class="rounded-md bg-#adfa1d px-1.5 py-0.5 text-xs text-black leading-none no-underline group-hover:no-underline"
                  >
                    New
                  </span>
                  <span
                    v-if="subItem.badge"
                    class="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground leading-none no-underline group-hover:no-underline"
                  >
                    {{ subItem.badge }}
                  </span>
                </NuxtLink>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  </SidebarMenu>
</template>

<style scoped></style>
