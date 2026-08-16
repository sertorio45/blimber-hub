<script setup lang="ts">
import { useMarketingAudience } from '~/composables/marketing/useMarketingAudience'
import { useWorkspace } from '~/composables/useWorkspace'

const { isClientExperience } = useMarketingAudience()
const workspace = useWorkspace()
const social = useMarketingSocial()

const visible = computed(() =>
  isClientExperience.value && workspace.can('marketing.social.approval.client'),
)

const { data: pending, refresh } = useAsyncData(
  'header-approval-inbox',
  async () => {
    if (!visible.value || !social.tenantId.value)
      return [] as any[]
    const response = await social.listApprovals({
      inbox: 'client',
      status: 'pending',
    })
    return (response.data || []).filter((item: any) => item.can_decide !== false)
  },
  {
    default: () => [] as any[],
    watch: [visible, () => social.tenantId.value],
    server: false,
  },
)

const count = computed(() => pending.value.length)
const preview = computed(() => pending.value.slice(0, 5))

function openInbox() {
  return navigateTo('/marketing/approvals')
}

function openRequest(id: string) {
  return navigateTo(`/marketing/approvals?request=${id}`)
}

onMounted(() => {
  if (visible.value)
    refresh()
})
</script>

<template>
  <DropdownMenu v-if="visible">
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="relative size-9 shrink-0"
        title="Aprovações pendentes"
        aria-label="Aprovações pendentes"
      >
        <Icon name="i-lucide-bell" class="size-5" mode="svg" />
        <span
          v-if="count"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
        >
          {{ count > 9 ? '9+' : count }}
        </span>
        <span class="sr-only">Aprovações pendentes</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-80">
      <DropdownMenuLabel>Aguardando você</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        v-for="item in preview"
        :key="item.id"
        class="flex cursor-pointer flex-col items-start gap-0.5 py-2"
        @click="openRequest(item.id)"
      >
        <span class="truncate font-medium">{{ item.title }}</span>
        <span class="text-xs text-muted-foreground">
          {{ (item.platforms || []).join(', ') || 'Peça pendente' }}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem v-if="!count" disabled>
        Nada para aprovar agora
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem class="cursor-pointer" @click="openInbox">
        Abrir aprovações
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
