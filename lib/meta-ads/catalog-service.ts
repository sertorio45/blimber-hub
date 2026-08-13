/**
 * Product catalog helpers for Advantage+ Catalog / template creatives.
 * Ownership: catalogs returned by the tenant ad account endpoint only.
 */

import type { MetaGraphFetch } from './types'
import { actPath, metaGraphUrl } from './graph'
import { MetaAdsToolError } from './types'

export type CatalogServiceContext = {
  apiVersion: string
  accessToken: string
  adAccountId: string
  graph: MetaGraphFetch
}

export type MetaProductCatalogSummary = {
  id: string
  name: string | null
  productCount: number | null
  vertical: string | null
}

export async function listProductCatalogs(
  ctx: CatalogServiceContext,
  options?: { limit?: number },
): Promise<MetaProductCatalogSummary[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200)
  const res = await ctx.graph(
    metaGraphUrl(ctx.apiVersion, `/${actPath(ctx.adAccountId)}/product_catalogs`),
    {
      query: {
        fields: 'id,name,product_count,vertical',
        limit,
        access_token: ctx.accessToken,
      },
    },
  )

  const rows = Array.isArray(res?.data) ? res.data : []
  return rows.map((row: any) => ({
    id: String(row.id),
    name: row.name != null ? String(row.name) : null,
    productCount: typeof row.product_count === 'number' ? row.product_count : null,
    vertical: row.vertical != null ? String(row.vertical) : null,
  }))
}

/**
 * Ensure product_set_id belongs to a catalog the ad account can see.
 */
export async function assertProductSetOwned(
  ctx: CatalogServiceContext,
  params: { catalogId: string, productSetId: string },
): Promise<void> {
  const catalogs = await listProductCatalogs(ctx, { limit: 200 })
  const catalogIds = new Set(catalogs.map(c => c.id))
  if (!catalogIds.has(params.catalogId)) {
    throw new MetaAdsToolError(
      'CATALOG_TENANT_MISMATCH',
      'Catálogo não pertence à ad account do tenant (ou token sem acesso).',
      403,
      { catalogId: params.catalogId },
    )
  }

  const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, `/${params.productSetId}`), {
    query: {
      fields: 'id,name,product_catalog{id}',
      access_token: ctx.accessToken,
    },
  })

  const setCatalogId = res?.product_catalog?.id != null
    ? String(res.product_catalog.id)
    : null
  if (!setCatalogId || setCatalogId !== params.catalogId) {
    throw new MetaAdsToolError(
      'PRODUCT_SET_CATALOG_MISMATCH',
      'productSetId não pertence ao catalogId informado.',
      400,
      { catalogId: params.catalogId, productSetId: params.productSetId, setCatalogId },
    )
  }
}

/**
 * Build AdCreative body for catalog / Advantage+ catalog style template_data.
 * Official Marketing API: object_story_spec.template_data + product_set_id on creative.
 */
export function buildCatalogTemplateCreativeBody(input: {
  creativeName: string
  pageId: string
  message: string
  linkUrl: string
  callToAction: string
  productSetId: string
  headline?: string
  description?: string
}): Record<string, unknown> {
  const templateData: Record<string, unknown> = {
    message: input.message,
    link: input.linkUrl,
    call_to_action: {
      type: input.callToAction,
      value: { link: input.linkUrl },
    },
  }
  if (input.headline)
    templateData.name = input.headline
  if (input.description)
    templateData.description = input.description

  return {
    name: input.creativeName,
    product_set_id: input.productSetId,
    object_story_spec: {
      page_id: input.pageId,
      template_data: templateData,
    },
  }
}
