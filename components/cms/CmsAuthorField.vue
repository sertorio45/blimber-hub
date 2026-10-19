<script setup lang="ts">
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

import { Button } from '~/components/ui/button'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'
import { normalizeCmsError } from '~/composables/cms/cmsErrors'
import { useCmsAuthors } from '~/composables/cms/useCmsAuthors'

const props = withDefaults(defineProps<{
  modelValue: string
  siteId: string
  disabled?: boolean
  error?: string | null
}>(), {
  disabled: false,
  error: null,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const authorsApi = useCmsAuthors(() => props.siteId)
const creating = ref(false)
const saving = ref(false)
const name = ref('')
const bio = ref('')
const formError = ref<string | null>(null)
const nameId = useId()

const selected = computed(() => authorsApi.authors.value.find(author => author.id === props.modelValue) ?? null)

function onSelect(value: unknown) {
  emit('update:modelValue', typeof value === 'string' ? value : '')
}

function openCreate() {
  name.value = ''
  bio.value = ''
  formError.value = null
  creating.value = true
}

async function submitCreate() {
  const trimmed = name.value.trim()
  if (!trimmed || saving.value)
    return
  saving.value = true
  formError.value = null
  try {
    const author = await authorsApi.createAuthor({
      name: trimmed,
      bio: bio.value.trim() || null,
    })
    emit('update:modelValue', author.id)
    creating.value = false
    toast.success('Autor criado.')
  }
  catch (error: unknown) {
    formError.value = normalizeCmsError(error).message
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <Label>Autor</Label>
      <button
        type="button"
        class="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :disabled="disabled"
        @click="openCreate"
      >
        Novo autor
      </button>
    </div>

    <Select :model-value="modelValue || undefined" :disabled="disabled" @update:model-value="onSelect">
      <SelectTrigger :aria-invalid="Boolean(error)">
        <SelectValue :placeholder="authorsApi.showSkeleton.value ? 'Carregando autores…' : 'Sem autor'" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="author in authorsApi.authors.value" :key="author.id" :value="author.id">
          {{ author.name }}
        </SelectItem>
      </SelectContent>
    </Select>

    <div v-if="selected" class="flex items-center justify-between gap-2">
      <p class="truncate text-xs text-muted-foreground">
        {{ selected.slug }}
      </p>
      <Button type="button" variant="ghost" size="sm" class="h-7 px-2 text-xs" :disabled="disabled" @click="emit('update:modelValue', '')">
        Remover
      </Button>
    </div>

    <p v-if="authorsApi.loadError.value" class="text-xs text-destructive" role="alert">
      {{ authorsApi.loadError.value.message }}
    </p>
    <p v-if="error" class="text-xs text-destructive">
      {{ error }}
    </p>

    <Dialog v-model:open="creating">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo autor</DialogTitle>
          <DialogDescription>
            O autor fica disponível nas publicações deste site.
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitCreate">
          <div class="space-y-2">
            <Label :for="nameId">Nome</Label>
            <Input :id="nameId" v-model="name" maxlength="160" required autocomplete="name" />
          </div>
          <div class="space-y-2">
            <Label for="cms-author-bio">Biografia</Label>
            <Textarea id="cms-author-bio" v-model="bio" rows="3" maxlength="2000" />
          </div>
          <p v-if="formError" class="text-xs text-destructive" role="alert">
            {{ formError }}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" @click="creating = false">
              Cancelar
            </Button>
            <Button type="submit" :disabled="saving || !name.trim()">
              Criar autor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
