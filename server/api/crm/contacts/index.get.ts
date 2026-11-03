import { serverSupabaseServiceRole } from '#supabase/server'

/** Lean columns for contacts listing — avoids select('*') + oversized payloads. */
const CONTACT_LIST_COLUMNS = [
  'id',
  'tenant_id',
  'name',
  'email',
  'phone',
  'position',
  'company_id',
  'lead_id',
  'notes',
  'last_contact',
  'created_at',
  'updated_at',
  'company:crm_company(name)',
].join(', ')

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { tenant_id, page = 1, limit = 20, search = '', lead_id } = query

  if (!tenant_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Tenant ID é obrigatório',
    })
  }

  const pageNum = Math.max(1, Number(page) || 1)
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20))
  const from = (pageNum - 1) * limitNum
  const to = from + limitNum - 1

  try {
    const supabase = serverSupabaseServiceRole(event)

    const selectColumns = lead_id
      ? `${CONTACT_LIST_COLUMNS.replace('company:crm_company(name)', 'company:crm_company(id, name, website, address, address_number, address_complement, cep, city, country, notes)')}`
      : CONTACT_LIST_COLUMNS

    let req = supabase
      .from('crm_contact')
      .select(selectColumns, { count: 'exact' })
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: lead_id ? true : false })

    if (lead_id)
      req = req.eq('lead_id', String(lead_id))

    if (search) {
      req = req.ilike('name', `%${search}%`)
    }

    const { data, error, count } = await req.range(from, to)

    if (error) {
      throw createError({
        statusCode: 400,
        statusMessage: error.message,
      })
    }

    const rows = (data || []).map((row: Record<string, unknown>) => {
      const company = row.company as { name?: string } | null
      if (lead_id) {
        return {
          ...row,
          company_name: company?.name || '',
        }
      }
      const { company: _company, ...rest } = row
      return {
        ...rest,
        company_name: company?.name || '',
      }
    })

    return {
      data: rows,
      total: count || 0,
      page: pageNum,
      limit: limitNum,
    }
  }
  catch (error: any) {
    if (error?.statusCode)
      throw error
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Falha ao buscar contatos',
    })
  }
})
