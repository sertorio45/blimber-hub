import type { z } from 'zod'
import type { CmsFieldSpec } from './fields'

import { CMS_LIMITS } from '~/lib/cms/contracts'

import {
  cardsPropsSchema,
  ctaPropsSchema,
  faqPropsSchema,
  galleryPropsSchema,
  heroPropsSchema,
  imageTextPropsSchema,
  latestPublicationsPropsSchema,
  richTextPropsSchema,
  sectionPropsSchema,
  testimonialsPropsSchema,
} from './definitions'
import { fieldsFromSchema } from './fields'

export type CmsBlockCategory = 'layout' | 'content' | 'conversion' | 'dynamic'

export const CMS_BLOCK_CATEGORY_LABELS: Record<CmsBlockCategory, string> = {
  layout: 'Estrutura',
  content: 'Conteúdo',
  conversion: 'Conversão',
  dynamic: 'Dinâmico',
}

export interface CmsBlockDefinition {
  id: string
  version: number
  /** Portuguese name shown in the catalog and the tree. */
  label: string
  description: string
  icon: string
  category: CmsBlockCategory
  /** Layout blocks may contain other blocks. Leaves must not. */
  acceptsChildren: boolean
  /**
   * Deepest level at which this block may appear.
   * Level 1 is the document root. Matches `CMS_LIMITS.maxBlockDepth`.
   * A block already at `maxDepth` cannot receive children.
   */
  maxDepth: number
  propsSchema: z.ZodObject<z.ZodRawShape>
  defaults: Record<string, unknown>
  fields: CmsFieldSpec[]
}

interface CmsBlockSeed {
  id: string
  version: number
  label: string
  description: string
  icon: string
  category: CmsBlockCategory
  acceptsChildren: boolean
  propsSchema: z.ZodObject<z.ZodRawShape>
}

function defineBlock(seed: CmsBlockSeed): CmsBlockDefinition {
  return {
    ...seed,
    maxDepth: CMS_LIMITS.maxBlockDepth,
    defaults: seed.propsSchema.parse({}) as Record<string, unknown>,
    fields: fieldsFromSchema(seed.propsSchema),
  }
}

/**
 * Initial page-builder catalog. `section` is both the full-bleed section and
 * the contained wrapper (`props.width`). GrapesJS is intentionally not used.
 */
export const CMS_BLOCKS: CmsBlockDefinition[] = [
  defineBlock({
    id: 'section',
    version: 1,
    label: 'Seção',
    description: 'Agrupa outros blocos. A largura escolhe seção inteira ou container.',
    icon: 'lucide:layout-template',
    category: 'layout',
    acceptsChildren: true,
    propsSchema: sectionPropsSchema,
  }),
  defineBlock({
    id: 'hero',
    version: 1,
    label: 'Destaque',
    description: 'Título grande, texto de apoio e botões.',
    icon: 'lucide:sparkles',
    category: 'content',
    acceptsChildren: false,
    propsSchema: heroPropsSchema,
  }),
  defineBlock({
    id: 'richText',
    version: 1,
    label: 'Texto',
    description: 'Parágrafos e formatação simples.',
    icon: 'lucide:text',
    category: 'content',
    acceptsChildren: false,
    propsSchema: richTextPropsSchema,
  }),
  defineBlock({
    id: 'imageText',
    version: 1,
    label: 'Imagem e texto',
    description: 'Imagem ao lado de um texto.',
    icon: 'lucide:panel-left',
    category: 'content',
    acceptsChildren: false,
    propsSchema: imageTextPropsSchema,
  }),
  defineBlock({
    id: 'cards',
    version: 1,
    label: 'Cartões',
    description: 'Grade de cartões com título, texto e link.',
    icon: 'lucide:layout-grid',
    category: 'content',
    acceptsChildren: false,
    propsSchema: cardsPropsSchema,
  }),
  defineBlock({
    id: 'faq',
    version: 1,
    label: 'Perguntas frequentes',
    description: 'Lista de perguntas e respostas.',
    icon: 'lucide:circle-help',
    category: 'content',
    acceptsChildren: false,
    propsSchema: faqPropsSchema,
  }),
  defineBlock({
    id: 'cta',
    version: 1,
    label: 'Chamada para ação',
    description: 'Convite com um botão.',
    icon: 'lucide:mouse-pointer-click',
    category: 'conversion',
    acceptsChildren: false,
    propsSchema: ctaPropsSchema,
  }),
  defineBlock({
    id: 'gallery',
    version: 1,
    label: 'Galeria',
    description: 'Grade de imagens com legenda.',
    icon: 'lucide:images',
    category: 'content',
    acceptsChildren: false,
    propsSchema: galleryPropsSchema,
  }),
  defineBlock({
    id: 'testimonials',
    version: 1,
    label: 'Depoimentos',
    description: 'Citações de clientes ou parceiros.',
    icon: 'lucide:quote',
    category: 'content',
    acceptsChildren: false,
    propsSchema: testimonialsPropsSchema,
  }),
  defineBlock({
    id: 'latestPublications',
    version: 1,
    label: 'Últimas publicações',
    description: 'Lista automática de artigos ou notícias do site.',
    icon: 'lucide:newspaper',
    category: 'dynamic',
    acceptsChildren: false,
    propsSchema: latestPublicationsPropsSchema,
  }),
]

const BY_ID = new Map(CMS_BLOCKS.map(definition => [definition.id, definition]))

export function listBlockDefinitions(): CmsBlockDefinition[] {
  return CMS_BLOCKS
}

export function getBlockDefinition(type: string): CmsBlockDefinition | undefined {
  return BY_ID.get(type)
}
