<script setup lang="ts">
import { Input } from '~/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

const inboxStore = useWhatsAppInboxStore()
</script>

<template>
  <div class="space-y-3 border-b p-4">
    <Input
      :model-value="inboxStore.filters.search"
      placeholder="Buscar conversas..."
      class="h-9"
      @update:model-value="inboxStore.setFilters({ search: String($event) })"
    />
    <div class="flex gap-2">
      <Select
        :model-value="inboxStore.filters.status"
        @update:model-value="inboxStore.setFilters({ status: $event as any })"
      >
        <SelectTrigger class="h-8 flex-1">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            Todas
          </SelectItem>
          <SelectItem value="open">
            Abertas
          </SelectItem>
          <SelectItem value="pending">
            Pendentes
          </SelectItem>
          <SelectItem value="resolved">
            Resolvidas
          </SelectItem>
        </SelectContent>
      </Select>
      <Select
        :model-value="inboxStore.filters.chatType || 'all'"
        @update:model-value="inboxStore.setFilters({ chatType: $event as any })"
      >
        <SelectTrigger class="h-8 w-[110px]">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            Todos
          </SelectItem>
          <SelectItem value="direct">
            Diretas
          </SelectItem>
          <SelectItem value="group">
            Grupos
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="flex gap-2">
      <button
        type="button"
        class="flex h-8 items-center gap-1 rounded-md border px-2 text-xs transition-colors"
        :class="inboxStore.filters.assignedToMe ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'"
        @click="inboxStore.setFilters({ assignedToMe: !inboxStore.filters.assignedToMe })"
      >
        <span class="i-lucide-user-check h-3.5 w-3.5" />
        Minhas
      </button>
      <button
        type="button"
        class="flex h-8 items-center gap-1 rounded-md border px-2 text-xs transition-colors"
        :class="inboxStore.filters.unreadOnly ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'"
        @click="inboxStore.setFilters({ unreadOnly: !inboxStore.filters.unreadOnly })"
      >
        <span class="i-lucide-mail h-3.5 w-3.5" />
        Não lidas
      </button>
    </div>
  </div>
</template>
