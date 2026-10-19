<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import ArticleFloatingMenu from '~/components/articles/ArticleFloatingMenu.vue'
import Tiny from '~/components/articles/Tiny.vue'
import { useToast } from '~/components/ui/toast'
import { useTenantPage } from '~/composables/useTenantPage'
import { useTenantStore } from '~/stores/tenant'

definePageMeta({
  middleware: ['auth', 'role', 'tenant-check'],
  requiredRoles: ['admin', 'funcionario', 'cliente', 'atendente'],
})

interface ArticleForm {
  id?: string
  title: string
  slug: string
  content: string
  publish_status: 'draft' | 'published'
  description: string
  category_id: string
}

interface ArticleCategory {
  id: number
  title: string
  tenant_id: string
  created_at?: string
}

function generateSlug(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-{2,}/g, '-')
}

const { toast } = useToast()
const tenantStore = useTenantStore()
const { tenantId, whenTenantReady } = useTenantPage()

const form = ref<ArticleForm>({
  title: '',
  slug: '',
  content: '',
  description: '',
  category_id: '',
  publish_status: 'draft',
})

const showFloatingMenu = ref(false)
const loading = ref(false)
const categories = ref<ArticleCategory[]>([])

function updateSlug() {
  if (form.value.title) {
    form.value.slug = generateSlug(form.value.title)
  }
}

async function fetchCategories() {
  try {
    const response = await $fetch('/api/articles/category', { method: 'GET' })
    categories.value = response.data as unknown as ArticleCategory[]
  }
  catch (error: any) {
    console.error('Erro ao buscar categorias:', error)
    toast({
      title: 'Erro',
      description: error?.data?.message || 'Não foi possível carregar as categorias',
      variant: 'destructive',
    })
    // Definir categorias como array vazio em caso de erro
    categories.value = []
  }
}

async function saveArticle() {
  // Verificar se o tenant está selecionado usando o Pinia store
  if (!tenantStore.tenantId) {
    toast({
      title: 'Erro',
      description: 'Selecione um tenant antes de criar o artigo',
      variant: 'destructive',
    })
    return
  }

  // Validar campos obrigatórios
  if (!form.value.title || !form.value.slug || !form.value.content || !form.value.description) {
    toast({
      title: 'Erro',
      description: 'Preencha todos os campos obrigatórios',
      variant: 'destructive',
    })
    return
  }

  loading.value = true
  const articleData = {
    title: form.value.title,
    slug: form.value.slug,
    content: form.value.content,
    meta_description: form.value.description,
    publish_status: form.value.publish_status || 'draft',
    category_id: form.value.category_id,
  }

  try {
    await $fetch('/api/articles', {
      method: 'POST',
      body: articleData,
    })

    toast({
      title: 'Sucesso',
      description: 'Artigo criado com sucesso!',
    })

    form.value = {
      title: '',
      slug: '',
      content: '',
      description: '',
      category_id: '',
      publish_status: 'draft',
    }

    navigateTo('/articles')
  }
  catch (e: any) {
    console.error('Erro ao salvar artigo:', e)
    toast({
      title: 'Erro',
      description: e?.data?.message || 'Ocorreu um erro ao salvar o artigo',
      variant: 'destructive',
    })
  }
  finally {
    loading.value = false
  }
}

whenTenantReady(async () => {
  if (tenantStore.tenantId || tenantId.value)
    await fetchCategories()
})

onMounted(() => {
  window.addEventListener('scroll', () => {
    showFloatingMenu.value = window.scrollY > 200
  })

  const handleTenantChanged = async (event: Event) => {
    const customEvent = event as CustomEvent
    if (customEvent.detail?.tenantId) {
      tenantStore.tenantId = customEvent.detail.tenantId
      await fetchCategories()
    }
  }

  window.addEventListener('tenant-changed', handleTenantChanged)

  onUnmounted(() => {
    window.removeEventListener('tenant-changed', handleTenantChanged)
  })
})
</script>

