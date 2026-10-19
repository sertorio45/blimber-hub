<script setup lang="ts">
import type { CmsBlock } from '~/lib/cms/contracts'

import { sanitizeRichHtml } from '~/lib/cms/blocks/render'

defineProps<{
  blocks: CmsBlock[]
  selectedId: string | null
}>()

const emit = defineEmits<{ select: [id: string] }>()

function record(block: CmsBlock): Record<string, unknown> {
  return block.props
}

function text(value: unknown, fallback = ''): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw || fallback
}

function items(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value))
    return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

function linkLabel(value: unknown): string {
  if (!value || typeof value !== 'object')
    return ''
  const label = (value as { label?: unknown }).label
  return typeof label === 'string' ? label.trim() : ''
}

function richHtml(block: CmsBlock): string {
  const html = sanitizeRichHtml(record(block).html).trim()
  return html || '<p class="text-muted-foreground">Texto vazio</p>'
}

const paddingClass: Record<string, string> = {
  none: 'p-2',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-8',
}

const backgroundClass: Record<string, string> = {
  default: 'bg-background',
  muted: 'bg-muted/80',
  contrast: 'bg-primary text-primary-foreground',
}
</script>

<template>
  <div class="space-y-3">
    <article
      v-for="block in blocks"
      :key="block.id"
      class="cursor-pointer border rounded-xl text-left transition-shadow"
      :class="selectedId === block.id ? 'ring-2 ring-primary' : 'hover:border-foreground/20'"
      @click.stop="emit('select', block.id)"
    >
      <div
        v-if="block.type === 'section'"
        :class="[
          paddingClass[String(record(block).padding)] || 'p-5',
          backgroundClass[String(record(block).background)] || 'bg-background',
        ]"
      >
        <div :class="record(block).width === 'contained' ? 'mx-auto max-w-3xl' : ''">
          <p class="mb-3 text-[11px] tracking-wide uppercase opacity-60">
            {{ text(record(block).label, record(block).width === 'contained' ? 'Container' : 'Seção') }}
          </p>
          <CmsBlockPreview
            v-if="block.children?.length"
            :blocks="block.children"
            :selected-id="selectedId"
            @select="emit('select', $event)"
          />
          <p v-else class="border rounded-lg border-dashed py-6 text-center text-xs opacity-70">
            Seção vazia
          </p>
        </div>
      </div>

      <div v-else-if="block.type === 'hero'" class="p-6" :class="record(block).align === 'center' ? 'text-center' : ''">
        <p v-if="text(record(block).eyebrow)" class="text-xs text-muted-foreground tracking-wide uppercase">
          {{ text(record(block).eyebrow) }}
        </p>
        <h3 class="mt-1 text-2xl font-semibold tracking-tight">
          {{ text(record(block).title, 'Destaque sem título') }}
        </h3>
        <p v-if="text(record(block).subtitle)" class="mt-2 text-sm text-muted-foreground">
          {{ text(record(block).subtitle) }}
        </p>
        <div class="mt-4 flex flex-wrap gap-2" :class="record(block).align === 'center' ? 'justify-center' : ''">
          <span v-if="linkLabel(record(block).primaryCta)" class="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
            {{ linkLabel(record(block).primaryCta) }}
          </span>
          <span v-if="linkLabel(record(block).secondaryCta)" class="border rounded-md px-3 py-1.5 text-xs">
            {{ linkLabel(record(block).secondaryCta) }}
          </span>
        </div>
      </div>

      <div v-else-if="block.type === 'richText'" class="p-5 text-sm leading-relaxed" v-html="richHtml(block)" />

      <div
        v-else-if="block.type === 'imageText'"
        class="grid gap-4 p-5 md:grid-cols-2"
        :class="record(block).imagePosition === 'right' ? '' : ''"
      >
        <div class="min-h-24 rounded-lg bg-muted" :class="record(block).imagePosition === 'right' ? 'md:order-2' : ''" />
        <div>
          <h3 class="font-semibold">
            {{ text(record(block).title, 'Imagem e texto') }}
          </h3>
          <p class="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {{ text(record(block).body, 'Sem texto') }}
          </p>
        </div>
      </div>

      <div v-else-if="block.type === 'cards'" class="p-5">
        <h3 v-if="text(record(block).title)" class="mb-3 font-semibold">
          {{ text(record(block).title) }}
        </h3>
        <div class="grid gap-3" :class="record(block).columns === '2' ? 'sm:grid-cols-2' : record(block).columns === '4' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'">
          <div v-for="(item, index) in items(record(block).items)" :key="index" class="border rounded-lg p-3">
            <p class="text-sm font-medium">
              {{ text(item.title, 'Cartão') }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ text(item.description) }}
            </p>
          </div>
          <p v-if="!items(record(block).items).length" class="text-sm text-muted-foreground">
            Nenhum cartão
          </p>
        </div>
      </div>

      <div v-else-if="block.type === 'faq'" class="p-5 space-y-2">
        <h3 v-if="text(record(block).title)" class="font-semibold">
          {{ text(record(block).title) }}
        </h3>
        <details v-for="(item, index) in items(record(block).items)" :key="index" class="border rounded-lg px-3 py-2">
          <summary class="cursor-pointer text-sm font-medium">
            {{ text(item.question, 'Pergunta') }}
          </summary>
          <p class="mt-2 text-sm text-muted-foreground">
            {{ text(item.answer) }}
          </p>
        </details>
        <p v-if="!items(record(block).items).length" class="text-sm text-muted-foreground">
          Nenhuma pergunta
        </p>
      </div>

      <div
        v-else-if="block.type === 'cta'"
        class="p-6"
        :class="record(block).tone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-muted'"
      >
        <h3 class="text-lg font-semibold">
          {{ text(record(block).title, 'Chamada para ação') }}
        </h3>
        <p v-if="text(record(block).description)" class="mt-1 text-sm opacity-80">
          {{ text(record(block).description) }}
        </p>
        <span v-if="text(record(block).buttonLabel)" class="mt-3 inline-flex rounded-md bg-background px-3 py-1.5 text-xs text-foreground">
          {{ text(record(block).buttonLabel) }}
        </span>
      </div>

      <div v-else-if="block.type === 'gallery'" class="p-5">
        <h3 v-if="text(record(block).title)" class="mb-3 font-semibold">
          {{ text(record(block).title) }}
        </h3>
        <div class="grid gap-2" :class="record(block).columns === '2' ? 'grid-cols-2' : record(block).columns === '4' ? 'grid-cols-4' : 'grid-cols-3'">
          <figure v-for="(item, index) in items(record(block).images)" :key="index" class="overflow-hidden rounded-lg bg-muted">
            <div class="aspect-square" />
            <figcaption v-if="text(item.caption)" class="px-2 py-1 text-[11px] text-muted-foreground">
              {{ text(item.caption) }}
            </figcaption>
          </figure>
          <p v-if="!items(record(block).images).length" class="col-span-full text-sm text-muted-foreground">
            Nenhuma imagem
          </p>
        </div>
      </div>

      <div v-else-if="block.type === 'testimonials'" class="p-5 space-y-3">
        <h3 v-if="text(record(block).title)" class="font-semibold">
          {{ text(record(block).title) }}
        </h3>
        <blockquote v-for="(item, index) in items(record(block).items)" :key="index" class="border-l-2 pl-3">
          <p class="text-sm">
            {{ text(item.quote, 'Depoimento') }}
          </p>
          <footer class="mt-1 text-xs text-muted-foreground">
            {{ text(item.author, 'Autor') }}<span v-if="text(item.role)"> · {{ text(item.role) }}</span>
          </footer>
        </blockquote>
        <p v-if="!items(record(block).items).length" class="text-sm text-muted-foreground">
          Nenhum depoimento
        </p>
      </div>

      <div v-else-if="block.type === 'latestPublications'" class="p-5">
        <h3 class="font-semibold">
          {{ text(record(block).title, 'Últimas publicações') }}
        </h3>
        <p class="mt-1 text-sm text-muted-foreground">
          O site lista
          {{ text(record(block).limit, '3') }}
          {{ record(block).publicationType === 'news' ? 'notícias' : record(block).publicationType === 'article' ? 'artigos' : 'publicações' }}
          automaticamente.
        </p>
      </div>

      <div v-else class="p-5 text-sm text-muted-foreground">
        Bloco não reconhecido
      </div>
    </article>
  </div>
</template>
