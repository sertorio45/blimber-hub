import type { CrmCompanyLookupResult, CrmLeadLookupResult } from '~/types/crm'
import {
  formatLeadValueInput,
  normalizeLeadValues,
} from '~/composables/crm/useCrmLeadValue'

export interface CrmLeadAutofillLeadForm {
  name: string
  source: string
  status?: string
  funnel_id?: string | null
  sales_stage_id?: string | null
  priority: string
  /** @deprecated prefer valuesInputs */
  value?: string
  valuesInputs?: string[]
  closedValue?: string
  notes: string
  assigned_to?: string | null
}

export interface CrmLeadAutofillContactForm {
  name: string
  email: string
  phone: string
  position: string
  notes: string
}

export interface CrmLeadAutofillCompanyForm {
  name: string
  website: string
  address: string
  address_number?: string
  address_complement?: string
  cep?: string
  city?: string
  country?: string
  notes?: string
}

function resolveSourceId(
  sourceEnum: string | null | undefined,
  leadSources: Array<{ id: string, name: string }> | null | undefined,
): string {
  if (!sourceEnum || !leadSources?.length)
    return ''

  const exactId = leadSources.find(source => source.id === sourceEnum)
  if (exactId)
    return exactId.id

  const enumValue = sourceEnum.toLowerCase()
  const exactName = leadSources.find(source => source.name.toLowerCase() === enumValue)
  if (exactName)
    return exactName.id

  const mapped = leadSources.find((source) => {
    const sourceName = source.name.toLowerCase()

    if (enumValue === 'website' && (sourceName.includes('website') || sourceName.includes('web')))
      return true
    if (enumValue === 'referral' && (sourceName.includes('referral') || sourceName.includes('indica')))
      return true
    if (enumValue === 'social' && (sourceName.includes('social') || sourceName.includes('redes')))
      return true
    if (enumValue === 'email' && (sourceName.includes('email') || sourceName.includes('e-mail')))
      return true
    if (enumValue === 'phone' && (sourceName.includes('phone') || sourceName.includes('telefone') || sourceName.includes('whatsapp') || sourceName.includes('whats')))
      return true
    if (enumValue === 'other' && (sourceName.includes('other') || sourceName.includes('outro')))
      return true

    return false
  })

  return mapped?.id || ''
}

export function applyCompanyAutofill(
  match: CrmCompanyLookupResult,
  companyForm: { value: CrmLeadAutofillCompanyForm },
  options?: { onCompanyId?: (companyId: string | null) => void },
) {
  companyForm.value = {
    name: match.name || '',
    website: match.website || '',
    address: match.address || '',
    address_number: match.address_number || '',
    address_complement: match.address_complement || '',
    cep: match.cep || '',
    city: match.city || '',
    country: match.country || '',
    notes: match.notes || '',
  }
  options?.onCompanyId?.(match.id || null)
}

export function applyCrmLeadAutofill(
  match: CrmLeadLookupResult,
  forms: {
    leadForm: { value: CrmLeadAutofillLeadForm }
    contactForm: { value: CrmLeadAutofillContactForm }
    companyForm: { value: CrmLeadAutofillCompanyForm }
  },
  options?: {
    leadSources?: Array<{ id: string, name: string }>
    preserveLeadStatus?: boolean
    fillLeadFields?: boolean
    onCompanyId?: (companyId: string | null) => void
  },
) {
  if (options?.fillLeadFields !== false) {
    forms.leadForm.value.name = match.name

    if (match.source) {
      const sourceId = resolveSourceId(match.source, options?.leadSources)
      if (sourceId)
        forms.leadForm.value.source = sourceId
    }

    if (match.priority)
      forms.leadForm.value.priority = match.priority

    const values = normalizeLeadValues(match.values)
    if (values.length) {
      forms.leadForm.value.valuesInputs = values.map(formatLeadValueInput)
      forms.leadForm.value.value = formatLeadValueInput(values[0])
    }
    else if (match.value != null && !Number.isNaN(match.value)) {
      forms.leadForm.value.valuesInputs = [formatLeadValueInput(match.value)]
      forms.leadForm.value.value = formatLeadValueInput(match.value)
    }

    if (match.lead_notes)
      forms.leadForm.value.notes = match.lead_notes
  }

  forms.contactForm.value = {
    name: match.contact_name || match.name,
    email: match.email || '',
    phone: match.phone || '',
    position: match.position || '',
    notes: match.contact_notes || '',
  }

  forms.companyForm.value = {
    name: match.company_name || '',
    website: match.company_website || '',
    address: match.company_address || '',
    address_number: (match as any).company_address_number || '',
    address_complement: (match as any).company_address_complement || '',
    cep: match.company_cep || '',
    city: match.company_city || '',
    country: match.company_country || '',
    notes: match.company_notes || '',
  }

  options?.onCompanyId?.(match.company_id || null)
}

export type { CrmCompanyLookupResult, CrmLeadLookupResult } from '~/types/crm'
