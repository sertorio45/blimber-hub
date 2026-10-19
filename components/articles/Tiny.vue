<script setup lang="ts">
import Editor from '@tinymce/tinymce-vue'
import { onMounted, ref, watch } from 'vue'

interface Props {
  modelValue: string
  height?: number
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  height: 500,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const colorMode = useColorMode()
const editorRef = ref<any>(null)
const isReady = ref(false)

// Configuração base do editor
const editorConfig = {
  height: props.height,
  menubar: true,
  skin: 'tinymce-5',
  content_css: 'tinymce-5',
  base_url: '/tinymce',
  suffix: '.min',
  plugins: [
    'advlist',
    'autolink',
    'lists',
    'link',
    'image',
    'charmap',
    'preview',
    'anchor',
    'searchreplace',
    'visualblocks',
    'code',
    'fullscreen',
    'insertdatetime',
    'media',
    'table',
    'help',
    'wordcount',
  ],
  toolbar: [
    'undo redo | blocks | bold italic | alignleft aligncenter alignright alignjustify',
    'bullist numlist outdent indent | removeformat | help | fullscreen',
  ].join(' | '),
  content_style: `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: hsl(var(--foreground));
      background: hsl(var(--background));
    }
    a {
      color: hsl(var(--primary));
    }
    a:hover {
      color: hsl(var(--primary) / 0.9);
    }
    blockquote {
      border-left: 4px solid hsl(var(--border));
      margin: 0;
      padding-left: 1rem;
      color: hsl(var(--muted-foreground));
    }
    pre {
      background: hsl(var(--muted));
      padding: 1rem;
      border-radius: var(--radius);
      color: hsl(var(--foreground));
    }
    code {
      background: hsl(var(--muted));
      padding: 0.2rem 0.4rem;
      border-radius: var(--radius);
      color: hsl(var(--foreground));
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1rem 0;
    }
    table th,
    table td {
      border: 1px solid hsl(var(--border));
      padding: 0.5rem;
    }
    table th {
      background: hsl(var(--muted));
      color: hsl(var(--foreground));
    }
  `,
  branding: false,
  promotion: false,
  resize: false,
  statusbar: false,
  setup: (editor: any) => {
    editorRef.value = editor

    // Configurações adicionais do editor
    editor.on('init', () => {
      updateEditorTheme()
    })
  },
}

// Função para atualizar o tema do editor
function updateEditorTheme() {
  if (!editorRef.value)
    return

  const isDark = colorMode.value === 'dark'

  // Atualiza a skin e o CSS do editor
  editorRef.value.skin = isDark ? 'oxide-dark' : 'oxide'
  editorRef.value.content_css = isDark ? 'dark' : 'default'

  // Atualiza as cores do corpo do editor
  const body = editorRef.value.getBody()
  if (body) {
    body.style.backgroundColor = `hsl(var(--background))`
    body.style.color = `hsl(var(--foreground))`
  }
}

// Observa mudanças no tema
watch(colorMode, () => {
  updateEditorTheme()
})

// `window` only exists in the browser, so the editor boots after mount.
onMounted(() => {
  editorConfig.content_css = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'tinymce-5'
  isReady.value = true
  updateEditorTheme()
})
</script>

<template>
  <div class="w-full">
    <Skeleton v-if="!isReady" class="w-full rounded-md" :style="{ height: `${height}px` }" />
    <Editor
      v-else
      :model-value="modelValue"
      :init="editorConfig"
      :disabled="disabled"
      tinymce-script-src="/tinymce/tinymce.min.js"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style>
/* Estilos base do editor */
.tox-tinymce {
  border-color: hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--background));
}

/* Barra de ferramentas */
.tox .tox-toolbar__primary {
  background: hsl(var(--background));
  border-bottom-color: hsl(var(--border));
}

.tox .tox-toolbar__group {
  border-color: hsl(var(--border));
}

.tox .tox-tbtn {
  color: hsl(var(--foreground));
}

.tox .tox-tbtn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

.tox .tox-tbtn--enabled {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

/* Menus e dropdowns */
.tox .tox-menubar {
  background-color: hsl(var(--background));
}

.tox .tox-menu {
  background: hsl(var(--background));
  border-color: hsl(var(--border));
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.tox .tox-collection__item {
  color: hsl(var(--foreground));
}

.tox .tox-collection__item:hover {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

/* Diálogos */
.tox .tox-dialog {
  background: hsl(var(--background));
  border-color: hsl(var(--border));
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.tox .tox-dialog__header {
  background: hsl(var(--background));
  border-bottom-color: hsl(var(--border));
}

.tox .tox-dialog__title {
  color: hsl(var(--foreground));
}

.tox .tox-dialog__body {
  color: hsl(var(--foreground));
}

.tox .tox-dialog__footer {
  background: hsl(var(--background));
  border-top-color: hsl(var(--border));
}

/* Campos de texto */
.tox .tox-textfield {
  background: hsl(var(--background));
  border-color: hsl(var(--border));
  color: hsl(var(--foreground));
  border-radius: var(--radius);
}

.tox .tox-textfield:focus {
  border-color: hsl(var(--ring));
  outline: none;
  box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
}

/* Botões */
.tox .tox-dialog__footer-end button {
  background-color: hsl(var(--primary));
  border-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-radius: var(--radius);
}

.tox .tox-dialog__footer-end button:hover {
  background-color: hsl(var(--primary) / 0.9);
  border-color: hsl(var(--primary) / 0.9);
}

.tox .tox-dialog__footer-end button.tox-button--secondary {
  background-color: transparent;
  border-color: hsl(var(--border));
  color: hsl(var(--foreground));
}

.tox .tox-dialog__footer-end button.tox-button--secondary:hover {
  background-color: hsl(var(--accent));
  border-color: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

/* Listagens */
.tox .tox-collection--list .tox-collection__group {
  border-color: hsl(var(--border));
}

/* Outros ajustes para modo escuro */
.dark .tox .tox-toolbar,
.dark .tox .tox-toolbar__primary,
.dark .tox .tox-toolbar__overflow,
.dark .tox .tox-menubar {
  background-color: hsl(var(--background));
}

.dark .tox .tox-statusbar {
  background-color: hsl(var(--background));
  border-top-color: hsl(var(--border));
  color: hsl(var(--muted-foreground));
}
</style>
