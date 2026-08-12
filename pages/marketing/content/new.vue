<script setup lang="ts">
import type { SocialPostInput } from '~/types/marketing-social'

import { toast } from 'vue-sonner'
import ContentEditor from '~/components/marketing/content/ContentEditor.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Novo conteúdo',
})

const route = useRoute()
const social = useMarketingSocial()
const { isClientExperience } = useMarketingAudience()
const saving = ref(false)
const formReady = ref(false)

onMounted(() => {
  formReady.value = true
})

const initialValue = computed(() => {
  const scheduledAt = typeof route.query.scheduledAt === 'string' ? route.query.scheduledAt : undefined
  const campaignId = typeof route.query.campaignId === 'string' ? route.query.campaignId : undefined
  return {
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(campaignId ? { campaignId } : {}),
  } as SocialPostInput | undefined
})

async function save(input: SocialPostInput) {
  saving.value = true
  try {
    const post = await social.createPost(input)
    toast.success('Rascunho criado')
    await navigateTo(`/marketing/content/${(post as any).id}`)
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Não foi possível salvar')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <MarketingPageSkeleton v-if="!formReady" variant="detail" />
  <div v-else class="mx-auto max-w-6xl px-4 py-6 lg:px-8">
    <div class="mb-8">
      <Button
        variant="ghost"
        size="sm"
        class="mb-3 -ml-2 text-muted-foreground transition-colors hover:text-foreground"
        @click="navigateTo('/marketing/content')"
      >
        <Icon name="lucide:arrow-left" class="mr-1.5 h-4 w-4" />
        {{ isClientExperience ? 'Publicações' : 'Conteúdos' }}
      </Button>
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon name="lucide:pen-square" class="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">
            {{ isClientExperience ? 'Criar post' : 'Novo conteúdo' }}
          </h1>
          <p class="text-sm text-muted-foreground">
            {{ isClientExperience
              ? 'Escreva a legenda, escolha os canais e veja a pré-visualização antes de publicar.'
              : 'Título, legenda, variantes por rede, anexos, campanha e responsáveis.' }}
          </p>
        </div>
      </div>
    </div>

    <ContentEditor :initial-value="initialValue" :saving="saving" @save="save" />
  </div>
</template>
