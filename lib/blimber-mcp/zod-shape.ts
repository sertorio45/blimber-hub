import { z } from 'zod'

/** Extracts Zod object shape for MCP tool registration (unwraps refinements/effects). */
export function zodObjectShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  if (schema instanceof z.ZodObject)
    return schema.shape

  const def = (schema as { _def?: { schema?: z.ZodTypeAny, innerType?: z.ZodTypeAny } })._def
  if (def?.schema)
    return zodObjectShape(def.schema)
  if (def?.innerType)
    return zodObjectShape(def.innerType)

  return {}
}
