export interface Lead {
  id: string
  name: string
  company?: string
  email?: string
  phone?: string
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
  source: 'website' | 'referral' | 'social' | 'email' | 'phone' | 'other'
  source_id?: string | null
  value: number
  /** Proposal amount options; when length > 1 the card shows a min-max range. */
  values?: number[]
  priority: 'low' | 'medium' | 'high'
  assignedTo?: string
  notes?: string
  createdAt: string
  updatedAt: string
  lastContact?: string
  nextFollowUp?: string
  tags: string[]
  /** Linked WhatsApp conversation when status is open or pending */
  whatsapp_conversation_id?: string | null
  whatsapp_conversation_status?: string | null
  tenant_id: string
  /** Set when lead is moved to stage won or lost */
  closed_at?: string
  meta_lead_id?: string | null
  fbc?: string | null
  fbp?: string | null
  fbclid?: string | null
  meta_ctwa_clid?: string | null
  meta_waba_id?: string | null
  meta_source_id?: string | null
  meta_campaign_id?: string | null
  meta_adset_id?: string | null
  meta_ad_id?: string | null
  meta_campaign_name?: string | null
  meta_adset_name?: string | null
  meta_ad_name?: string | null
  attribution_method?: string | null
  attribution_date?: string | null
  attribution_channel?: string | null
  meta_capi_status?: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped' | null
  meta_capi_event?: string | null
  meta_capi_error?: string | null
}

export interface ProductCategory {
  id: string
  tenant_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  tenant_id: string
  name: string
  description?: string
  type: 'recorrente' | 'avulso'
  price: number
  recurrence?: 'mensal' | 'trimestral' | 'semestral' | 'anual' | null
  category_id?: string | null
  /** Display name from category relation (API join) */
  category?: string | null
  tags: string[]
  active: boolean
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  position?: string
  company_id?: string
  company_name?: string
  lead_id?: string | null
  notes?: string
  created_at: string
  updated_at: string
  tenant_id: string
  last_contact?: string
}

export interface Company {
  id: string
  name: string
  website?: string
  address?: string
  address_number?: string
  address_complement?: string
  cep?: string
  city?: string
  country?: string
  notes?: string
  created_at: string
  updated_at: string
  tenant_id: string
}

export interface CrmCompanyLookupResult {
  id: string
  name: string
  website: string | null
  address: string | null
  address_number: string | null
  address_complement: string | null
  cep: string | null
  city: string | null
  country: string | null
  notes: string | null
}

export interface Meeting {
  id: string
  title: string
  description?: string
  start_time: string
  end_time: string
  location?: string
  type: 'call' | 'video' | 'in-person' | 'demo'
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show'
  attendees?: string[]
  lead_id?: string
  contact_id?: string
  company_id?: string
  created_by: string
  created_at: string
  updated_at: string
  tenant_id: string
  notes?: string
  outcome?: string
  // Para exibição no frontend
  company_name?: string
  contact_name?: string
  lead_name?: string
}

export interface LeadSource {
  id: string
  name: string
  description?: string
  is_default: boolean
  is_active: boolean
  tenant_id?: string
  created_at: string
  updated_at: string
}

export interface CrmLeadLookupResult {
  id: string
  match_type: 'lead' | 'contact'
  name: string
  lead_id: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  position: string | null
  contact_notes: string | null
  source: string | null
  priority: string | null
  value: number | null
  values: number[] | null
  lead_notes: string | null
  company_id: string | null
  company_name: string | null
  company_website: string | null
  company_address: string | null
  company_cep: string | null
  company_city: string | null
  company_country: string | null
  company_notes: string | null
}

// @deprecated — use types/whatsapp.ts
export type {
  WhatsAppMessage,
  WhatsAppConversation,
  EvolutionAPIConfig,
  EvolutionAPIMessage,
  EvolutionAPIWebhook,
} from '~/types/whatsapp'

export interface SalesStage {
  id: string
  name: string
  order: number
  color: string
  description?: string
  tenant_id?: string
  funnel_id?: string
  is_default: boolean
}

export interface DashboardStageStat {
  id: string
  name: string
  color: string
  count: number
  value: number
}

export interface DashboardRecentActivity {
  id: string
  type: 'created' | 'won' | 'updated'
  title: string
  description: string
  occurredAt: string
}

export interface DashboardKPI {
  totalLeads: number
  newLeadsThisMonth: number
  conversionRate: number
  totalRevenue: number
  revenueThisMonth: number
  averageDealSize: number
  negotiationValue: number
  leadsPerStage: DashboardStageStat[]
  revenueByMonth: Array<{ month: string, revenue: number }>
  topSources: Array<{ source: string, count: number }>
  topPerformers: Array<{ userId: string, deals: number, revenue: number }>
  recentActivity: DashboardRecentActivity[]
}
