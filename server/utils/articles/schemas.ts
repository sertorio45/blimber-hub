import { readBody } from 'h3'
import { z } from 'zod'

import { articleError } from '~/server/utils/articles/errors'

export const ARTICLE_TABLES = {
  articles: 'articles',
  categories: 'articles_category',
  tags: 'articles_tag',
  tagRelations: 'articles_tag_relations',
} as const

export const articlePublishStatusSchema = z.enum(['draft', 'published', 'arquived', 'scheduled'])

export const articleRowIdSchema = z.coerce.number().int().positive()

const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value)

const optionalRowIdSchema = z.preprocess(emptyToNull, articleRowIdSchema.nullable())

const titleSchema = z.string().trim().min(1, 'Título é obrigatório').max(200)
const slugSchema = z.string().trim().min(1, 'Slug é obrigatório').max(160)
const descriptionSchema = z.string().max(1000).nullish()

/** The edit screen historically sent `description`; it maps onto `meta_description`. */
function mapLegacyDescription(value: unknown) {
  if (!value || typeof value !== 'object')
    return value
  const body = value as Record<string, unknown>
  if (body.meta_description === undefined && typeof body.description === 'string')
    return { ...body, meta_description: body.description }
  return body
}

export const articleInputSchema = z.preprocess(mapLegacyDescription, z.object({
  title: titleSchema,
  slug: slugSchema,
  content: z.string().max(2_000_000).default(''),
  meta_description: descriptionSchema,
  publish_status: articlePublishStatusSchema.default('draft'),
  category_id: optionalRowIdSchema.default(null),
}))
export type ArticleInput = z.infer<typeof articleInputSchema>

export const articleTermInputSchema = z.object({
  title: titleSchema,
  slug: slugSchema,
  description: descriptionSchema,
  publish_status: articlePublishStatusSchema.default('draft'),
})
export type ArticleTermInput = z.infer<typeof articleTermInputSchema>

export const articleTagRelationsInputSchema = z.object({
  article_id: articleRowIdSchema,
  tag_ids: z.array(articleRowIdSchema).max(100),
})
export type ArticleTagRelationsInput = z.infer<typeof articleTagRelationsInputSchema>

export const articleTagRelationsQuerySchema = z.object({
  article_id: z.preprocess(emptyToNull, articleRowIdSchema.nullable()).optional(),
})

export function parseArticleInput<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value ?? {})
  if (!result.success) {
    const issue = result.error.issues[0]
    throw articleError(
      422,
      'validation_failed',
      issue?.message || 'Dados inválidos',
      result.error.flatten(),
    )
  }
  return result.data
}

export async function readArticleBody<T extends z.ZodTypeAny>(event: any, schema: T): Promise<z.infer<T>> {
  const body = await readBody(event).catch(() => null)
  return parseArticleInput(schema, body)
}
