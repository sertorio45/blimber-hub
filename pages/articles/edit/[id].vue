<script setup lang="ts">
import { useAsyncData } from '#app'
import { computed, onMounted, ref, watch } from 'vue'

import { useRoute } from 'vue-router'

import ArticleFloatingMenu from '~/components/articles/ArticleFloatingMenu.vue'
import Tiny from '~/components/articles/Tiny.vue'
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
} from '~/components/ui/tags-input'
import { useToast } from '~/components/ui/toast'
import { useTenant } from '~/composables/useTenant'
import { useTenantStore } from '~/stores/tenant'

definePageMeta({
  middleware: ['auth', 'role'],
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

// Remover a definição não utilizada de ArticleCategory se não for usada em outro lugar
// type _ArticleCategory = ArticleCategory // Se precisar manter a referência de tipo

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
const { tenantId } = useTenant()
const route = useRoute()

const form = ref<ArticleForm>({
  title: '',
  slug: '',
  content: '',
  description: '',
  category_id: '',
  publish_status: 'draft',
})

const showFloatingMenu = ref(false)
const loading = ref(true)

// Carregar artigo para edição
async function loadArticle() {
  loading.value = true
  try {
    const response = await $fetch(`/api/articles/${route.params.id}`)
    const data: any = response.data
    form.value = {
      id: data.id || '',
      title: data.title || '',
      slug: data.slug || '',
      content: data.content || '',
      description: data.meta_description || '',
      category_id: data.category_id || '',
      publish_status: data.publish_status || '',
    }
  }
  catch (e: any) {
    toast({ title: 'Erro', description: e?.data?.message || 'Erro ao carregar artigo', variant: 'destructive' })
  }
  loading.value = false
}

// Início da busca de categorias usando useAsyncData do Nuxt
// Este bloco de código busca e filtra as categorias de artigos para o tenant atual
const {
  data: categories, // Dados das categorias
  error: _error, // Objeto de erro caso ocorra falha na busca
  pending: _pending, // Estado de carregamento
} = await useAsyncData(
  'article-categories',
  async () => {
    try {
      const tenantStore = useTenantStore()
      const response = await $fetch('/api/articles/category', {
        method: 'GET',
        query: { tenant_id: tenantStore.tenantId },
      })
      return response.data as any[]
    }
    catch {
      return []
    }
  },
  {
    lazy: true,
    default: () => [],
  },
)
// Fim da busca de categorias usando useAsyncData

// Get relations
const { data: relations } = await useAsyncData(
  'article-relations',
  async () => {
    if (!tenantId.value || !route.params.id)
      return []

    const res = await $fetch('/api/articles/tag/relations', {
      method: 'GET',
      query: {
        tenant_id: tenantId.value,
        article_id: route.params.id,
      },
    })
    return res.data as any[]
  },
  {
    lazy: true,
    default: () => [],
  },
)

// Buscar todas as tags do tenant
const { data: allTags } = await useAsyncData(
  'all-article-tags',
  async () => {
    if (!tenantId.value)
      return []
    const res = await $fetch('/api/articles/tag', {
      method: 'GET',
    })
    return res.data as any[]
  },
  {
    lazy: true,
    default: () => [],
  },
)

// Computed para filtrar as tags relacionadas ao artigo
const relatedTags = computed(() => {
  const rels = Array.isArray(relations.value) ? relations.value : []
  const tags = Array.isArray(allTags.value) ? allTags.value : []
  if (!rels.length || !tags.length)
    return []
  const tagIds = rels.map(r => r.tag_id)
  // Só retorna tags do tenant atual
  return tags.filter(tag => tagIds.includes(tag.id) && tag.tenant_id === tenantId.value)
})

// O v-model do input de tags deve ser um array de titles das tags selecionadas
const selectedTagTitles = ref(relatedTags.value.map(tag => tag.title))

// Limpa o input e adiciona tag ao pressionar Enter, espaço ou blur
function onTagInputEvent(e: KeyboardEvent | FocusEvent) {
  const input = e.target as HTMLInputElement
  const value = input.value.trim().toLowerCase()
  // Adiciona ao pressionar Enter, espaço ou blur
  if ((e instanceof KeyboardEvent && (e.key === 'Enter' || e.key === ' ')) || e.type === 'blur') {
    if (value && !selectedTagTitles.value.includes(value)) {
      selectedTagTitles.value.push(value)
    }
    input.value = ''
    if (e instanceof KeyboardEvent) {
      e.preventDefault()
    }
  }
}

// Datalist só mostra tags do tenant que ainda não estão selecionadas
const availableTags = computed(() => {
  const all = Array.isArray(allTags.value) ? allTags.value : []
  return all.filter(tag => !selectedTagTitles.value.includes(tag.title) && tag.tenant_id === tenantId.value)
})

// Quando o usuário altera as tags (adiciona ou remove), o v-model é atualizado automaticamente
// Para garantir que o input permita adicionar/remover qualquer tag do tenant, use allTags no datalist

watch(relatedTags, (newTags) => {
  selectedTagTitles.value = newTags.map(tag => tag.title)
})

// Função para sincronizar tags e relações N:N
async function syncTags(allTagsList: any[]) {
  const tagIds = []
  for (const title of selectedTagTitles.value) {
    let tag: any = allTagsList.find((t: any) => t.title === title)
    if (!tag) {
      // Cria a tag se não existir
      const created: any = await $fetch('/api/articles/tag', {
        method: 'POST',
        body: {
          title,
          slug: generateSlug(title),
        },
      })
      tag = created?.data
    }
    if (tag && tag.id)
      tagIds.push(tag.id)
  }
  // Atualizar as relações no backend
  await $fetch('/api/articles/tag/relations', {
    method: 'POST',
    body: {
      article_id: route.params.id,
      tag_ids: tagIds,
    },
  })
}

onMounted(async () => {
  window.addEventListener('scroll', () => {
    showFloatingMenu.value = window.scrollY > 200
  })

  await loadArticle()

  loading.value = false
})

function updateSlug() {
  if (form.value.title) {
    form.value.slug = generateSlug(form.value.title)
  }
}

// Salvar edição do artigo
async function saveArticle() {
  if (!form.value.title || !form.value.slug || !form.value.content || !form.value.description) {
    toast({ title: 'Erro', description: 'Preencha todos os campos obrigatórios', variant: 'destructive' })
    return
  }
  const articleData: any = {
    title: form.value.title,
    slug: form.value.slug,
    content: form.value.content,
    meta_description: form.value.description,
    publish_status: form.value.publish_status,
    category_id: form.value.category_id,
  }
  try {
    await $fetch(`/api/articles/${route.params.id}`, { method: 'PUT', body: articleData })
    await syncTags(allTags.value)
    toast({ title: 'Sucesso', description: 'Artigo atualizado com sucesso!' })
    navigateTo('/articles')
  }
  catch (_e: any) {
    toast({
      title: 'Erro',
      description: _e?.data?.message || 'Ocorreu um erro ao salvar o artigo',
      variant: 'destructive',
    })
  }
}
</script>

<template>
  <div>
    <!-- Topo abaixo de breadcrumb -->
    <div>
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">
          Edit Article
        </h1>
        <Button class="bg-primary hover:bg-primary/90" @click="() => navigateTo('/articles')">
          <Icon name="lucide:arrow-left" class="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      <!-- Formulário -->
      <form v-if="!loading" class="space-y-8" @submit.prevent="saveArticle">
        <!-- Grid com proporção 70/30 -->
        <div class="grid grid-cols-1 gap-8 md:grid-cols-12">
          <!-- Coluna da Esquerda: Informações Básicas (70%) -->
          <Card class="md:col-span-8">
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
              <CardDescription> Preencha as informações principais do artigo </CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <!-- Título -->
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

              <!-- Slug -->
              <div class="space-y-2">
                <Label for="slug">URL do Artigo</Label>
                <div class="flex gap-2">
                  <Input id="slug" v-model="form.slug" placeholder="url-do-artigo" :disabled="loading" required />
                  <Button type="button" variant="outline" :disabled="loading" @click="updateSlug">
                    <Icon name="lucide:refresh-cw" class="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <!-- Descrição -->
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

          <!-- Coluna da Direita: Status (30%) -->
          <Card class="md:col-span-4">
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription> Defina o status do artigo </CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <!-- Status -->
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
                  <Select v-model="form.category_id" :disabled="loading" class="flex-1">
                    <SelectTrigger class="h-10">
                      <SelectValue placeholder="Selecionar categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem v-for="category in categories" :key="category.id" :value="category.id">
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
                <TagsInput v-model="selectedTagTitles">
                  <TagsInputItem v-for="title in selectedTagTitles" :key="title" :value="title">
                    <TagsInputItemText>{{ title }}</TagsInputItemText>
                    <TagsInputItemDelete />
                  </TagsInputItem>
                  <TagsInputInput
                    placeholder="Add a tag and press Enter, Space or Blur..."
                    list="tags-list"
                    @keydown.enter="onTagInputEvent"
                    @keydown.space="onTagInputEvent"
                    @blur="onTagInputEvent"
                  />
                </TagsInput>
                <datalist id="tags-list">
                  <option v-for="tag in availableTags" :key="tag.id" :value="tag.title">
                    {{ tag.title }}
                  </option>
                </datalist>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Editor de Conteúdo (Largura Total) -->
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

      <!-- Loading State -->
      <div v-else class="space-y-8">
        <div class="grid grid-cols-1 gap-8 md:grid-cols-12">
          <Card class="md:col-span-8">
            <CardHeader>
              <Skeleton class="h-6 w-[200px]" />
              <Skeleton class="h-4 w-[300px]" />
            </CardHeader>
            <CardContent class="space-y-6">
              <Skeleton class="h-10 w-full" />
              <Skeleton class="h-10 w-full" />
              <Skeleton class="h-24 w-full" />
            </CardContent>
          </Card>
          <Card class="md:col-span-4">
            <CardHeader>
              <Skeleton class="h-6 w-[150px]" />
              <Skeleton class="h-4 w-[200px]" />
            </CardHeader>
            <CardContent class="space-y-6">
              <!-- Status Skeleton -->
              <div class="space-y-2">
                <Skeleton class="h-5 w-16" />
                <Skeleton class="h-10 w-full" />
              </div>

              <!-- Categoria Skeleton -->
              <div class="space-y-2">
                <Skeleton class="h-5 w-24" />
                <div class="flex gap-2">
                  <Skeleton class="h-10 w-full" />
                  <Skeleton class="h-10 w-10" />
                  <Skeleton class="h-10 w-10" />
                </div>
                <Skeleton class="h-5 w-60" />
              </div>

              <!-- Tags Skeleton -->
              <div class="space-y-2">
                <Skeleton class="h-5 w-16" />
                <Skeleton class="h-10 w-full" />
                <Skeleton class="h-5 w-40" />
              </div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <Skeleton class="h-6 w-[180px]" />
            <Skeleton class="h-4 w-[250px]" />
          </CardHeader>
          <CardContent>
            <Skeleton class="h-[500px] w-full" />
          </CardContent>
        </Card>
      </div>
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
