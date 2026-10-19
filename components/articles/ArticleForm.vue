<script setup lang="ts">
import type { ArticleForm } from '~/types/articles'

import { defineEmits, defineProps, ref, watch } from 'vue'
import Tiny from '~/components/articles/Tiny.vue'
import TagsInput from '~/components/ui/tags-input/TagsInput.vue'

const props = defineProps<{
  modelValue: Partial<ArticleForm>
  loading?: boolean
  categories: Array<{ id: string, title: string }>
  tags: Array<{ id: string, title: string }>
  isEdit?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', value: ArticleForm): void
  (e: 'cancel'): void
  (e: 'update:modelValue', value: Partial<ArticleForm>): void
}>()

const form = ref<ArticleForm>({
  title: '',
  slug: '',
  content: '',
  meta_description: '',
  category_id: '',
  status: 'draft',
  featured_image: '',
  tags: [],
  is_published: false,
  is_public: false,
})

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      form.value = {
        ...form.value,
        ...val,
        content: val.content ?? '',
        tags: val.tags ?? [],
        featured_image: val.featured_image ?? '',
      }
    }
  },
  { immediate: true },
)

function handleSubmit() {
  emit('submit', { ...form.value })
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <form class="space-y-8" @submit.prevent="handleSubmit">
    <div class="grid grid-cols-1 gap-8 md:grid-cols-12">
      <div class="md:col-span-8 space-y-6">
        <div class="space-y-2">
          <Label for="title">Title</Label>
          <Input id="title" v-model="form.title" placeholder="Article title" :disabled="props.loading" required />
        </div>
        <div class="space-y-2">
          <Label for="slug">Slug</Label>
          <Input id="slug" v-model="form.slug" placeholder="article-slug" :disabled="props.loading" required />
        </div>
        <div class="space-y-2">
          <Label for="meta_description">Meta Description</Label>
          <Textarea
            id="meta_description"
            v-model="form.meta_description"
            placeholder="Short description"
            :disabled="props.loading"
            required
            rows="3"
          />
        </div>
        <div class="space-y-2">
          <Label for="content">Content</Label>
          <ClientOnly>
            <Tiny v-model="form.content" :disabled="props.loading" :height="400" />
            <template #fallback>
              <Skeleton class="h-[400px] w-full rounded-md" />
            </template>
          </ClientOnly>
        </div>
      </div>
      <div class="md:col-span-4 space-y-6">
        <div class="space-y-2">
          <Label for="status">Status</Label>
          <Select v-model="form.status" :disabled="props.loading">
            <SelectTrigger>
              <SelectValue :placeholder="form.status" />
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
                  Arquived
                </SelectItem>
                <SelectItem value="scheduled">
                  Scheduled
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label for="category_id">Category</Label>
          <Select v-model="form.category_id" :disabled="props.loading">
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="cat in props.categories" :key="cat.id" :value="cat.id">
                  {{ cat.title }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label for="tags">Tags</Label>
          <TagsInput v-model="form.tags" :options="props.tags" :disabled="props.loading" />
        </div>
        <div class="space-y-2">
          <Label for="featured_image">Thumbnail URL</Label>
          <Input
            id="featured_image"
            v-model="form.featured_image"
            placeholder="https://..."
            :disabled="props.loading"
          />
        </div>
      </div>
    </div>
    <div class="flex justify-end gap-2">
      <Button type="button" variant="outline" :disabled="props.loading" @click="handleCancel">
        Cancel
      </Button>
      <Button type="submit" :disabled="props.loading">
        {{ props.isEdit ? 'Update' : 'Create' }}
      </Button>
    </div>
  </form>
</template>
