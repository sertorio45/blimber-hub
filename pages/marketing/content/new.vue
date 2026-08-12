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
  <div v-else class="mx-auto max-w-5xl space-y-6">
    <div>
      <Button variant="ghost" class="mb-2 -ml-3" @click="navigateTo('/marketing/content')">
        <Icon name="lucide:arrow-left" class="mr-2 h-4 w-4" />
        {{ isClientExperience ? 'Voltar para publicações' : 'Voltar para conteúdos' }}
      </Button>
      <h1 class="text-2xl font-bold tracking-tight">
        {{ isClientExperience ? 'Criar post' : 'Novo conteúdo' }}
      </h1>
      <p class="mt-1 text-muted-foreground">
        {{ isClientExperience
          ? 'Escreva a legenda, escolha os canais e veja a pré-visualização antes de publicar.'
          : 'Título, legenda, variantes por rede, anexos, campanha e responsáveis.' }}
      </p>
    </div>

    <ContentEditor :initial-value="initialValue" :saving="saving" @save="save" />
  </div>
</template>
