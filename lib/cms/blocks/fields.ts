import { z } from 'zod'

/**
 * Form metadata lives on the Zod node that appears in an object shape.
 * The props panel walks the schema and reads these annotations, so a new
 * block does not need a hand-written form.
 */
export type CmsFieldWidget
  = | 'text'
    | 'textarea'
    | 'url'
    | 'number'
    | 'boolean'
    | 'select'
    | 'media'
    | 'group'
    | 'list'

export interface CmsSelectOption {
  value: string
  label: string
}

export interface CmsFieldSpec {
  key: string
  label: string
  widget: CmsFieldWidget
  options?: CmsSelectOption[]
  fields?: CmsFieldSpec[]
  min?: number
  max?: number
  placeholder?: string
  itemLabel?: string
}

export type CmsFieldMeta = Omit<CmsFieldSpec, 'key' | 'fields'>

const FIELD_META = new WeakMap<object, CmsFieldMeta>()

export function field<T extends z.ZodTypeAny>(schema: T, meta: CmsFieldMeta): T {
  FIELD_META.set(schema, meta)
  return schema
}

function readMeta(schema: z.ZodTypeAny): CmsFieldMeta | undefined {
  let current: z.ZodTypeAny | undefined = schema
  while (current) {
    const meta = FIELD_META.get(current)
    if (meta)
      return meta
    current = unwrapOnce(current)
  }
  return undefined
}

function unwrapOnce(schema: z.ZodTypeAny): z.ZodTypeAny | undefined {
  if (schema instanceof z.ZodDefault || schema instanceof z.ZodOptional || schema instanceof z.ZodNullable)
    return schema._def.innerType
  if (schema instanceof z.ZodEffects)
    return schema._def.schema
  return undefined
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema
  let next = unwrapOnce(current)
  while (next) {
    current = next
    next = unwrapOnce(current)
  }
  return current
}

function inferWidget(schema: z.ZodTypeAny): CmsFieldWidget {
  if (schema instanceof z.ZodNumber)
    return 'number'
  if (schema instanceof z.ZodBoolean)
    return 'boolean'
  if (schema instanceof z.ZodEnum)
    return 'select'
  if (schema instanceof z.ZodArray)
    return 'list'
  if (schema instanceof z.ZodObject)
    return 'group'
  return 'text'
}

function specFor(key: string, schema: z.ZodTypeAny): CmsFieldSpec {
  const meta = readMeta(schema)
  const inner = unwrap(schema)
  const widget = meta?.widget ?? inferWidget(inner)
  const spec: CmsFieldSpec = {
    key,
    label: meta?.label ?? key,
    widget,
    options: meta?.options ?? (inner instanceof z.ZodEnum
      ? (inner.options as string[]).map(value => ({ value, label: value }))
      : undefined),
    placeholder: meta?.placeholder,
    itemLabel: meta?.itemLabel,
    min: meta?.min,
    max: meta?.max,
  }

  if (widget === 'group' && inner instanceof z.ZodObject)
    spec.fields = fieldsFromSchema(inner)

  if (widget === 'list' && inner instanceof z.ZodArray) {
    const element = unwrap(inner.element)
    if (element instanceof z.ZodObject)
      spec.fields = fieldsFromSchema(element)
  }

  return spec
}

/** Labels and widgets for every key of a block props schema. */
export function fieldsFromSchema(schema: z.ZodObject<z.ZodRawShape>): CmsFieldSpec[] {
  return Object.entries(schema.shape).map(([key, child]) => specFor(key, child as z.ZodTypeAny))
}

/** Blank row for a `list` field. Item schemas must accept `{}` via defaults. */
export function defaultListItem(schema: z.ZodObject<z.ZodRawShape>, key: string): Record<string, unknown> {
  const child = schema.shape[key]
  if (!child)
    return {}
  const array = unwrap(child as z.ZodTypeAny)
  if (!(array instanceof z.ZodArray))
    return {}
  const element = unwrap(array.element)
  const parsed = element.safeParse({})
  if (parsed.success && parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data))
    return parsed.data as Record<string, unknown>
  return {}
}
