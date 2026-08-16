<script setup lang="ts">
import type { SocialContentBoardItem } from '@/utils/marketing-social-preview'
import type { SocialPostStatus } from '~/types/marketing-social'
import DeletePostDialog from '~/components/marketing/social/DeletePostDialog.vue'
import SocialContentBoard from '~/components/marketing/social/SocialContentBoard.vue'
import SocialViewToggle from '~/components/marketing/social/SocialViewToggle.vue'
import { uniquePostPreviewAssets } from '@/utils/marketing-social-preview'
import { useWorkspace } from '~/composables/useWorkspace'
import { SOCIAL_STATUS_LABELS } from '~/types/marketing-social'
import { MARKETING_MVP_STATUS_LABELS } from '~/types/marketing-mvp'
import { resolveMarketingMvpStatus } from '~/utils/marketing-mvp-status'
import {
  clientPortalPostsListQuery,
  includeClientPortalBoardItem,
} from '~/utils/marketing-client-content'

definePageMeta({
  middleware: ['auth'],
  title: 'Conteúdos',
})

type CampaignOption = { id: string, name: string }
type TeamMemberOption = { userId: string, name: string }

const DeletePostDialogPanel = markRaw(DeletePostDialog)

const route = useRoute()
const social = useMarketingSocial()
const { isClientExperience } = useMarketingAudience()
const workspace = useWorkspace()

const search = ref(String(route.query.search || ''))
const mvpStatus = ref(String(route.query.mvp_status || 'all'))
const platform = ref(String(route.query.platform || 'all'))
const campaignId = ref(String(route.query.campaign_id || 'all'))
const assignedTo = ref(String(route.query.assigned_to || 'all'))
const viewMode = ref<'thumb' | 'list'>('thumb')
const deleteDialogOpen = ref(false)
const postToDelete = ref<any>(null)

const canCreate = computed(() => workspace.can('marketing.social.create'))
const canDelete = computed(() =>
  workspace.can('marketing.social.delete.local') || workspace.can('marketing.social.delete.remote'),
)

const postsQueryKey = computed(() =>
  [
    'marketing-content',
    social.tenantId.value,
    mvpStatus.value,
    platform.value,
    campaignId.value,
    assignedTo.value,
    search.value,
    isClientExperience.value ? 'client' : 'agency',
  ].join('-'),
)

const { data: campaigns } = useMarketingFetch({
  key: () => `marketing-content-campaigns-${social.tenantId.value}`,
  handler: async () => {
    const response = await $fetch<{ data: CampaignOption[] }>('/api/marketing/social/campaigns', {
      query: { tenant_id: social.tenantId.value || undefined, status: 'all' },
    }).catch(() => ({ data: [] as CampaignOption[] }))
    return response.data
  },
  default: () => [] as CampaignOption[],
  watch: [social.tenantId],
  enabled: () => Boolean(social.tenantId.value),
})

const { data: members } = useMarketingFetch({
  key: () => `marketing-content-members-${social.tenantId.value}`,
  handler: async () => {
    const response = await $fetch<{ data: TeamMemberOption[] }>('/api/marketing/social/approvers', {
      query: { tenant_id: social.tenantId.value || undefined },
    }).catch(() => ({ data: [] as TeamMemberOption[] }))
    return response.data
  },
  default: () => [] as TeamMemberOption[],
  watch: [social.tenantId, isClientExperience],
  enabled: () => !isClientExperience.value && Boolean(social.tenantId.value),
})

const { data: response, showSkeleton, refresh } = useMarketingFetch({
  key: postsQueryKey,
  handler: () => social.listPosts({
    search: search.value || undefined,
    platform: platform.value !== 'all' ? platform.value : undefined,
    campaign_id: campaignId.value !== 'all' ? campaignId.value : undefined,
    assigned_to: assignedTo.value !== 'all' ? assignedTo.value : undefined,
    ...clientPortalPostsListQuery({
      isClientExperience: isClientExperience.value,
      mvpStatus: mvpStatus.value,
    }),
  }),
  default: () => ({ data: [] as any[], pagination: {} as Record<string, unknown> }),
  watch: [social.tenantId, platform, campaignId, assignedTo, search, mvpStatus, isClientExperience],
  enabled: () => Boolean(social.tenantId.value),
})

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer)
    clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    refresh()
  }, 300)
})

