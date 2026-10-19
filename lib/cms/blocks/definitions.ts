import { z } from 'zod'

import { field } from './fields'

/**
 * Block images keep the media-ref shape, but `assetId` stays a plain string so
 * a half-typed id does not fail autosave. The public site resolves only UUIDs.
 */
const blockMediaSchema = z.object({
  assetId: z.string().trim().max(64),
  objectPath: z.string().min(1).max(1024).optional(),
  alt: z.string().max(300).optional(),
  credit: z.string().max(200).optional(),
})

function text(label: string, max = 160, placeholder?: string) {
  return field(z.string().max(max).default(''), { label, widget: 'text', placeholder })
}

function area(label: string, max = 4000) {
  return field(z.string().max(max).default(''), { label, widget: 'textarea' })
}

function link(label: string, placeholder = '/contato ou https://') {
  return field(z.string().max(500).default(''), { label, widget: 'url', placeholder })
}

function choice<const T extends string>(
  label: string,
  options: ReadonlyArray<{ value: T, label: string }>,
  fallback: T,
) {
  const values = options.map(option => option.value) as [T, ...T[]]
  return field(z.enum(values).default(fallback), {
    label,
    widget: 'select',
    options: options.map(option => ({ value: option.value, label: option.label })),
  })
}

function media(label: string) {
  return field(blockMediaSchema.nullable().default(null), { label, widget: 'media' })
}

function linkGroup(label: string) {
  return field(z.object({
    label: text('Texto', 80),
    href: link('Link'),
  }).default({ label: '', href: '' }), { label, widget: 'group' })
}

function list(label: string, itemLabel: string, item: z.ZodObject<z.ZodRawShape>, max: number) {
  return field(z.array(item).max(max).default([]), { label, widget: 'list', itemLabel, max })
}

const cardItemSchema = z.object({
  title: text('Título', 120),
  description: area('Descrição', 400),
  href: link('Link'),
})

const faqItemSchema = z.object({
  question: text('Pergunta', 200),
  answer: area('Resposta', 2000),
})

const galleryItemSchema = z.object({
  image: media('Imagem'),
  caption: text('Legenda', 200),
})

const testimonialItemSchema = z.object({
  quote: area('Depoimento', 600),
  author: text('Nome', 120),
  role: text('Cargo ou origem', 120),
})

/** Section doubles as the container: `width` switches full-bleed vs contained. */
export const sectionPropsSchema = z.object({
  label: text('Nome interno', 80, 'Ex.: Introdução'),
  background: choice('Fundo', [
    { value: 'default', label: 'Padrão' },
    { value: 'muted', label: 'Suave' },
    { value: 'contrast', label: 'Destaque' },
  ], 'default'),
  padding: choice('Espaçamento', [
    { value: 'none', label: 'Nenhum' },
    { value: 'sm', label: 'Compacto' },
    { value: 'md', label: 'Médio' },
    { value: 'lg', label: 'Amplo' },
  ], 'md'),
  width: choice('Largura', [
    { value: 'full', label: 'Seção largura total' },
    { value: 'contained', label: 'Container' },
  ], 'contained'),
})

export const heroPropsSchema = z.object({
  eyebrow: text('Linha de apoio', 80),
  title: text('Título', 160),
  subtitle: area('Subtítulo', 400),
  align: choice('Alinhamento', [
    { value: 'start', label: 'Esquerda' },
    { value: 'center', label: 'Centro' },
  ], 'start'),
  image: media('Imagem'),
  primaryCta: linkGroup('Botão principal'),
  secondaryCta: linkGroup('Botão secundário'),
})

export const richTextPropsSchema = z.object({
  html: area('Texto', 20_000),
})

export const imageTextPropsSchema = z.object({
  title: text('Título', 160),
  body: area('Texto', 4000),
  image: media('Imagem'),
  imagePosition: choice('Posição da imagem', [
    { value: 'left', label: 'Esquerda' },
    { value: 'right', label: 'Direita' },
  ], 'left'),
})

/**
 * Optional link to a structured collection. When `collectionKey` is filled,
 * the public API replaces `items` with the collection's published entries at
 * read time — the page stores only the reference, never a copy of the data.
 * `items` stays as the fallback used when the collection is missing.
 */
function collectionLinkProps() {
  return {
    collectionKey: text('Coleção vinculada (chave)', 64, 'Ex.: depoimentos — vazio = itens manuais'),
    collectionLimit: field(z.number().int().min(1).max(20).default(6), {
      label: 'Quantidade da coleção',
      widget: 'number',
      min: 1,
      max: 20,
    }),
  }
}

export const cardsPropsSchema = z.object({
  title: text('Título', 160),
  columns: choice('Colunas', [
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4' },
  ], '3'),
  ...collectionLinkProps(),
  items: list('Cartões', 'Cartão', cardItemSchema, 12),
})

export const faqPropsSchema = z.object({
  title: text('Título', 160),
  ...collectionLinkProps(),
  items: list('Perguntas', 'Pergunta', faqItemSchema, 20),
})

export const ctaPropsSchema = z.object({
  title: text('Título', 160),
  description: area('Descrição', 400),
  buttonLabel: text('Texto do botão', 80),
  buttonHref: link('Link do botão'),
  tone: choice('Destaque', [
    { value: 'default', label: 'Neutro' },
    { value: 'primary', label: 'Primário' },
  ], 'primary'),
})

export const galleryPropsSchema = z.object({
  title: text('Título', 160),
  columns: choice('Colunas', [
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4' },
  ], '3'),
  images: list('Imagens', 'Imagem', galleryItemSchema, 24),
})

export const testimonialsPropsSchema = z.object({
  title: text('Título', 160),
  ...collectionLinkProps(),
  items: list('Depoimentos', 'Depoimento', testimonialItemSchema, 12),
})

export const latestPublicationsPropsSchema = z.object({
  title: text('Título', 160, 'Ex.: Últimas notícias'),
  publicationType: choice('Tipo', [
    { value: 'all', label: 'Artigos e notícias' },
    { value: 'article', label: 'Artigos' },
    { value: 'news', label: 'Notícias' },
  ], 'all'),
  limit: field(z.number().int().min(1).max(12).default(3), {
    label: 'Quantidade',
    widget: 'number',
    min: 1,
    max: 12,
  }),
})
