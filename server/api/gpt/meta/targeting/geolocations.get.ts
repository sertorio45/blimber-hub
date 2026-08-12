import { defineEventHandler } from 'h3'
import { META_GEOLOCATION_TYPES } from '~/lib/meta-ads'
import {
  optionalInt,
  optionalString,
  queryRecord,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

const GEO_TYPE_SET = new Set<string>(META_GEOLOCATION_TYPES)

/**
 * Parse locationTypes query: comma-separated (city,region) or JSON array string.
 */
function parseLocationTypes(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null || raw === '')
    return undefined
  if (Array.isArray(raw)) {
    const list = raw.map(String).map(s => s.trim()).filter(Boolean)
    return list.length ? list.filter(t => GEO_TYPE_SET.has(t)) : undefined
  }
  const text = String(raw).trim()
  if (!text)
    return undefined
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (Array.isArray(parsed)) {
        const list = parsed.map(String).map(s => s.trim()).filter(t => GEO_TYPE_SET.has(t))
        return list.length ? list : undefined
      }
    }
    catch {
      // fall through to comma-separated
    }
  }
  const list = text.split(',').map(s => s.trim()).filter(t => GEO_TYPE_SET.has(t))
  return list.length ? list : undefined
}

/** Busca cidades/regiões Meta (Graph type=adgeolocation) para geo_locations. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMetaGptTool(event, 'meta_search_geolocations', {
    tenantId: optionalString(q.tenantId),
    q: optionalString(q.q),
    limit: optionalInt(q.limit),
    locationTypes: parseLocationTypes(q.locationTypes),
    countryCode: optionalString(q.countryCode),
  })
})
