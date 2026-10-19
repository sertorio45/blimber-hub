<script setup lang="ts">
import type { CmsDocument, CmsDocumentKind, CmsPublicationType, CmsSite } from '~/lib/cms/contracts'

import { computed, ref, useId, watch } from 'vue'
import { toast } from 'vue-sonner'

import CmsSlugField from '~/components/cms/CmsSlugField.vue'
import {
  CMS_PUBLICATION_TYPE_HINTS,
  CMS_PUBLICATION_TYPE_LABELS,
  cmsFieldErrors,
  cmsPathPrefix,
} from '~/composables/cms/cmsDisplay'
import { normalizeCmsError } from '~/composables/cms/useCmsApi'
import { useCmsDocumentMutations } from '~/composables/cms/useCmsDocuments'
import { CMS_LIMITS, cmsCreateDocumentInputSchema } from '~/lib/cms/contracts'

const props = withDefaults(defineProps<{
  kind: CmsDocumentKind
  site: CmsSite | null
  defaultType?: CmsPublicationType | null
  /** Open the editor after creating. */
  navigate?: boolean
}>(), {
  defaultType: null,
  navigate: true,
})

const emit = defineEmits<{ created: [document: CmsDocument] }>()

const open = defineModel<boolean>('open', { default: false })

const { createDocument } = useCmsDocumentMutations()

const titleId = useId()
const step = ref<'type' | 'details'>('details')
const publicationType = ref<CmsPublicationType | null>(null)
const title = ref('')
const slug = ref('')
const errors = ref<Record<string, string>>({})
const submitting = ref(false)

const TYPES: CmsPublicationType[] = ['article', 'news']

const dialogTitle = computed(() => {
  if (props.kind === 'page')
    return 'Nova página'
  if (step.value === 'type' || !publicationType.value)
    return 'Nova publicação'
  return publicationType.value === 'news' ? 'Nova notícia' : 'Novo artigo'
})

const dialogDescription = computed(() => {
  if (props.kind === 'page')
    return 'Dê um título. Você poderá editar o conteúdo em seguida.'
  if (step.value === 'type')
    return 'Escolha o tipo de publicação.'
  return 'Dê um título. Você poderá editar o conteúdo em seguida.'
})

const prefix = computed(() => cmsPathPrefix(props.kind, publicationType.value, props.site))

watch(open, (isOpen) => {
  if (!isOpen)
    return
  publicationType.value = props.kind === 'publication' ? props.defaultType : null
  step.value = props.kind === 'publication' && !props.defaultType ? 'type' : 'details'
  title.value = ''
  slug.value = ''
  errors.value = {}
}, { immediate: true })

function chooseType(type: CmsPublicationType) {
  publicationType.value = type
  step.value = 'details'
}

async function submit() {
  if (submitting.value)
    return
  if (!props.site) {
    toast.error('Crie um site antes de adicionar conteúdo.')
    return
  }

  const parsed = cmsCreateDocumentInputSchema.safeParse({
    siteId: props.site.id,
    kind: props.kind,
    publicationType: props.kind === 'publication' ? publicationType.value ?? undefined : undefined,
    title: title.value,
    slug: slug.value || undefined,
  })

  if (!parsed.success) {
    const next: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.')
      if (!next[key])
        next[key] = key === 'title' ? 'Informe um título.' : issue.message
    }
    errors.value = next
    return
  }

  errors.value = {}
  submitting.value = true
  try {
    const created = await createDocument(parsed.data)
    open.value = false
    emit('created', created)
    toast.success(props.kind === 'page' ? 'Página criada' : 'Publicação criada')
    if (props.navigate)
      await navigateTo(`/cms/documents/${created.id}`)
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    if (normalized.code === 'route_conflict') {
      errors.value = { slug: 'Já existe um conteúdo com este endereço. Escolha outro.' }
    }
    else if (normalized.code === 'validation_failed') {
      const fieldErrors = cmsFieldErrors(normalized.details)
      errors.value = Object.keys(fieldErrors).length ? fieldErrors : { form: normalized.message }
    }
    else if (normalized.code !== 'aborted') {
      errors.value = { form: normalized.message }
    }
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription>{{ dialogDescription }}</DialogDescription>
      </DialogHeader>

      <div
        v-if="step === 'type'"
        role="radiogroup"
        aria-label="Tipo de publicação"
        class="grid gap-3 sm:grid-cols-2"
      >
        <button
          v-for="type in TYPES"
          :key="type"
          type="button"
          role="radio"
          :aria-checked="publicationType === type"
          class="group flex flex-col items-start gap-2 border rounded-lg p-4 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="publicationType === type ? 'border-foreground/40 bg-muted/40' : ''"
          @click="chooseType(type)"
        >
          <span class="size-8 flex items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
            <Icon :name="type === 'news' ? 'lucide:newspaper' : 'lucide:file-text'" class="size-4" aria-hidden="true" />
          </span>
          <span class="text-sm font-medium">{{ CMS_PUBLICATION_TYPE_LABELS[type] }}</span>
          <span class="text-xs text-muted-foreground leading-relaxed">{{ CMS_PUBLICATION_TYPE_HINTS[type] }}</span>
        </button>
      </div>

      <form v-else class="space-y-4" novalidate @submit.prevent="submit">
        <div class="space-y-1.5">
          <Label :for="titleId">Título</Label>
          <Input
            :id="titleId"
            v-model="title"
            :maxlength="CMS_LIMITS.maxTitleLength"
            :aria-invalid="Boolean(errors.title) || undefined"
            :aria-describedby="errors.title ? `${titleId}-error` : undefined"
            autocomplete="off"
            autofocus
            :placeholder="kind === 'page' ? 'Ex.: Sobre nós' : 'Ex.: Como escolher o melhor plano'"
          />
          <p v-if="errors.title" :id="`${titleId}-error`" class="text-xs text-destructive">
            {{ errors.title }}
          </p>
        </div>

        <CmsSlugField
          v-model="slug"
          :source="title"
          :prefix="prefix"
          :error="errors.slug"
        />

        <p v-if="errors.publicationType" class="text-xs text-destructive">
          {{ errors.publicationType }}
        </p>
        <p v-if="errors.form" role="alert" class="border border-destructive/30 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {{ errors.form }}
        </p>

        <DialogFooter class="gap-2 sm:gap-0">
          <Button
            v-if="kind === 'publication'"
            type="button"
            variant="ghost"
            class="sm:mr-auto"
            @click="step = 'type'"
          >
            <Icon name="lucide:arrow-left" class="mr-2 size-4" aria-hidden="true" />
            Trocar tipo
          </Button>
          <Button type="button" variant="outline" @click="open = false">
            Cancelar
          </Button>
          <Button type="submit" :disabled="submitting || !title.trim()">
            <Icon v-if="submitting" name="lucide:loader-circle" class="mr-2 size-4 animate-spin" aria-hidden="true" />
            {{ submitting ? 'Criando…' : 'Criar e editar' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