function formatDate(value?: string | null) {
  if (!value)
    return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const campaignNameById = computed(() => {
  const map = new Map<string, string>()
  for (const campaign of campaigns.value || [])
    map.set(campaign.id, campaign.name)
  return map
})

const memberNameById = computed(() => {
  const map = new Map<string, string>()
  for (const member of members.value || [])
    map.set(member.userId, member.name)
  return map
})

const boardItems = computed<SocialContentBoardItem[]>(() => {
  const items = ((response.value?.data || []) as any[])
    .map((post) => {
      const resolvedMvp = resolveMarketingMvpStatus(post)
      return {
        id: post.id,
        title: post.title,
        caption: post.content || 'Sem texto-base',
        status: post.status,
        statusLabel: MARKETING_MVP_STATUS_LABELS[resolvedMvp]
          || SOCIAL_STATUS_LABELS[post.status as SocialPostStatus]
          || post.status,
        mvpStatus: resolvedMvp,
        platforms: (post.social_post_variants || []).map((variant: any) => variant.platform),
        previewAssets: uniquePostPreviewAssets(post),
        meta: formatDate(post.scheduled_at || post.updated_at),
        campaignLabel: post.campaign_id
          ? (campaignNameById.value.get(post.campaign_id) || 'Campanha')
          : null,
        assigneeLabel: post.assigned_to
          ? (memberNameById.value.get(post.assigned_to) || 'Responsável')
          : null,
        href: `/marketing/content/${post.id}`,
        raw: post,
      }
    })

  return items.filter(item => includeClientPortalBoardItem(item.mvpStatus, {
    isClientExperience: isClientExperience.value,
    mvpStatusFilter: mvpStatus.value,
  }))
})

function openDelete(post: any) {
  postToDelete.value = post
  deleteDialogOpen.value = true
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          {{ isClientExperience ? 'Publicações' : 'Conteúdos' }}
        </h1>
        <p class="mt-1 text-muted-foreground">
          {{ isClientExperience
            ? 'Peças aguardando aprovação, agendadas ou publicadas — sem rascunhos da agência.'
            : 'Editor central do Marketing — peça única do fluxo ideia → publicado.' }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          v-if="!isClientExperience"
          variant="outline"
          @click="navigateTo('/marketing/production')"
        >
          <Icon name="lucide:kanban" class="mr-2 h-4 w-4" />
          Produção
        </Button>
        <Button
          v-if="canCreate"
          @click="navigateTo('/marketing/content/new')"
        >
          <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
          Novo conteúdo
        </Button>
      </div>
    </div>

    <Card>
      <CardContent class="flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <div class="relative min-w-[12rem] flex-1">
          <Icon name="lucide:search" class="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input v-model="search" class="pl-9" placeholder="Buscar por título" />
        </div>

        <Select v-model="mvpStatus">
          <SelectTrigger class="w-full md:w-48">
            <SelectValue placeholder="Status MVP" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {{ isClientExperience ? 'Exceto rascunhos' : 'Todos os status' }}
            </SelectItem>
            <SelectItem
              v-for="(label, value) in MARKETING_MVP_STATUS_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select v-model="platform">
          <SelectTrigger class="w-full md:w-44">
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Todas as redes
            </SelectItem>
            <SelectItem value="instagram">
              Instagram
            </SelectItem>
            <SelectItem value="facebook">
              Facebook
            </SelectItem>
            <SelectItem value="linkedin">
              LinkedIn
            </SelectItem>
          </SelectContent>
        </Select>

        <Select v-model="campaignId">
          <SelectTrigger class="w-full md:w-52">
            <SelectValue placeholder="Campanha" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Todas as campanhas
            </SelectItem>
            <SelectItem
              v-for="campaign in campaigns"
              :key="campaign.id"
              :value="campaign.id"
            >
              {{ campaign.name }}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select v-if="!isClientExperience" v-model="assignedTo">
          <SelectTrigger class="w-full md:w-52">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Todos os responsáveis
            </SelectItem>
            <SelectItem
              v-for="member in members"
              :key="member.userId"
              :value="member.userId"
            >
              {{ member.name }}
            </SelectItem>
          </SelectContent>
        </Select>

        <SocialViewToggle v-model="viewMode" />
      </CardContent>
    </Card>

    <MarketingPageSkeleton v-if="showSkeleton" variant="grid" />

    <SocialContentBoard
      v-else
      :items="boardItems"
      :view-mode="viewMode"
      :empty-title="isClientExperience ? 'Nenhuma publicação encontrada' : 'Nenhum conteúdo encontrado'"
      :empty-description="isClientExperience
        ? 'Quando houver peças para aprovar, agendadas ou no ar, elas aparecem aqui.'
        : 'Crie o primeiro rascunho para iniciar o fluxo editorial.'"
    >
      <template #actions="{ item }">
        <Button
          v-if="canDelete"
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Excluir conteúdo"
          @click="openDelete(item.raw)"
        >
          <Icon name="lucide:trash-2" class="h-4 w-4" />
        </Button>
      </template>
    </SocialContentBoard>

    <ClientOnly>
      <component
        :is="DeletePostDialogPanel"
        v-model:open="deleteDialogOpen"
        :post="postToDelete"
        @deleted="refresh"
      />
    </ClientOnly>
  </div>
</template>