<template>
  <div>
    <div>
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">
          Criando Artigo
        </h1>
        <Button class="bg-primary hover:bg-primary/90" @click="() => navigateTo('/articles')">
          <Icon name="lucide:arrow-left" class="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
      <form v-if="!loading" class="space-y-8" @submit.prevent="saveArticle">
        <div class="grid grid-cols-1 gap-8 md:grid-cols-12">
          <Card class="md:col-span-8">
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
              <CardDescription> Preencha as informações principais do artigo </CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <div class="space-y-2">
                <Label for="title">Título</Label>
                <Input
                  id="title"
                  v-model="form.title"
                  placeholder="Digite um título atrativo para seu artigo"
                  :disabled="loading"
                  required
                  @blur="updateSlug"
                />
              </div>
              <div class="space-y-2">
                <Label for="slug">URL do Artigo</Label>
                <div class="flex gap-2">
                  <Input id="slug" v-model="form.slug" placeholder="url-do-artigo" :disabled="loading" required />
                  <Button type="button" variant="outline" :disabled="loading" @click="updateSlug">
                    <Icon name="lucide:refresh-cw" class="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div class="space-y-2">
                <Label for="description">Descrição</Label>
                <Textarea
                  id="description"
                  v-model="form.description"
                  placeholder="Escreva um breve resumo do seu artigo"
                  :disabled="loading"
                  required
                  rows="3"
                />
              </div>
            </CardContent>
          </Card>
          <Card class="md:col-span-4">
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription> Defina o status do artigo </CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <div class="space-y-2">
                <Label>Status</Label>
                <Select v-model="form.publish_status" :disabled="loading">
                  <SelectTrigger>
                    <SelectValue :placeholder="form.publish_status === 'draft' ? 'Rascunho' : 'Publicado'" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="draft">
                        <div class="flex items-center">
                          <Icon name="lucide:file-text" class="mr-2 h-4 w-4" />
                          Rascunho
                        </div>
                      </SelectItem>
                      <SelectItem value="published">
                        <div class="flex items-center">
                          <Icon name="lucide:check-circle" class="mr-2 h-4 w-4" />
                          Publicado
                        </div>
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <!-- Categoria (apenas HTML, sem lógica) -->
              <div class="space-y-2">
                <Label>Categorias
                  <span class="ms-2 text-xs text-muted-foreground"><a href="/articles/category" class="text-purple hover:text-purple/80">Gerenciar categorias</a></span></Label>
                <div class="flex items-center gap-2">
                  <Select v-model="form.category_id" :disabled="loading">
                    <SelectTrigger class="h-10">
                      <SelectValue placeholder="Selecionar categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem v-for="category in categories" :key="category.id" :value="String(category.id)">
                          {{ category.title }}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    class="h-10 w-10 border-2 rounded-md p-0 transition-colors duration-200 hover:bg-secondary hover:text-secondary-foreground"
                    disabled
                  >
                    <Icon name="lucide:plus" class="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    class="h-10 w-10 border-2 border-destructive rounded-md p-0 text-destructive transition-colors duration-200 hover:bg-destructive hover:text-destructive-foreground"
                    disabled
                    title="Excluir categoria selecionada"
                  >
                    <Icon name="lucide:trash-2" class="h-4 w-4" />
                  </Button>
                </div>
                <p class="text-sm text-muted-foreground">
                  Selecione uma categoria para o artigo<br>
                  (opcional)
                </p>
              </div>
              <!-- Tags (apenas HTML, sem lógica) -->
              <div class="space-y-2">
                <Label>Tags
                  <span class="ms-2 text-xs text-muted-foreground"><a href="/articles/tags" class="text-purple hover:text-purple/80">Gerenciar tags</a></span></Label>
                <div class="space-y-3">
                  <div class="relative">
                    <div class="flex items-center overflow-x-auto whitespace-nowrap border rounded-md px-3 py-2">
                      <div class="max-w-full flex items-center gap-1.5">
                        <span
                          class="inline-flex shrink-0 items-center rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium"
                        >Tag Exemplo</span>
                        <div class="flex-1" />
                      </div>
                    </div>
                    <p class="text-sm text-muted-foreground">
                      Digite e pressione enter para adicionar <br>
                      (opcional)
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Conteúdo</CardTitle>
            <CardDescription> Escreva o conteúdo do seu artigo usando o editor abaixo </CardDescription>
          </CardHeader>
          <CardContent>
            <ClientOnly>
              <Tiny v-model="form.content" :height="500" :disabled="loading" />
              <template #fallback>
                <Skeleton class="h-[500px] w-full rounded-md" />
              </template>
            </ClientOnly>
          </CardContent>
        </Card>
      </form>
    </div>
    <ArticleFloatingMenu
      :on-save="saveArticle"
      :on-back="() => navigateTo('/articles')"
      :on-cancel="() => navigateTo('/articles')"
      :is-loading="loading"
      :show="showFloatingMenu"
    />
  </div>
</template>

<style>
.tox-tinymce {
  border-radius: 0.5rem;
  border-color: hsl(var(--border));
}

.dark .tox-tinymce {
  border-color: hsl(var(--border));
}

.dark .tox:not(.tox-tinymce-inline) .tox-editor-header {
  background-color: hsl(var(--background));
  border-bottom-color: hsl(var(--border));
}

.fade-tag-enter-active,
.fade-tag-leave-active {
  transition:
    opacity 0.25s,
    transform 0.25s;
}
.fade-tag-enter-from {
  opacity: 0;
  transform: scale(0.85);
}
.fade-tag-enter-to {
  opacity: 1;
  transform: scale(1);
}
.fade-tag-leave-from {
  opacity: 1;
  transform: scale(1);
}
.fade-tag-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
</style>
