<script setup lang="ts">
import type { ArticleTermRecord } from '~/types/articles'

import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import ArticleFloatingMenu from '~/components/articles/ArticleFloatingMenu.vue'
import { useToast } from '~/components/ui/toast'
import { useTenantStore } from '~/stores/tenant'

definePageMeta({
  middleware: ['auth', 'role'],
  requiredRoles: ['admin', 'funcionario', 'cliente', 'atendente'],
})

interface CategoryForm {
  id?: number
  title: string
  slug: string
  description: string
  publish_status: 'draft' | 'published' | 'arquived' | 'scheduled'
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
const route = useRoute()

const form = ref<CategoryForm>({
  title: '',
  slug: '',
  description: '',
  publish_status: 'draft',
})

const showFloatingMenu = ref(false)
const loading = ref(true)

// Carregar categoria para edição
async function loadCategory() {
  loading.value = true
  try {
    const response = await $fetch<{ data: ArticleTermRecord }>(`/api/articles/category/${route.params.id}?tenant_id=${useTenantStore().tenantId}`)
    const { data } = response
    form.value = {
      id: data.id,
      title: data.title || '',
      slug: data.slug || '',
      description: data.description || '',
      publish_status: data.publish_status || 'draft',
    }
  }
  catch (e: any) {
    toast({ title: 'Error', description: e.message || 'Error loading category', variant: 'destructive' })
  }
  loading.value = false
}

onMounted(async () => {
  window.addEventListener('scroll', () => {
    showFloatingMenu.value = window.scrollY > 200
  })

  await loadCategory()

  loading.value = false
})

function updateSlug() {
  if (form.value.title) {
    form.value.slug = generateSlug(form.value.title)
  }
}

// Salvar edição da categoria
async function saveCategory() {
  if (!form.value.title || !form.value.slug) {
    toast({ title: 'Error', description: 'Fill all required fields', variant: 'destructive' })
    return
  }
  const categoryData: any = {
    title: form.value.title,
    slug: form.value.slug,
    description: form.value.description,
    publish_status: form.value.publish_status,
  }
  try {
    await $fetch(`/api/articles/category/${route.params.id}`, { method: 'PUT', body: categoryData })
    toast({ title: 'Success', description: 'Category updated successfully!' })
    navigateTo('/articles/category')
  }
  catch (e: any) {
    toast({ title: 'Error', description: e?.data?.message || 'Error updating category', variant: 'destructive' })
  }
}
</script>

<template>
  <div>
    <div>
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">
          Edit Category
        </h1>
        <Button class="bg-primary hover:bg-primary/90" @click="() => navigateTo('/articles/category')">
          <Icon name="lucide:arrow-left" class="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
      <form v-if="!loading" class="space-y-8" @submit.prevent="saveCategory">
        <div class="grid grid-cols-1 gap-8 md:grid-cols-12">
          <!-- Left column: Basic Info (70%) -->
          <Card class="md:col-span-8">
            <CardHeader>
              <CardTitle>Category Information</CardTitle>
              <CardDescription>Fill in the main information for the category</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <div class="space-y-2">
                <Label for="title">Title</Label>
                <Input
                  id="title"
                  v-model="form.title"
                  placeholder="Enter a category title"
                  :disabled="loading"
                  required
                  @blur="updateSlug"
                />
              </div>
              <div class="space-y-2">
                <Label for="slug">Slug</Label>
                <div class="flex gap-2">
                  <Input id="slug" v-model="form.slug" placeholder="category-slug" :disabled="loading" required />
                  <Button type="button" variant="outline" :disabled="loading" @click="updateSlug">
                    <Icon name="lucide:refresh-cw" class="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div class="space-y-2">
                <Label for="description">Description</Label>
                <Textarea
                  id="description"
                  v-model="form.description"
                  placeholder="Write a short description for your category"
                  :disabled="loading"
                  required
                  rows="3"
                />
              </div>
            </CardContent>
          </Card>
          <!-- Right column: Status (30%) -->
          <Card class="md:col-span-4">
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription> Set the publication status for this category </CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <div class="space-y-2">
                <Label>Status</Label>
                <Select v-model="form.publish_status" :disabled="loading">
                  <SelectTrigger>
                    <SelectValue :placeholder="form.publish_status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="draft">
                        Draft
                      </SelectItem>
                      <SelectItem value="published">
                        Published
                      </SelectItem>
                      <SelectItem value="arquived">
                        Archived
                      </SelectItem>
                      <SelectItem value="scheduled">
                        Scheduled
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
        <div class="flex justify-end">
          <Button type="submit" :disabled="loading" class="bg-primary hover:bg-primary/90">
            Save Category
          </Button>
        </div>
      </form>
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
              <Skeleton class="h-5 w-16" />
              <Skeleton class="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    <ArticleFloatingMenu
      :on-save="saveCategory"
      :on-back="() => navigateTo('/articles/category')"
      :on-cancel="() => navigateTo('/articles/category')"
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
