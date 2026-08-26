<script setup lang="ts">
import ApprovalStatusBadge from '@/components/marketing/social/ApprovalStatusBadge.vue'
import { useMarketingAudience } from '~/composables/marketing/useMarketingAudience'
import { useWorkspace } from '~/composables/useWorkspace'

const { isClientExperience } = useMarketingAudience()
const workspace = useWorkspace()
const social = useMarketingSocial()

const canApprove = computed(() =>
  workspace.can('marketing.social.approve')
  || workspace.can('marketing.social.approval.internal')
  || workspace.can('marketing.social.approval.client'),
)

const visible = computed(() => canApprove.value && Boolean(social.tenantId.value))

const listQuery = computed(() => {
  if (isClientExperience.value) {
    return {
      inbox: 'client' as const,
      status: 'pending' as const,
    }
  }
  return {
    assignedToMe: true,
    status: 'pending' as const,
  }
})

const { data: pending, refresh, status } = useAsyncData(
  'header-approval-inbox',
  async () => {
    if (!visible.value || !social.tenantId.value)
      return [] as any[]
    const response = await social.listApprovals(listQuery.value)
    return (response.data || []).filter((item: any) => item.can_decide !== false)
  },
  {
    default: () => [] as any[],
    watch: [visible, listQuery, () => social.tenantId.value],
    server: false,
  },
)

const count = computed(() => pending.value.length)
const preview = computed(() => pending.value.slice(0, 5))
const loading = computed(() => status.value === 'pending')

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
      <DropdownMenuLabel class="flex items-center justify-between gap-2">
        <span>{{ isClientExperience ? 'Aguardando você' : 'Atribuídos a mim' }}</span>
        <Badge v-if="count" variant="secondary" class="font-normal">
          {{ count }}
        </Badge>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div v-if="loading && !count" class="px-2 py-3 text-sm text-muted-foreground">
        Carregando…
      </div>
      <DropdownMenuItem
        v-for="item in preview"
        :key="item.id"
        class="flex cursor-pointer flex-col items-start gap-1 py-2.5"
        @click="openRequest(item.id)"
      >
        <span class="w-full truncate font-medium">{{ item.title }}</span>
        <div class="flex w-full items-center gap-2">
          <ApprovalStatusBadge status="pending" :overdue="Boolean(item.overdue)" class="shrink-0" />
          <span class="truncate text-xs text-muted-foreground">
            {{ (item.platforms || []).join(', ') || 'Peça pendente' }}
          </span>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem v-if="!loading && !count" disabled>
        Nada para aprovar agora
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem class="cursor-pointer" @click="openInbox">
        Abrir aprovações
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
