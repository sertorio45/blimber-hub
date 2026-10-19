<script setup lang="ts">
import type { CmsSite } from '~/lib/cms/contracts'

import { ref, useId, watch } from 'vue'
import { toast } from 'vue-sonner'

import { cmsFieldErrors, cmsSlugDraft, cmsSlugify } from '~/composables/cms/cmsDisplay'
import { normalizeCmsError } from '~/composables/cms/useCmsApi'
import { cmsCreateSiteInputSchema } from '~/lib/cms/contracts'

const props = defineProps<{
  create: (input: { name: string, siteKey?: string }) => Promise<CmsSite>
}>()

const emit = defineEmits<{ created: [site: CmsSite] }>()

const open = defineModel<boolean>('open', { default: false })

const nameId = useId()
const keyId = useId()
const name = ref('')
const siteKey = ref('')
const errors = ref<Record<string, string>>({})
const submitting = ref(false)

watch(open, (isOpen) => {
  if (!isOpen)
    return
  name.value = ''
  siteKey.value = ''
  errors.value = {}
})

async function submit() {
  const parsed = cmsCreateSiteInputSchema.safeParse({
    name: name.value,
    siteKey: siteKey.value ? cmsSlugify(siteKey.value) : undefined,
  })
  if (!parsed.success) {
    const next: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form')
      if (!next[key])
        next[key] = key === 'name' ? 'Informe o nome do site.' : 'Use de 3 a 64 caracteres: letras minúsculas, números e hífens.'
    }
    errors.value = next
    return
  }

  errors.value = {}
  submitting.value = true
  try {
    const site = await props.create(parsed.data)
    toast.success('Site criado')
    open.value = false
    emit('created', site)
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    if (normalized.code === 'aborted')
      return
    const fieldErrors = cmsFieldErrors(normalized.details)
    errors.value = Object.keys(fieldErrors).length ? fieldErrors : { form: normalized.message }
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Criar site</DialogTitle>
        <DialogDescription>
          O site reúne as páginas e publicações desta empresa. Você pode ajustar tudo depois em Configurações.
        </DialogDescription>
      </DialogHeader>
      <form class="space-y-4" novalidate @submit.prevent="submit">
        <div class="space-y-1.5">
          <Label :for="nameId">Nome</Label>
          <Input
            :id="nameId"
            v-model="name"
            maxlength="160"
            autofocus
            autocomplete="off"
            placeholder="Ex.: Site institucional"
            :aria-invalid="Boolean(errors.name) || undefined"
            :aria-describedby="errors.name ? `${nameId}-error` : undefined"
          />
          <p v-if="errors.name" :id="`${nameId}-error`" class="text-xs text-destructive">
            {{ errors.name }}
          </p>
        </div>
        <div class="space-y-1.5">
          <Label :for="keyId">
            Chave pública <span class="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Input
            :id="keyId"
            :model-value="siteKey"
            maxlength="64"
            autocomplete="off"
            spellcheck="false"
            placeholder="gerada automaticamente"
            class="font-mono"
            :aria-invalid="Boolean(errors.siteKey) || undefined"
            :aria-describedby="`${keyId}-hint`"
            @update:model-value="value => (siteKey = cmsSlugDraft(String(value ?? '')))"
          />
          <p v-if="errors.siteKey" class="text-xs text-destructive">
            {{ errors.siteKey }}
          </p>
          <p :id="`${keyId}-hint`" class="text-xs text-muted-foreground">
            Identifica o site para o front-end que exibe o conteúdo. Não pode ser alterada depois.
          </p>
        </div>
        <p v-if="errors.form" role="alert" class="border border-destructive/30 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {{ errors.form }}
        </p>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button type="button" variant="outline" @click="open = false">
            Cancelar
          </Button>
          <Button type="submit" :disabled="submitting || !name.trim()">
            {{ submitting ? 'Criando…' : 'Criar site' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
