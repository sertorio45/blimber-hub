import { createError } from 'h3'
import type { BrandContext } from '~/types/brand-context'
import { fetchBrandGuideForTenant } from '~/server/utils/brand-guide'
import { toBrandContext } from '~/utils/brand-context'

type SupabaseLike = {
  from: (table: string) => unknown
  storage: {
    from: (bucket: string) => {
      createSignedUrls: (
        paths: string[],
        expiresIn: number,
      ) => Promise<{ data: Array<{ signedUrl?: string | null, path?: string | null }> | null }>
    }
  }
}

/**
 * Loads Brand Center row for the workspace tenant and maps to BrandContext.
 * Rejects any accidental tenant mismatch before returning to AI consumers.
 */
export async function fetchBrandContextForTenant(
  client: SupabaseLike,
  tenantId: string,
): Promise<BrandContext> {
  const trimmed = tenantId.trim()
  if (!trimmed) {
    throw createError({ statusCode: 400, statusMessage: 'tenantId obrigatório' })
  }

  const guide = await fetchBrandGuideForTenant(client, trimmed)

  if (guide.tenantId && guide.tenantId !== trimmed) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Contexto de marca inválido para o tenant',
    })
  }

  return toBrandContext(guide, { tenantId: trimmed })
}
