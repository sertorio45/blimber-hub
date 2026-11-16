<script setup lang="ts">
import type { WhatsAppMessage } from '~/types/whatsapp'
import type { SendWhatsAppMessagePayload } from '~/composables/whatsapp/useWhatsAppMessages'

import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'
import { toast } from 'vue-sonner'

const props = defineProps<{
  disabled?: boolean
  sending?: boolean
  replyTo?: WhatsAppMessage | null
}>()

const emit = defineEmits<{
  send: [payload: SendWhatsAppMessagePayload]
  typing: []
  clearReply: []
}>()

const { tenantId } = useTenant()
const draft = ref('')
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function handleSubmit() {
  if (!draft.value.trim() || props.disabled || props.sending || uploading.value)
    return
  emit('send', {
    type: 'text',
    content: draft.value,
    replyToId: props.replyTo?.id || null,
  })
  draft.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
  }
}

function onInput() {
  emit('typing')
}

function openFilePicker() {
  fileInput.value?.click()
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !tenantId.value)
    return

  const mediatype = file.type.startsWith('image/')
    ? 'image'
    : file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('audio/')
        ? 'audio'
        : 'document'

  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('tenant_id', tenantId.value)

    const uploaded = await $fetch<{ url?: string, data?: { url?: string, signedUrl?: string } }>(
      '/api/whatsapp/media/upload',
      { method: 'POST', body: form },
    )

    const url = uploaded.url || uploaded.data?.url || uploaded.data?.signedUrl
    if (!url)
      throw new Error('Upload sem URL')

    emit('send', {
      type: 'media',
      content: draft.value.trim() || undefined,
      replyToId: props.replyTo?.id || null,
      media: {
        mediatype,
        url,
        caption: draft.value.trim() || undefined,
        fileName: file.name,
      },
    })
    draft.value = ''
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Falha ao enviar mídia')
  }
  finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="border-t bg-background p-4">
    <div
      v-if="replyTo"
      class="mb-2 flex items-start justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs"
    >
      <div class="min-w-0">
        <p class="font-medium">
          Respondendo {{ replyTo.fromMe ? 'você' : (replyTo.participantName || 'contato') }}
        </p>
        <p class="truncate text-muted-foreground">
          {{ replyTo.content || '[mídia]' }}
        </p>
      </div>
      <Button variant="ghost" size="icon" class="h-7 w-7" @click="emit('clearReply')">
        <span class="i-lucide-x h-3.5 w-3.5" />
      </Button>
    </div>

    <div class="flex items-end gap-2">
      <input
        ref="fileInput"
        type="file"
        class="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
        @change="onFileSelected"
      >
      <Button
        variant="outline"
        size="icon"
        class="shrink-0"
        :disabled="disabled || sending || uploading"
        @click="openFilePicker"
      >
        <span class="i-lucide-paperclip h-4 w-4" />
      </Button>
      <Textarea
        v-model="draft"
        :disabled="disabled || sending || uploading"
        placeholder="Digite uma mensagem..."
        class="min-h-[44px] resize-none"
        rows="1"
        @keydown="onKeydown"
        @input="onInput"
      />
      <Button
        :disabled="disabled || sending || uploading || !draft.trim()"
        size="icon"
        class="shrink-0"
        @click="handleSubmit"
      >
        <span class="i-lucide-send h-4 w-4" />
      </Button>
    </div>
    <p class="mt-2 text-xs text-muted-foreground">
      Enter para enviar · Shift+Enter para nova linha · clipe para mídia
    </p>
  </div>
</template>
